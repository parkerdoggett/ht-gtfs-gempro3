import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './Schedule.css';

function Schedule() {
    const [routes, setRoutes] = useState([]);
    const [selectedRoute, setSelectedRoute] = useState(null);
    const [stops, setStops] = useState([]);
    const [selectedStop, setSelectedStop] = useState(null);
    const [schedule, setSchedule] = useState(null);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('Weekdays'); // Weekdays, Saturday, Sunday

    useEffect(() => {
        const fetchRoutes = async () => {
            try {
                const res = await axios.get('/api/routes');
                setRoutes(res.data);
            } catch (err) {
                console.error(err);
            }
        };
        fetchRoutes();
    }, []);

    const handleRouteSelect = async (route) => {
        setSelectedRoute(route);
        setSelectedStop(null);
        setSchedule(null);
        setSearchQuery(''); // Clear search on step change
        setLoading(true);
        try {
            const res = await axios.get(`/api/routes/${route.route_id}/stops`);
            setStops(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleStopSelect = async (stop) => {
        setSelectedStop(stop);
        setLoading(true);
        try {
            const res = await axios.get(`/api/schedule`, {
                params: { stopId: stop.stop_id, routeId: selectedRoute.route_id }
            });
            setSchedule(res.data);
            // Default to Weekdays if available, else first available
            const services = res.data;
            const hasWeekdays = Object.values(services).some(s => getServiceLabel(s.calendar) === 'Weekdays');
            setActiveTab(hasWeekdays ? 'Weekdays' : 'Saturday');
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const getServiceLabel = (calendar) => {
        if (!calendar) return 'Special';
        const days = [];
        if (calendar.monday === '1') days.push('Mon');
        if (calendar.tuesday === '1') days.push('Tue');
        if (calendar.wednesday === '1') days.push('Wed');
        if (calendar.thursday === '1') days.push('Thu');
        if (calendar.friday === '1') days.push('Fri');
        if (calendar.saturday === '1') days.push('Sat');
        if (calendar.sunday === '1') days.push('Sun');

        if (days.length === 5 && days[0] === 'Mon' && days[4] === 'Fri') return 'Weekdays';
        if (days.length === 7) return 'Every Day';
        if (days.length === 1 && days[0] === 'Sat') return 'Saturday';
        if (days.length === 1 && days[0] === 'Sun') return 'Sunday';

        return days.join(', ');
    };

    // Filter items based on search query
    const filteredRoutes = routes.filter(r =>
        r.route_short_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.route_long_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredStops = stops.filter(s =>
        s.stop_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.stop_code.includes(searchQuery)
    );

    // Get times for current tab
    const getCurrentTimes = () => {
        if (!schedule) return [];
        let times = [];

        Object.values(schedule).forEach(service => {
            const label = getServiceLabel(service.calendar);
            // Map tab names to service labels
            if (activeTab === 'Weekdays' && label === 'Weekdays') times = [...times, ...service.departures];
            if (activeTab === 'Saturday' && label === 'Saturday') times = [...times, ...service.departures];
            if (activeTab === 'Sunday' && label === 'Sunday') times = [...times, ...service.departures];
        });

        return times.sort((a, b) => a.time.localeCompare(b.time));
    };

    return (
        <div className="schedule-page">
            <div className="schedule-header">
                <Link to="/" className="back-link">← Home</Link>
                <h1>Schedule Lookup</h1>
            </div>

            <div className="schedule-content">
                {/* Step 1: Select Route */}
                {!selectedRoute && (
                    <div className="selection-card">
                        <h2>Select a Route</h2>
                        <input
                            type="text"
                            placeholder="Search routes..."
                            className="schedule-search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoFocus
                        />
                        <div className="list-container">
                            {filteredRoutes.map(r => (
                                <div key={r.route_id} className="list-item" onClick={() => handleRouteSelect(r)}>
                                    <span className="route-badge">{r.route_short_name}</span>
                                    <span>{r.route_long_name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Step 2: Select Stop */}
                {selectedRoute && !selectedStop && (
                    <div className="selection-card">
                        <div className="step-header">
                            <button onClick={() => setSelectedRoute(null)}>← Change Route</button>
                            <h2>{selectedRoute.route_short_name} - Select Stop</h2>
                        </div>
                        <input
                            type="text"
                            placeholder="Search stops..."
                            className="schedule-search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoFocus
                        />
                        {loading ? <div className="spinner"></div> : (
                            <div className="list-container">
                                {filteredStops.map(s => (
                                    <div key={s.stop_id} className="list-item" onClick={() => handleStopSelect(s)}>
                                        <span className="stop-code">{s.stop_code}</span>
                                        <span>{s.stop_name}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Step 3: View Schedule */}
                {selectedRoute && selectedStop && schedule && (
                    <div className="schedule-view-card">
                        <div className="step-header">
                            <button onClick={() => setSelectedStop(null)}>← Change Stop</button>
                            <div>
                                <h2>{selectedStop.stop_name}</h2>
                                <p>{selectedRoute.route_short_name} - {selectedRoute.route_long_name}</p>
                            </div>
                        </div>

                        <div className="tabs">
                            {['Weekdays', 'Saturday', 'Sunday'].map(tab => (
                                <button
                                    key={tab}
                                    className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                                    onClick={() => setActiveTab(tab)}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>

                        <div className="time-list-unified">
                            {getCurrentTimes().length > 0 ? (
                                getCurrentTimes().map((dep, i) => (
                                    <div key={i} className="time-item">
                                        <span className="time">{dep.time.slice(0, 5)}</span>
                                        <span className="headsign">{dep.headsign}</span>
                                    </div>
                                ))
                            ) : (
                                <div className="no-service">No service scheduled for {activeTab}</div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default Schedule;
