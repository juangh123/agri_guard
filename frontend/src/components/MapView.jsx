import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import MapGL, { NavigationControl, Source, Layer } from 'react-map-gl/maplibre';
import { MapPin, Layers, AlertTriangle, Loader2, Flame, Waves, Activity } from 'lucide-react';
import { OPEN_MAP_STYLE, SATELLITE_MAP_STYLE } from '../utils/mapStyles';
import {
  ARCGIS_LAYERS,
  ARCGIS_LAYER_STYLE,
  EMPTY_GEOJSON,
  buildArcGISQueryUrl,
  flattenBounds,
} from '../utils/arcGisLayers';

// AgriGuard uses MapLibre GL with official public raster and ArcGIS layers,
// so no proprietary Mapbox token or API key is required.
const LAYER_ICONS = {
  flame: Flame,
  waves: Waves,
  activity: Activity,
};

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
    pitch: 0
  });

  const [mapMode, setMapMode] = useState('satellite'); // 'osm' or 'satellite'
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef(null);
  const abortControllers = useRef({});
  const moveTimer = useRef(null);

  const [activeLayers, setActiveLayers] = useState({
    viirs: true,
    glofas: false,
    gauges: false,
  });

  const [arcGisData, setArcGisData] = useState({
    viirs: EMPTY_GEOJSON,
    glofas: EMPTY_GEOJSON,
    gauges: EMPTY_GEOJSON,
  });

  const [layersLoading, setLayersLoading] = useState({
    viirs: false,
    glofas: false,
    gauges: false,
  });

  const [layersError, setLayersError] = useState({});

  const activeStyle = useMemo(() => {
    return mapMode === 'satellite' ? SATELLITE_MAP_STYLE : OPEN_MAP_STYLE;
  }, [mapMode]);

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

  useEffect(() => {
    const center = featureCenter(primaryFeature);
    if (center) {
      setViewState((prev) => ({ ...prev, longitude: center[0], latitude: center[1], zoom: 11 }));
    }
  }, [primaryFeature]);

  const fetchArcGISLayer = useCallback(
    async (layerKey) => {
      const map = mapRef.current;
      if (!map || !activeLayers[layerKey]) return;

      const bounds = flattenBounds(map.getBounds().toArray());
      const url = buildArcGISQueryUrl(layerKey, bounds);
      if (!url) return;

      abortControllers.current[layerKey]?.abort();
      const controller = new AbortController();
      abortControllers.current[layerKey] = controller;

      setLayersLoading((prev) => ({ ...prev, [layerKey]: true }));

      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`${layerKey} service returned ${response.status}`);
        }
        const data = await response.json();
        setArcGisData((prev) => ({ ...prev, [layerKey]: data }));
        setLayersError((prev) => {
          const next = { ...prev };
          delete next[layerKey];
          return next;
        });
      } catch (error) {
        if (error.name !== 'AbortError') {
          setArcGisData((prev) => ({ ...prev, [layerKey]: EMPTY_GEOJSON }));
          setLayersError((prev) => ({ ...prev, [layerKey]: error.message }));
        }
      } finally {
        if (abortControllers.current[layerKey] === controller) {
          setLayersLoading((prev) => ({ ...prev, [layerKey]: false }));
        }
      }
    },
    [activeLayers]
  );

  const refreshVisibleLayers = useCallback(() => {
    Object.keys(activeLayers).forEach((layerKey) => {
      if (activeLayers[layerKey]) {
        fetchArcGISLayer(layerKey);
      } else {
        setArcGisData((prev) => ({ ...prev, [layerKey]: EMPTY_GEOJSON }));
      }
    });
  }, [activeLayers, fetchArcGISLayer]);

  useEffect(() => {
    if (mapReady) {
      refreshVisibleLayers();
    }
  }, [mapReady, refreshVisibleLayers]);

  const handleMapLoad = useCallback(
    (event) => {
      mapRef.current = event.target;
      setMapReady(true);
      refreshVisibleLayers();
    },
    [refreshVisibleLayers]
  );

  const scheduleRefresh = useCallback(() => {
    if (moveTimer.current) {
      clearTimeout(moveTimer.current);
    }
    moveTimer.current = setTimeout(() => refreshVisibleLayers(), 350);
  }, [refreshVisibleLayers]);

  useEffect(() => {
    const moveTimerRef = moveTimer;
    const abortControllersRef = abortControllers;

    return () => {
      if (moveTimerRef.current) {
        clearTimeout(moveTimerRef.current);
      }
      Object.values(abortControllersRef.current).forEach((controller) => controller?.abort());
    };
  }, []);

  const toggleLayer = (layerKey) => {
    setActiveLayers((prev) => ({ ...prev, [layerKey]: !prev[layerKey] }));
  };

  const fireHotspot = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: isDisasterActive
        ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: hotspotCoordinates } }]
        : []
    };
  }, [isDisasterActive, hotspotCoordinates]);

  const activeLegendLayers = Object.values(ARCGIS_LAYERS).filter((layer) => activeLayers[layer.key]);
  const activeLayerCount = activeLegendLayers.length;

  return (
    <div className="h-[calc(100vh-12rem)] w-full rounded-2xl overflow-hidden relative group shadow-lg border border-gray-800">
      {/* Controls Overlay */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <div className="glass-panel rounded-xl shadow-md p-1.5 flex flex-col gap-1 border border-white/20 bg-black/60 backdrop-blur-md">
          <button
            onClick={() => setMapMode('satellite')}
            className={`p-2.5 rounded-lg transition-all font-medium ${mapMode === 'satellite' ? 'bg-green-500/30 text-green-400 shadow-sm border border-green-500/40' : 'hover:bg-white/10 text-gray-400'}`}
            title="ArcGIS Satellite View (Official Africa GeoPortal)"
          >
            <MapPin className="h-5 w-5" />
          </button>
          <button
            onClick={() => setMapMode('osm')}
            className={`p-2.5 rounded-lg transition-all font-medium ${mapMode === 'osm' ? 'bg-green-500/30 text-green-400 shadow-sm border border-green-500/40' : 'hover:bg-white/10 text-gray-400'}`}
            title="OpenStreetMap View (Official Open Layer)"
          >
            <Layers className="h-5 w-5" />
          </button>
        </div>

        <div className="glass-panel rounded-xl shadow-md p-1.5 flex flex-col gap-1 border border-white/20 bg-black/60 backdrop-blur-md">
          {Object.values(ARCGIS_LAYERS).map((layer) => {
            const Icon = LAYER_ICONS[layer.icon] || Layers;
            const isActive = activeLayers[layer.key];
            const isLoading = layersLoading[layer.key];
            const hasError = Boolean(layersError[layer.key]);

            return (
              <button
                key={layer.key}
                onClick={() => toggleLayer(layer.key)}
                className={`relative p-2.5 rounded-lg transition-all font-medium ${isActive ? 'bg-cyan-500/30 text-cyan-400 shadow-sm border border-cyan-500/40' : 'hover:bg-white/10 text-gray-400'} ${hasError ? 'border-red-500/70' : ''}`}
                title={`${layer.label} — ${layer.description}`}
              >
                <Icon className="h-5 w-5" />
                {isLoading && (
                  <Loader2 className="absolute top-0 right-0 h-3 w-3 animate-spin text-cyan-300" />
                )}
                <span className="sr-only">{layer.label}</span>
              </button>
            );
          })}
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

      {/* Live Atlas Legend */}
      {activeLegendLayers.length > 0 && (
        <div className="absolute bottom-6 left-4 z-10 glass-panel rounded-xl px-3 py-3 shadow-lg border border-white/20 bg-black/60 backdrop-blur-md max-w-[240px]">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-gray-200">
            <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
            Esri Living Atlas
          </div>
          <div className="space-y-2">
            {activeLegendLayers.map((layer) => (
              <div key={layer.key}>
                <div className="text-[11px] font-semibold text-gray-100">{layer.label}</div>
                <div className="mt-1 space-y-1">
                  {layer.legend.map((item) => (
                    <div key={item.label} className="flex items-center gap-2 text-[10px] text-gray-300">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 glass-panel px-5 py-3 rounded-full shadow-lg border border-white/20 bg-black/60 backdrop-blur-md flex gap-6 text-xs font-bold text-gray-200">
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.6)] block ring-2 ${isDisasterActive ? 'bg-red-500 ring-red-400 shadow-red-500' : 'bg-green-500 ring-green-400'}`}></span>
          {primaryFarmName} (Galileo GNSS)
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)] block ring-2 ring-cyan-300"></span>
          {activeLayerCount} Official Living Atlas Layer{activeLayerCount === 1 ? '' : 's'}
        </div>
      </div>

      <MapGL
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        onLoad={handleMapLoad}
        onMoveEnd={scheduleRefresh}
        mapStyle={activeStyle}

        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="top-right" />

        {/* Official ArcGIS Living Atlas feature layers (kept under farm geometry) */}
        {Object.values(ARCGIS_LAYERS).map((layer) => {
          if (!activeLayers[layer.key]) return null;
          const style = ARCGIS_LAYER_STYLE[layer.key];

          return (
            <Source
              key={layer.key}
              id={`arcgis-${layer.key}`}
              type="geojson"
              data={arcGisData[layer.key] || EMPTY_GEOJSON}
            >
              <Layer
                id={`arcgis-${layer.key}-${style.type}`}
                type={style.type}
                paint={style.paint}
              />
            </Source>
          );
        })}

        {/* Farm Fence Polygons */}
        <Source id="farm-fence" type="geojson" data={farmData}>
          <Layer
            id="farm-fence-fill"
            type="fill"
            paint={{
              'fill-color': isDisasterActive ? '#EF4444' : '#22C55E',
              'fill-opacity': isDisasterActive ? 0.45 : 0.25
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
              'circle-radius': 16,
              'circle-opacity': 0.85,
              'circle-blur': 0.4
            }}
          />
        </Source>
      </MapGL>
    </div>
  );
}