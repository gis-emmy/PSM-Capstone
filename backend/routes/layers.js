// API Routes for Environmental Data Layers
// ================================================
// Endpoints for: eBird, EPA Water Quality, NOAA Climate, TDEC Watersheds, FEMA Flood Hazard, iNaturalist

const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');

// Initialize cache (stdTTL = 3600 seconds = 1 hour)
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

module.exports = function(pool) {
  const router = express.Router();

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  // Database query helper
  async function queryDatabase(sql, params = []) {
    try {
      const result = await pool.query(sql, params);
      return { success: true, data: result.rows, rowCount: result.rowCount };
    } catch (error) {
      console.error('Database query error:', error);
      return { success: false, error: error.message };
    }
  }

  // GeoJSON Feature wrapper
  function createFeature(id, geometry, properties) {
    return {
      type: "Feature",
      id,
      geometry,
      properties: {
        data_source: properties.data_source || 'Unknown',
        ...properties
      }
    };
  }

  // GeoJSON FeatureCollection wrapper
  function createFeatureCollection(features, metadata = {}) {
    return {
      type: "FeatureCollection",
      features,
      metadata: {
        timestamp: new Date().toISOString(),
        ...metadata
      }
    };
  }

  // Point geometry helper
  function createPointGeometry(lat, lon) {
    return {
      type: "Point",
      coordinates: [Number(lon), Number(lat)]
    };
  }

  // Parse bbox parameter from query
  function parseBboxFromQuery(query) {
    const { north, south, east, west } = query;
    if (!north || !south || !east || !west) return null;
    return { 
      north: parseFloat(north), 
      south: parseFloat(south), 
      east: parseFloat(east), 
      west: parseFloat(west) 
    };
  }

  // Build SQL WHERE clause for bbox filtering
  function getBboxWhereClause(latColumn, lonColumn, bbox, paramIndex = 1) {
    if (!bbox) return { clause: '', params: [], nextIndex: paramIndex };
    const params = [bbox.south, bbox.north, bbox.west, bbox.east];
    const clause = `WHERE ${latColumn} >= $${paramIndex} AND ${latColumn} <= $${paramIndex + 1} 
                    AND ${lonColumn} >= $${paramIndex + 2} AND ${lonColumn} <= $${paramIndex + 3}`;
    return { clause, params, nextIndex: paramIndex + 4 };
  }

  // Parse bbox parameter
  function parseBbox(bboxStr) {
    if (!bboxStr) return null;
    const [south, west, north, east] = bboxStr.split(',').map(Number);
    return { south, west, north, east };
  }

  // ============================================================================
  // LAYER 1: EBIRD OBSERVATIONS
  // ============================================================================

  router.get('/ebird/locations', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 50, 500);
      const offset = parseInt(req.query.offset) || 0;
      const bbox = parseBboxFromQuery(req.query);

      let sql = 'SELECT * FROM ebird_locations';
      let params = [];

      // If bbox provided, filter by geographic bounds
      if (bbox) {
        sql += ` WHERE latitude >= $1 AND latitude <= $2 AND longitude >= $3 AND longitude <= $4`;
        params = [bbox.south, bbox.north, bbox.west, bbox.east];
        sql += ` ORDER BY observation_count DESC LIMIT $5 OFFSET $6`;
        params.push(limit, offset);
      } else {
        sql += ` ORDER BY observation_count DESC LIMIT $1 OFFSET $2`;
        params = [limit, offset];
      }

      const result = await queryDatabase(sql, params);

      if (result.success) {
        const features = result.data.map(loc => 
          createFeature(
            loc.location_id,
            createPointGeometry(loc.latitude, loc.longitude),
            {
              location_id: loc.location_id,
              location_name: loc.location_name,
              latitude: loc.latitude,
              longitude: loc.longitude,
              observation_count: loc.observation_count,
              unique_species_count: loc.unique_species_count,
              first_observation_date: loc.first_observation_date,
              last_observation_date: loc.last_observation_date,
              url: `https://ebird.org/hotspot/${loc.location_id}`,
              data_source: 'eBird'
            }
          )
        );

        // Get total count for the bbox
        let countSql = 'SELECT COUNT(*) as total FROM ebird_locations';
        let countParams = [];
        if (bbox) {
          countSql += ` WHERE latitude >= $1 AND latitude <= $2 AND longitude >= $3 AND longitude <= $4`;
          countParams = [bbox.south, bbox.north, bbox.west, bbox.east];
        }
        const countResult = await queryDatabase(countSql, countParams);
        const total = countResult.success ? countResult.data[0].total : 0;

        res.json(createFeatureCollection(features, {
          source: '/api/layers/ebird/locations',
          bbox: bbox,
          pagination: {
            limit,
            offset,
            total,
            hasMore: offset + limit < total
          }
        }));
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve eBird locations',
          message: result.error
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  });

  // ============================================================================
  // LAYER 2: EPA WATER QUALITY STATIONS
  // ============================================================================

  router.get('/water-quality/stations', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 50, 500);
      const offset = parseInt(req.query.offset) || 0;
      const bbox = parseBboxFromQuery(req.query);
      const organization = req.query.organization;
      const huc_code = req.query.huc_code;

      let sql = 'SELECT * FROM water_quality_stations';
      let params = [];
      let whereClause = [];

      // Add bbox filter if provided
      if (bbox) {
        whereClause.push(`latitude >= $${params.length + 1} AND latitude <= $${params.length + 2} AND longitude >= $${params.length + 3} AND longitude <= $${params.length + 4}`);
        params.push(bbox.south, bbox.north, bbox.west, bbox.east);
      }

      if (organization) {
        whereClause.push(`provider_name = $${params.length + 1}`);
        params.push(organization);
      }

      if (huc_code) {
        whereClause.push(`huc_code = $${params.length + 1}`);
        params.push(huc_code);
      }

      // Build WHERE clause
      if (whereClause.length > 0) {
        sql += ' WHERE ' + whereClause.join(' AND ');
      }

      sql += ' ORDER BY monitoring_location_name ASC';
      sql += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await queryDatabase(sql, params);

      if (result.success) {
        const features = result.data.map(station =>
          createFeature(
            station.station_id,
            createPointGeometry(station.latitude, station.longitude),
            {
              station_id: station.station_id,
              monitoring_location_identifier: station.monitoring_location_identifier,
              monitoring_location_name: station.monitoring_location_name,
              latitude: station.latitude,
              longitude: station.longitude,
              organization_identifier: station.organization_identifier,
              organization_name: station.organization_name,
              monitoring_location_type: station.monitoring_location_type,
              huc_code: station.huc_code,
              drainage_area_square_miles: station.drainage_area_square_miles,
              site_url: station.site_url,
              provider_name: station.provider_name,
              data_source: 'EPA Water Quality'
            }
          )
        );

        // Get total count with same filters
        let countSql = 'SELECT COUNT(*) as total FROM water_quality_stations';
        let countParams = [];
        if (whereClause.length > 0) {
          countSql += ' WHERE ' + whereClause.join(' AND ');
          countParams = params.slice(0, -2);
        }
        const countResult = await queryDatabase(countSql, countParams);
        const total = countResult.success ? countResult.data[0].total : 0;

        res.json(createFeatureCollection(features, {
          source: '/api/layers/water-quality/stations',
          bbox: bbox,
          pagination: {
            limit,
            offset,
            total,
            hasMore: offset + limit < total
          }
        }));
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve water quality stations',
          message: result.error
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  });

  // Get water quality results for a specific station
  router.get('/water-quality/station/:station_id/results', async (req, res) => {
    try {
      const station_id = req.params.station_id;
      const days_back = parseInt(req.query.days_back) || 90;
      const limit = Math.min(parseInt(req.query.limit) || 10, 100);

      // Note: This would typically query an external WQP API
      // For now, return placeholder structure
      res.json({
        station_id,
        results: [],
        note: 'Water quality results queried from EPA WQP API on-demand',
        api_endpoint: `https://waterqualitydata.us/data/Result/search?siteid=${station_id}&mimeType=json`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  });

  // ============================================================================
  // LAYER 3: NOAA CLIMATE DATA
  // ============================================================================

  router.get('/climate/stations', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 50, 500);
      const offset = parseInt(req.query.offset) || 0;
      const bbox = parseBboxFromQuery(req.query);

      let sql = 'SELECT * FROM weather_stations';
      let params = [];

      // Add bbox filter if provided
      if (bbox) {
        sql += ` WHERE latitude >= $${params.length + 1} AND latitude <= $${params.length + 2} AND longitude >= $${params.length + 3} AND longitude <= $${params.length + 4}`;
        params = [bbox.south, bbox.north, bbox.west, bbox.east];
      }

      sql += ` ORDER BY station_name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await queryDatabase(sql, params);

      if (result.success) {
        const features = result.data.map(station =>
          createFeature(
            station.id,
            createPointGeometry(station.latitude, station.longitude),
            {
              station_id: station.station_id,
              station_name: station.station_name,
              latitude: station.latitude,
              longitude: station.longitude,
              elevation_m: station.elevation_m,
              data_source: 'NOAA'
            }
          )
        );

        // Get total count with bbox filter
        let countSql = 'SELECT COUNT(*) as total FROM weather_stations';
        let countParams = [];
        if (bbox) {
          countSql += ` WHERE latitude >= $1 AND latitude <= $2 AND longitude >= $3 AND longitude <= $4`;
          countParams = [bbox.south, bbox.north, bbox.west, bbox.east];
        }
        const countResult = await queryDatabase(countSql, countParams);
        const total = countResult.success ? countResult.data[0].total : 0;

        res.json(createFeatureCollection(features, {
          source: '/api/layers/climate/stations',
          bbox: bbox,
          pagination: {
            limit,
            offset,
            total,
            hasMore: offset + limit < total
          }
        }));
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve climate stations',
          message: result.error
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  });

  // Get climate normals for a specific station
  router.get('/climate/station/:station_id/normals', async (req, res) => {
    try {
      const station_id = req.params.station_id;

      const sql = `SELECT 
        ws.id, ws.station_id, ws.station_name, ws.latitude, ws.longitude, ws.elevation_m,
        c.month, c.avg_temp_f, c.max_temp_f, c.min_temp_f, c.avg_precip_in, c.avg_snowfall_in
      FROM climate_monthly_normals c
      JOIN weather_stations ws ON c.station_id = ws.id
      WHERE ws.station_id = $1
      ORDER BY c.month`;

      const result = await queryDatabase(sql, [station_id]);

      if (result.success && result.data.length > 0) {
        const stationData = result.data[0];
        res.json({
          station: {
            station_id: stationData.station_id,
            station_name: stationData.station_name,
            latitude: stationData.latitude,
            longitude: stationData.longitude,
            elevation_m: stationData.elevation_m
          },
          monthly_normals: result.data.map(row => ({
            month: row.month,
            avg_temp_f: row.avg_temp_f,
            max_temp_f: row.max_temp_f,
            min_temp_f: row.min_temp_f,
            avg_precip_in: row.avg_precip_in,
            avg_snowfall_in: row.avg_snowfall_in
          })),
          data_source: 'NOAA NCEI'
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Station not found'
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  });

  // Nearest weather station
  router.get('/climate/nearest', async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat);
      const lon = parseFloat(req.query.lon);

      if (!lat || !lon) {
        return res.status(400).json({
          success: false,
          error: 'lat and lon parameters required'
        });
      }

      const sql = `SELECT 
        ws.id, ws.station_id, ws.station_name, ws.latitude, ws.longitude, ws.elevation_m,
        (6371 * acos(cos(radians($1)) * cos(radians(latitude)) * 
         cos(radians(longitude) - radians($2)) + 
         sin(radians($1)) * sin(radians(latitude)))) AS distance_km
      FROM weather_stations
      ORDER BY distance_km ASC
      LIMIT 1`;

      const result = await queryDatabase(sql, [lat, lon]);

      if (result.success && result.data.length > 0) {
        const station = result.data[0];
        
        // Get normals for this station
        const normalsResult = await queryDatabase(
          `SELECT month, avg_temp_f, max_temp_f, min_temp_f, avg_precip_in, avg_snowfall_in
           FROM climate_monthly_normals
           WHERE station_id = $1
           ORDER BY month`,
          [station.id]
        );

        res.json({
          station: {
            station_id: station.station_id,
            station_name: station.station_name,
            latitude: station.latitude,
            longitude: station.longitude,
            elevation_m: station.elevation_m,
            distance_km: station.distance_km
          },
          monthly_normals: normalsResult.data || [],
          data_source: 'NOAA NCEI'
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'No weather stations found'
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  });

  // ============================================================================
  // LAYER 4: TDEC WATERSHEDS (HUC12)
  // ============================================================================

  router.get('/watersheds/point', async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat);
      const lon = parseFloat(req.query.lon);

      if (!lat || !lon) {
        return res.status(400).json({
          success: false,
          error: 'lat and lon parameters required'
        });
      }

      // Query TDEC REST service
      // For now, return reference to TDEC service
      res.json({
        note: 'Query TDEC HUC12 MapServer for point-in-polygon',
        location: { latitude: lat, longitude: lon },
        api_endpoint: 'https://tdeconline.tn.gov/arcgis/rest/services/HUC12/MapServer/0/query',
        example_query: `?geometry=${lon},${lat}&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects&f=geojson`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  });

  router.get('/watersheds/huc12/:code', async (req, res) => {
    try {
      const code = req.params.code;

      if (!code || code.length !== 12) {
        return res.status(400).json({
          success: false,
          error: 'Invalid HUC12 code (must be 12 digits)'
        });
      }

      // Query TDEC REST service
      res.json({
        note: 'Query TDEC HUC12 MapServer for specific HUC code',
        huc12_code: code,
        api_endpoint: 'https://tdeconline.tn.gov/arcgis/rest/services/HUC12/MapServer/0/query',
        example_query: `?where=HUC_12='${code}'&f=geojson`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  });

  // ============================================================================
  // LAYER 5: FEMA FLOOD HAZARD
  // ============================================================================

  router.get('/flood-hazard/point', async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat);
      const lon = parseFloat(req.query.lon);

      if (!lat || !lon) {
        return res.status(400).json({
          success: false,
          error: 'lat and lon parameters required'
        });
      }

      // Query FEMA NFHL service
      res.json({
        note: 'Query FEMA NFHL MapServer for flood hazard zones',
        location: { latitude: lat, longitude: lon },
        api_endpoint: 'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/0/query',
        example_query: `?geometry=${lon},${lat}&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects&f=geojson`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  });

  // ============================================================================
  // LAYER 6: INATURALIST OBSERVATIONS
  // ============================================================================

  router.get('/biodiversity/observations', async (req, res) => {
    try {
      let lat = parseFloat(req.query.lat);
      let lon = parseFloat(req.query.lon);
      const radius = parseFloat(req.query.radius) || 10;
      const quality = req.query.quality || 'research';
      const limit = Math.min(parseInt(req.query.limit) || 100, 500);

      // Default to Tennessee center if no coordinates provided
      if (!lat || isNaN(lat) || !lon || isNaN(lon)) {
        lat = 35.7478;
        lon = -86.6923;
        console.log('iNaturalist: No valid coordinates, using Tennessee center:', { lat, lon });
      }

      // Check cache
      const cacheKey = `inat:${lat}:${lon}:${radius}:${quality}`;
      const cachedData = cache.get(cacheKey);
      
      if (cachedData) {
        return res.json(cachedData);
      }

      // Query iNaturalist API
      try {
        const url = 'https://api.inaturalist.org/v1/observations';
        const params = {
          lat,
          lng: lon,
          radius,
          quality_grade: quality,
          order_by: 'created_at',
          order: 'desc',
          per_page: limit
        };

        console.log('iNaturalist query params:', params);
        const response = await axios.get(url, { params, timeout: 10000 });
        
        const features = (response.data.results || []).map(obs => {
          // Safely extract coordinates from geojson field (iNaturalist returns them there)
          let obsLon = null;
          let obsLat = null;
          
          if (obs.geojson && obs.geojson.coordinates && Array.isArray(obs.geojson.coordinates)) {
            [obsLon, obsLat] = obs.geojson.coordinates;
          } else if (obs.longitude !== null && obs.latitude !== null) {
            // Fallback to direct fields
            obsLon = obs.longitude;
            obsLat = obs.latitude;
          }
          
          // Skip observations without valid coordinates
          if (obsLon === null || obsLon === undefined || obsLat === null || obsLat === undefined) {
            return null;
          }
          
          return {
            type: "Feature",
            id: obs.id,
            geometry: {
              type: "Point",
              coordinates: [Number(obsLon), Number(obsLat)]
            },
            properties: {
              id: obs.id,
              species_name: obs.taxon?.name || obs.species_guess || 'Unknown',
              common_name: obs.taxon?.preferred_common_name || '',
              organism_type: obs.taxon?.rank || '',
              observed_date: obs.observed_on || '',
              location: obs.place_guess || '',
              photo_url: obs.photos?.[0]?.medium_url || null,
              quality_grade: obs.quality_grade || 'casual',
              user_login: obs.user?.login || 'Anonymous',
              url: obs.uri || '',
              data_source: 'iNaturalist'
            }
          };
        }).filter(f => f !== null);

        const result = createFeatureCollection(features, {
          source: '/api/layers/biodiversity/observations',
          query_params: { lat, lon, radius, quality },
          total: features.length
        });

        // Cache for 15 minutes
        cache.set(cacheKey, result, 900);
        
        res.json(result);
      } catch (apiError) {
        console.error('iNaturalist API error:', apiError.message);
        res.status(503).json({
          success: false,
          error: 'iNaturalist API unavailable',
          message: apiError.message
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  });

  // ============================================================================
  // HUC12 WATERSHEDS (TDEC REST Service)
  // ============================================================================
  router.get('/huc12', async (req, res) => {
    try {
      const bbox = parseBboxFromQuery(req.query);
      
      if (!bbox) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters: north, south, east, west'
        });
      }

      // TDEC HUC12 MapServer REST service
      const tdecUrl = 'https://tdeconline.tn.gov/arcgis/rest/services/HUC12/MapServer/0/query';
      
      const params = {
        geometry: JSON.stringify({
          xmin: bbox.west,
          ymin: bbox.south,
          xmax: bbox.east,
          ymax: bbox.north
        }),
        geometryType: 'esriGeometryEnvelope',
        spatialRel: 'esriSpatialRelIntersects',
        outSR: JSON.stringify({ wkid: 4326 }),
        f: 'geojson',
        returnGeometry: 'true',
        outFields: '*'
      };

      const response = await axios.get(tdecUrl, { params, timeout: 10000 });
      
      if (response.data.features) {
        const features = response.data.features.map(feature => ({
          type: 'Feature',
          id: feature.properties?.HUC_12,
          geometry: feature.geometry,
          properties: {
            huc12: feature.properties?.HUC_12 || 'N/A',
            huc10: feature.properties?.HUC_10 || 'N/A',
            huc8: feature.properties?.HUC_8 || 'N/A',
            name: feature.properties?.HU_12_NAME || 'Unnamed Watershed',
            area_acres: feature.properties?.ACRES,
            downstream_huc12: feature.properties?.HU_12_DS,
            states: feature.properties?.STATES,
            data_source: 'TDEC HUC12'
          }
        }));

        res.json(createFeatureCollection(features, {
          source: '/api/layers/huc12',
          bbox: bbox,
          total: features.length
        }));
      } else {
        res.json(createFeatureCollection([], {
          source: '/api/layers/huc12',
          bbox: bbox,
          message: 'No HUC12 watersheds found in bounding box'
        }));
      }
    } catch (error) {
      console.error('HUC12 API error:', error.message);
      res.status(503).json({
        success: false,
        error: 'HUC12 service unavailable',
        message: error.message
      });
    }
  });

  // ============================================================================
  // FIRM PANELS (FEMA Insurance Rate Maps - Base Layer)
  // ============================================================================
  router.get('/firm-panels', async (req, res) => {
    try {
      const bbox = parseBboxFromQuery(req.query);
      
      if (!bbox) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters: north, south, east, west'
        });
      }

      // Query FIRM Panels from FEMA Layer 25
      const firmData = await queryFEMALayer(25, bbox);
      
      if (firmData.features) {
        const features = firmData.features.map(feature => ({
          type: 'Feature',
          id: feature.properties?.OBJECTID || feature.id,
          geometry: feature.geometry,
          properties: {
            objectid: feature.properties?.OBJECTID,
            panel_id: feature.properties?.PANEL_ID,
            county: feature.properties?.COUNTY,
            state: feature.properties?.STATE,
            firm_date: feature.properties?.FIRM_DATE,
            fha_indicator: feature.properties?.FHA_INDICATOR,
            index_number: feature.properties?.INDEX_NUMBER,
            data_source: 'FEMA NFHL - FIRM Panels'
          }
        }));

        res.json(createFeatureCollection(features, {
          source: '/api/layers/firm-panels',
          bbox: bbox,
          total: features.length
        }));
      } else {
        res.json(createFeatureCollection([], {
          source: '/api/layers/firm-panels',
          bbox: bbox,
          message: 'No FIRM panels found in bounding box'
        }));
      }
    } catch (error) {
      console.error('FIRM Panels API error:', error.message);
      res.status(503).json({
        success: false,
        error: 'FIRM Panels service unavailable',
        message: error.message
      });
    }
  });

  // ============================================================================
  // INATURALIST OBSERVATIONS (with bbox support)
  // ============================================================================
  router.get('/inaturalist', async (req, res) => {
    try {
      const bbox = parseBboxFromQuery(req.query);
      let lat = parseFloat(req.query.lat);
      let lon = parseFloat(req.query.lon);
      const quality = req.query.quality || 'research';
      const limit = Math.min(parseInt(req.query.limit) || 100, 500);

      // If bbox provided, use its center and calculate radius
      let radius = 10; // default radius in km
      if (bbox) {
        lat = (bbox.north + bbox.south) / 2;
        lon = (bbox.east + bbox.west) / 2;
        
        // Calculate radius from bbox diagonal (in km)
        // Using approximate conversion: 1 degree ≈ 111 km at equator
        const latDiff = Math.abs(bbox.north - bbox.south);
        const lonDiff = Math.abs(bbox.east - bbox.west);
        const avgLatDiff = latDiff * 111; // km
        const avgLonDiff = lonDiff * 111 * Math.cos((lat * Math.PI) / 180); // adjust for latitude
        const maxDist = Math.max(avgLatDiff, avgLonDiff);
        radius = Math.ceil(maxDist / 2) + 1; // half diagonal + buffer
        
        console.log(`iNaturalist bbox query: center=[${lat.toFixed(4)}, ${lon.toFixed(4)}], radius=${radius}km`);
      } else if (!lat || isNaN(lat) || !lon || isNaN(lon)) {
        // Default to Tennessee center if no coordinates provided
        lat = 35.7478;
        lon = -86.6923;
        console.log('iNaturalist: No valid coordinates, using Tennessee center:', { lat, lon });
      }

      // Check cache
      const cacheKey = `inat:${lat.toFixed(2)}:${lon.toFixed(2)}:${radius}:${quality}`;
      const cachedData = cache.get(cacheKey);
      
      if (cachedData) {
        return res.json(cachedData);
      }

      // Query iNaturalist API with bbox-derived center and radius
      try {
        const url = 'https://api.inaturalist.org/v1/observations';
        const params = {
          lat,
          lng: lon,
          radius,
          quality_grade: quality,
          order_by: 'created_at',
          order: 'desc',
          per_page: limit
        };

        const response = await axios.get(url, { params, timeout: 10000 });
        
        const features = (response.data.results || []).map(obs => {
          // Safely extract coordinates from geojson field
          let obsLon = null;
          let obsLat = null;
          
          if (obs.geojson && obs.geojson.coordinates && Array.isArray(obs.geojson.coordinates)) {
            [obsLon, obsLat] = obs.geojson.coordinates;
          } else if (obs.longitude !== null && obs.latitude !== null) {
            // Fallback to direct fields
            obsLon = obs.longitude;
            obsLat = obs.latitude;
          }
          
          // Skip observations without valid coordinates
          if (obsLon === null || obsLon === undefined || obsLat === null || obsLat === undefined) {
            return null;
          }
          
          return {
            type: "Feature",
            id: obs.id,
            geometry: {
              type: "Point",
              coordinates: [Number(obsLon), Number(obsLat)]
            },
            properties: {
              id: obs.id,
              species_name: obs.taxon?.name || obs.species_guess || 'Unknown',
              common_name: obs.taxon?.preferred_common_name || '',
              organism_type: obs.taxon?.rank || '',
              observed_date: obs.observed_on || '',
              location: obs.place_guess || '',
              photo_url: obs.photos?.[0]?.medium_url || null,
              quality_grade: obs.quality_grade || 'casual',
              user_login: obs.user?.login || 'Anonymous',
              url: obs.uri || '',
              data_source: 'iNaturalist'
            }
          };
        }).filter(f => f !== null);

        const result = createFeatureCollection(features, {
          source: '/api/layers/inaturalist',
          bbox: bbox || { lat, lon, radius },
          total: features.length
        });

        // Cache for 15 minutes
        cache.set(cacheKey, result, 900);
        
        res.json(result);
      } catch (apiError) {
        console.error('iNaturalist API error:', apiError.message);
        res.status(503).json({
          success: false,
          error: 'iNaturalist API unavailable',
          message: apiError.message
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  });

  // ============================================================================
  // FEMA FLOOD HAZARD (NFHL REST Service with Multiple Layers)
  // ============================================================================
  
  // Helper function to query FEMA NFHL MapServer layer
  async function queryFEMALayer(layerId, bbox) {
    try {
      const femaUrl = `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/${layerId}/query`;
      
      const params = {
        geometry: JSON.stringify({
          xmin: parseFloat(bbox.west),
          ymin: parseFloat(bbox.south),
          xmax: parseFloat(bbox.east),
          ymax: parseFloat(bbox.north)
        }),
        geometryType: 'esriGeometryEnvelope',
        spatialRel: 'esriSpatialRelIntersects',
        outSR: JSON.stringify({ wkid: 4326 }),
        outFields: '*',
        f: 'geojson',
        returnGeometry: 'true'
      };

      const response = await axios.get(femaUrl, { params, timeout: 8000 });
      return response.data;
    } catch (error) {
      console.warn(`Error querying FEMA layer ${layerId}:`, error.message);
      return { type: "FeatureCollection", features: [] };
    }
  }

  router.get('/flood-hazard/zones', async (req, res) => {
    try {
      const bbox = parseBboxFromQuery(req.query);
      
      if (!bbox) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters: north, south, east, west'
        });
      }

      // Query main flood hazard zones layer (Layer 28) only
      const mainLayerData = await queryFEMALayer(28, bbox);

      // Process main zones layer
      const zones = (mainLayerData.features || []).map(feature => ({
        type: 'Feature',
        id: feature.properties?.OBJECTID || feature.id,
        geometry: feature.geometry,
        properties: {
          objectid: feature.properties?.OBJECTID,
          flood_zone: feature.properties?.FLD_ZONE || 'X',
          base_flood_elevation: feature.properties?.BFE || null,
          zone_subtype: feature.properties?.ZONE_SUBTY || '',
          sfha: feature.properties?.SFHA_TF || 'N',
          coastal_barrier: feature.properties?.CSTL_BARR_TF || 'N',
          firm_date: feature.properties?.FIRM_DATE || '',
          data_source: 'FEMA NFHL - Flood Hazard Zones'
        }
      }));

      // Return simple FeatureCollection with flood zones only
      res.json(createFeatureCollection(zones, {
        source: '/api/layers/flood-hazard/zones',
        bbox: bbox,
        total: zones.length
      }));
    } catch (error) {
      console.error('Flood hazard API error:', error.message);
      res.status(503).json({
        success: false,
        error: 'Flood hazard service unavailable',
        message: error.message
      });
    }
  });

  return router;
};
