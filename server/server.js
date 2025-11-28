const express = require('express');
const cors = require('cors');
const gtfs = require('./gtfs');

const app = express();
const PORT = process.env.PORT || 8700;

app.use(cors());
app.use(express.json());

// Initialize Data
gtfs.updateStaticData();
gtfs.updateRealtimeData();

// Update realtime data every 30 seconds
setInterval(() => {
    gtfs.updateRealtimeData();
}, 30000);

// API Endpoints
app.get('/api/stops', (req, res) => {
    res.json(gtfs.getStops());
});

app.get('/api/routes', (req, res) => {
    res.json(gtfs.getRoutes());
});

app.get('/api/vehicles', (req, res) => {
    res.json(gtfs.getVehicles());
});

app.get('/api/alerts', (req, res) => {
    res.json(gtfs.getAlerts());
});

app.get('/api/stops/:id/routes', (req, res) => {
    const stopId = req.params.id;
    const routes = gtfs.getRoutesForStop(stopId);
    res.json(routes);
});

app.get('/api/stops/:id/departures', (req, res) => {
    const stopId = req.params.id;
    const departures = gtfs.getDeparturesForStop(stopId);
    res.json(departures);
});

app.get('/api/trips/:id/shape', (req, res) => {
    const tripId = req.params.id;
    const shape = gtfs.getShapeForTrip(tripId);
    if (shape) {
        res.json(shape);
    } else {
        res.status(404).json({ error: 'Shape not found' });
    }
});

app.get('/api/routes/:id/stops', (req, res) => {
    const routeId = req.params.id;
    const stops = gtfs.getStopsForRoute(routeId);
    res.json(stops);
});

app.get('/api/schedule', (req, res) => {
    const { stopId, routeId } = req.query;
    if (!stopId || !routeId) {
        return res.status(400).json({ error: 'Missing stopId or routeId' });
    }
    const schedule = gtfs.getScheduleForStop(stopId, routeId);
    res.json(schedule);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
