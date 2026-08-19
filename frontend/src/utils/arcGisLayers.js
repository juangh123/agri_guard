// Official ArcGIS Living Atlas service endpoints used by AgriGuard.
// These are public FeatureServer endpoints and do not require an API key.
export const EMPTY_GEOJSON = Object.freeze({
  type: 'FeatureCollection',
  features: [],
});

export const ARCGIS_LAYERS = {
  viirs: {
    key: 'viirs',
    label: 'VIIRS Fire Activity',
    shortLabel: 'Fires',
    icon: 'flame',
    description: 'NASA LANCE VIIRS thermal hotspots, last 7 days',
    sourceAttribution: 'NASA LANCE / Esri Living Atlas',
    serviceUrl: 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0/query',
    resultRecordCount: 800,
    orderByFields: 'acq_date DESC',
    outFields: 'latitude,longitude,bright_ti4,frp,confidence,daynight,acq_date,acq_time,hours_old',
    legendKeys: ['legend_high_confidence', 'legend_nominal_confidence', 'legend_low_confidence'],
    legend: [
      { label: 'High confidence', color: '#ef4444' },
      { label: 'Nominal confidence', color: '#f97316' },
      { label: 'Low confidence', color: '#facc15' },
    ],
  },
  glofas: {
    key: 'glofas',
    label: 'GEOGLOWS Streamflow',
    shortLabel: 'Flow',
    icon: 'waves',
    description: 'GEOGLOWS 2.0 ECMWF 10-day streamflow forecast',
    sourceAttribution: 'GEOGLOWS / ECMWF / Esri Living Atlas',
    serviceUrl: 'https://livefeeds3.arcgis.com/arcgis/rest/services/GEOGLOWS/GlobalWaterModel_Medium/MapServer/0/query',
    resultRecordCount: 700,
    orderByFields: 'meanflow DESC',
    outFields: 'comid,streamorder,rivercountry,meanflow,returnperiod,thickness,timevalue',
    legendKeys: ['legend_low_flow', 'legend_moderate', 'legend_high', 'legend_extreme'],
    legend: [
      { label: 'Low flow', color: '#38bdf8' },
      { label: 'Moderate', color: '#2563eb' },
      { label: 'High', color: '#7c3aed' },
      { label: 'Extreme', color: '#dc2626' },
    ],
  },
  gauges: {
    key: 'gauges',
    label: 'Live Stream Gauges',
    shortLabel: 'Gauges',
    icon: 'activity',
    description: 'Live USGS/NOAA stream gauge readings',
    sourceAttribution: 'USGS / NOAA / Esri Living Atlas',
    serviceUrl: 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Live_Stream_Gauges_v1/FeatureServer/0/query',
    resultRecordCount: 500,
    orderByFields: 'lastupdate DESC',
    outFields: 'stationid,stationurl,stage_ft,flow_cfs,status,name,lastupdate,lastupdate_age,status_full',
    legendKeys: ['legend_normal', 'legend_minor', 'legend_moderate', 'legend_major_flood'],
    legend: [
      { label: 'Normal', color: '#22c55e' },
      { label: 'Minor', color: '#facc15' },
      { label: 'Moderate', color: '#f97316' },
      { label: 'Major/Flood', color: '#dc2626' },
    ],
  },
};

export const ARCGIS_LAYER_STYLE = {
  viirs: {
    type: 'circle',
    paint: {
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['coalesce', ['to-number', ['get', 'frp']], 0],
        0,
        3,
        100,
        16,
      ],
      'circle-color': [
        'match',
        ['downcase', ['coalesce', ['to-string', ['get', 'confidence']], '']],
        'high',
        '#ef4444',
        'nominal',
        '#f97316',
        '#facc15',
      ],
      'circle-opacity': 0.7,
      'circle-stroke-color': '#fff7ed',
      'circle-stroke-width': 0.5,
    },
  },
  glofas: {
    type: 'line',
    paint: {
      'line-color': [
        'interpolate',
        ['linear'],
        ['coalesce', ['to-number', ['get', 'meanflow']], 0],
        0,
        '#38bdf8',
        100,
        '#2563eb',
        1000,
        '#7c3aed',
        5000,
        '#dc2626',
      ],
      'line-width': [
        'interpolate',
        ['linear'],
        ['coalesce', ['to-number', ['get', 'streamorder']], 1],
        1,
        0.6,
        7,
        2.8,
      ],
      'line-opacity': 0.55,
    },
  },
  gauges: {
    type: 'circle',
    paint: {
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['coalesce', ['to-number', ['get', 'flow_cfs']], 0],
        0,
        4,
        10000,
        12,
      ],
      'circle-color': [
        'match',
        ['downcase', ['coalesce', ['to-string', ['get', 'status_full']], '']],
        'major',
        '#dc2626',
        'moderate',
        '#f97316',
        'minor',
        '#facc15',
        'normal',
        '#22c55e',
        '#38bdf8',
      ],
      'circle-opacity': 0.8,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 0.8,
    },
  },
};

export function flattenBounds(boundsArray) {
  if (!Array.isArray(boundsArray) || boundsArray.length < 2) return null;
  const [southWest, northEast] = boundsArray;
  if (!Array.isArray(southWest) || !Array.isArray(northEast)) return null;
  return [...southWest, ...northEast];
}

export function buildArcGISQueryUrl(layerKey, bounds) {
  const layer = ARCGIS_LAYERS[layerKey];
  if (!layer || !bounds) return null;

  const params = new URLSearchParams({
    where: '1=1',
    outFields: layer.outFields,
    returnGeometry: 'true',
    f: 'geojson',
    outSR: '4326',
    geometry: bounds.map((value) => Number(value)).join(','),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    resultRecordCount: String(layer.resultRecordCount),
    orderByFields: layer.orderByFields,
  });

  return `${layer.serviceUrl}?${params.toString()}`;
}
