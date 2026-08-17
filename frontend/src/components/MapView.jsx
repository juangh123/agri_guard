import React, { useState, useMemo, useEffect } from 'react';
import MapGL, { NavigationControl, Source, Layer } from 'react-map-gl/mapbox';
import { MapPin, Layers, AlertTriangle, Loader2 } from 'lucide-react';

// Mapbox token comes from Vite env (see frontend/.env / frontend/.env.example)
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || 'MISSING_VITE_MAPBOX_TOKEN';
if (!import.meta.env.VITE_MAPBOX_TOKEN) {
  console.warn('VITE_MAPBOX_TOKEN is not set. Add it to frontend/.env 鈥?the map will not load without it.');
}

function featureCenter(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return null;

  if (geometry.type === 'Point') {
    return geometry.coordinates;
  }

  const ring =
    geometry.type === 'Polygon'
      ? geometry.coordinates?.[0]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates?.[0]?.[0]
        : null;

  if (!ring || ring.length < 2) return null;

  const lons = ring.map((point) => point[0]);
  const lats = ring.map((point) => point[1]);
  return [
    (Math.min(...lons) + Math.max(...lons)) / 2,
    (Math.min(...lats) + Math.max(...lats)) / 2,
  ];
}

function fallbackFarmFeature() {
  return {
    type: 'Feature',
    properties: { name: 'Mwangi Farm' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [37.88, 0.01],
          [37.92, 0.01],
          [37.92, 0.03],
          [37.88, 0.03],
          [37.88, 0.01]
        ]
      ]
    }
  };
}

export default function MapView({ isDisasterActive, onSimulateDisaster, isSimulating = false, farms = [] }) {
  const [viewState, setViewState] = useState({
    longitude: 37.9, // Kenya coords
    latitude: 0.02,
    zoom: 11,
    pitch: 45
  });

  const [mapStyle, setMapStyle] = useState('mapbox://styles/mapbox/dark-v11');

  const farmData = useMemo(() => {
    if (farms.length > 0) {
      return { type: 'FeatureCollection', features: farms };
    }
    return { type: 'FeatureCollection', features: [fallbackFarmFeature()] };
  }, [farms]);

  const primaryFeature = useMemo(() => farmData.features[0], [farmData]);
  const primaryFarmName = primaryFeature?.properties?.name || 'Mwangi Farm';
  const hotspotCoordinates = useMemo(
    () => featureCenter(primaryFeature) || [37.9, 0.02],
    [primaryFeature]
  );

  // Center the map on the first registered farm once it is loaded.
  useEffect(() => {
    const center = featureCenter(primaryFeature);
    if (center) {
      setViewState((prev) => ({ ...prev, longitude: center[0], latitude: center[1], zoom: 11 }));
    }
  }, [primaryFeature]);

  const fireHotspot = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: isDisasterActive
        ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: hotspotCoordinates } }]
        : []
    };
  }, [isDisasterActive, hotspotCoordinates]);

  return (
    <div className="h-[calc(100vh-12rem)] w-full rounded-2xl overflow-hidden relative group shadow-lg border border-gray-800">
      
      {/* Controls Overlay */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div className="glass-panel rounded-xl shadow-md p-1.5 flex flex-col gap-1 border border-white/20 bg-black/40 backdrop-blur-md">
          <button 
            onClick={() => setMapStyle('mapbox://styles/mapbox/dark-v11')}
            className={`p-2.5 rounded-lg transition-all font-medium ${mapStyle.includes('dark') ? 'bg-green-500/20 text-green-400 shadow-sm' : 'hover:bg-white/10 text-gray-400'}`}
            title="Dark Mode"
          >
            <Layers className="h-5 w-5" />
          </button>
          <button 
            onClick={() => setMapStyle('mapbox://styles/mapbox/satellite-streets-v12')}
            className={`p-2.5 rounded-lg transition-all font-medium ${mapStyle.includes('satellite') ? 'bg-green-500/20 text-green-400 shadow-sm' : 'hover:bg-white/10 text-gray-400'}`}
            title="Satellite View"
          >
            <MapPin className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* God Mode Button */}
      {onSimulateDisaster && (
        <div className="absolute top-4 right-14 z-10">
          <button 
            onClick={onSimulateDisaster}
            disabled={isSimulating}
            className={`px-4 py-2 rounded-full font-bold shadow-lg flex items-center gap-2 transition-all disabled:cursor-not-allowed disabled:opacity-70 ${
              isDisasterActive 
                ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' 
                : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white'
            }`}
          >
            {isSimulating ? <Loader2 className="h-5 w-5 animate-spin" /> : <AlertTriangle className="h-5 w-5" />}
            {isSimulating ? 'Running Pipeline...' : isDisasterActive ? 'Disaster Active' : 'Simulate Disaster (God Mode)'}
          </button>
        </div>
      )}

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 glass-panel px-5 py-3 rounded-full shadow-lg border border-white/20 bg-black/40 backdrop-blur-md flex gap-6 text-xs font-bold text-gray-200">
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.6)] block ring-2 ${isDisasterActive ? 'bg-red-500 ring-red-400 shadow-red-500' : 'bg-green-500 ring-green-400'}`}></span> 
          {primaryFarmName}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] block ring-2 ring-red-400 animate-pulse"></span> 
          VIIRS Hotspots
        </div>
      </div>

      <MapGL
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapStyle={mapStyle}
        mapboxAccessToken={MAPBOX_TOKEN}
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="top-right" />
        
        {/* Farm Fence Polygons */}
        <Source id="farm-fence" type="geojson" data={farmData}>
          <Layer 
            id="farm-fence-fill" 
            type="fill" 
            paint={{
              'fill-color': isDisasterActive ? '#EF4444' : '#22C55E',
              'fill-opacity': isDisasterActive ? 0.4 : 0.2
            }} 
          />
          <Layer 
            id="farm-fence-line" 
            type="line" 
            paint={{
              'line-color': isDisasterActive ? '#EF4444' : '#22C55E',
              'line-width': 2
            }} 
          />
        </Source>

        {/* Disaster Hotspot */}
        <Source id="fire-hotspot" type="geojson" data={fireHotspot}>
          <Layer 
            id="fire-hotspot-point" 
            type="circle" 
            paint={{
              'circle-color': '#EF4444',
              'circle-radius': 15,
              'circle-opacity': 0.8,
              'circle-blur': 0.5
            }} 
          />
        </Source>
      </MapGL>
    </div>
  );
}
