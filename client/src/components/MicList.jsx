import React, { useState, useEffect } from 'react';
import './MicList.css';

// Skeleton loader component for better UX while loading
const MicListItemSkeleton = () => (
  <div className="mic-list-item-skeleton">
    <div className="skeleton-line title"></div>
    <div className="skeleton-line text"></div>
    <div className="skeleton-line text short"></div>
  </div>
);

function MicList() {
  const [mics, setMics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Filter states
  const [selectedDay, setSelectedDay] = useState('');
  const [selectedBorough, setSelectedBorough] = useState('');
  const [selectedNeighborhood, setSelectedNeighborhood] = useState('');

  // Get API URL from environment variable or use default for local dev
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  useEffect(() => {
    const fetchMics = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${API_URL}/api/v1/mics`);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
          setMics(data.mics || []);
          setLastUpdated(data.lastUpdated);
        } else {
          setMics([]);
        }
      } catch (err) {
        setError('Failed to load open mics. Please try again later.');
        console.error('Error fetching mics:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMics();
  }, [API_URL]);

  // Get unique values for filters
  const uniqueDays = [...new Set(mics.map(mic => mic.day).filter(Boolean))].sort();
  const uniqueBoroughs = [...new Set(mics.map(mic => mic.borough?.trim()).filter(Boolean))].sort();
  const uniqueNeighborhoods = [...new Set(mics.map(mic => mic.neighborhood).filter(Boolean))].sort();

  // Filter mics based on selected filters
  const filteredMics = mics.filter(mic => {
    if (selectedDay && mic.day !== selectedDay) return false;
    if (selectedBorough && mic.borough?.trim() !== selectedBorough) return false;
    if (selectedNeighborhood && mic.neighborhood !== selectedNeighborhood) return false;
    return true;
  });

  // Clear all filters
  const clearFilters = () => {
    setSelectedDay('');
    setSelectedBorough('');
    setSelectedNeighborhood('');
  };

  // Format timestamp for display
  const formatLastUpdated = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  if (error) {
    return (
      <div className="mic-list-container">
        <div className="error-message">
          <h2>Oops!</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mic-list-container">
      <header className="mic-list-header">
        <h1>Open Mics</h1>
        {lastUpdated && !loading && (
          <p className="last-updated">
            Updated {formatLastUpdated(lastUpdated)}
          </p>
        )}
      </header>

      {/* Filter Bar */}
      {!loading && mics.length > 0 && (
        <div className="filter-bar">
          <div className="filter-row">
            <select
              className="filter-select"
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
            >
              <option value="">All Days</option>
              {uniqueDays.map(day => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>

            <select
              className="filter-select"
              value={selectedBorough}
              onChange={(e) => setSelectedBorough(e.target.value)}
            >
              <option value="">All Boroughs</option>
              {uniqueBoroughs.map(borough => (
                <option key={borough} value={borough}>{borough}</option>
              ))}
            </select>

            <select
              className="filter-select"
              value={selectedNeighborhood}
              onChange={(e) => setSelectedNeighborhood(e.target.value)}
            >
              <option value="">All Neighborhoods</option>
              {uniqueNeighborhoods.map(neighborhood => (
                <option key={neighborhood} value={neighborhood}>{neighborhood}</option>
              ))}
            </select>
          </div>

          {(selectedDay || selectedBorough || selectedNeighborhood) && (
            <button className="clear-filters-btn" onClick={clearFilters}>
              Clear Filters ({filteredMics.length} shown)
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="mic-list">
          {Array.from({ length: 8 }).map((_, index) => (
            <MicListItemSkeleton key={index} />
          ))}
        </div>
      ) : filteredMics.length === 0 ? (
        <div className="empty-state">
          <p>No open mics match your filters. Try adjusting your selection.</p>
        </div>
      ) : (
        <div className="mic-list">
          {filteredMics.map((mic) => (
            <div key={mic.id} className="mic-list-item">
              <h2 className="mic-name">{mic.name}</h2>

              <div className="mic-info">
                {mic.venueName && (
                  <p className="mic-venue">
                    <span className="icon">🎭</span>
                    {mic.venueName}
                  </p>
                )}

                {mic.day && mic.startTime && (
                  <p className="mic-details">
                    <span className="icon">📅</span>
                    <strong>{mic.day}</strong> at {mic.startTime}
                    {mic.endTime && ` - ${mic.endTime}`}
                  </p>
                )}

                {mic.address && (
                  <p className="mic-address">
                    <span className="icon">📍</span>
                    {mic.address}
                    {mic.neighborhood && ` (${mic.neighborhood})`}
                  </p>
                )}

                {mic.borough && (
                  <p className="mic-borough">
                    <span className="icon">🗺️</span>
                    {mic.borough}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filteredMics.length > 0 && (
        <footer className="mic-list-footer">
          <p>
            Showing {filteredMics.length} of {mics.length} open mic{mics.length !== 1 ? 's' : ''}
          </p>
        </footer>
      )}
    </div>
  );
}

export default MicList;
