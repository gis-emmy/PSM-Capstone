#!/usr/bin/env python3
"""
INTERACTIVE WEB LAYERS IMPLEMENTATION PLAN
Complete architecture for frontend displays and backend services
Each dataset as interactive web layer with professional HTML popups and unique symbology

Document: data_sources/INTERACTIVE_LAYERS_PLAN.md
Date: November 7, 2026
"""

IMPLEMENTATION_PLAN = """
================================================================================
INTERACTIVE WEB LAYERS IMPLEMENTATION PLAN
TDOT Environmental Viewer - Frontend & Backend Integration
================================================================================

PROJECT SCOPE
================================================================================
Transform 6 environmental data sources into interactive web layers with:
  ✓ Unique symbology for each data source (distinct visual identity)
  ✓ Professional HTML content popups (rich information display)
  ✓ Backend API endpoints (efficient data delivery)
  ✓ Frontend map integration (Leaflet/Mapbox with custom styling)
  ✓ User interactions (click, hover, filter, export)
  ✓ Performance optimization (caching, clustering, pagination)

Data Sources to Integrate:
  1. eBird Observations (114 hotspots)
  2. EPA Water Quality Stations (30,627 stations)
  3. NOAA Climate Data (50 weather stations)
  4. TDEC Watersheds (HUC12 boundaries)
  5. FEMA Flood Hazard (flood zones)
  6. iNaturalist Observations (runtime query)


================================================================================
LAYER 1: EBIRD OBSERVATIONS
================================================================================

DATA SOURCE
--------
  Database Table: ebird_locations (114 records)
  Point type: Observation hotspots
  Attributes: location_name, latitude, longitude, observation_count, unique_species_count
  Update frequency: Daily
  Data freshness: Real-time observations on-demand

POINT SYMBOLOGY
--------
  Icon: Custom bird silhouette marker (orange background)
  Color scheme: 
    - Base: Orange (#FF8C00)
    - Hover: Red (#DC143C)
    - Selected: Gold (#FFD700)
  Size: 30px diameter
  Badge: Small circle showing species count (if > 0)
  Clustering: Enable for zoom levels 0-10; disable at 11+

HTML POPUP CONTENT
--------
  Size: 350px wide × 450px tall
  Header:
    - Location icon + Location Name (bold)
    - Close button (X)
  
  Content sections:
    1. Quick Stats (grid layout)
       | Total Observations | 245 |
       | Unique Species     | 38  |
       | Last Observed      | Today at 3:45 PM |
    
    2. Recent Activity (expandable)
       Species list with dates:
       • White-tailed Deer (Nov 7, 2:30 PM)
       • Eastern Bluebird (Nov 6, 10:15 AM)
       • Red Fox (Nov 5, 4:20 PM)
       [Show More...] (links to eBird website)
    
    3. Action buttons (row layout)
       [View on eBird] [Filter by Species] [Export CSV]

BACKEND API ENDPOINT
--------
  Route: GET /api/ebird/locations
  Query params:
    - lat, lon, radius (optional - for proximity search)
    - limit (default 50, max 500)
    - offset (for pagination)
  
  Response format:
  {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "id": "location_uuid",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {
          "location_id": "L12345",
          "location_name": "Great Smoky Mountains National Park",
          "latitude": 35.6832,
          "longitude": -83.5007,
          "observation_count": 2847,
          "unique_species_count": 156,
          "first_observation_date": "2020-01-15",
          "last_observation_date": "2026-11-07",
          "url": "https://ebird.org/hotspot/L12345"
        }
      }
    ],
    "pagination": {
      "limit": 50,
      "offset": 0,
      "total": 114
    }
  }

FRONTEND MAP LAYER CODE (Pseudocode)
--------
  const ebirdLayer = L.geoJSON(ebirdData, {
    pointToLayer: (feature, latlng) => {
      const marker = L.marker(latlng, {
        icon: L.divIcon({
          className: 'ebird-marker',
          html: `<div style="background: #FF8C00; color: white; ...">
                   <span>${feature.properties.unique_species_count}</span>
                 </div>`,
          iconSize: [30, 30]
        })
      });
      return marker;
    },
    onEachFeature: (feature, layer) => {
      layer.bindPopup(createEbirdPopup(feature.properties));
      layer.on('mouseover', () => {
        layer.setIcon(hoverIcon); // Change to red
      });
      layer.on('mouseout', () => {
        layer.setIcon(normalIcon); // Change back to orange
      });
    }
  });

INTERACTION PATTERNS
--------
  1. Hover: Color changes to red, show tooltip with name
  2. Click: Open HTML popup with full details
  3. Popup actions:
     - "View on eBird": Opens eBird website in new tab
     - "Filter by Species": Pre-filters other observations
     - "Export CSV": Downloads location data
  4. Clustering: Pin icon with count at zoom 0-10
  5. Map click outside popup: Close popup, show marker

LAYER CONTROL
--------
  Checkbox: "eBird Observation Hotspots"
  Visibility: Toggleable
  Legend entry:
    [Orange bird icon] eBird Hotspots (114 locations)
    "Click to see recent observations and species counts"


================================================================================
LAYER 2: EPA WATER QUALITY STATIONS
================================================================================

DATA SOURCE
--------
  Database Table: water_quality_stations (30,627 records)
  Point type: Monitoring stations
  Attributes: monitoring_location_name, organization_name, latitude, longitude, huc_code
  Update frequency: Monthly
  Data freshness: Station metadata; results queried on-demand

POINT SYMBOLOGY
--------
  Icon: Water drop marker (blue/teal background)
  Color scheme:
    - Base: Teal (#20B2AA)
    - Hover: Deep Sea Blue (#006994)
    - Selected: Cyan (#00CED1)
  Size: 28px diameter
  Badge: Small circle showing organization count (if multiple orgs)
  Clustering: Enable for zoom levels 0-9; disable at 10+
  Shape variant:
    - Circle for streams
    - Square for lakes/reservoirs
    - Pentagon for groundwater

HTML POPUP CONTENT
--------
  Size: 380px wide × 500px tall
  Header:
    - Water droplet icon + Station Name (bold)
    - Organization name (smaller text)
    - Close button (X)
  
  Content sections:
    1. Station Info (grid layout)
       | Monitoring ID  | USGS-03568550 |
       | Organization   | USGS          |
       | Latitude       | 35.6832°      |
       | Longitude      | -83.5007°     |
       | HUC-12 Code    | 020601010101  |
       | Drainage Area  | 125.2 sq mi   |
    
    2. Recent Results (table, max 5 rows)
       Date       | Characteristic | Value    | Status
       2026-11-07 | pH            | 7.2      | ✓
       2026-11-06 | Temperature   | 18.5 °C  | ✓
       2026-11-05 | Dissolved O2  | 8.1 mg/L | ✓
       [Load More Results...] (clickable)
    
    3. Action buttons (row layout)
       [View Full Results] [View on EPA WQP] [Map This HUC12] [Export CSV]

BACKEND API ENDPOINTS
--------
  Endpoint 1: GET /api/water-quality/stations
    Query params:
      - lat, lon, radius (optional)
      - huc_code (optional - filter by HUC12)
      - organization (optional - filter by EPA, USGS, state, etc.)
      - limit (default 50, max 500)
      - offset (pagination)
    Response: GeoJSON FeatureCollection (like eBird)

  Endpoint 2: GET /api/water-quality/station/{station_id}/results
    Query params:
      - days_back (default 90)
      - characteristic (optional - filter by parameter)
      - limit (default 10, max 100)
    Response:
    {
      "station_id": "uuid",
      "station_name": "Spring Creek",
      "results": [
        {
          "date": "2026-11-07",
          "characteristic_name": "pH",
          "result_value": 7.2,
          "measure_unit": "None pH",
          "organization_name": "USGS",
          "status": "Verified"
        }
      ]
    }

FRONTEND MAP LAYER CODE (Pseudocode)
--------
  const wqLayer = L.geoJSON(wqData, {
    pointToLayer: (feature, latlng) => {
      const org = feature.properties.organization_name;
      const iconType = getWaterIconType(org); // circle, square, pentagon
      
      const marker = L.marker(latlng, {
        icon: L.divIcon({
          className: `wq-marker ${iconType}`,
          html: `<div style="background: #20B2AA; color: white; ...">
                   <span class="water-drop">💧</span>
                 </div>`,
          iconSize: [28, 28]
        })
      });
      return marker;
    },
    onEachFeature: (feature, layer) => {
      layer.bindPopup(createWQPopup(feature.properties));
    }
  });

INTERACTION PATTERNS
--------
  1. Hover: Color changes to deep sea blue, show tooltip with station name
  2. Click: Open HTML popup with latest results
  3. Popup actions:
     - "View Full Results": Opens EPA WQP website
     - "Map This HUC12": Highlights HUC12 watershed boundary
     - "Export CSV": Downloads station data
  4. Clustering: Water droplet with count at zoom 0-9
  5. Hover on result row: Show full characteristic details in tooltip

LAYER CONTROL
--------
  Checkbox: "Water Quality Monitoring Stations"
  Visibility: Toggleable
  Sublayers (checkboxes):
    ☑ USGS (teal)
    ☑ EPA (blue)
    ☑ State Agencies (cyan)
    ☑ Other (light blue)
  Legend entry:
    [Blue droplet] Water Quality Stations (30,627 locations)
    "Click to see recent water quality observations"


================================================================================
LAYER 3: NOAA CLIMATE DATA
================================================================================

DATA SOURCE
--------
  Database Tables:
    - weather_stations (50 records)
    - climate_monthly_normals (600 records - 50 stations × 12 months)
  Point type: Weather stations
  Attributes: station_name, elevation_m, monthly temperature & precipitation
  Update frequency: Annual (December)
  Data freshness: 30-year normals (1991-2020)

POINT SYMBOLOGY
--------
  Icon: Thermometer marker (red/warm gradient)
  Color scheme:
    - Base: Dark Red (#8B0000)
    - Hover: Crimson (#DC143C)
    - Selected: Orange Red (#FF4500)
  Size: 32px diameter
  Temp indicator: Gradient color in marker (cold→warm)
  Clustering: Enable for zoom levels 0-7; disable at 8+

HTML POPUP CONTENT
--------
  Size: 400px wide × 550px tall
  Header:
    - Thermometer icon + Station Name (bold)
    - Elevation (smaller text, e.g., "Elevation: 1,250 ft")
    - Close button (X)
  
  Content sections:
    1. Current Month Climate Summary
       Month: November
       | Avg Temp    | 45°F    |
       | Max Temp    | 56°F    |
       | Min Temp    | 34°F    |
       | Precipitation | 4.2 in |
       | Snowfall    | 0.1 in  |
    
    2. Annual Climate Chart (embedded)
       12-month mini line chart showing:
       - Temperature trend (min/avg/max)
       - Precipitation bars
       - Hover to see monthly details
    
    3. Seasonal Patterns (text summary)
       "Coldest month: January (Avg 36°F)"
       "Warmest month: July (Avg 73°F)"
       "Wettest month: July (5.2 in)"
       "Driest month: September (4.0 in)"
    
    4. Action buttons (row layout)
       [View Full Year] [Compare Stations] [Download CSV]

BACKEND API ENDPOINTS
--------
  Endpoint 1: GET /api/climate/stations
    Query params:
      - lat, lon, radius (optional)
      - limit (default 50, max 500)
    Response: GeoJSON with station metadata
    {
      "type": "Feature",
      "properties": {
        "station_id": "GHCND:USW00013897",
        "station_name": "Nashville International Airport",
        "latitude": 36.1247,
        "longitude": -86.6814,
        "elevation_m": 178
      }
    }

  Endpoint 2: GET /api/climate/station/{station_id}/normals
    Response:
    {
      "station": {...},
      "monthly_normals": [
        {
          "month": 1,
          "month_name": "January",
          "avg_temp_f": 36.3,
          "max_temp_f": 45.2,
          "min_temp_f": 27.4,
          "avg_precip_in": 5.2,
          "avg_snowfall_in": 1.2
        },
        ...12 months
      ]
    }

  Endpoint 3: GET /api/climate/nearest?lat={lat}&lon={lon}
    Response: Nearest station with full normals (single station)

FRONTEND MAP LAYER CODE (Pseudocode)
--------
  const climateLayer = L.geoJSON(climateData, {
    pointToLayer: (feature, latlng) => {
      // Color intensity based on average annual temperature
      const avgTemp = feature.properties.annual_avg_temp;
      const color = getTemperatureColor(avgTemp); // gradient cold→hot
      
      const marker = L.marker(latlng, {
        icon: L.divIcon({
          className: 'climate-marker',
          html: `<div style="background: ${color}; color: white; ...">
                   <span>🌡️</span>
                 </div>`,
          iconSize: [32, 32]
        })
      });
      return marker;
    },
    onEachFeature: (feature, layer) => {
      layer.bindPopup(createClimatePopup(feature.properties));
      // Embed chart in popup using Chart.js or similar
    }
  });

INTERACTION PATTERNS
--------
  1. Hover: Show station name and annual avg temperature
  2. Click: Open popup with monthly chart and seasonal summary
  3. Chart interaction: Hover over bars/lines to see monthly details
  4. Popup actions:
     - "View Full Year": Expand chart to larger view
     - "Compare Stations": Open station comparison tool
     - "Download CSV": Export all monthly normals
  5. Clustering: Thermometer icon with count at zoom 0-7

LAYER CONTROL
--------
  Checkbox: "Weather Stations (Climate Normals)"
  Visibility: Toggleable
  Legend entry:
    [Red thermometer] Weather Stations (50 stations)
    "Click to see 30-year climate normals and seasonal patterns"
    Color gradient: Cold (blue) ← → Warm (red)


================================================================================
LAYER 4: TDEC WATERSHEDS (HUC12)
================================================================================

DATA SOURCE
--------
  REST Service: TDEC HUC12 MapServer
  URL: https://tdeconline.tn.gov/arcgis/rest/services/HUC12/MapServer/0
  Geometry type: Polygon
  Attributes: HUC12, HUC_NAME, AREA_SQKM, DOWNSTREAM_HUC12
  Update frequency: As needed (TDEC maintains)
  Data freshness: Real-time from TDEC service

POLYGON SYMBOLOGY
--------
  Fill color: Light green (#90EE90) with 40% opacity
  Stroke color: Dark green (#228B22)
  Stroke width: 2px
  Hover fill: Medium green (#3CB371) with 60% opacity
  Hover stroke: Dark green (#006400)
  Selected fill: Yellow (#FFFF00) with 50% opacity
  Selected stroke: Orange (#FF8C00)
  Interaction: Smooth transitions (0.3s)

HTML POPUP CONTENT (on polygon click)
--------
  Size: 380px wide × 450px tall
  Header:
    - Watershed icon + HUC12 Code (monospace font)
    - Watershed Name (bold)
    - Close button (X)
  
  Content sections:
    1. HUC Details (grid layout)
       | HUC12 Code       | 020601010101 |
       | Watershed Name   | Nolichucky Headwaters |
       | Area             | 450 sq km    |
       | States           | TN, NC       |
       | Downstream HUC   | 020601010102 |
    
    2. Related Data (section links)
       "Data in this watershed:"
       • Weather Stations: 3 nearby
       • Water Quality Stations: 8 monitored
       • eBird Hotspots: 5 locations
       • Flood Risk: Zone AE in parts
    
    3. Action buttons (row layout)
       [Show Related Data] [Zoom to Watershed] [Export Boundary]

BACKEND API ENDPOINTS
--------
  Endpoint 1: GET /api/watershed/huc12
    Query params:
      - codes (comma-separated HUC12 codes, optional)
      - bbox (north,south,east,west)
      - limit (default 50)
    Response: GeoJSON FeatureCollection with polygon geometry
    {
      "type": "Feature",
      "properties": {
        "huc12": "020601010101",
        "huc_name": "Nolichucky Headwaters",
        "area_sqkm": 450.0,
        "area_sqmi": 174.0,
        "states": ["TN", "NC"],
        "downstream_huc12": "020601010102"
      },
      "geometry": {"type": "Polygon", "coordinates": [...]}
    }

  Endpoint 2: GET /api/watershed/point?lat={lat}&lon={lon}
    Response: Single HUC12 polygon containing the point
    {
      "type": "Feature",
      "properties": {...},
      "geometry": {...}
    }

  Endpoint 3: GET /api/watershed/{huc12}/related-data
    Response: Aggregated data for the HUC12
    {
      "huc12": "020601010101",
      "weather_stations": [
        {"name": "Station A", "distance_km": 5.2, ...}
      ],
      "water_quality_stations": [...],
      "ebird_hotspots": [...],
      "flood_zones": {...}
    }

FRONTEND MAP LAYER CODE (Pseudocode)
--------
  const watershedLayer = L.geoJSON(watershedData, {
    style: (feature) => ({
      fillColor: '#90EE90',
      weight: 2,
      opacity: 1,
      color: '#228B22',
      fillOpacity: 0.4,
      dashArray: null
    }),
    onEachFeature: (feature, layer) => {
      layer.bindPopup(createWatershedPopup(feature.properties));
      
      layer.on('mouseover', () => {
        layer.setStyle({
          fillColor: '#3CB371',
          fillOpacity: 0.6,
          color: '#006400',
          weight: 3
        });
      });
      
      layer.on('mouseout', () => {
        layer.setStyle({
          fillColor: '#90EE90',
          fillOpacity: 0.4,
          color: '#228B22',
          weight: 2
        });
      });
    }
  });

INTERACTION PATTERNS
--------
  1. Hover: Fill darkens to medium green, stroke thickens
  2. Click: Open popup with HUC12 details and related data
  3. Popup actions:
     - "Show Related Data": Highlights related stations/hotspots
     - "Zoom to Watershed": Zooms and centers map on watershed
     - "Export Boundary": Downloads polygon as GeoJSON
  4. Caching: 24-hour server-side cache for performance
  5. User can click "Weather Stations: 3 nearby" to filter climate layer

LAYER CONTROL
--------
  Checkbox: "Watersheds (HUC12 Boundaries)"
  Visibility: Toggleable
  Opacity slider: 0-100%
  Legend entry:
    [Green polygon] HUC12 Watershed Boundaries
    "Click on watershed to see related environmental data"
    "Shows climate, water quality, and observations in each watershed"


================================================================================
LAYER 5: FEMA FLOOD HAZARD ZONES
================================================================================

DATA SOURCE
--------
  REST Service: FEMA NFHL MapServer
  URL: https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer
  Geometry type: Polygon
  Attributes: FLOOD_ZONE, BASE_FLOOD_ELEVATION, SFHA, FIRM_DATE
  Update frequency: Quarterly (when new FIRM issued)
  Data freshness: Latest published FIRM

POLYGON SYMBOLOGY
--------
  Color scheme (by flood zone type):
    - Zone AE (Base Flood Elevation known): Red (#FF0000) with 35% opacity
    - Zone A (Base Flood Elevation unknown): Orange (#FF8C00) with 35% opacity
    - Zone X (0.2% annual chance): Yellow (#FFFF00) with 35% opacity
    - Zone AO (Shallow flooding): Purple (#9370DB) with 35% opacity
    - Zone D (Unstudied): Gray (#A9A9A9) with 35% opacity
  
  Stroke: Darker shade of fill color, 1px
  Hover: Opacity increases to 60%, stroke thickens to 2px
  Selected: Opacity 75%, stroke 3px, white outline

HTML POPUP CONTENT (on polygon click)
--------
  Size: 380px wide × 420px tall
  Header:
    - Warning icon (⚠️) + "FLOOD HAZARD ZONE"
    - Zone type (bold, e.g., "Zone AE")
    - Close button (X)
  
  Content sections:
    1. Hazard Info (prominent display)
       | Zone Type              | AE           |
       | Base Flood Elevation   | 854.2 ft MSL |
       | Annual Chance of Flood | 1% (100-yr)  |
       | SFHA Status            | Yes          |
    
    2. Risk Assessment (warning box style)
       "This location is in an area designated as Special Flood Hazard Area.
        Flood insurance is required if you have a federally-backed mortgage."
    
    3. FIRM Info (smaller text)
       | FIRM Effective Date | 12/15/2023 |
       | Last Updated        | 12/15/2023 |
       | Flood Zone Type     | See "Zone Types" below |
    
    4. Zone Type Reference (collapsible)
       Zone A: No BFE specified
       Zone AE: BFE specified (see above)
       Zone X: 0.2% annual chance (1 in 500-year)
       Zone AO: Shallow flooding, depth shown
       Zone D: Unstudied area
    
    5. Action buttons (row layout)
       [FEMA Flood Maps] [Get Flood Insurance Info] [Export Zone]

BACKEND API ENDPOINTS
--------
  Endpoint 1: GET /api/flood-hazard/zones
    Query params:
      - bbox (north,south,east,west) - required
      - zone_types (optional - filter by AE,A,X,etc)
    Response: GeoJSON FeatureCollection
    {
      "type": "Feature",
      "properties": {
        "flood_zone": "AE",
        "base_flood_elevation_ft": 854.2,
        "sfha": true,
        "annual_chance_percent": 1,
        "firm_effective_date": "2023-12-15",
        "zone_description": "Base Flood Elevation Known"
      },
      "geometry": {"type": "Polygon", "coordinates": [...]}
    }

  Endpoint 2: GET /api/flood-hazard/point?lat={lat}&lon={lon}
    Response: Flood zone polygon(s) containing the point
    {
      "type": "FeatureCollection",
      "features": [
        {"type": "Feature", "properties": {...}, "geometry": {...}}
      ]
    }

FRONTEND MAP LAYER CODE (Pseudocode)
--------
  const floodLayer = L.geoJSON(floodData, {
    style: (feature) => {
      const zoneType = feature.properties.flood_zone;
      const colorMap = {
        'AE': '#FF0000',
        'A': '#FF8C00',
        'X': '#FFFF00',
        'AO': '#9370DB',
        'D': '#A9A9A9'
      };
      
      return {
        fillColor: colorMap[zoneType],
        weight: 1,
        opacity: 1,
        color: darken(colorMap[zoneType], 30%),
        fillOpacity: 0.35
      };
    },
    onEachFeature: (feature, layer) => {
      layer.bindPopup(createFloodPopup(feature.properties));
      
      layer.on('mouseover', () => {
        layer.setStyle({fillOpacity: 0.6, weight: 2});
      });
      
      layer.on('mouseout', () => {
        layer.setStyle({fillOpacity: 0.35, weight: 1});
      });
    }
  });

INTERACTION PATTERNS
--------
  1. Hover: Opacity increases, stroke thickens, shows zone type
  2. Click: Open popup with BFE and SFHA status
  3. Popup actions:
     - "FEMA Flood Maps": Opens official FEMA map viewer
     - "Get Flood Insurance Info": Links to flood insurance resource
     - "Export Zone": Downloads polygon GeoJSON
  4. Warning colors: Red (AE) most prominent to gray (D) least
  5. Can toggle individual zone types via legend checkboxes

LAYER CONTROL
--------
  Checkbox: "FEMA Flood Hazard Zones"
  Visibility: Toggleable (default off)
  Sublayers (checkboxes):
    ☑ Zone AE (red - highest risk)
    ☑ Zone A (orange)
    ☑ Zone X (yellow)
    ☑ Zone AO (purple)
    ☑ Zone D (gray - lowest risk)
  Opacity slider: 0-100%
  Legend entry:
    [Red] Zone AE (1% annual flood probability)
    [Orange] Zone A (1% annual, elevation unknown)
    [Yellow] Zone X (0.2% annual probability)
    [Purple] Zone AO (Shallow flooding)
    [Gray] Zone D (Unstudied)
    ⚠️ "Click zones to see flood risk details"


================================================================================
LAYER 6: INATURALIST OBSERVATIONS
================================================================================

DATA SOURCE
--------
  REST Service: iNaturalist API v1
  URL: https://api.inaturalist.org/v1/observations
  Geometry type: Point
  Attributes: species_name, observed_date, location, photo_url
  Update frequency: Real-time
  Data freshness: Live observations (can configure: last 7/30/90 days)
  Caching: 15-minute Redis cache

POINT SYMBOLOGY
--------
  Icon: Custom species icon (varies by organism type)
  Organism categories:
    - Amphibians: Blue circle (🐸)
    - Birds: Orange circle (🦅)
    - Fungi: Brown circle (🍄)
    - Insects: Yellow circle (🦋)
    - Mammals: Purple circle (🦌)
    - Plants: Green circle (🌿)
    - Reptiles: Cyan circle (🐢)
  Size: 24px diameter
  Badge: Photo indicator (camera icon) if photo available
  Clustering: Enable for zoom levels 0-11; disable at 12+
  Animation: Subtle pulse effect for recent observations (< 24hrs)

HTML POPUP CONTENT
--------
  Size: 340px wide × 480px tall
  Header:
    - Species photo (thumbnail, 300x200px)
    - Common name (bold)
    - Scientific name (italics, gray)
    - Close button (X)
  
  Content sections:
    1. Observation Details (grid layout)
       | Observed Date | Nov 7, 2026 at 2:45 PM |
       | Location      | Great Smoky Mountains  |
       | Accuracy      | Within 4 meters        |
       | Observer      | @username              |
    
    2. Quality Grade (colored badge)
       ✓ Research Grade (verified by community)
       
    3. Identification (if verified)
       "Confirmed by [5] experts"
       "View discussion" (link)
    
    4. Action buttons (row layout)
       [View Full Details] [View on iNaturalist] [Similar Species]

BACKEND API ENDPOINT
--------
  Endpoint 1: GET /api/biodiversity/observations
    Query params:
      - lat, lon, radius (optional)
      - days_back (default 30, max 90)
      - quality (default "research", options: research|needs_id|casual)
      - organism_type (optional - filter: birds, mammals, etc)
      - limit (default 50, max 500)
    
    Response: GeoJSON FeatureCollection
    {
      "type": "Feature",
      "geometry": {"type": "Point", "coordinates": [lon, lat]},
      "properties": {
        "id": 413446336,
        "species_name": "Sceloporus undulatus",
        "common_name": "Eastern Fence Lizard",
        "organism_type": "reptiles",
        "observed_date": "2026-11-07T14:45:00Z",
        "location": "Cedars Of Lebanon State Park",
        "photo_url": "https://...",
        "quality_grade": "research",
        "verified": true,
        "observer": "username",
        "url": "https://www.inaturalist.org/observations/..."
      }
    }

FRONTEND MAP LAYER CODE (Pseudocode)
--------
  const inatLayer = L.geoJSON(inatData, {
    pointToLayer: (feature, latlng) => {
      const orgType = feature.properties.organism_type;
      const icon = getOrganismIcon(orgType);
      const isRecent = isLessThan24Hours(feature.properties.observed_date);
      
      const marker = L.marker(latlng, {
        icon: L.divIcon({
          className: `inat-marker ${orgType} ${isRecent ? 'recent' : ''}`,
          html: `<div style="background: ${getColor(orgType)}; ...">
                   ${icon}
                   ${feature.properties.photo_url ? '📷' : ''}
                 </div>`,
          iconSize: [24, 24]
        })
      });
      
      // Add pulse animation for recent observations
      if (isRecent) {
        marker._icon.style.animation = 'pulse 2s infinite';
      }
      
      return marker;
    },
    onEachFeature: (feature, layer) => {
      layer.bindPopup(createInatPopup(feature.properties));
    }
  });

INTERACTION PATTERNS
--------
  1. Hover: Show species name and observation date
  2. Click: Open popup with photo (if available) and details
  3. Recent observations (< 24hrs): Pulse animation to draw attention
  4. Popup actions:
     - "View Full Details": Opens iNaturalist website
     - "Similar Species": Filter to related species
  5. Clustering: Organism type icon with count at zoom 0-11
  6. Color-coded by organism type for quick identification

LAYER CONTROL
--------
  Checkbox: "Recent Observations (iNaturalist)"
  Visibility: Toggleable
  Sublayers (checkboxes - with counts):
    ☑ Amphibians (45)
    ☑ Birds (156)
    ☑ Fungi (23)
    ☑ Insects (234)
    ☑ Mammals (67)
    ☑ Plants (89)
    ☑ Reptiles (34)
  Date filter dropdown:
    Last 7 days (default)
    Last 30 days
    Last 90 days
  Quality filter dropdown:
    Research Grade only (default)
    Including Needs ID
    All observations
  Legend entry:
    [Icons by organism type] Recent iNaturalist Observations
    "Click to see species details and photos"
    "🟢 = Recent (< 24 hours) | 📷 = Has photo"


================================================================================
IMPLEMENTATION PRIORITIES
================================================================================

PHASE 1: BACKEND INFRASTRUCTURE (Weeks 1-2)
--------
  Week 1:
    [ ] Set up Flask/FastAPI blueprint for /api routes
    [ ] Create database query functions for each layer
    [ ] Implement GeoJSON transformers
    [ ] Set up Redis caching layer
    [ ] Write error handling and logging
  
  Week 2:
    [ ] Test all API endpoints with sample data
    [ ] Implement pagination and filtering
    [ ] Add rate limiting for runtime query services (eBird, iNaturalist)
    [ ] Performance testing and optimization

PHASE 2: FRONTEND MAP SETUP (Weeks 2-3)
--------
  Week 2:
    [ ] Initialize Leaflet/Mapbox base map
    [ ] Create map controls and layer toggle interface
    [ ] Set up CSS for marker styling
    [ ] Implement HTML template system for popups
  
  Week 3:
    [ ] Render each layer with proper symbology
    [ ] Implement hover effects and interactions
    [ ] Test clustering at different zoom levels
    [ ] Performance optimization (lazy loading, clustering)

PHASE 3: POPUP & CONTENT (Weeks 3-4)
--------
  Week 3:
    [ ] Design and code HTML popup templates for each layer
    [ ] Integrate data into popup content
    [ ] Add action buttons and links
    [ ] Implement popup styling (CSS)
  
  Week 4:
    [ ] Embed charts/graphs in climate popup
    [ ] Add image galleries for photos (iNaturalist)
    [ ] Implement expand/collapse sections
    [ ] Mobile-responsive popup design

PHASE 4: ADVANCED INTERACTIONS (Week 4-5)
--------
  Week 4:
    [ ] Implement "Show Related Data" across layers
    [ ] Add data filtering by attributes
    [ ] Create comparison tools (e.g., station comparison)
    [ ] Implement export functions (CSV, GeoJSON)
  
  Week 5:
    [ ] Add search functionality
    [ ] Implement location-based queries
    [ ] Add measurement tools (distance, area)
    [ ] Performance tuning and bug fixes

PHASE 5: TESTING & DEPLOYMENT (Week 5-6)
--------
  [ ] End-to-end testing of all layers and interactions
  [ ] Cross-browser testing
  [ ] Mobile device testing
  [ ] Accessibility audit (WCAG 2.1)
  [ ] Production deployment
  [ ] Documentation and user guide


================================================================================
TECHNICAL SPECIFICATIONS
================================================================================

FRONTEND STACK
--------
  Map Framework: Leaflet.js + Leaflet Plugins
  Base Map: OpenStreetMap or Mapbox
  Styling: CSS3 with SCSS preprocessor
  Charts: Chart.js or D3.js (for climate data)
  Icons: Font Awesome + Custom SVG icons
  Responsive: Bootstrap 5 grid system
  Browser support: Chrome, Firefox, Safari, Edge (latest 2 versions)

BACKEND STACK
--------
  Framework: FastAPI or Flask
  Database: PostgreSQL/RDS
  Caching: Redis
  API Documentation: OpenAPI/Swagger
  Authentication: JWT tokens (future)
  Rate limiting: Slowapi or custom middleware
  Logging: Python logging + CloudWatch
  Error handling: Consistent JSON error responses

API RESPONSE FORMAT
--------
  All endpoints return GeoJSON FeatureCollection:
  {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "id": "unique_identifier",
        "geometry": {
          "type": "Point|Polygon|LineString",
          "coordinates": [...]
        },
        "properties": {
          "data_source": "source_name",
          "display_name": "Human readable name",
          ... layer-specific properties
        }
      }
    ],
    "metadata": {
      "source": "API endpoint",
      "timestamp": "2026-11-07T...",
      "query": {query parameters},
      "pagination": {
        "limit": 50,
        "offset": 0,
        "total": 1234
      }
    }
  }

POPUP DESIGN STANDARDS
--------
  Size: 340-400px wide × 420-550px tall
  Font: System font stack (Segoe UI, -apple-system, sans-serif)
  Typography:
    - Headers: 18px bold
    - Labels: 12px gray
    - Values: 14px regular
    - Links: 14px blue, underline on hover
  Spacing: 16px padding, 8px between sections
  Colors:
    - Background: White (#FFFFFF)
    - Text: Dark gray (#333333)
    - Accent: Data source color
    - Links: Blue (#0066CC)
  Buttons: 12px height, full width or 48% width, consistent styling
  Mobile: Stack buttons vertically, reduce font sizes, single column

PERFORMANCE TARGETS
--------
  Initial map load: < 2 seconds
  API response time: < 500ms (database), < 1000ms (runtime queries)
  Clustering: < 100ms per layer
  Popup open: < 300ms
  Zoom/pan interaction: < 60fps (60ms per frame)
  Mobile: < 3 seconds initial load
  Caching: 24-hour TTL for static data, 15-min for dynamic

ACCESSIBILITY
--------
  WCAG 2.1 Level AA compliance
  Keyboard navigation for map and popups
  Screen reader support (ARIA labels)
  Color contrast ratios > 4.5:1
  Alt text for all images
  Semantic HTML in popups
  Mobile touch targets > 44x44px


================================================================================
DEPLOYMENT CHECKLIST
================================================================================

  Backend:
    [ ] All API endpoints tested and documented
    [ ] Error handling and logging working
    [ ] Rate limiting configured
    [ ] Cache warming script ready
    [ ] Production environment variables set
    [ ] CORS configured for frontend domain
    [ ] Database indexes optimized
  
  Frontend:
    [ ] All layers render correctly
    [ ] Popups display properly
    [ ] Icons load correctly
    [ ] Responsive design tested
    [ ] Mobile testing complete
    [ ] Browser compatibility verified
    [ ] Performance targets met
    [ ] User guide/help text ready
  
  Integration:
    [ ] API calls working end-to-end
    [ ] Data flows correctly from database to map
    [ ] Caching working properly
    [ ] Error messages user-friendly
    [ ] Analytics/monitoring in place
  
  Documentation:
    [ ] API documentation complete (Swagger/OpenAPI)
    [ ] Frontend component documentation
    [ ] Deployment runbook
    [ ] User guide
    [ ] Architecture diagram

================================================================================
"""

if __name__ == "__main__":
    print(IMPLEMENTATION_PLAN)
