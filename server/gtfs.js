const axios = require('axios');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
const AdmZip = require('adm-zip');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const GTFS_STATIC_URL = 'https://gtfs.halifax.ca/static/google_transit.zip';
const GTFS_REALTIME_URL = 'https://gtfs.halifax.ca/realtime/Vehicle/VehiclePositions.pb';
const GTFS_ALERTS_URL = 'https://gtfs.halifax.ca/realtime/Alert/Alerts.pb';
const GTFS_TRIP_UPDATES_URL = 'https://gtfs.halifax.ca/realtime/TripUpdate/TripUpdates.pb';

let stops = [];
let routes = [];
let stopTimes = {}; // Map<stop_id, Array<stop_time>>
let trips = {}; // Map<trip_id, trip>
let shapes = {}; // Map<shape_id, Array<shape_point>>
let routeStops = {}; // Map<route_id, Set<stop_id>>
let vehicles = [];
let alerts = [];
let tripUpdates = [];
let calendar = {}; // Map<service_id, {monday, tuesday, ...}>

// Helper to parse CSV stream
function parseCsvEntry(entry, onData) {
    return new Promise((resolve, reject) => {
        const results = [];
        Readable.from(entry.getData())
            .pipe(csv())
            .on('data', (row) => {
                if (onData) onData(row);
                results.push(row);
            })
            .on('end', () => resolve(results))
            .on('error', reject);
    });
}

function getRouteCategory(routeShortName) {
    const num = parseInt(routeShortName);
    if (isNaN(num)) return 'Local';
    if (num >= 1 && num <= 10) return 'Corridor'; // High frequency
    if (num >= 100 && num < 200) return 'Express';
    if (num >= 300 && num < 400) return 'Regional Express';
    return 'Local';
}

async function updateStaticData() {
    console.log('Fetching static GTFS data...');
    try {
        const response = await axios.get(GTFS_STATIC_URL, { responseType: 'arraybuffer' });
        const zip = new AdmZip(response.data);
        const zipEntries = zip.getEntries();

        const stopsEntry = zipEntries.find(entry => entry.entryName === 'stops.txt');
        const routesEntry = zipEntries.find(entry => entry.entryName === 'routes.txt');
        const stopTimesEntry = zipEntries.find(entry => entry.entryName === 'stop_times.txt');
        const tripsEntry = zipEntries.find(entry => entry.entryName === 'trips.txt');
        const shapesEntry = zipEntries.find(entry => entry.entryName === 'shapes.txt');
        const calendarEntry = zipEntries.find(entry => entry.entryName === 'calendar.txt');

        // 0. Load Calendar
        if (calendarEntry) {
            const calendarList = await parseCsvEntry(calendarEntry);
            calendar = {};
            calendarList.forEach(c => calendar[c.service_id] = c);
            console.log(`Loaded ${Object.keys(calendar).length} calendars.`);
        }

        // 1. Load Routes (and categorize)
        if (routesEntry) {
            const routesData = await parseCsvEntry(routesEntry);
            routes = routesData.map(r => ({
                ...r,
                category: getRouteCategory(r.route_short_name)
            }));
            console.log(`Loaded ${routes.length} routes.`);
        }

        // 2. Load Stops
        if (stopsEntry) {
            stops = await parseCsvEntry(stopsEntry);
            // Parse coordinates as floats
            stops.forEach(s => {
                s.stop_lat = parseFloat(s.stop_lat);
                s.stop_lon = parseFloat(s.stop_lon);
            });
            console.log(`Loaded ${stops.length} stops.`);
        }

        // 3. Load Trips
        if (tripsEntry) {
            const tripsList = await parseCsvEntry(tripsEntry);
            trips = {};
            tripsList.forEach(t => trips[t.trip_id] = t);
            console.log(`Loaded ${Object.keys(trips).length} trips.`);
        }

        // 4. Load Shapes
        if (shapesEntry) {
            const shapesList = await parseCsvEntry(shapesEntry);
            const shapesData = {};
            shapesList.forEach(row => {
                if (!shapesData[row.shape_id]) shapesData[row.shape_id] = [];
                shapesData[row.shape_id].push({
                    lat: parseFloat(row.shape_pt_lat),
                    lon: parseFloat(row.shape_pt_lon),
                    sequence: parseInt(row.shape_pt_sequence)
                });
            });
            for (const shapeId in shapesData) {
                shapesData[shapeId].sort((a, b) => a.sequence - b.sequence);
            }
            shapes = shapesData;
            console.log(`Loaded ${Object.keys(shapes).length} shapes.`);
        }

        // 5. Load Stop Times (and build routeStops index)
        if (stopTimesEntry) {
            routeStops = {};
            stopTimes = {};

            await parseCsvEntry(stopTimesEntry, (row) => {
                // Populate stopTimes map
                if (!stopTimes[row.stop_id]) stopTimes[row.stop_id] = [];
                stopTimes[row.stop_id].push(row);

                // Populate routeStops index
                const trip = trips[row.trip_id];
                if (trip) {
                    const routeId = trip.route_id;
                    if (!routeStops[routeId]) routeStops[routeId] = new Set();
                    routeStops[routeId].add(row.stop_id);
                }
            });
            console.log(`Loaded stop_times and indexed stops for ${Object.keys(routeStops).length} routes.`);
        }

    } catch (error) {
        console.error('Error updating static data:', error);
    }
}

// Helper to fetch realtime data
async function updateRealtimeData() {
    try {
        // 1. Vehicle Positions
        const vpResponse = await axios.get(GTFS_REALTIME_URL, { responseType: 'arraybuffer' });
        const vpFeed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(vpResponse.data));

        const now = Date.now() / 1000;

        vehicles = vpFeed.entity.map(entity => {
            if (entity.vehicle) {
                const tripId = entity.vehicle.trip ? entity.vehicle.trip.tripId : null;
                const routeId = entity.vehicle.trip ? entity.vehicle.trip.routeId : null;
                const timestamp = entity.vehicle.timestamp ? parseInt(entity.vehicle.timestamp.low) : now;

                let status = routeId ? 'on_route' : 'off_route';

                return {
                    id: entity.id,
                    vehicle: {
                        tripId: tripId,
                        routeId: routeId,
                        latitude: entity.vehicle.position ? entity.vehicle.position.latitude : null,
                        longitude: entity.vehicle.position ? entity.vehicle.position.longitude : null,
                        bearing: entity.vehicle.position ? entity.vehicle.position.bearing : null,
                        speed: entity.vehicle.position ? entity.vehicle.position.speed : null,
                        vehicleLabel: entity.vehicle.vehicle ? entity.vehicle.vehicle.label : null,
                        timestamp: timestamp,
                        lastUpdated: Math.floor(now - timestamp),
                        status: status
                    }
                };
            }
            return null;
        }).filter(v => v !== null);

        // 2. Alerts
        const alertsResponse = await axios.get(GTFS_ALERTS_URL, { responseType: 'arraybuffer' });
        const alertsFeed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(alertsResponse.data));
        alerts = alertsFeed.entity.filter(e => e.alert).map(e => ({
            id: e.id,
            alert: {
                headerText: e.alert.headerText ? e.alert.headerText.translation[0].text : 'Alert',
                descriptionText: e.alert.descriptionText ? e.alert.descriptionText.translation[0].text : '',
                informedEntity: e.alert.informedEntity
            }
        }));

        // 3. Trip Updates (Optional for now, but good to have)
        // const tuResponse = await axios.get(GTFS_TRIP_UPDATES_URL, { responseType: 'arraybuffer' });
        // const tuFeed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(tuResponse.data));
        // tripUpdates = tuFeed.entity;

    } catch (error) {
        console.error('Error updating realtime data:', error);
    }
}

function getStops() {
    return stops;
}

function getRoutes() {
    return routes;
}

function getVehicles() {
    return vehicles;
}

function getAlerts() {
    return alerts;
}

// New function to get unique routes serving a stop
function getRoutesForStop(stopId) {
    if (!stopTimes[stopId]) return [];

    const uniqueRoutes = new Map();

    // Iterate through all stop times for this stop
    for (const st of stopTimes[stopId]) {
        const trip = trips[st.trip_id];
        if (!trip) continue;

        const routeId = trip.route_id;
        if (!uniqueRoutes.has(routeId)) {
            // Find route details
            const route = routes.find(r => r.route_id === routeId);
            if (route) {
                uniqueRoutes.set(routeId, {
                    routeId: routeId,
                    routeShortName: route.route_short_name,
                    routeLongName: route.route_long_name,
                    routeDesc: route.route_desc
                });
            }
        }
    }

    return Array.from(uniqueRoutes.values()).sort((a, b) =>
        parseInt(a.routeShortName) - parseInt(b.routeShortName)
    );
}

function getDeparturesForStop(stopId) {
    if (!stopTimes[stopId]) return [];

    // Get current time in HH:MM:SS format for comparison
    const now = new Date();
    const currentTime = now.toTimeString().split(' ')[0];

    // Filter for future departures
    const rawDepartures = stopTimes[stopId]
        .filter(st => st.departure_time >= currentTime)
        .sort((a, b) => a.departure_time.localeCompare(b.departure_time));

    const uniqueDepartures = [];
    const seen = new Set();

    for (const st of rawDepartures) {
        if (uniqueDepartures.length >= 20) break;

        const trip = trips[st.trip_id];
        if (!trip) continue;

        const routeId = trip.route_id;
        const headsign = trip.trip_headsign;
        const departureTime = st.departure_time;

        // Create a unique key for deduplication
        // We want to avoid showing the exact same bus details at the exact same time
        const key = `${departureTime}-${routeId}-${headsign}`;

        if (!seen.has(key)) {
            seen.add(key);
            uniqueDepartures.push({
                departureTime: departureTime,
                tripId: st.trip_id,
                routeId: routeId,
                headsign: headsign,
                serviceId: trip.service_id
            });
        }
    }

    return uniqueDepartures;
}

// New function to get shape for a trip
function getShapeForTrip(tripId) {
    const trip = trips[tripId];
    if (!trip || !trip.shape_id || !shapes[trip.shape_id]) return null;
    return shapes[trip.shape_id];
}

function getStopsForRoute(routeId) {
    if (!routeStops[routeId]) return [];
    const stopIds = Array.from(routeStops[routeId]);
    // Return full stop objects
    return stopIds.map(id => stops.find(s => s.stop_id === id)).filter(s => s);
}

function getScheduleForStop(stopId, routeId) {
    if (!stopTimes[stopId]) return {};

    const schedule = {}; // { service_id: [times] }

    stopTimes[stopId].forEach(st => {
        const trip = trips[st.trip_id];
        if (!trip || trip.route_id !== routeId) return;

        const serviceId = trip.service_id;
        if (!schedule[serviceId]) schedule[serviceId] = [];

        schedule[serviceId].push({
            time: st.departure_time,
            headsign: trip.trip_headsign
        });
    });

    // Sort times for each service
    for (const serviceId in schedule) {
        schedule[serviceId].sort((a, b) => a.time.localeCompare(b.time));
    }

    // Attach calendar info
    const result = {};
    for (const serviceId in schedule) {
        result[serviceId] = {
            calendar: calendar[serviceId],
            departures: schedule[serviceId]
        };
    }

    return result;
}

module.exports = {
    updateStaticData,
    updateRealtimeData,
    getStops,
    getRoutes,
    getVehicles,
    getAlerts,
    getRoutesForStop,
    getDeparturesForStop,
    getShapeForTrip,
    getStopsForRoute,
    getScheduleForStop
};

