import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import MapGL, { NavigationControl, Source, Layer } from "react-map-gl/maplibre";
import {
  MapPin,
  Layers,
  AlertTriangle,
  Loader2,
  Flame,
  Waves,
  Activity,
  Play,
  Pause,
  RotateCcw,
  Calendar,
  Sparkles
} from "lucide-react";
import { OPEN_MAP_STYLE, SATELLITE_MAP_STYLE } from "../utils/mapStyles";
import {
  ARCGIS_LAYERS,
  ARCGIS_LAYER_STYLE,
  EMPTY_GEOJSON,
  buildArcGISQueryUrl,
  flattenBounds,
} from "../utils/arcGisLayers";

const LAYER_ICONS = {
  flame: Flame,
  waves: Waves,
  activity: Activity,
};

function featureCenter(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return null;
  if (geometry.type === "Point") {
    return geometry.coordinates;
  }
  const ring =
    geometry.type === "Polygon"
      ? geometry.coordinates?.[0]
      : geometry.type === "MultiPolygon"
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

/* Bounding box [west, south, east, north] across every farm polygon */
function collectionBounds(featureCollection) {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  const visit = (coords) => {
    coords.forEach(([lon, lat]) => {
      west = Math.min(west, lon); east = Math.max(east, lon);
      south = Math.min(south, lat); north = Math.max(north, lat);
    });
  };
  (featureCollection?.features || []).forEach((f) => {
    const g = f?.geometry;
    if (g?.type === "Polygon") visit(g.coordinates[0] || []);
    if (g?.type === "MultiPolygon") (g.coordinates[0] || []).forEach(visit);
    if (g?.type === "Point") visit([g.coordinates]);
  });
  return Number.isFinite(west) ? [west, south, east, north] : null;
}

function fallbackFarmFeature(defaultName) {
  return {
    type: "Feature",
    properties: { name: defaultName },
    geometry: {
      type: "Polygon",
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

export default function MapView({ isDisasterActive, onSimulateDisaster, isSimulating = false, farms = [], alerts = [] }) {
  const { t } = useTranslation();
  const [viewState, setViewState] = useState({
    longitude: 37.9,
    latitude: 0.02,
    zoom: 11,
    pitch: 0
  });

  const [mapMode, setMapMode] = useState("satellite");
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

  // Time Slider State
  const [timeIndex, setTimeIndex] = useState(6);
  const [isPlaying, setIsPlaying] = useState(false);

  /* Disaster-type-specific evolution scenarios.
   * Each curve models the canonical signature of the peril based on historical
   * event patterns: drought = slow NDVI decay over ~30 days; flood = streamflow
   * surging within 2-3 days; wildfire = FRP hotspots erupting in 24-48h;
   * heatwave = temperature anomaly building over a week. */
  const SCENARIOS = useMemo(() => ({
    DROUGHT: {
      metricKey: "ts_ndvi_label",
      points: [
        { v: "0.78", q: "ts_ndvi_healthy", riskKey: "normal" },
        { v: "0.74", q: "ts_ndvi_optimal", riskKey: "normal" },
        { v: "0.68", q: "ts_ndvi_adequate", riskKey: "normal" },
        { v: "0.55", q: "ts_ndvi_mild_stress", riskKey: "low" },
        { v: "0.42", q: "ts_ndvi_drying", riskKey: "moderate" },
        { v: "0.31", q: "ts_ndvi_drought_warning", riskKey: "high" },
      ],
      activeV: "0.18", activeQ: "ts_ndvi_extreme", idleV: "0.72", idleQ: "ts_ndvi_stable",
    },
    FLOOD: {
      metricKey: "ts_metric_flow",
      points: [
        { v: "12.4", q: "ts_q_flow_normal", riskKey: "normal" },
        { v: "13.1", q: "ts_q_flow_normal", riskKey: "normal" },
        { v: "18.7", q: "ts_q_flow_normal", riskKey: "normal" },
        { v: "42.5", q: "ts_q_flow_rising", riskKey: "low" },
        { v: "96.0", q: "ts_q_flow_rising", riskKey: "moderate" },
        { v: "188.3", q: "ts_q_flow_bankfull", riskKey: "high" },
      ],
      activeV: "342.0", activeQ: "ts_q_flow_flooding", idleV: "15.8", idleQ: "ts_q_flow_normal",
    },
    WILDFIRE: {
      metricKey: "ts_metric_frp",
      points: [
        { v: "0.0", q: "ts_q_fire_none", riskKey: "normal" },
        { v: "0.0", q: "ts_q_fire_none", riskKey: "normal" },
        { v: "2.1", q: "ts_q_fire_none", riskKey: "normal" },
        { v: "8.4", q: "ts_q_fire_smoldering", riskKey: "low" },
        { v: "24.6", q: "ts_q_fire_emerging", riskKey: "moderate" },
        { v: "61.2", q: "ts_q_fire_active", riskKey: "high" },
      ],
      activeV: "128.5", activeQ: "ts_q_fire_extreme", idleV: "0.0", idleQ: "ts_q_fire_none",
    },
    HEATWAVE: {
      metricKey: "ts_metric_temp",
      points: [
        { v: "+0.3", q: "ts_q_heat_mild", riskKey: "normal" },
        { v: "+0.6", q: "ts_q_heat_mild", riskKey: "normal" },
        { v: "+1.1", q: "ts_q_heat_elevated", riskKey: "normal" },
        { v: "+1.8", q: "ts_q_heat_elevated", riskKey: "low" },
        { v: "+2.4", q: "ts_q_heat_severe", riskKey: "moderate" },
        { v: "+3.1", q: "ts_q_heat_severe", riskKey: "high" },
      ],
      activeV: "+4.6", activeQ: "ts_q_heat_extreme", idleV: "+0.4", idleQ: "ts_q_heat_mild",
    },
  }), []);

  const SCENARIO_LABEL_KEYS = { DROUGHT: "drought", FLOOD: "flood", WILDFIRE: "wildfire", HEATWAVE: "heatwave" };

  // Default scenario follows the latest real alert's event type
  const alertScenario = useMemo(() => {
    const ev = String(alerts[0]?.event_type || "").toUpperCase();
    return SCENARIOS[ev] ? ev : "DROUGHT";
  }, [alerts, SCENARIOS]);
  const [scenarioOverride, setScenarioOverride] = useState(null);
  const activeScenarioKey = scenarioOverride || alertScenario;
  const scenarioDef = SCENARIOS[activeScenarioKey];

  const timelineDates = useMemo(() => {
    const relDays = [30, 25, 20, 15, 10, 5];
    const dates = ["2026-07-20", "2026-07-25", "2026-07-30", "2026-08-04", "2026-08-09", "2026-08-14"];
    const labels = ["T-30d", "T-25d", "T-20d", "T-15d", "T-10d", "T-5d"];
    const rows = scenarioDef.points.map((p, i) => ({
      day: t("ts_day_prefix", { days: relDays[i] }),
      label: labels[i],
      date: dates[i],
      ndvi: `${p.v} (${t(p.q)})`,
      riskKey: p.riskKey,
    }));
    rows.push({
      day: t("ts_today"),
      label: t("ts_now"),
      date: "2026-08-19",
      ndvi: isDisasterActive
        ? `${scenarioDef.activeV} (${t(scenarioDef.activeQ)})`
        : `${scenarioDef.idleV} (${t(scenarioDef.idleQ)})`,
      riskKey: isDisasterActive ? "critical" : "normal",
    });
    return rows;
  }, [isDisasterActive, t, scenarioDef]);

  const RISK_LABEL_KEYS = {
    normal: "ts_risk_normal",
    low: "ts_risk_low",
    moderate: "ts_risk_moderate",
    high: "ts_risk_high",
    critical: "ts_risk_critical",
  };

  // Localize MapLibre control tooltips (Zoom in/out, compass, attribution)
  const mapLocale = useMemo(() => ({
    "NavigationControl.ZoomIn": t("map_zoom_in"),
    "NavigationControl.ZoomOut": t("map_zoom_out"),
    "NavigationControl.ResetBearing": t("map_reset_north"),
    "AttributionControl.ToggleAttribution": t("map_toggle_attrib"),
    "FullscreenControl.Enter": t("map_fullscreen_enter"),
    "FullscreenControl.Exit": t("map_fullscreen_exit"),
  }), [t]);

  useEffect(() => {
    let interval = null;
    if (isPlaying) {
      interval = setInterval(() => {
        setTimeIndex((prev) => (prev + 1) % timelineDates.length);
      }, 1500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, timelineDates.length]);

  const activeStyle = useMemo(() => {
    return mapMode === "satellite" ? SATELLITE_MAP_STYLE : OPEN_MAP_STYLE;
  }, [mapMode]);

  const localizedLayers = useMemo(() => {
    return Object.values(ARCGIS_LAYERS).map((layer) => ({
      ...layer,
      label: t(`layer_${layer.key}_label`),
      description: t(`layer_${layer.key}_desc`),
      legend: layer.legend.map((item, idx) => ({
        ...item,
        label: t(layer.legendKeys?.[idx] || ""),
      })),
    }));
  }, [t]);

  const farmData = useMemo(() => {
    if (farms.length > 0) {
      return { type: "FeatureCollection", features: farms };
    }
    return { type: "FeatureCollection", features: [fallbackFarmFeature(t("farmer_default_farm_name"))] };
  }, [farms, t]);

  const primaryFeature = useMemo(() => farmData.features[0], [farmData]);
  const primaryFarmName = primaryFeature?.properties?.name || t("farmer_default_farm_name");
  const hotspotCoordinates = useMemo(
    () => featureCenter(primaryFeature) || [37.9, 0.02],
    [primaryFeature]
  );

  useEffect(() => {
    // Fit the viewport to ALL farm parcels so no insured plot is off-screen
    const bounds = collectionBounds(farmData);
    if (!bounds) return;
    const map = mapRef.current;
    if (mapReady && map) {
      map.fitBounds(
        [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
        { padding: 90, maxZoom: 13, duration: 800 }
      );
    } else {
      const center = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
      setViewState((prev) => ({ ...prev, longitude: center[0], latitude: center[1] }));
    }
  }, [farmData, mapReady]);

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
        if (error.name !== "AbortError") {
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
      setMapReady(true)
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
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
      Object.values(abortControllersRef.current).forEach((controller) => controller?.abort());
    };
  }, []);

  const toggleLayer = (layerKey) => {
    setActiveLayers((prev) => ({ ...prev, [layerKey]: !prev[layerKey] }));
  };

  const fireHotspot = useMemo(() => {
    return {
      type: "FeatureCollection",
      features: isDisasterActive
        ? [{ type: "Feature", geometry: { type: "Point", coordinates: hotspotCoordinates } }]
        : []
    };
  }, [isDisasterActive, hotspotCoordinates]);

  const activeLegendLayers = localizedLayers.filter((layer) => activeLayers[layer.key]);
  const activeLayerCount = activeLegendLayers.length;
  const currentTimelinePoint = timelineDates[timeIndex] || timelineDates[timelineDates.length - 1];

  return (
    <div className="h-[calc(100vh-12rem)] w-full rounded-2xl overflow-hidden relative group shadow-lg border border-border/80 bg-card">
      {/* Controls Overlay */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <div className="glass-panel rounded-xl shadow-md p-1.5 flex flex-col gap-1 border border-border/40 bg-card/80 backdrop-blur-md">
          <button
            onClick={() => setMapMode("satellite")}
            className={`p-2.5 rounded-lg transition-all font-medium ${mapMode === "satellite" ? "bg-primary/20 text-primary shadow-sm border border-primary/40" : "hover:bg-muted text-muted-foreground"}`}
            title={t("map_satellite_title")}
          >
            <MapPin className="h-5 w-5" />
          </button>
          <button
            onClick={() => setMapMode("osm")}
            className={`p-2.5 rounded-lg transition-all font-medium ${mapMode === "osm" ? "bg-primary/20 text-primary shadow-sm border border-primary/40" : "hover:bg-muted text-muted-foreground"}`}
            title={t("map_osm_title")}
          >
            <Layers className="h-5 w-5" />
          </button>
        </div>

        <div className="glass-panel rounded-xl shadow-md p-1.5 flex flex-col gap-1 border border-border/40 bg-card/80 backdrop-blur-md">
          {localizedLayers.map((layer) => {
            const Icon = LAYER_ICONS[layer.icon] || Layers;
            const isActive = activeLayers[layer.key];
            const isLoading = layersLoading[layer.key];
            const hasError = Boolean(layersError[layer.key]);

            return (
              <button
                key={layer.key}
                onClick={() => toggleLayer(layer.key)}
                className={`relative p-2.5 rounded-lg transition-all font-medium ${isActive ? "bg-cyan-500/20 text-cyan-400 shadow-sm border border-cyan-500/40" : "hover:bg-muted text-muted-foreground"} ${hasError ? "border-red-500/70" : ""}`}
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

      {/* Disaster Trigger Simulation */}
      {onSimulateDisaster && (
        <div className="absolute top-4 right-14 z-10">
          <button
            onClick={onSimulateDisaster}
            disabled={isSimulating}
            className={`px-4 py-2 rounded-full font-bold shadow-lg flex items-center gap-2 transition-all disabled:cursor-not-allowed disabled:opacity-70 ${
              isDisasterActive
                ? "bg-red-500 hover:bg-red-600 text-white animate-pulse"
                : "bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white"
            }`}
          >
            {isSimulating ? <Loader2 className="h-5 w-5 animate-spin" /> : <AlertTriangle className="h-5 w-5" />}
            {isSimulating ? t("map_running_pipeline") : isDisasterActive ? t("map_disaster_active") : t("map_simulate_disaster")}
          </button>
        </div>
      )}

      {/* Live Atlas Legend */}
      {activeLegendLayers.length > 0 && (
        <div className="absolute bottom-28 left-4 z-10 glass-panel rounded-xl px-3 py-3 shadow-lg border border-border/40 bg-card/85 backdrop-blur-md max-w-[240px] max-h-48 overflow-y-auto scrollbar-thin">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-foreground">
            <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
            {t("map_esri_living_atlas")}
          </div>
          <div className="space-y-2">
            {activeLegendLayers.map((layer) => (
              <div key={layer.key}>
                <div className="text-[11px] font-semibold text-foreground/90">{layer.label}</div>
                <div className="mt-1 space-y-1">
                  {layer.legend.map((item) => (
                    <div key={item.label} className="flex items-center gap-2 text-[10px] text-muted-foreground">
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

      {/* Interactive Time Slider Controller */}
      <div className="absolute bottom-4 left-4 right-4 z-10 glass-panel p-3 rounded-2xl shadow-xl border border-border/60 bg-card/90 backdrop-blur-md flex flex-col md:flex-row items-center gap-4 justify-between">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all shrink-0 shadow-md"
            title={isPlaying ? t("timeslider_pause") : t("timeslider_play")}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
          <button
            onClick={() => { setIsPlaying(false); setTimeIndex(0); }}
            className="p-2 rounded-xl bg-muted text-muted-foreground hover:text-foreground transition-all shrink-0"
            title={t("timeslider_reset")}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <div className="text-xs">
            <div className="font-bold text-foreground flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              {currentTimelinePoint.date} ({currentTimelinePoint.day})
            </div>
            <div className="text-[11px] text-muted-foreground">
              {t(scenarioDef.metricKey)}: <span className="font-semibold text-foreground">{currentTimelinePoint.ndvi}</span> · {t("ts_status_label")}: <span className={currentTimelinePoint.riskKey === "normal" ? "text-green-500 font-semibold" : currentTimelinePoint.riskKey === "critical" ? "text-red-500 font-bold" : "text-amber-500 font-bold"}>{t(RISK_LABEL_KEYS[currentTimelinePoint.riskKey] || "ts_risk_normal")}</span>
            </div>
          </div>
        </div>

        {/* Disaster scenario selector — drought / flood / wildfire / heatwave curves */}
        <div className="w-full md:w-auto shrink-0">
          <select
            value={activeScenarioKey}
            onChange={(e) => { setScenarioOverride(e.target.value); setTimeIndex(6); }}
            aria-label={t("ts_scenario")}
            className="w-full md:w-auto rounded-xl border border-border bg-muted/60 px-3 py-2 text-xs font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          >
            {Object.keys(SCENARIOS).map((key) => (
              <option key={key} value={key}>{t(SCENARIO_LABEL_KEYS[key])}</option>
            ))}
          </select>
        </div>

        {/* Range Slider */}
        <div className="w-full md:flex-1 max-w-2xl flex flex-col gap-1.5 px-2">
          <div className="flex justify-between text-[11px] text-foreground/70 font-bold font-mono">
            {timelineDates.map((item, idx) => (
              <button
                key={item.day}
                onClick={() => { setIsPlaying(false); setTimeIndex(idx); }}
                className={`cursor-pointer transition-colors px-1 py-0.5 rounded ${timeIndex === idx ? "text-primary scale-110 bg-primary/10" : "hover:text-foreground"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={timelineDates.length - 1}
            step={1}
            value={timeIndex}
            onChange={(e) => { setIsPlaying(false); setTimeIndex(parseInt(e.target.value, 10)); }}
            className="w-full h-2.5 bg-primary/20 rounded-full appearance-none cursor-pointer accent-primary"
          />
        </div>

        {/* Active Farm & Layer Stats Badge */}
        <div className="hidden lg:flex items-center gap-3 text-xs shrink-0 font-medium">
          <div className="flex items-center gap-1.5 bg-muted/60 px-3 py-1.5 rounded-xl border border-border/40">
            <span className={`w-2.5 h-2.5 rounded-full ${isDisasterActive ? "bg-red-500 animate-ping" : "bg-green-500"}`} />
            <span className="text-foreground font-semibold">{primaryFarmName}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-cyan-500/10 text-cyan-400 px-3 py-1.5 rounded-xl border border-cyan-500/30">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t("map_official_layers", { count: activeLayerCount })}</span>
          </div>
        </div>
      </div>

      <MapGL
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        onLoad={handleMapLoad}
        onMoveEnd={scheduleRefresh}
        mapStyle={activeStyle}
        locale={mapLocale}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="top-right" />

        {/* Official ArcGIS Living Atlas feature layers */}
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
              "fill-color": isDisasterActive ? "#EF4444" : "#22C55E",
              "fill-opacity": isDisasterActive ? 0.5 : 0.3
            }}
          />
          <Layer
            id="farm-fence-line"
            type="line"
            paint={{
              "line-color": isDisasterActive ? "#EF4444" : "#15803D",
              "line-width": 3
            }}
          />
          {/* Farm name labels — visible at a glance for insurers & farmers */}
          <Layer
            id="farm-fence-label"
            type="symbol"
            layout={{
              "text-field": ["coalesce", ["get", "name"], t("farmer_default_farm_name")],
              "text-size": 13,
              "text-font": ["Noto Sans Regular"],
              "text-allow-overlap": true
            }}
            paint={{
              "text-color": isDisasterActive ? "#991B1B" : "#14532D",
              "text-halo-color": "#FFFFFF",
              "text-halo-width": 2
            }}
          />
        </Source>

        {/* Disaster Hotspot */}
        <Source id="fire-hotspot" type="geojson" data={fireHotspot}>
          <Layer
            id="fire-hotspot-point"
            type="circle"
            paint={{
              "circle-color": "#EF4444",
              "circle-radius": 16,
              "circle-opacity": 0.85,
              "circle-blur": 0.4
            }}
          />
        </Source>
      </MapGL>
    </div>
  );
}
