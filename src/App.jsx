import React, { useState, useRef, useEffect, useCallback, Component } from 'react';
import { APIProvider, Map, AdvancedMarker, useApiIsLoaded } from '@vis.gl/react-google-maps';

class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'sans-serif', color: '#c00' }}>
          <h2>Something went wrong</h2>
          <pre style={{ whiteSpace: 'pre-wrap', marginTop: 12, fontSize: 13, color: '#333' }}>
            {this.state.error.message}
            {'\n'}
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const GOOGLE_MAPS_API_KEY = 'AIzaSyBk2FOFmCTkhxpO1rdsUXKLqtiZykuwaB8';

const FALLBACK_CENTER = { lat: 40.7484, lng: -73.9857 };
const INITIAL_ZOOM = 14;
const ANIM_DURATION = 500;

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function useAnimatedMarker(target) {
  const [pos, setPos] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!target) { setPos(null); return; }
    if (!fromRef.current) { fromRef.current = target; setPos(target); return; }

    const from = fromRef.current;
    const startTime = performance.now();

    cancelAnimationFrame(rafRef.current);

    function step(now) {
      const t = Math.min((now - startTime) / ANIM_DURATION, 1);
      const e = easeInOut(t);
      const next = {
        lat: from.lat + (target.lat - from.lat) * e,
        lng: from.lng + (target.lng - from.lng) * e,
      };
      setPos(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    }

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target]);

  return pos;
}

function getUrlState() {
  const p = new URLSearchParams(window.location.search);
  const lat = parseFloat(p.get('lat'));
  const lng = parseFloat(p.get('lng'));
  if (!isFinite(lat) || !isFinite(lng)) return null;
  const heading = parseFloat(p.get('heading'));
  const pitch = parseFloat(p.get('pitch'));
  const zoom = parseFloat(p.get('zoom'));
  return {
    coords: { lat, lng },
    pov: {
      heading: isFinite(heading) ? heading : 0,
      pitch: isFinite(pitch) ? pitch : 0,
    },
    zoom: isFinite(zoom) ? zoom : 1,
  };
}

function MapAndStreetView({ center, clickedLocation, initialPov, initialZoom, animatedMarker, onMapClick, onMarkerMove, onPovChange, setSvStatus, svStatus }) {
  const apiIsLoaded = useApiIsLoaded();
  const streetViewRef = useRef(null);
  const panoramaRef = useRef(null);

  useEffect(() => {
    if (!apiIsLoaded || !clickedLocation || !streetViewRef.current) return;

    const { lat, lng } = clickedLocation;
    const svService = new window.google.maps.StreetViewService();

    svService.getPanorama({ location: { lat, lng }, radius: 100 }, (data, status) => {
      if (status === window.google.maps.StreetViewStatus.OK) {
        setSvStatus(null);
        if (!panoramaRef.current) {
          panoramaRef.current = new window.google.maps.StreetViewPanorama(
            streetViewRef.current,
            { position: { lat, lng }, pov: initialPov, zoom: initialZoom }
          );
          panoramaRef.current.addListener('position_changed', () => {
            const pos = panoramaRef.current.getPosition();
            if (pos) onMarkerMove({ lat: pos.lat(), lng: pos.lng() });
          });
          panoramaRef.current.addListener('pov_changed', () => {
            const pov = panoramaRef.current.getPov();
            onPovChange({ heading: pov.heading, pitch: pov.pitch });
          });
          panoramaRef.current.addListener('zoom_changed', () => {
            onPovChange({ zoom: panoramaRef.current.getZoom() });
          });
        } else {
          panoramaRef.current.setPosition({ lat, lng });
          panoramaRef.current.setVisible(true);
        }
      } else {
        setSvStatus('No Street View imagery available near this location.');
        if (panoramaRef.current) panoramaRef.current.setVisible(false);
      }
    });
  }, [apiIsLoaded, clickedLocation]);

  return (
    <div style={styles.container}>
      {/* Left panel: Google Maps */}
      <div style={styles.panel}>
        <div style={styles.label}>Google Maps — click to open Street View</div>
        {!center ? (
          <div style={styles.locating}>Locating…</div>
        ) : (
          <Map
            style={styles.fill}
            defaultCenter={center}
            defaultZoom={INITIAL_ZOOM}
            gestureHandling="greedy"
            mapId="main-map"
            onClick={onMapClick}
          >
            {animatedMarker && <AdvancedMarker position={animatedMarker} />}
          </Map>
        )}
      </div>

      {/* Right panel: Street View */}
      <div style={styles.panel}>
        <div style={styles.label}>Google Street View</div>
        <div ref={streetViewRef} style={styles.fill} />
        {svStatus && (
          <div style={styles.svOverlay}>
            <span style={styles.svMessage}>{svStatus}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const syncUrlThrottled = (() => {
  let pending = null;
  let timer = null;
  return (params) => {
    pending = params;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (!pending) return;
      const p = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(pending)) {
        p.set(k, typeof v === 'number' ? v.toFixed(2) : v);
      }
      window.history.replaceState(null, '', `?${p}`);
      pending = null;
    }, 300);
  };
})();

export default function App() {
  const [center, setCenter] = useState(null);
  const urlState = useRef(getUrlState());
  const initial = urlState.current;
  const [clickedLocation, setClickedLocation] = useState(initial?.coords ?? null);
  const [markerLocation, setMarkerLocation] = useState(initial?.coords ?? null);
  const [svPov, setSvPov] = useState(initial?.pov ?? { heading: 0, pitch: 0 });
  const [svZoom, setSvZoom] = useState(initial?.zoom ?? 1);
  const [svStatus, setSvStatus] = useState(
    initial ? null : 'Click the map to load Street View'
  );
  const animatedMarker = useAnimatedMarker(markerLocation);

  const initLocation = useCallback((loc) => {
    setCenter(loc);
    setClickedLocation(loc);
    setMarkerLocation(loc);
    setSvStatus(null);
  }, []);

  useEffect(() => {
    if (initial) {
      setCenter(initial.coords);
      return;
    }
    if (!navigator.geolocation) {
      initLocation(FALLBACK_CENTER);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => initLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => initLocation(FALLBACK_CENTER)
    );
  }, []);

  useEffect(() => {
    if (!markerLocation) return;
    syncUrlThrottled({
      lat: markerLocation.lat,
      lng: markerLocation.lng,
      heading: svPov.heading,
      pitch: svPov.pitch,
      zoom: svZoom,
    });
  }, [markerLocation, svPov, svZoom]);

  const handleMapClick = useCallback((e) => {
    const { lat, lng } = e.detail.latLng;
    setClickedLocation({ lat, lng });
    setMarkerLocation({ lat, lng });
  }, []);

  const handleMarkerMove = useCallback((loc) => {
    setMarkerLocation(loc);
  }, []);

  const handlePovChange = useCallback((update) => {
    if ('zoom' in update) {
      setSvZoom(update.zoom);
    } else {
      setSvPov(update);
    }
  }, []);

  return (
    <ErrorBoundary>
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <MapAndStreetView
        center={center}
        clickedLocation={clickedLocation}
        initialPov={svPov}
        initialZoom={svZoom}
        animatedMarker={animatedMarker}
        onMapClick={handleMapClick}
        onMarkerMove={handleMarkerMove}
        onPovChange={handlePovChange}
        setSvStatus={setSvStatus}
        svStatus={svStatus}
      />
    </APIProvider>
    </ErrorBoundary>
  );
}

const styles = {
  container: {
    display: 'flex',
    width: '100%',
    height: '100%',
    fontFamily: 'sans-serif',
  },
  panel: {
    position: 'relative',
    flex: 1,
    borderRight: '2px solid #333',
  },
  label: {
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
  fill: {
    width: '100%',
    height: '100%',
  },
  locating: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#e8e8e8',
    color: '#555',
    fontSize: 14,
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
