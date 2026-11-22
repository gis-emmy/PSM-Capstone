// Export Routes - GeoJSON and Excel Data Export
// Allows users to export spatial data within a bounding box or radius

const express = require('express');
const axios = require('axios');
const ExcelJS = require('exceljs');
const { Readable } = require('stream');

module.exports = function(pool) {
  const router = express.Router();

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  // Parse area from request
  function parseArea(areaData) {
    if (areaData.type === 'bbox') {
      return {
        type: 'bbox',
        north: areaData.north,
        south: areaData.south,
        east: areaData.east,
        west: areaData.west
      };
    } else if (areaData.type === 'line_buffer') {
      // New approach: buffer the line geometry
      if (!areaData.coordinates || !Array.isArray(areaData.coordinates) || !areaData.radius_km) {
        throw new Error('Line buffer mode requires coordinates array and radius_km');
      }
      return {
        type: 'line_buffer',
        coordinates: areaData.coordinates, // Array of [lon, lat] pairs in WGS84
        radius_km: parseFloat(areaData.radius_km)
      };
    } else if (areaData.type === 'radius') {
      if (!areaData.project_id || !areaData.radius_km) {
        throw new Error('Radius mode requires project_id and radius_km');
      }
      return {
        type: 'radius',
        project_id: areaData.project_id, // Keep as string/UUID
        radius_km: parseFloat(areaData.radius_km)
      };
    }
    throw new Error('Invalid area type');
  }

  // Convert line geometry with buffer to bbox
  async function lineBufferToBbox(coordinates, radius_km) {
    if (!coordinates || coordinates.length === 0) {
      throw new Error('No coordinates provided for buffering');
    }

    // Find min/max bounds from all coordinates
    let minLat = coordinates[0][1];
    let maxLat = coordinates[0][1];
    let minLon = coordinates[0][0];
    let maxLon = coordinates[0][0];

    for (const [lon, lat] of coordinates) {
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
    }

    console.log('[lineBufferToBbox] Line extent - Lat:', { min: minLat, max: maxLat }, 'Lon:', { min: minLon, max: maxLon });
    console.log('[lineBufferToBbox] Line has', coordinates.length, 'coordinates');

    // Calculate buffer distance in degrees (approximate)
    // 1 degree latitude ≈ 111.32 km
    const latBuffer = (radius_km / 111.32);
    
    // Calculate average latitude for more accurate longitude buffer
    const avgLat = (minLat + maxLat) / 2;
    const lonBuffer = (radius_km / (111.32 * Math.cos(avgLat * Math.PI / 180)));

    const bbox = {
      north: maxLat + latBuffer,
      south: minLat - latBuffer,
      east: maxLon + lonBuffer,
      west: minLon - lonBuffer
    };

    console.log('[lineBufferToBbox] Calculated bbox with', radius_km, 'km buffer:', bbox);
    console.log('[lineBufferToBbox] Buffer in degrees - Lat:', latBuffer, 'Lon:', lonBuffer);

    return bbox;
  }

  // Convert radius to bbox (deprecated - kept for backwards compatibility)
  async function radiusToBbox(project_id, radius_km) {
    const result = await pool.query(
      'SELECT latitude, longitude FROM tdot_projects WHERE project_id = $1',
      [project_id]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Project not found');
    }

    const lat = parseFloat(result.rows[0].latitude);
    const lon = parseFloat(result.rows[0].longitude);
    const latDelta = (radius_km / 111.32) * 1.2; // 1 degree latitude ≈ 111.32 km
    const lonDelta = (radius_km / (111.32 * Math.cos(lat * Math.PI / 180))) * 1.2;

    return {
      north: lat + latDelta,
      south: lat - latDelta,
      east: lon + lonDelta,
      west: lon - lonDelta
    };
  }

  // ============================================================================
  // SPATIAL QUERY FUNCTIONS
  // ============================================================================

  async function queryEbirdLocations(bbox) {
    const result = await pool.query(
      `SELECT location_id, location_name, latitude, longitude,
              observation_count, unique_species_count,
              first_observation_date, last_observation_date
       FROM ebird_locations
       WHERE latitude >= $1 AND latitude <= $2
         AND longitude >= $3 AND longitude <= $4`,
      [bbox.south, bbox.north, bbox.west, bbox.east]
    );
    return result.rows;
  }

  async function queryEbirdObservations(locationIds) {
    if (locationIds.length === 0) return [];
    
    const placeholders = locationIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await pool.query(
      `SELECT observation_id, location_id, ebird_id, species_code,
              common_name, scientific_name, observation_date,
              observation_count, is_protected, is_validated, data_quality_flag
       FROM ebird_observations_new
       WHERE location_id IN (${placeholders})`,
      locationIds
    );
    return result.rows;
  }

  async function queryWaterQualityStations(bbox) {
    console.log(`[Export] Querying water quality stations with bbox:`, {
      north: bbox.north, south: bbox.south, east: bbox.east, west: bbox.west
    });
    
    const result = await pool.query(
      `SELECT station_id, monitoring_location_identifier,
              monitoring_location_name, organization_name,
              latitude, longitude, monitoring_location_type,
              huc_code, drainage_area_square_miles
       FROM water_quality_stations
       WHERE latitude >= $1 AND latitude <= $2
         AND longitude >= $3 AND longitude <= $4`,
      [bbox.south, bbox.north, bbox.west, bbox.east]
    );
    
    console.log(`[Export] Found ${result.rows.length} water quality stations`);
    if (result.rows.length > 0) {
      console.log(`[Export] Sample station:`, result.rows[0]);
    }
    return result.rows;
  }

  async function queryWaterQualityResults(monitoringLocationIds) {
    console.log(`[Export] Starting queryWaterQualityResults with ${monitoringLocationIds.length} monitoring location IDs`);
    console.log(`[Export] Monitoring location IDs:`, monitoringLocationIds.slice(0, 5)); // Log first 5
    
    if (monitoringLocationIds.length === 0) {
      console.log(`[Export] No monitoring location IDs provided, returning empty results`);
      return [];
    }
    
    const allResults = [];
    
    // Helper function to parse CSV line respecting quoted fields
    function parseCSVLine(line) {
      const result = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            // Escaped quote
            current += '"';
            i++; // Skip next quote
          } else {
            // Toggle quote state
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          // Field separator
          result.push(current.trim().replace(/^"|"$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      
      // Add last field
      result.push(current.trim().replace(/^"|"$/g, ''));
      return result;
    }
    
    // Fetch water quality results for each monitoring location from EPA WQP API
    // Process sequentially to avoid overwhelming the EPA API
    for (const monitoringLocationId of monitoringLocationIds) {
      try {
        console.log(`[Export] Fetching EPA results for monitoring location: "${monitoringLocationId}"`);
        
        const response = await axios.get('https://waterqualitydata.us/data/Result/search', {
          params: {
            siteid: monitoringLocationId,
            mimeType: 'csv',
            zip: 'no'
          },
          headers: {
            'User-Agent': 'TDOT-Environmental-Viewer/1.0'
          },
          timeout: 15000
        });

        console.log(`[Export] EPA API response status: ${response.status}, data length: ${response.data.length}`);

        // Parse CSV response
        const lines = response.data.split('\n');
        console.log(`[Export] CSV response has ${lines.length} lines`);
        
        if (lines.length < 2) {
          console.log(`[Export] No results for monitoring location ${monitoringLocationId}`);
          continue;
        }

        const headerLine = lines[0];
        const headers = parseCSVLine(headerLine);
        console.log(`[Export] CSV headers: ${headers.length} columns - ${headers.slice(0, 5).join(', ')}...`);
        
        // Parse up to 100 results per station
        let resultCount = 0;
        for (let i = 1; i < lines.length && resultCount < 100; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          const values = parseCSVLine(line);
          const row = {};
          headers.forEach((header, idx) => {
            row[header] = values[idx] || '';
          });

          // Only include results with actual measured values
          if (row['ResultMeasureValue']) {
            allResults.push({
              monitoring_location_id: monitoringLocationId,
              activity_id: row['ActivityIdentifier'] || '',
              date: row['ActivityStartDate'] || '',
              parameter: row['CharacteristicName'] || '',
              result_value: row['ResultMeasureValue'] || '',
              units: row['ResultMeasure.MeasureUnitCode'] || row['ResultMeasureUnit'] || '',
              status: row['ResultStatusIdentifier'] || 'Final',
              media: row['ActivityMediaName'] || ''
            });
            resultCount++;
          }
        }
        
        console.log(`[Export] Retrieved ${resultCount} results for monitoring location ${monitoringLocationId}`);
      } catch (error) {
        console.error(`[Export] Error fetching water quality results for location ${monitoringLocationId}:`, error.message);
        // Continue with next station if one fails
      }
    }
    
    console.log(`[Export] Total water quality results collected: ${allResults.length}`);
    
    // Sort all results by date (most recent first)
    allResults.sort((a, b) => {
      const dateA = new Date(a.date || 0);
      const dateB = new Date(b.date || 0);
      return dateB - dateA;
    });
    
    return allResults;
  }

  async function queryINaturalist(bbox) {
    try {
      // Calculate center and radius from bbox
      const lat = (bbox.north + bbox.south) / 2;
      const lon = (bbox.east + bbox.west) / 2;
      const latDelta = bbox.north - bbox.south;
      const radius = (latDelta / 2) * 111.32; // km

      const params = {
        lat: lat,
        lng: lon,
        radius: Math.round(radius),
        per_page: 100,
        order: 'desc',
        order_by: 'created_at'
      };

      const response = await axios.get('https://api.inaturalist.org/v1/observations', { params });
      
      if (response.data && response.data.results) {
        return response.data.results.map(obs => ({
          id: obs.id,
          common_name: obs.taxon?.preferred_common_name || 'Unknown',
          scientific_name: obs.taxon?.name || 'Unknown',
          observation_date: obs.observed_on,
          quality_grade: obs.quality_grade,
          photo_url: obs.photos?.[0]?.medium_url || null,
          latitude: obs.geom?.coordinates?.[1] || obs.place_town_name,
          longitude: obs.geom?.coordinates?.[0] || null,
          user_login: obs.user?.login,
          data_source: 'iNaturalist'
        }));
      }
      return [];
    } catch (error) {
      console.error('Error querying iNaturalist:', error);
      return [];
    }
  }

  async function queryHUC12(bbox) {
    try {
      // Query TDEC HUC12 MapServer REST service
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
        inSR: JSON.stringify({ wkid: 4326 }),
        outSR: JSON.stringify({ wkid: 4326 }),
        f: 'json',
        returnGeometry: 'true',
        outFields: '*'
      };

      const response = await axios.get(tdecUrl, { 
        params, 
        timeout: 10000,
        headers: {
          'Referer': 'https://tdeconline.tn.gov/arcgis/apps/webappviewer/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (response.data.features) {
        return response.data.features.map(feature => ({
          huc12: feature.properties?.HUC_12 || 'N/A',
          huc10: feature.properties?.HUC_10 || 'N/A',
          huc8: feature.properties?.HUC_8 || 'N/A',
          name: feature.properties?.HU_12_NAME || 'Unnamed Watershed',
          area_acres: feature.properties?.ACRES,
          downstream_huc12: feature.properties?.HU_12_DS,
          states: feature.properties?.STATES,
          geometry: feature.geometry,  // Include GeoJSON geometry
          data_source: 'TDEC HUC12'
        }));
      }
      return [];
    } catch (error) {
      console.error('Error querying HUC-12:', error.message);
      return [];
    }
  }

  async function queryFloodZones(bbox) {
    try {
      // Query FEMA NFHL REST service for flood hazard zones
      // Layer 28 contains the main flood hazard zone polygons
      const femaUrl = 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query';
      
      const params = {
        geometry: JSON.stringify({
          xmin: parseFloat(bbox.west),
          ymin: parseFloat(bbox.south),
          xmax: parseFloat(bbox.east),
          ymax: parseFloat(bbox.north)
        }),
        geometryType: 'esriGeometryEnvelope',
        spatialRel: 'esriSpatialRelIntersects',
        inSR: JSON.stringify({ wkid: 4326 }),
        outSR: JSON.stringify({ wkid: 4326 }),
        outFields: '*',
        f: 'json',
        returnGeometry: 'true'
      };

      const response = await axios.get(femaUrl, { 
        params, 
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (response.data.features) {
        return response.data.features.map(feature => ({
          objectid: feature.properties?.OBJECTID,
          flood_zone: feature.properties?.FLD_ZONE || 'X',
          base_flood_elevation: feature.properties?.BFE || null,
          zone_subtype: feature.properties?.ZONE_SUBTY || '',
          sfha: feature.properties?.SFHA_TF || 'N',
          coastal_barrier: feature.properties?.CSTL_BARR_TF || 'N',
          firm_date: feature.properties?.FIRM_DATE || '',
          geometry: feature.geometry,  // Include GeoJSON geometry
          data_source: 'FEMA NFHL - Flood Hazard Zones'
        }));
      }
      return [];
    } catch (error) {
      console.error('Error querying flood zones:', error.message);
      return [];
    }
  }

  async function queryClimateStations(bbox) {
    const result = await pool.query(
      `SELECT DISTINCT ws.id as station_id, ws.station_id as ghcnd_id,
              ws.station_name, ws.latitude, ws.longitude, ws.elevation_m
       FROM weather_stations ws
       WHERE ws.latitude >= $1 AND ws.latitude <= $2
         AND ws.longitude >= $3 AND ws.longitude <= $4`,
      [bbox.south, bbox.north, bbox.west, bbox.east]
    );
    return result.rows;
  }

  async function queryClimateNormals(stationIds) {
    if (stationIds.length === 0) return [];
    
    const placeholders = stationIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await pool.query(
      `SELECT station_id, month, avg_temp_f, max_temp_f, min_temp_f,
              avg_precip_in, avg_snowfall_in
       FROM climate_monthly_normals
       WHERE station_id IN (${placeholders})`,
      stationIds
    );
    return result.rows;
  }

  // ============================================================================
  // EXPORT FORMATS
  // ============================================================================

  async function generateExcel(data, bbox) {
    const workbook = new ExcelJS.Workbook();

    // Metadata sheet
    const metaSheet = workbook.addWorksheet('Metadata');
    metaSheet.addRow(['Export Information']);
    metaSheet.addRow(['Timestamp', new Date().toISOString()]);
    metaSheet.addRow(['Area', `N:${bbox.north.toFixed(4)}, S:${bbox.south.toFixed(4)}, E:${bbox.east.toFixed(4)}, W:${bbox.west.toFixed(4)}`]);
    
    // Summary of what was exported
    metaSheet.addRow(['']);
    metaSheet.addRow(['Datasets Exported:']);
    if (data.ebirdLocations && data.ebirdLocations.length > 0) {
      metaSheet.addRow([`  eBird Locations: ${data.ebirdLocations.length} records`]);
    }
    if (data.ebirdObservations && data.ebirdObservations.length > 0) {
      metaSheet.addRow([`  eBird Observations: ${data.ebirdObservations.length} records`]);
    }
    if (data.waterQualityStations && data.waterQualityStations.length > 0) {
      metaSheet.addRow([`  Water Quality Stations: ${data.waterQualityStations.length} records`]);
    }
    if (data.waterQualityResults && data.waterQualityResults.length > 0) {
      metaSheet.addRow([`  Water Quality Results: ${data.waterQualityResults.length} records`]);
    }
    if (data.climateStations && data.climateStations.length > 0) {
      metaSheet.addRow([`  Climate Stations: ${data.climateStations.length} records`]);
    }
    if (data.climateNormals && data.climateNormals.length > 0) {
      metaSheet.addRow([`  Climate Normals: ${data.climateNormals.length} records`]);
    }
    if (data.inaturalist && data.inaturalist.length > 0) {
      metaSheet.addRow([`  iNaturalist Observations: ${data.inaturalist.length} records`]);
    }
    if (data.huc12 && data.huc12.length > 0) {
      metaSheet.addRow([`  HUC-12 Watersheds: ${data.huc12.length} records`]);
    }
    if (data.floodZones && data.floodZones.length > 0) {
      metaSheet.addRow([`  Flood Zones: ${data.floodZones.length} records`]);
    }
    
    metaSheet.addRow(['']);
    metaSheet.addRow(['Notes:']);
    metaSheet.addRow(['HUC-12 Watersheds queried from TDEC REST API']);
    metaSheet.addRow(['Flood Zones queried from FEMA NFHL REST API']);
    metaSheet.addRow(['Water Quality Results fetched from EPA Water Quality Portal (WQP)']);
    metaSheet.addRow(['Results are sorted by date (most recent first) and limited to 100 per station']);
    metaSheet.addRow(['Projects are display-only and fetched from ArcGIS REST service (not included in export)']);

    // eBird
    if (data.ebirdLocations && data.ebirdLocations.length > 0) {
      const sheet = workbook.addWorksheet('eBird_Locations');
      const headers = Object.keys(data.ebirdLocations[0]);
      sheet.addRow(headers);
      data.ebirdLocations.forEach(row => sheet.addRow(Object.values(row)));
    }

    if (data.ebirdObservations && data.ebirdObservations.length > 0) {
      const sheet = workbook.addWorksheet('eBird_Observations');
      const headers = Object.keys(data.ebirdObservations[0]);
      sheet.addRow(headers);
      data.ebirdObservations.forEach(row => sheet.addRow(Object.values(row)));
    }

    // Water Quality
    if (data.waterQualityStations && data.waterQualityStations.length > 0) {
      const sheet = workbook.addWorksheet('Water_Quality_Stations');
      const headers = Object.keys(data.waterQualityStations[0]);
      sheet.addRow(headers);
      data.waterQualityStations.forEach(row => sheet.addRow(Object.values(row)));
    }

    if (data.waterQualityResults && data.waterQualityResults.length > 0) {
      const sheet = workbook.addWorksheet('Water_Quality_Results');
      const headers = Object.keys(data.waterQualityResults[0]);
      sheet.addRow(headers);
      data.waterQualityResults.forEach(row => sheet.addRow(Object.values(row)));
    }

    // Climate
    if (data.climateStations && data.climateStations.length > 0) {
      const sheet = workbook.addWorksheet('Climate_Stations');
      const headers = Object.keys(data.climateStations[0]);
      sheet.addRow(headers);
      data.climateStations.forEach(row => sheet.addRow(Object.values(row)));
    }

    if (data.climateNormals && data.climateNormals.length > 0) {
      const sheet = workbook.addWorksheet('Climate_Normals');
      const headers = Object.keys(data.climateNormals[0]);
      sheet.addRow(headers);
      data.climateNormals.forEach(row => sheet.addRow(Object.values(row)));
    }

    // iNaturalist
    if (data.inaturalist && data.inaturalist.length > 0) {
      const sheet = workbook.addWorksheet('iNaturalist');
      const headers = Object.keys(data.inaturalist[0]);
      sheet.addRow(headers);
      data.inaturalist.forEach(row => sheet.addRow(Object.values(row)));
    }

    // HUC-12 Watersheds
    if (data.huc12 && data.huc12.length > 0) {
      const sheet = workbook.addWorksheet('HUC12');
      const headers = Object.keys(data.huc12[0]);
      sheet.addRow(headers);
      data.huc12.forEach(row => sheet.addRow(Object.values(row)));
    }

    // Flood Zones
    if (data.floodZones && data.floodZones.length > 0) {
      const sheet = workbook.addWorksheet('Flood_Zones');
      const headers = Object.keys(data.floodZones[0]);
      sheet.addRow(headers);
      data.floodZones.forEach(row => sheet.addRow(Object.values(row)));
    }

    return await workbook.xlsx.writeBuffer();
  }

  async function generateGeoJSON(data, bbox) {
    const archiver = require('archiver');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const { PassThrough } = require('stream');

    console.log('[GeoJSON] Generating GeoJSON export with individual layer files...');
    console.log('[GeoJSON] Data summary:', {
      waterQualityStations: data.waterQualityStations?.length || 0,
      ebirdLocations: data.ebirdLocations?.length || 0,
      climateStations: data.climateStations?.length || 0,
      inaturalist: data.inaturalist?.length || 0,
      huc12: data.huc12?.length || 0,
      floodZones: data.floodZones?.length || 0
    });

    // Helper function to recursively convert string coordinates to numbers
    function normalizeGeometryCoordinates(geometry) {
      if (!geometry) return null;
      
      const coords = JSON.parse(JSON.stringify(geometry.coordinates)); // Deep clone
      
      function convertCoordinates(coord) {
        if (typeof coord === 'string') {
          return parseFloat(coord);
        } else if (Array.isArray(coord)) {
          return coord.map(convertCoordinates);
        }
        return coord;
      }
      
      return {
        type: geometry.type,
        coordinates: convertCoordinates(coords)
      };
    }

    // Helper function to create a FeatureCollection
    function createFeatureCollection(features) {
      return {
        type: 'FeatureCollection',
        crs: {
          type: 'name',
          properties: {
            name: 'EPSG:4326'
          }
        },
        bbox: [bbox.west, bbox.south, bbox.east, bbox.north],
        features: features
      };
    }

    try {
      // Create temporary directory for files
      const tmpDir = os.tmpdir();
      const exportDir = path.join(tmpDir, `export_${Date.now()}`);
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }

      // Create individual GeoJSON files

      // 1. Water Quality Stations
      if (data.waterQualityStations && data.waterQualityStations.length > 0) {
        console.log('[GeoJSON] Processing water quality stations:', data.waterQualityStations.length);
        const features = [];
        data.waterQualityStations.forEach(station => {
          const lon = parseFloat(station.longitude);
          const lat = parseFloat(station.latitude);
          
          if (!isNaN(lon) && !isNaN(lat)) {
            features.push({
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [lon, lat]
              },
              properties: {
                station_id: station.station_id,
                monitoring_location_identifier: station.monitoring_location_identifier,
                monitoring_location_name: station.monitoring_location_name,
                organization_name: station.organization_name,
                monitoring_location_type: station.monitoring_location_type,
                huc_code: station.huc_code,
                drainage_area_square_miles: station.drainage_area_square_miles
              }
            });
          }
        });

        const geojson = createFeatureCollection(features);
        fs.writeFileSync(
          path.join(exportDir, '01_water_quality_stations.geojson'),
          JSON.stringify(geojson, null, 2)
        );
        console.log('[GeoJSON] Created 01_water_quality_stations.geojson');
      }

      // 2. eBird Locations
      if (data.ebirdLocations && data.ebirdLocations.length > 0) {
        console.log('[GeoJSON] Processing eBird locations:', data.ebirdLocations.length);
        
        // Create a map of observations by location_id for quick lookup
        const observationsByLocation = {};
        if (data.ebirdObservations && data.ebirdObservations.length > 0) {
          data.ebirdObservations.forEach(obs => {
            if (!observationsByLocation[obs.location_id]) {
              observationsByLocation[obs.location_id] = [];
            }
            observationsByLocation[obs.location_id].push(obs);
          });
        }
        
        const features = [];
        data.ebirdLocations.forEach(location => {
          const lon = parseFloat(location.longitude);
          const lat = parseFloat(location.latitude);
          
          if (!isNaN(lon) && !isNaN(lat)) {
            // Get observations for this location
            const locationObservations = observationsByLocation[location.location_id] || [];
            
            features.push({
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [lon, lat]
              },
              properties: {
                location_name: location.location_name,
                country_code: location.country_code,
                subnational1_code: location.subnational1_code,
                subnational2_code: location.subnational2_code,
                elevation_m: location.elevation_m,
                observation_count: location.observation_count,
                unique_species_count: location.unique_species_count,
                first_observation_date: location.first_observation_date,
                last_observation_date: location.last_observation_date,
                observations: locationObservations
              }
            });
          }
        });

        const geojson = createFeatureCollection(features);
        fs.writeFileSync(
          path.join(exportDir, '02_ebird_locations.geojson'),
          JSON.stringify(geojson, null, 2)
        );
        console.log('[GeoJSON] Created 02_ebird_locations.geojson');
      }

      // 3. Climate Stations
      if (data.climateStations && data.climateStations.length > 0) {
        console.log('[GeoJSON] Processing climate stations:', data.climateStations.length);
        const features = [];
        data.climateStations.forEach(station => {
          const lon = parseFloat(station.longitude);
          const lat = parseFloat(station.latitude);
          
          if (!isNaN(lon) && !isNaN(lat)) {
            features.push({
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [lon, lat]
              },
              properties: {
                station_id: station.station_id,
                station_name: station.station_name,
                state: station.state,
                elevation_ft: station.elevation_ft
              }
            });
          }
        });

        const geojson = createFeatureCollection(features);
        fs.writeFileSync(
          path.join(exportDir, '03_climate_stations.geojson'),
          JSON.stringify(geojson, null, 2)
        );
        console.log('[GeoJSON] Created 03_climate_stations.geojson');
      }

      // 4. iNaturalist Observations
      if (data.inaturalist && data.inaturalist.length > 0) {
        console.log('[GeoJSON] Processing iNaturalist observations:', data.inaturalist.length);
        const features = [];
        data.inaturalist.forEach(obs => {
          const lon = parseFloat(obs.longitude);
          const lat = parseFloat(obs.latitude);
          
          if (!isNaN(lon) && !isNaN(lat)) {
            features.push({
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [lon, lat]
              },
              properties: {
                id: obs.id,
                common_name: obs.common_name,
                scientific_name: obs.scientific_name,
                observation_date: obs.observation_date,
                quality_grade: obs.quality_grade,
                user_login: obs.user_login
              }
            });
          }
        });

        const geojson = createFeatureCollection(features);
        fs.writeFileSync(
          path.join(exportDir, '04_inaturalist_observations.geojson'),
          JSON.stringify(geojson, null, 2)
        );
        console.log('[GeoJSON] Created 04_inaturalist_observations.geojson');
      }

      // 4b. Water Quality Results
      if (data.waterQualityResults && data.waterQualityResults.length > 0) {
        console.log('[GeoJSON] Processing water quality results:', data.waterQualityResults.length);
        const features = [];
        data.waterQualityResults.forEach(result => {
          // Water quality results don't have direct geometry, but we can use the station location
          // For now, we'll store them as attribute-rich records indexed by monitoring location
          features.push({
            type: 'Feature',
            geometry: null,  // No geometry for results themselves
            properties: {
              monitoring_location_id: result.monitoring_location_id,
              activity_id: result.activity_id,
              date: result.date,
              parameter: result.parameter,
              result_value: result.result_value,
              units: result.units,
              status: result.status,
              media: result.media
            }
          });
        });

        const geojson = createFeatureCollection(features);
        fs.writeFileSync(
          path.join(exportDir, '04b_water_quality_results.geojson'),
          JSON.stringify(geojson, null, 2)
        );
        console.log('[GeoJSON] Created 04b_water_quality_results.geojson with', features.length, 'results');
      }

      // 5. HUC12 Watersheds
      if (data.huc12 && data.huc12.length > 0) {
        console.log('[GeoJSON] Processing HUC12 watersheds:', data.huc12.length);
        const features = [];
        data.huc12.forEach(huc => {
          if (huc.geometry) {
            try {
              const normalizedGeometry = normalizeGeometryCoordinates(huc.geometry);
              if (normalizedGeometry) {
                features.push({
                  type: 'Feature',
                  geometry: normalizedGeometry,
                  properties: {
                    huc12: huc.huc12,
                    huc10: huc.huc10,
                    huc8: huc.huc8,
                    name: huc.name,
                    area_acres: huc.area_acres,
                    downstream_huc12: huc.downstream_huc12,
                    states: huc.states
                  }
                });
              }
            } catch (e) {
              console.warn('[GeoJSON] Error normalizing HUC12 geometry:', huc.huc12, e.message);
            }
          }
        });

        const geojson = createFeatureCollection(features);
        fs.writeFileSync(
          path.join(exportDir, '05_huc12_watersheds.geojson'),
          JSON.stringify(geojson, null, 2)
        );
        console.log('[GeoJSON] Created 05_huc12_watersheds.geojson with', features.length, 'features');
      }

      // 6. Flood Zones
      if (data.floodZones && data.floodZones.length > 0) {
        console.log('[GeoJSON] Processing flood zones:', data.floodZones.length);
        const features = [];
        data.floodZones.forEach(zone => {
          if (zone.geometry) {
            try {
              const normalizedGeometry = normalizeGeometryCoordinates(zone.geometry);
              if (normalizedGeometry) {
                features.push({
                  type: 'Feature',
                  geometry: normalizedGeometry,
                  properties: {
                    objectid: zone.objectid,
                    flood_zone: zone.flood_zone,
                    base_flood_elevation: zone.base_flood_elevation,
                    zone_subtype: zone.zone_subtype,
                    sfha: zone.sfha,
                    coastal_barrier: zone.coastal_barrier,
                    firm_date: zone.firm_date
                  }
                });
              }
            } catch (e) {
              console.warn('[GeoJSON] Error normalizing flood zone geometry:', zone.objectid, e.message);
            }
          }
        });

        const geojson = createFeatureCollection(features);
        fs.writeFileSync(
          path.join(exportDir, '06_flood_zones.geojson'),
          JSON.stringify(geojson, null, 2)
        );
        console.log('[GeoJSON] Created 06_flood_zones.geojson with', features.length, 'features');
      }

      // Create ZIP file
      return new Promise((resolve, reject) => {
        const output = new PassThrough();
        const archive = archiver('zip', { zlib: { level: 9 } });
        const chunks = [];

        output.on('data', chunk => chunks.push(chunk));
        output.on('end', () => {
          const buffer = Buffer.concat(chunks);
          
          // Clean up temporary files
          fs.rmSync(exportDir, { recursive: true, force: true });
          
          console.log('[GeoJSON] ZIP file created, size:', buffer.length, 'bytes');
          resolve(buffer);
        });

        archive.on('error', (err) => {
          fs.rmSync(exportDir, { recursive: true, force: true });
          reject(err);
        });

        archive.pipe(output);
        
        // Add all files from export directory
        archive.directory(exportDir + '/', false);
        
        archive.finalize();
      });
    } catch (error) {
      console.error('[GeoJSON] Error creating GeoJSON export:', error);
      throw error;
    }
  }

  // ============================================================================
  // MAIN EXPORT ENDPOINT
  // ============================================================================

  router.post('/', async (req, res) => {
    try {
      const { area, datasets, format } = req.body;

      // Validate input
      if (!area || !datasets || !format) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: area, datasets, format'
        });
      }

      if (!['geojson', 'excel'].includes(format)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid format. Must be "geojson" or "excel"'
        });
      }

      // Parse and validate area
      let parsedArea;
      try {
        parsedArea = parseArea(area);
      } catch (e) {
        return res.status(400).json({
          success: false,
          error: 'Invalid area configuration',
          message: e.message
        });
      }

      let bbox = parsedArea.type === 'bbox' 
        ? parsedArea 
        : parsedArea.type === 'line_buffer'
          ? await lineBufferToBbox(parsedArea.coordinates, parsedArea.radius_km)
          : await radiusToBbox(parsedArea.project_id, parsedArea.radius_km);

      console.log('[Export] Using', parsedArea.type, 'mode with bbox:', bbox);

      // Validate bounds
      if (bbox.north <= bbox.south || bbox.east <= bbox.west) {
        return res.status(400).json({
          success: false,
          error: 'Invalid bounding box'
        });
      }

      // Collect requested data
      const data = {};

      // Note: Projects are display-only and fetched from ArcGIS REST service
      // They are no longer exported to maintain separation of concerns

      if (datasets.includes('ebird')) {
        const locations = await queryEbirdLocations(bbox);
        data.ebirdLocations = locations;
        if (locations.length > 0) {
          const locationIds = locations.map(l => l.location_id);
          data.ebirdObservations = await queryEbirdObservations(locationIds);
        }
      }

      if (datasets.includes('water-quality')) {
        const stations = await queryWaterQualityStations(bbox);
        data.waterQualityStations = stations;
        console.log(`[Export] Assigned ${stations.length} water quality stations to export data`);
        if (stations.length > 0) {
          const monitoringLocationIds = stations.map(s => s.monitoring_location_identifier);
          console.log(`[Export] Extracted monitoring location IDs: ${monitoringLocationIds.length} IDs`);
          data.waterQualityResults = await queryWaterQualityResults(monitoringLocationIds);
          console.log(`[Export] Assigned ${data.waterQualityResults.length} water quality results to export data`);
        }
      }

      if (datasets.includes('climate')) {
        const stations = await queryClimateStations(bbox);
        data.climateStations = stations;
        if (stations.length > 0) {
          const stationIds = stations.map(s => s.station_id);
          data.climateNormals = await queryClimateNormals(stationIds);
        }
      }

      if (datasets.includes('inaturalist')) {
        data.inaturalist = await queryINaturalist(bbox);
      }

      if (datasets.includes('huc12')) {
        data.huc12 = await queryHUC12(bbox);
      }

      if (datasets.includes('flood-zones')) {
        data.floodZones = await queryFloodZones(bbox);
      }

      // Generate file
      let fileBuffer, contentType, filename;

      if (format === 'excel') {
        fileBuffer = await generateExcel(data, bbox);
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        filename = `export_${new Date().toISOString().split('T')[0]}.xlsx`;
      } else if (format === 'geojson') {
        console.log('[Export] Generating GeoJSON ZIP file with individual layers...');
        console.log('[Export] Data to export:', {
          waterQualityStations: data.waterQualityStations?.length || 0,
          ebirdLocations: data.ebirdLocations?.length || 0,
          climateStations: data.climateStations?.length || 0,
          inaturalist: data.inaturalist?.length || 0,
          huc12: data.huc12?.length || 0,
          floodZones: data.floodZones?.length || 0
        });
        fileBuffer = await generateGeoJSON(data, bbox);
        contentType = 'application/zip';
        filename = `export_${new Date().toISOString().split('T')[0]}.zip`;
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid format'
        });
      }

      // Send file
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', fileBuffer.length);
      res.send(fileBuffer);

    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({
        success: false,
        error: 'Export failed',
        message: error.message
      });
    }
  });

  return router;
};
