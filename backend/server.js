// API Server
// ================================================

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const proj4 = require('proj4');
const { Pool } = require('pg');
const layersRouter = require('./routes/layers');
const exportRouter = require('./routes/export');

// load .env
dotenv.config();

// initialize express
const app = express();
const PORT = process.env.PORT || 3001;

// Initialize PostgreSQL connection pool
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'dev-password',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'tdot_env',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.warn('Database connection warning:', err.message);
  } else {
    console.log('✓ Database connected successfully');
  }
});

// Database query helper function
async function queryDatabase(sql, params = []) {
  try {
    const result = await pool.query(sql, params);
    return { success: true, data: result.rows, rowCount: result.rowCount };
  } catch (error) {
    console.error('Database query error:', error);
    return { success: false, error: error.message };
  }
}

// middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://tdot-frontend-59406.s3-website.us-east-2.amazonaws.com',
    'http://tdot-frontend-59406.s3.us-east-2.amazonaws.com',
    'https://tdot-frontend-59406.s3-website.us-east-2.amazonaws.com',
    'https://tdot-frontend-59406.s3.us-east-2.amazonaws.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma', 'Expires'],
  exposedHeaders: ['Content-Type', 'Content-Disposition', 'Content-Length', 'Cache-Control', 'ETag']
}));
app.use(express.json());

// Add explicit CORS headers for all responses
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://tdot-frontend-59406.s3-website.us-east-2.amazonaws.com',
    'http://tdot-frontend-59406.s3.us-east-2.amazonaws.com',
    'https://tdot-frontend-59406.s3-website.us-east-2.amazonaws.com',
    'https://tdot-frontend-59406.s3.us-east-2.amazonaws.com'
  ];
  
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  } else if (!origin) {
    // Allow requests without origin (from direct API calls, curl, etc)
    res.header('Access-Control-Allow-Origin', '*');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Expose-Headers', 'Content-Type, Content-Disposition, Content-Length');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Mount layers API routes
app.use('/api/layers', layersRouter(pool));

// Mount export API routes
app.use('/api/export', exportRouter(pool));

// generic status endpoint
app.get('/api/health', async (req, res) => {
  let dbStatus = 'unknown';
  let dbError = null;

  try {
    // Test database connection with timeout
    const queryPromise = pool.query('SELECT NOW()');
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Database query timeout')), 5000)
    );
    
    await Promise.race([queryPromise, timeoutPromise]);
    dbStatus = 'connected';
  } catch (error) {
    dbStatus = 'disconnected';
    dbError = error.message;
    console.warn('Health check - Database connection issue:', error.message);
  }

  // Always return 200 if backend is running, even if DB is unavailable
  res.status(200).json({
    status: 'running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: {
      status: dbStatus,
      error: dbError,
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      name: process.env.DB_NAME || 'tdot_env'
    }
  });
});

// define root
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'TDOT Project Viewer - Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      projects: '/api/projects',
      environmental: '/api/environmental-data'
    }
  });
});

// Placeholders
app.get('/api/projects', async (req, res) => {
  try {
    // Add cache-busting headers
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('ETag', 'W/"' + Date.now() + '"');

    // ArcGIS REST endpoint for TDOT projects
    const arcgisUrl = 'https://spatial.tdot.tn.gov/arcgis/rest/services/Roadway_Projects/Projects_Public_Viewer/FeatureServer/0/query';

    // Get query parameters
    const limit = Math.min(parseInt(req.query.limit) || 1000, 2000); // Max 2000
    const offset = parseInt(req.query.offset) || 0;
    const bbox = req.query.bbox; // Format: "minX,minY,maxX,maxY" or null for all

    // Build ArcGIS query parameters
    const arcgisParams = {
      where: '1=1', // Get all records
      outFields: '*', // Get all fields
      returnGeometry: true,
      f: 'json',
      resultRecordCount: limit,
      resultOffset: offset,
      geometryType: 'esriGeometryEnvelope',
      spatialRel: 'esriSpatialRelIntersects'
    };

    // Add bbox filtering if provided
    if (bbox) {
      const [minX, minY, maxX, maxY] = bbox.split(',').map(Number);
      arcgisParams.geometry = JSON.stringify({
        xmin: minX,
        ymin: minY,
        xmax: maxX,
        ymax: maxY,
        spatialReference: { wkid: 4326 }
      });
      console.log('[Projects API] Filtering by bbox:', { minX, minY, maxX, maxY });
    }

    console.log('[Projects API] Requesting ArcGIS service with params:', arcgisParams);
    
    // Fetch from ArcGIS REST service with explicit headers
    const response = await axios.get(arcgisUrl, {
      params: arcgisParams,
      timeout: 30000, // 30 second timeout
      headers: {
        'User-Agent': 'TDOT-Environmental-Platform/1.0',
        'Accept': 'application/json'
      }
    });

    console.log('[Projects API] ArcGIS response status:', response.status);
    console.log('[Projects API] ArcGIS response has features:', !!response.data?.features);
    console.log('[Projects API] Feature count:', response.data?.features?.length);

    if (!response.data || !response.data.features) {
      console.error('[Projects API] Invalid response structure:', response.data);
      return res.status(500).json({
        success: false,
        error: 'Invalid response from ArcGIS service',
        details: 'Response missing features array'
      });
    }

    // Helper function to convert State Plane NAD83 (feet) to WGS84 (lat/lon)
    // Tennessee State Plane uses EPSG:2274 (State Plane NAD83 feet)
    // Using proper proj4 transformation with correct datum shift
    const spToWgs84 = (easting, northing) => {
      // Define Tennessee State Plane NAD83 (US Survey Feet)
      // EPSG:2274 - NAD83 / Tennessee
      const tnStatePlane = proj4.Proj(
        '+proj=lcc +lat_1=35.25 +lat_2=36.41666666666667 +lat_0=34.33333333333334 +lon_0=-86 ' +
        '+x_0=600000 +y_0=0 +ellps=GRS80 +units=us-ft +no_defs'
      );
      
      // Define WGS84 (latitude/longitude)
      // EPSG:4326
      const wgs84 = proj4.Proj('EPSG:4326');
      
      // Create transformation function from TN State Plane to WGS84
      const transform = proj4(tnStatePlane, wgs84);
      
      // Transform coordinates [easting, northing] to [lon, lat]
      const [lon, lat] = transform.forward([easting, northing]);
      
      return [lon, lat]; // GeoJSON format: [longitude, latitude]
    };

    // Transform ArcGIS features to GeoJSON format
    console.log('[Projects API] Processing', response.data.features.length, 'features');
    
    const features = response.data.features.map((feature, index) => {
      const { geometry, attributes } = feature;
      
      // Log first feature geometry structure for debugging
      if (index === 0 && geometry) {
        console.log('[Projects API] Sample geometry structure:', JSON.stringify(geometry).substring(0, 500));
      }
      
      // Handle different geometry types
      let geoJsonGeometry = null;
      if (geometry) {
        if (geometry.paths) {
          // Polyline/LineString - handle array of paths
          if (Array.isArray(geometry.paths) && geometry.paths.length > 0) {
            // Log first path to verify coordinate structure
            if (index === 0) {
              console.log('[Projects API] First path sample (before conversion):', JSON.stringify(geometry.paths[0].slice(0, 2)).substring(0, 200));
            }
            // Convert from State Plane to WGS84
            const convertedPath = geometry.paths[0].map(coord => spToWgs84(coord[0], coord[1]));
            if (index === 0) {
              console.log('[Projects API] First path sample (after conversion):', JSON.stringify(convertedPath.slice(0, 2)));
            }
            geoJsonGeometry = {
              type: 'LineString',
              coordinates: convertedPath
            };
          }
        } else if (geometry.rings) {
          // Polygon
          if (Array.isArray(geometry.rings) && geometry.rings.length > 0) {
            if (index === 0) {
              console.log('[Projects API] First ring sample (before conversion):', JSON.stringify(geometry.rings[0].slice(0, 2)).substring(0, 200));
            }
            // Convert all rings from State Plane to WGS84
            const convertedRings = geometry.rings.map(ring => 
              ring.map(coord => spToWgs84(coord[0], coord[1]))
            );
            if (index === 0) {
              console.log('[Projects API] First ring sample (after conversion):', JSON.stringify(convertedRings[0].slice(0, 2)));
            }
            geoJsonGeometry = {
              type: 'Polygon',
              coordinates: convertedRings
            };
          }
        } else if (geometry.x !== undefined && geometry.y !== undefined) {
          // Point - convert from State Plane to WGS84
          const [lon, lat] = spToWgs84(geometry.x, geometry.y);
          geoJsonGeometry = {
            type: 'Point',
            coordinates: [lon, lat]
          };
        }
      }

      if (index === 0) {
        console.log('[Projects API] Transformed first feature geometry type:', geoJsonGeometry?.type);
      }

      return {
        type: 'Feature',
        id: attributes?.OBJECTID || index,
        geometry: geoJsonGeometry,
        properties: {
          ...attributes,
          data_source: 'TDOT ArcGIS REST Service'
        }
      };
    });

    // Get total count if available
    const total = response.data.exceededTransferLimit 
      ? (offset + limit + 1) 
      : (offset + features.length);

    console.log(`[Projects API] Successfully retrieved ${features.length} features`);

    res.status(200).json({
      success: true,
      type: 'FeatureCollection',
      features: features,
      pagination: {
        total: total,
        limit: limit,
        offset: offset,
        hasMore: response.data.exceededTransferLimit || false
      }
    });

  } catch (error) {
    console.error('[Projects API] Error fetching from ArcGIS:', error.message);
    console.error('[Projects API] Error details:', error.response?.data || error.response?.status || 'No response data');
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve projects',
      message: error.message,
      details: error.response?.data || null
    });
  }
});

app.get('/api/environmental-data', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 5000);
    const offset = parseInt(req.query.offset) || 0;
    const category = req.query.category;
    const source = req.query.source;

    let whereClause = '';
    let params = [];

    if (category) {
      whereClause += `data_category = $${params.length + 1} AND `;
      params.push(category);
    }
    if (source) {
      whereClause += `data_source = $${params.length + 1} AND `;
      params.push(source);
    }

    if (whereClause) {
      whereClause = whereClause.slice(0, -5);
      whereClause = ' WHERE ' + whereClause;
    }

    // Get total count
    const countResult = await queryDatabase(`SELECT COUNT(*) FROM environmental_data${whereClause}`, params);
    const total = countResult.success ? countResult.data[0].count : 0;

    // Get paginated results
    const sql = `SELECT 
      env_data_id, data_category, data_type, data_source, 
      latitude, longitude, value, unit,
      measurement_date, data_quality_flag, is_validated, updated_at
      FROM environmental_data${whereClause}
      ORDER BY updated_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    
    params.push(limit, offset);
    const result = await queryDatabase(sql, params);

    if (result.success) {
      res.status(200).json({
        success: true,
        data: result.data,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve environmental data',
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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.path} does not exist`
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`

    Backend Server
    Environment: ${(process.env.NODE_ENV || 'development').padEnd(35)}
    Server running on: http://localhost:${PORT}
    Health check: http://localhost:${PORT}/api/health

  `);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await pool.end();
  process.exit(0);
});

module.exports = app;
