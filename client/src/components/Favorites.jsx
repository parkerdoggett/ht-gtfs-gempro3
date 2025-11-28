import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Favorites.css';

function Favorites() {
    const [favorites, setFavorites] = useState([]);

    useEffect(() => {
        const storedFavorites = JSON.parse(localStorage.getItem('favorites') || '[]');
        setFavorites(storedFavorites);
    }, []);

    const removeFavorite = (id) => {
        const newFavorites = favorites.filter(f => f.id !== id);
        setFavorites(newFavorites);
        localStorage.setItem('favorites', JSON.stringify(newFavorites));
    };

    return (
        <div className="favorites-page">
            <div className="favorites-header">
                <Link to="/" className="back-link">← Home</Link>
                <h1>Favorites</h1>
            </div>

            {favorites.length === 0 ? (
                <div className="empty-state">
                    <p>No favorites added yet.</p>
                    <p>Star stops or routes to see them here!</p>
                </div>
            ) : (
                <div className="favorites-list">
                    {favorites.map(fav => (
                        <div key={fav.id} className="favorite-item">
                            <div className="fav-info">
                                <span className="fav-type">{fav.type === 'stop' ? 'Stop' : 'Route'}</span>
                                <span className="fav-name">{fav.name}</span>
                            </div>
                            <button className="remove-btn" onClick={() => removeFavorite(fav.id)}>&times;</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default Favorites;
