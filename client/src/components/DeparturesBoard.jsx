import { useState, useEffect } from 'react';
import axios from 'axios';
import './DeparturesBoard.css';

function DeparturesBoard({ stopId, stopName, onClose }) {
    const [departures, setDepartures] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDepartures = async () => {
            setLoading(true);
            try {
                const response = await axios.get(`/api/stops/${stopId}/departures`);
                setDepartures(response.data);
            } catch (error) {
                console.error('Error fetching departures:', error);
            } finally {
                setLoading(false);
            }
        };

        if (stopId) {
            fetchDepartures();
        }
    }, [stopId]);

    return (
        <div className="departures-board">
            <div className="board-header">
                <h2>{stopName}</h2>
                <button className="close-btn" onClick={onClose}>&times;</button>
            </div>
            <div className="board-content">
                {loading ? (
                    <p>Loading schedule...</p>
                ) : departures.length === 0 ? (
                    <p>No upcoming departures found.</p>
                ) : (
                    <table className="departures-table">
                        <thead>
                            <tr>
                                <th>Route</th>
                                <th>Destination</th>
                                <th>Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            {departures.map((dep, index) => (
                                <tr key={index}>
                                    <td className="route-id">{dep.routeId}</td>
                                    <td>{dep.headsign}</td>
                                    <td className="time">{dep.departureTime.substring(0, 5)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

export default DeparturesBoard;
