import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './Home.css';

function Home() {
    const [alerts, setAlerts] = useState([]);
    const [isAlertsOpen, setIsAlertsOpen] = useState(true);

    useEffect(() => {
        const fetchAlerts = async () => {
            try {
                const response = await axios.get('/api/alerts');
                setAlerts(response.data);
            } catch (error) {
                console.error('Error fetching alerts:', error);
            }
        };
        fetchAlerts();
    }, []);

    return (
        <div className="home-container">
            <div className="home-content">
                <div className="brand-logo">
                    <h1>Halifax Transit</h1>
                    <p>Realtime Tracking & Schedules</p>
                </div>

                {alerts.length > 0 && (
                    <div className="alerts-section">
                        <div className="alerts-header" onClick={() => setIsAlertsOpen(!isAlertsOpen)}>
                            <h3>⚠️ Service Alerts ({alerts.length})</h3>
                            <span className={`arrow ${isAlertsOpen ? 'open' : ''}`}>▼</span>
                        </div>
                        {isAlertsOpen && (
                            <div className="alerts-list">
                                {alerts.slice(0, 3).map(alert => (
                                    <div key={alert.id} className="alert-item">
                                        <strong>{alert.alert.headerText}</strong>
                                        <p>{alert.alert.descriptionText}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="menu-grid">
                    <Link to="/map" className="menu-item primary">
                        <span className="icon">🗺️</span>
                        <span className="label">Live Map</span>
                    </Link>

                    <Link to="/search" className="menu-item">
                        <span className="icon">🔍</span>
                        <span className="label">Search</span>
                    </Link>

                    <Link to="/schedule" className="menu-item">
                        <span className="icon">📅</span>
                        <span className="label">Schedule</span>
                    </Link>
                </div>
            </div>
        </div>
    );
}

export default Home;
