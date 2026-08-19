// Open/ArcGIS Tile Styles compliant with SATNAV Africa Joint Programme specs
// No proprietary Mapbox token or API key required!
// MapLibre glyphs are required for symbol (text label) layers.
const MAP_GLYPHS = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';

export const OPEN_MAP_STYLE = {
  version: 8,
  glyphs: MAP_GLYPHS,
  sources: {
    'osm-tiles': {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
      ],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }
  },
  layers: [
    {
      id: 'osm-layer',
      type: 'raster',
      source: 'osm-tiles',
      minzoom: 0,
      maxzoom: 19
    }
  ]
};

export const SATELLITE_MAP_STYLE = {
  version: 8,
  glyphs: MAP_GLYPHS,
  sources: {
    'esri-imagery': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256,
      attribution: 'Tiles &copy; Esri &mdash; Africa GeoPortal / Living Atlas'
    }
  },
  layers: [
    {
      id: 'esri-layer',
      type: 'raster',
      source: 'esri-imagery',
      minzoom: 0,
      maxzoom: 19
    }
  ]
};
