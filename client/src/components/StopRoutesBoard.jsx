import { useState, useEffect } from 'react';
import axios from 'axios';
import './StopRoutesBoard.css';

function StopRoutesBoard({ stopId, stopName, onClose }) {
    const [routes, setRoutes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isFavorite, setIsFavorite] = useState(false);

    useEffect(() => {
        if (!stopId) return;

        const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
        setIsFavorite(favorites.some(f => f.id === stopId && f.type === 'stop'));

        const fetchRoutes = async () => {
            setLoading(true);
            try {
                const response = await axios.get('/api/stops/' + stopId + '/routes');
                setRoutes(response.data);
            } catch (error) {
                console.error('Error fetching routes:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchRoutes();
    }, [stopId]);

    const toggleFavorite = () => {
        const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
        if (isFavorite) {
            const newFavorites = favorites.filter(f => !(f.id === stopId && f.type === 'stop'));
            localStorage.setItem('favorites', JSON.stringify(newFavorites));
            setIsFavorite(false);
        } else {
            favorites.push({ id: stopId, name: stopName, type: 'stop' });
            localStorage.setItem('favorites', JSON.stringify(favorites));
            setIsFavorite(true);
        }
    };

    return (
        <div className="stop-routes-board">
            <div className="board-header">
                <div className="header-title">
                    <h2>{stopName || 'Stop Details'}</h2>
                    <button
                        className={'fav-btn ' + (isFavorite ? 'active' : '')}
                        onClick={toggleFavorite}
                        title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
                    >
                        {isFavorite ? '★' : '☆'}
                    </button>
                </div>
                <button className="close-btn" onClick={onClose}>&times;</button>
            </div>
            <div className="board-content">
                {loading ? (
                    <p style={{ padding: '20px', textAlign: 'center' }}>Loading routes...</p>
                ) : routes.length === 0 ? (
                    <p style={{ padding: '20px', textAlign: 'center' }}>No routes found for this stop.</p>
                ) : (
                    <div className="routes-list">
                        {routes.map((route) => (
                            <div key={route.routeId} className="route-item">
                                <span className="route-badge">{route.routeShortName}</span>
                                <span className="route-name">{route.routeLongName}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default StopRoutesBoard;
