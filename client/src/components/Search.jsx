import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Search.css';

function Search() {
    const [query, setQuery] = useState('');
    const [stops, setStops] = useState([]);
    const [routes, setRoutes] = useState([]);
    const [vehicles, setVehicles] = useState([]);
    const [results, setResults] = useState({ stops: [], routes: [], vehicles: [] });
    const [recentSearches, setRecentSearches] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        // Load recent searches
        const storedRecents = JSON.parse(localStorage.getItem('recentSearches') || '[]');
        setRecentSearches(storedRecents);

        // Fetch all data once for client-side filtering
        const fetchData = async () => {
            try {
                const [stopsRes, routesRes, vehiclesRes] = await Promise.all([
                    axios.get('/api/stops'),
                    axios.get('/api/routes'),
                    axios.get('/api/vehicles')
                ]);
                setStops(stopsRes.data);
                setRoutes(routesRes.data);
                setVehicles(vehiclesRes.data);
            } catch (error) {
                console.error('Error fetching data for search:', error);
            }
        };
        fetchData();
    }, []);

    const addToRecents = (item, type) => {
        const newRecent = { id: item.id || item.stop_id || item.route_id, name: item.name || item.stop_name || item.route_long_name, type, data: item };
        const updatedRecents = [newRecent, ...recentSearches.filter(r => r.id !== newRecent.id)].slice(0, 5);
        setRecentSearches(updatedRecents);
        localStorage.setItem('recentSearches', JSON.stringify(updatedRecents));
    };

    useEffect(() => {
        if (query.length < 2) {
            setResults({ stops: [], routes: [], vehicles: [] });
            return;
        }

        const lowerQuery = query.toLowerCase();

        const filteredStops = stops.filter(s =>
            s.stop_name.toLowerCase().includes(lowerQuery) ||
            s.stop_code.includes(lowerQuery)
        ).slice(0, 10);

        const filteredRoutes = routes.filter(r =>
            r.route_long_name.toLowerCase().includes(lowerQuery) ||
            r.route_short_name.toLowerCase().includes(lowerQuery)
        ).slice(0, 10);

        const filteredVehicles = vehicles.filter(v =>
            v.vehicle.vehicleLabel.toLowerCase().includes(lowerQuery)
        ).slice(0, 10);

        setResults({ stops: filteredStops, routes: filteredRoutes, vehicles: filteredVehicles });
    }, [query, stops, routes, vehicles]);

    const [selectedItem, setSelectedItem] = useState(null);

    const handleRouteClick = (route) => {
        addToRecents(route, 'route');
        setSelectedItem({ type: 'route', data: route });
    };

    const handleVehicleClick = (vehicle) => {
        addToRecents({ ...vehicle, name: `Bus #${vehicle.vehicle.vehicleLabel}` }, 'vehicle');
        setSelectedItem({ type: 'vehicle', data: vehicle });
    };

    const handleStopClick = (stop) => {
        addToRecents(stop, 'stop');
        setSelectedItem({ type: 'stop', data: stop });
    };

    const closeCard = () => setSelectedItem(null);

    const viewOnMap = () => {
        if (!selectedItem) return;
        if (selectedItem.type === 'route') navigate('/map?routeId=' + selectedItem.data.route_id);
        if (selectedItem.type === 'vehicle') navigate('/map?vehicleId=' + selectedItem.data.id);
        if (selectedItem.type === 'stop') navigate('/map'); // Just go to map, maybe center?
    };

    return (
        <div className="search-page">
            <div className="search-header">
                <Link to="/" className="back-link">← Home</Link>
                <div className="search-input-wrapper">
                    <span className="search-icon">🔍</span>
                    <input
                        type="text"
                        placeholder="Search stops, routes, or buses..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoFocus
                    />
                </div>
            </div>

            <div className="search-results">
                {/* Recent Searches */}
                {query.length < 2 && recentSearches.length > 0 && (
                    <div className="result-section">
                        <h3>Recent Searches</h3>
                        {recentSearches.map((item, index) => (
                            <div key={index} className="result-item" onClick={() => {
                                if (item.type === 'route') handleRouteClick(item.data);
                                if (item.type === 'vehicle') handleVehicleClick(item.data);
                                if (item.type === 'stop') handleStopClick(item.data);
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                                    <span className="icon">🕒</span>
                                    <span>{item.name}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {results.vehicles.length > 0 && (
                    <div className="result-section">
                        <h3>Vehicles</h3>
                        {results.vehicles.map(v => (
                            <div key={v.id} className="result-item" onClick={() => handleVehicleClick(v)}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                                    <span className="icon">🚌</span>
                                    <span>Bus #{v.vehicle.vehicleLabel}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {results.routes.length > 0 && (
                    <div className="result-section">
                        <h3>Routes</h3>
                        {results.routes.map(route => (
                            <div key={route.route_id} className="result-item">
                                <div
                                    style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, cursor: 'pointer' }}
                                    onClick={() => handleRouteClick(route)}
                                >
                                    <span className="route-badge">{route.route_short_name}</span>
                                    <span>{route.route_long_name}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {results.stops.length > 0 && (
                    <div className="result-section">
                        <h3>Stops</h3>
                        {results.stops.map(stop => (
                            <div key={stop.stop_id} className="result-item">
                                <div
                                    style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, cursor: 'pointer' }}
                                    onClick={() => handleStopClick(stop)}
                                >
                                    <span className="stop-code">{stop.stop_code}</span>
                                    <span>{stop.stop_name}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {query.length >= 2 && results.stops.length === 0 && results.routes.length === 0 && results.vehicles.length === 0 && (
                    <div className="no-results">No results found.</div>
                )}
            </div>

            {selectedItem && (
                <div className="details-card-overlay" onClick={closeCard}>
                    <div className="details-card" onClick={e => e.stopPropagation()}>
                        <button className="close-btn" onClick={closeCard}>&times;</button>

                        {selectedItem.type === 'vehicle' && (
                            <>
                                <h2>Bus #{selectedItem.data.vehicle.vehicleLabel}</h2>
                                <p><strong>Route:</strong> {selectedItem.data.vehicle.routeId}</p>
                                <p><strong>Status:</strong> {selectedItem.data.vehicle.status === 'on_route' ? 'On Route' : 'Off Route'}</p>
                                <p><strong>Speed:</strong> {Math.round(selectedItem.data.vehicle.speed * 3.6)} km/h</p>
                            </>
                        )}

                        {selectedItem.type === 'route' && (
                            <>
                                <h2>{selectedItem.data.route_short_name}</h2>
                                <p>{selectedItem.data.route_long_name}</p>
                                <p className="badge">{selectedItem.data.category || 'Local'}</p>
                                <p>{selectedItem.data.route_desc}</p>
                            </>
                        )}

                        {selectedItem.type === 'stop' && (
                            <>
                                <h2>{selectedItem.data.stop_name}</h2>
                                <p>Code: {selectedItem.data.stop_code}</p>
                            </>
                        )}

                        <button className="view-map-btn" onClick={viewOnMap}>View on Map</button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Search;
