export const LAYER_CONFIG = {
  ebird: { name: '🐦 eBird', color: '#FF8C00' },
  'water-quality': { name: '💧 Water Quality', color: '#1E90FF' },
  climate: { name: '🌡️ Climate', color: '#DC143C' },
  inaturalist: { name: '🦋 iNaturalist', color: '#FF69B4' },
  huc12: { name: '🏞️ HUC12 Watersheds', color: '#228B22' },
  'flood-hazard': { name: '⚠️ Flood Hazard', color: '#FF4500' }
};

export const BASE_MAPS = {
  OpenStreetMap: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr: '© OpenStreetMap',
    label: 'Street'
  },
  Satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr: '© Esri',
    label: 'Satellite'
  },
  Terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attr: '© OpenTopoMap',
    label: 'Terrain'
  }
};
