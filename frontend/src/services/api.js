const API_URL = "http://tdot-api-manual.eba-muthcmmp.us-east-2.elasticbeanstalk.com/api";

export { API_URL };

export const healthAPI = {
  check: async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const res = await fetch(`${API_URL}/health`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return res.ok ? await res.json() : { status: "error", message: "HTTP error: " + res.status };
    } catch (err) {
      return { status: "error", message: err.message };
    }
  }
};

export const projectsAPI = {
  getAll: async (params = {}) => {
    try {
      // Add cache-busting parameter
      const cacheParam = { ...params, t: Date.now() };
      const qs = new URLSearchParams(cacheParam).toString();
      console.log('[projectsAPI] Fetching with params:', cacheParam);
      const res = await fetch(`${API_URL}/projects?${qs}`);
      if (!res.ok) {
        console.error('[projectsAPI] Response not OK:', res.status, res.statusText);
        return { success: false, data: [], error: res.statusText };
      }
      const data = await res.json();
      console.log('[projectsAPI] Successfully fetched projects:', {
        success: data.success,
        featureCount: data.features?.length,
        pagination: data.pagination
      });
      return data;
    } catch (err) {
      console.error('[projectsAPI] Error:', err);
      return { success: false, error: err.message, data: [] };
    }
  },

  // Get projects within a bounding box
  getByBbox: async (bbox, params = {}) => {
    try {
      // bbox format: [minLng, minLat, maxLng, maxLat]
      const bboxStr = `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}`;
      console.log('[projectsAPI] Fetching by bbox:', bboxStr);
      
      const cacheParam = { 
        ...params, 
        bbox: bboxStr, 
        t: Date.now() 
      };
      const qs = new URLSearchParams(cacheParam).toString();
      const res = await fetch(`${API_URL}/projects?${qs}`);
      if (!res.ok) {
        console.error('[projectsAPI] Response not OK:', res.status, res.statusText);
        return { success: false, features: [], error: res.statusText };
      }
      const data = await res.json();
      console.log('[projectsAPI] Successfully fetched bbox-filtered projects:', {
        success: data.success,
        featureCount: data.features?.length
      });
      return data;
    } catch (err) {
      console.error('[projectsAPI] Error fetching by bbox:', err);
      return { success: false, error: err.message, features: [] };
    }
  }
};

export const layersAPI = {
  ebird: async (params) => {
    try {
      const qs = new URLSearchParams(params).toString();
      const res = await fetch(`${API_URL}/layers/ebird/locations?${qs}`);
      if (!res.ok) {
        console.error(`eBird API error: ${res.status}`);
        return { type: "FeatureCollection", features: [] };
      }
      return await res.json();
    } catch (err) {
      console.error('eBird service error:', err);
      return { type: "FeatureCollection", features: [] };
    }
  },
  waterQuality: async (params) => {
    try {
      const qs = new URLSearchParams(params).toString();
      const res = await fetch(`${API_URL}/layers/water-quality/stations?${qs}`);
      if (!res.ok) {
        console.error(`Water Quality API error: ${res.status}`);
        return { type: "FeatureCollection", features: [] };
      }
      return await res.json();
    } catch (err) {
      console.error('Water Quality service error:', err);
      return { type: "FeatureCollection", features: [] };
    }
  },
  climate: async (params) => {
    try {
      const qs = new URLSearchParams(params).toString();
      const res = await fetch(`${API_URL}/layers/climate/stations?${qs}`);
      if (!res.ok) {
        console.error(`Climate API error: ${res.status}`);
        return { type: "FeatureCollection", features: [] };
      }
      return await res.json();
    } catch (err) {
      console.error('Climate service error:', err);
      return { type: "FeatureCollection", features: [] };
    }
  },
  inaturalist: async (params) => {
    try {
      const qs = new URLSearchParams(params).toString();
      const res = await fetch(`${API_URL}/layers/inaturalist?${qs}`);
      if (!res.ok) {
        console.error(`iNaturalist API error: ${res.status}`);
        return { type: "FeatureCollection", features: [] };
      }
      const data = await res.json();
      if (!data || !Array.isArray(data.features)) {
        console.warn('iNaturalist returned invalid data:', data);
        return { type: "FeatureCollection", features: [] };
      }
      return data;
    } catch (err) {
      console.error('iNaturalist service error:', err);
      return { type: "FeatureCollection", features: [] };
    }
  },
  huc12: async (params) => {
    try {
      // Query TDEC HUC12 REST service directly from frontend
      const { north, south, east, west } = params;
      if (!north || !south || !east || !west) {
        return { type: "FeatureCollection", features: [] };
      }
      
      const tdecUrl = 'https://tdeconline.tn.gov/arcgis/rest/services/HUC12/MapServer/0/query';
      const geometry = JSON.stringify({
        xmin: west,
        ymin: south,
        xmax: east,
        ymax: north
      });
      
      const url = new URL(tdecUrl);
      url.searchParams.append('geometry', geometry);
      url.searchParams.append('geometryType', 'esriGeometryEnvelope');
      url.searchParams.append('inSR', JSON.stringify({ wkid: 4326 }));
      url.searchParams.append('spatialRel', 'esriSpatialRelIntersects');
      url.searchParams.append('outSR', JSON.stringify({ wkid: 4326 }));
      url.searchParams.append('f', 'geojson');
      url.searchParams.append('returnGeometry', 'true');
      url.searchParams.append('outFields', '*');
      
      const res = await fetch(url.toString());
      if (!res.ok) {
        console.error(`HUC12 API error: ${res.status}`);
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
      case "flood-zones":
        return await layersAPI.floodHazard(params);
      default:
        return { type: "FeatureCollection", features: [] };
    }
  } catch (err) {
    console.error('Error fetching layer data:', err);
    return { type: "FeatureCollection", features: [] };
  }
};
