import React, { useState, useRef, useEffect, useCallback } from 'react';
import { DeckGL } from '@deck.gl/react';
import { ScatterplotLayer } from '@deck.gl/layers';
import { FlyToInterpolator } from '@deck.gl/core';

// Replace with your Google Maps JavaScript API key
const GOOGLE_MAPS_API_KEY = 'YOUR_GOOGLE_MAPS_API_KEY';

const INITIAL_VIEW_STATE = {
  longitude: -73.9857,
  latitude: 40.7484,
  zoom: 14,
  pitch: 0,
  bearing: 0,
};

function loadGoogleMapsApi(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) {
      resolve(window.google.maps);
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    script.async = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error('Failed to load Google Maps API'));
    document.head.appendChild(script);
  });
}

export default function App() {
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [clickedLocation, setClickedLocation] = useState(null);
  const [svStatus, setSvStatus] = useState('Click the map to load Street View');
  const [googleMapsLoaded, setGoogleMapsLoaded] = useState(false);
  const streetViewRef = useRef(null);
  const panoramaRef = useRef(null);

  useEffect(() => {
    loadGoogleMapsApi(GOOGLE_MAPS_API_KEY)
      .then(() => setGoogleMapsLoaded(true))
      .catch(() => setSvStatus('Failed to load Google Maps API. Check your API key.'));
  }, []);

  // Initialize or update the Street View panorama when a location is clicked
  useEffect(() => {
    if (!googleMapsLoaded || !clickedLocation || !streetViewRef.current) return;

    const { lat, lng } = clickedLocation;
    const svService = new window.google.maps.StreetViewService();

    svService.getPanorama(
      { location: { lat, lng }, radius: 100 },
      (data, status) => {
        if (status === window.google.maps.StreetViewStatus.OK) {
          setSvStatus(null);

          if (!panoramaRef.current) {
            panoramaRef.current = new window.google.maps.StreetViewPanorama(
              streetViewRef.current,
              {
                position: { lat, lng },
                pov: { heading: 0, pitch: 0 },
                zoom: 1,
                addressControl: true,
                fullscreenControl: true,
              }
            );
          } else {
            panoramaRef.current.setPosition({ lat, lng });
          }
        } else {
          setSvStatus(`No Street View imagery available near this location.`);
          if (panoramaRef.current) {
            panoramaRef.current.setVisible(false);
          }
        }
      }
    );
  }, [clickedLocation, googleMapsLoaded]);

  const handleClick = useCallback((info) => {
    if (!info.coordinate) return;
    const [lng, lat] = info.coordinate;
    setClickedLocation({ lat, lng });
    setViewState((vs) => ({
      ...vs,
      longitude: lng,
      latitude: lat,
      zoom: Math.max(vs.zoom, 14),
      transitionDuration: 500,
      transitionInterpolator: new FlyToInterpolator(),
    }));
  }, []);

  const layers = [
    clickedLocation &&
      new ScatterplotLayer({
        id: 'click-marker',
        data: [clickedLocation],
        getPosition: (d) => [d.lng, d.lat],
        getRadius: 20,
        getFillColor: [255, 80, 80, 220],
        getLineColor: [255, 255, 255],
        lineWidthMinPixels: 2,
        stroked: true,
        radiusMinPixels: 8,
        radiusMaxPixels: 20,
      }),
  ].filter(Boolean);

  return (
    <div style={styles.container}>
      {/* Left panel: deck.gl map */}
      <div style={styles.mapPanel}>
        <div style={styles.mapLabel}>deck.gl Map — click to open Street View</div>
        <DeckGL
          viewState={viewState}
          onViewStateChange={({ viewState: vs }) => setViewState(vs)}
          controller={true}
          onClick={handleClick}
          layers={layers}
          style={styles.deckgl}
        >
          {/* Simple canvas map background via deck.gl OrthographicView is not needed;
              use a plain background. For a real tile basemap, add a TileLayer here. */}
          <div style={styles.mapBackground} />
        </DeckGL>
      </div>

      {/* Right panel: Street View */}
      <div style={styles.svPanel}>
        <div style={styles.mapLabel}>Google Street View</div>
        <div ref={streetViewRef} style={styles.streetView} />
        {svStatus && (
          <div style={styles.svOverlay}>
            <span style={styles.svMessage}>{svStatus}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    width: '100%',
    height: '100%',
    fontFamily: 'sans-serif',
  },
  mapPanel: {
    position: 'relative',
    flex: 1,
    borderRight: '2px solid #333',
  },
  svPanel: {
    position: 'relative',
    flex: 1,
  },
  mapLabel: {
    position: 'absolute',
    top: 10,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 10,
    background: 'rgba(0,0,0,0.65)',
    color: '#fff',
    padding: '4px 12px',
    borderRadius: 4,
    fontSize: 13,
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  },
  deckgl: {
    position: 'absolute',
    inset: 0,
  },
  mapBackground: {
    position: 'absolute',
    inset: 0,
    background: '#1a1a2e',
  },
  streetView: {
    width: '100%',
    height: '100%',
  },
  svOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#111',
    pointerEvents: 'none',
  },
  svMessage: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
    padding: '0 24px',
    maxWidth: 320,
  },
};
