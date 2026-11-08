export const LAYER_CONFIG = {
  ebird: { 
    name: 'eBird', 
    color: '#FF8C00', 
    type: 'point',
    displayExtent: Infinity,
    requiresBbox: true
  },
  'water-quality': { 
    name: 'Water Quality', 
    color: '#1E90FF', 
    type: 'point',
    displayExtent: Infinity,
    requiresBbox: true
  },
  climate: { 
    name: 'Climate', 
    color: '#DC143C', 
    type: 'point',
    displayExtent: Infinity,
    requiresBbox: true
  },
  inaturalist: { 
    name: 'iNaturalist', 
    color: '#FF69B4', 
    type: 'point',
    displayExtent: Infinity,
    requiresBbox: true
  },
  huc12: { 
    name: 'HUC12 Watersheds', 
    color: '#228B22', 
    type: 'polygon',
    displayExtent: Infinity,
    directQuery: true  // Query TDEC REST service directly from frontend
  },
  'flood-zones': { 
    name: 'Flood Zones', 
    color: '#FF4500', 
    type: 'polygon',
    displayExtent: 0.5,
    requiresBbox: true
  }
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
