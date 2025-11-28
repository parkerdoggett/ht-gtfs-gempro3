import { MapContainer, TileLayer, Marker, Popup, useMap, CircleMarker, Polyline } from 'react-leaflet';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import StopRoutesBoard from './StopRoutesBoard';

// Fix for default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom Bus Icon (Dot + Pointer)
const createBusIcon = (bearing, status, category) => {
    // Color coding based on category
    let color = '#dc2626'; // Default Red (Local)
    if (category === 'Express') color = '#d97706'; // Amber
    if (category === 'Regional Express') color = '#059669'; // Emerald
    if (category === 'Corridor') color = '#005596'; // Blue (Corridor)

    // Grey if off-route
    if (status !== 'on_route') color = '#9ca3af';

    return L.divIcon({
        className: 'custom-bus-icon',
        html: `
      <div style="position: relative; width: 24px; height: 24px;">
        <div style="
          width: 14px; 
          height: 14px; 
          background-color: ${color}; 
          border: 2px solid white; 
          border-radius: 50%; 
          position: absolute; 
          top: 50%; 
          left: 50%; 
          transform: translate(-50%, -50%);
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        "></div>
        <div style="
          width: 0; 
          height: 0; 
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-bottom: 8px solid ${color};
          position: absolute;
          top: -6px;
          left: 50%;
          transform: translateX(-50%) rotate(${bearing}deg);
          transform-origin: center 18px;
        "></div>
      </div>
    `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
    });
};

// Helper component to center map
function MapUpdater({ center, zoom }) {
    const map = useMap();
    useEffect(() => {
        if (center && !isNaN(center[0]) && !isNaN(center[1])) {
            map.setView(center, zoom);
        }
    }, [center, zoom, map]);
    return null;
}

// Locate Me Control
function LocateControl() {
    const map = useMap();

    const handleLocate = () => {
        map.locate({ setView: true, maxZoom: 16 });
    };

    return (
        <div className="leaflet-bottom leaflet-right">
            <div className="leaflet-control leaflet-bar">
                <button
                    onClick={handleLocate}
                    style={{
                        backgroundColor: 'white',
                        border: 'none',
                        width: '30px',
                        height: '30px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                        color: '#333'
                    }}
                    title="Locate Me"
                >
                    📍
                </button>
            </div>
        </div>
    );
}

function MapComponent() {
    const [vehicles, setVehicles] = useState([]);
    const [stops, setStops] = useState([]);
    const [routes, setRoutes] = useState([]);
    const [selectedStop, setSelectedStop] = useState(null);
    const [selectedVehicle, setSelectedVehicle] = useState(null);
    const [vehicleShape, setVehicleShape] = useState(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const [mapCenter, setMapCenter] = useState([44.6488, -63.5752]);
    const [mapZoom, setMapZoom] = useState(13);
    const [closestStopName, setClosestStopName] = useState('');

    const routeIdParam = searchParams.get('routeId');
    const vehicleIdParam = searchParams.get('vehicleId');

    useEffect(() => {
        const fetchVehicles = async () => {
            try {
                const response = await axios.get('/api/vehicles');
                setVehicles(response.data);
            } catch (error) {
                console.error('Error fetching vehicles:', error);
            }
        };

        const fetchRoutes = async () => {
            try {
                const response = await axios.get('/api/routes');
                setRoutes(response.data);
            } catch (error) {
                console.error('Error fetching routes:', error);
            }
        };

        const fetchStops = async () => {
            try {
                // If route filter is active, fetch only stops for that route
                const url = routeIdParam ? `/api/routes/${routeIdParam}/stops` : '/api/stops';
                const response = await axios.get(url);
                if (Array.isArray(response.data)) {
                    setStops(response.data);
                } else {
                    setStops([]);
                }
            } catch (error) {
                console.error('Error fetching stops:', error);
                setStops([]);
            }
        };

        fetchRoutes();
        fetchStops();
        fetchVehicles();
        const interval = setInterval(fetchVehicles, 15000);
        return () => clearInterval(interval);
    }, [routeIdParam]); // Re-fetch stops when routeIdParam changes

    // Handle URL params
    useEffect(() => {
        if (vehicles.length === 0) return;

        if (vehicleIdParam) {
            const vehicle = vehicles.find(v => v.id === vehicleIdParam);
            if (vehicle) {
                setSelectedVehicle(vehicle);
                setMapCenter([vehicle.vehicle.latitude, vehicle.vehicle.longitude]);
                setMapZoom(16);
            }
        } else if (routeIdParam && stops.length > 0) {
            // Center on the first stop of the route if only route is selected
            // Calculate average lat/lon to center map on route
            const lats = stops.map(s => parseFloat(s.stop_lat));
            const lons = stops.map(s => parseFloat(s.stop_lon));
            if (lats.length > 0) {
                const avgLat = lats.reduce((a, b) => a + b, 0) / lats.length;
                const avgLon = lons.reduce((a, b) => a + b, 0) / lons.length;
                if (!isNaN(avgLat) && !isNaN(avgLon)) {
                    setMapCenter([avgLat, avgLon]);
                    setMapZoom(12);
                }
            }
        }
    }, [vehicleIdParam, routeIdParam, vehicles, stops]);

    // Calculate closest stop when vehicle is selected
    useEffect(() => {
        if (!selectedVehicle || stops.length === 0) {
            setClosestStopName('');
            return;
        }

        const vLat = selectedVehicle.vehicle.latitude;
        const vLon = selectedVehicle.vehicle.longitude;
        let minDist = Infinity;
        let closest = null;

        stops.forEach(stop => {
            const dist = Math.sqrt(Math.pow(stop.stop_lat - vLat, 2) + Math.pow(stop.stop_lon - vLon, 2));
            if (dist < minDist) {
                minDist = dist;
                closest = stop;
            }
        });

        if (closest) {
            setClosestStopName(closest.stop_name);
        }
    }, [selectedVehicle, stops]);

    // Fetch shape when a vehicle is selected
    useEffect(() => {
        if (!selectedVehicle || !selectedVehicle.vehicle.tripId) {
            setVehicleShape(null);
            return;
        }

        const fetchShape = async () => {
            try {
                const response = await axios.get(`/api/trips/${selectedVehicle.vehicle.tripId}/shape`);
                setVehicleShape(response.data);
            } catch (error) {
                console.error('Error fetching shape:', error);
                setVehicleShape(null);
            }
        };

        fetchShape();
    }, [selectedVehicle]);

    // Helper to split shape into past/future based on current position
    const getSplitShape = () => {
        if (!vehicleShape || !selectedVehicle) return { past: [], future: [] };

        const currentLat = selectedVehicle.vehicle.latitude;
        const currentLon = selectedVehicle.vehicle.longitude;

        // Find closest point index
        let closestIndex = 0;
        let minDist = Infinity;

        vehicleShape.forEach((pt, index) => {
            const dist = Math.sqrt(Math.pow(pt.lat - currentLat, 2) + Math.pow(pt.lon - currentLon, 2));
            if (dist < minDist) {
                minDist = dist;
                closestIndex = index;
            }
        });

        return {
            past: vehicleShape.slice(0, closestIndex + 1).map(pt => [pt.lat, pt.lon]),
            future: vehicleShape.slice(closestIndex).map(pt => [pt.lat, pt.lon])
        };
    };

    const { past, future } = getSplitShape();

    // Filter vehicles if routeIdParam is present
    const displayedVehicles = routeIdParam
        ? vehicles.filter(v => v.vehicle.routeId === routeIdParam)
        : vehicles;

    const getRouteCategory = (routeId) => {
        const route = routes.find(r => r.route_id === routeId);
        return route ? route.category : 'Local';
    };

    const clearFilter = () => {
        setSearchParams({});
        // Will trigger re-fetch of all stops
    };

    return (
        <>
            <a href="/" style={{
                position: 'absolute',
                top: '20px',
                left: '20px',
                zIndex: 1000,
                background: 'white',
                padding: '12px 20px',
                borderRadius: '12px',
                textDecoration: 'none',
                color: 'var(--ht-blue)',
                fontWeight: 'bold',
                boxShadow: 'var(--shadow-lg)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'transform 0.2s'
            }}>
                <span>←</span> Home
            </a>

            {routeIdParam && (
                <div style={{
                    position: 'absolute',
                    top: '20px',
                    left: '140px',
                    zIndex: 1000,
                    background: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(4px)',
                    padding: '12px 20px',
                    borderRadius: '12px',
                    color: 'var(--ht-blue)',
                    fontWeight: '600',
                    boxShadow: 'var(--shadow-lg)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    border: '1px solid rgba(0, 85, 150, 0.1)'
                }}>
                    <span>Filtered View: Route {routeIdParam}</span>
                    <button
                        onClick={clearFilter}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '1.2rem',
                            color: 'var(--ht-grey)',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center'
                        }}
                    >&times;</button>
                </div>
            )}

            <MapContainer center={[44.6488, -63.5752]} zoom={13} style={{ height: '100vh', width: '100%' }}>
                <MapUpdater center={mapCenter} zoom={mapZoom} />
                <LocateControl />
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                />

                {/* Vehicle Shape */}
                {selectedVehicle && vehicleShape && (
                    <>
                        <Polyline positions={past} pathOptions={{ color: '#005596', weight: 4, opacity: 1 }} />
                        <Polyline positions={future} pathOptions={{ color: '#005596', weight: 4, opacity: 0.4, dashArray: '10, 10' }} />
                    </>
                )}

                {/* Stops */}
                {stops.map((stop) => (
                    <CircleMarker
                        key={stop.stop_id}
                        center={[stop.stop_lat, stop.stop_lon]}
                        radius={4}
                        pathOptions={{
                            color: '#005596',
                            fillColor: 'white',
                            fillOpacity: 1,
                            weight: 2
                        }}
                        eventHandlers={{
                            click: () => {
                                setSelectedStop(stop);
                                setSelectedVehicle(null); // Deselect vehicle when stop is clicked
                            },
                        }}
                    />
                ))}

                {/* Vehicles */}
                {displayedVehicles.map((v) => (
                    <Marker
                        key={v.id}
                        position={[v.vehicle.latitude, v.vehicle.longitude]}
                        icon={createBusIcon(v.vehicle.bearing || 0, v.vehicle.status, getRouteCategory(v.vehicle.routeId))}
                        eventHandlers={{
                            click: () => {
                                setSelectedVehicle(v);
                                setSelectedStop(null); // Deselect stop when vehicle is clicked
                            }
                        }}
                    >
                        <Popup className="custom-popup">
                            <div className="popup-content">
                                <h3 style={{ margin: '0 0 5px 0', color: 'var(--ht-blue)' }}>Route {v.vehicle.routeId || 'N/A'}</h3>
                                <p style={{ margin: '0 0 5px 0', fontWeight: '500' }}>Bus #{v.vehicle.vehicleLabel}</p>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', fontSize: '0.85rem' }}>
                                    <span>Speed: {Math.round(v.vehicle.speed * 3.6)} km/h</span>
                                    <span>{v.vehicle.status === 'on_route' ? 'On Route' : 'Off Route'}</span>
                                </div>
                                {closestStopName && (
                                    <p style={{ marginTop: '8px', fontWeight: 'bold', color: 'var(--ht-blue)', fontSize: '0.9rem' }}>
                                        📍 Near: {closestStopName}
                                    </p>
                                )}
                                <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '8px', marginBottom: 0 }}>
                                    Updated {v.vehicle.lastUpdated}s ago
                                </p>
                            </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>

            {selectedStop && (
                <StopRoutesBoard
                    stopId={selectedStop.stop_id}
                    stopName={selectedStop.stop_name}
                    onClose={() => setSelectedStop(null)}
                />
            )}
        </>
    );
}

export default MapComponent;
