const API_URL = "https://tdot-api-manual.eba-muthcmmp.us-east-2.elasticbeanstalk.com/api";

export const healthAPI = {
  check: async () => {
    try {
      const res = await fetch(`${API_URL}/health`);
      return res.ok ? await res.json() : { status: "error" };
    } catch (err) {
      return { status: "error", message: err.message };
    }
  }
};

export const projectsAPI = {
  getAll: async (params = {}) => {
    try {
      const qs = new URLSearchParams(params).toString();
      const res = await fetch(`${API_URL}/projects?${qs}`);
      return res.ok ? await res.json() : { success: false, data: [] };
    } catch (err) {
      return { success: false, error: err.message, data: [] };
    }
  }
};

export const layersAPI = {
  ebird: async (params) => {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${API_URL}/layers/ebird/locations?${qs}`);
    return res.ok ? await res.json() : { type: "FeatureCollection", features: [] };
  },
  waterQuality: async (params) => {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${API_URL}/layers/water-quality/stations?${qs}`);
    return res.ok ? await res.json() : { type: "FeatureCollection", features: [] };
  },
  climate: async (params) => {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${API_URL}/layers/climate/stations?${qs}`);
    return res.ok ? await res.json() : { type: "FeatureCollection", features: [] };
  },
  inaturalist: async (params) => {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${API_URL}/layers/biodiversity/observations?${qs}`);
    return res.ok ? await res.json() : { type: "FeatureCollection", features: [] };
  },
  huc12: async (params) => {
    try {
      const { north, south, east, west } = params;
      if (!north || !south || !east || !west) {
        return { type: "FeatureCollection", features: [] };
      }
      
      // Helper function to convert WGS84 to Web Mercator
      const toWebMercator = (lon, lat) => {
        const x = lon * 20037508.34 / 180;
        const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) * 20037508.34 / Math.PI;
        return [x, y];
      };
      
      // Convert bbox to Web Mercator
      const [xmin, ymin] = toWebMercator(west, south);
      const [xmax, ymax] = toWebMercator(east, north);
      
      // Call TDEC HUC12 REST service (uses Web Mercator - WKID 102113)
      const tdecUrl = 'https://tdeconline.tn.gov/arcgis/rest/services/HUC12/MapServer/0/query';
      const geometryJson = JSON.stringify({ xmin, ymin, xmax, ymax });
      
      const url = new URL(tdecUrl);
      url.searchParams.append('geometry', geometryJson);
      url.searchParams.append('geometryType', 'esriGeometryEnvelope');
      url.searchParams.append('spatialRel', 'esriSpatialRelIntersects');
      url.searchParams.append('outSR', JSON.stringify({ wkid: 4326 }));
      url.searchParams.append('f', 'geojson');
      url.searchParams.append('returnGeometry', 'true');
      url.searchParams.append('outFields', '*');
      
      const res = await fetch(url.toString(), { mode: 'cors' });
      if (!res.ok) {
        console.warn(`HUC12 API returned status ${res.status}`);
        return { type: "FeatureCollection", features: [] };
      }
      
      const data = await res.json();
      return {
        type: "FeatureCollection",
        features: (data.features || []).map(f => ({
          type: "Feature",
          id: f.properties?.HUC_12,
          geometry: f.geometry,
          properties: {
            huc12: f.properties?.HUC_12 || 'N/A',
            huc10: f.properties?.HUC_10 || 'N/A',
            huc8: f.properties?.HUC_8 || 'N/A',
            name: f.properties?.HU_12_NAME || 'Unnamed Watershed',
            area_acres: f.properties?.ACRES,
            downstream_huc12: f.properties?.HU_12_DS,
            states: f.properties?.STATES,
            data_source: 'TDEC HUC12'
          }
        }))
      };
    } catch (err) {
      console.error('HUC12 service error:', err);
      return { type: "FeatureCollection", features: [] };
    }
  },
  floodHazard: async (params) => {
    try {
      const qs = new URLSearchParams(params).toString();
      const res = await fetch(`${API_URL}/layers/flood-hazard/zones?${qs}`);
      return res.ok ? await res.json() : { type: "FeatureCollection", features: [] };
    } catch (err) {
      console.error('Flood hazard service error:', err);
      return { type: "FeatureCollection", features: [] };
    }
  }
};

export const fetchLayerData = async (layerId, params = {}) => {
  try {
    switch (layerId) {
      case "ebird":
        return await layersAPI.ebird(params);
      case "water-quality":
        return await layersAPI.waterQuality(params);
      case "climate":
        return await layersAPI.climate(params);
      case "inaturalist":
        return await layersAPI.inaturalist(params);
      case "huc12":
        return await layersAPI.huc12(params);
      case "flood-hazard":
        return await layersAPI.floodHazard(params);
      default:
        return { type: "FeatureCollection", features: [] };
    }
  } catch (err) {
    console.error('Error fetching layer data:', err);
    return { type: "FeatureCollection", features: [] };
  }
};
