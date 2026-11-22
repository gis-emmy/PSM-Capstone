import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BASE_MAPS } from '../services/constants';
import { API_URL } from '../services/api';
import './Map.css';

// Popup builders for different layer types
function createPointPopup(layerId, feature) {
  const props = feature.properties || {};
  let html = '<div class="popup-content">';
  
  // Debug: Log properties to browser console
  if (layerId === 'water-quality' || layerId === 'flood-zones') {
    console.log(`[${layerId}] Feature properties:`, props);
  }
  
  const formatCoord = (val) => {
    return val ? parseFloat(val).toFixed(4) : 'N/A';
  };
  
  switch(layerId) {
    case 'ebird':
      html += '<h3>' + (props.location_name || 'eBird Location') + '</h3>';
      html += '<p style="margin: 4px 0;"><strong>Observations:</strong> ' + (props.observation_count || 'N/A') + '</p>';
      html += '<p style="margin: 4px 0 8px 0;"><strong>Unique Species:</strong> ' + (props.unique_species_count || 'N/A') + '</p>';
      
      // Display observations table
      if (props.observations && Array.isArray(props.observations) && props.observations.length > 0) {
        html += '<p style="margin: 8px 0 4px 0;"><strong>Recent Observations:</strong></p>';
        html += '<table style="width: 100%; font-size: 11px; border-collapse: collapse; margin-bottom: 8px;">';
        html += '<thead><tr style="background-color: #f0f0f0; border-bottom: 1px solid #ccc;">';
        html += '<th style="padding: 4px 6px; text-align: left; border: 1px solid #ddd;">Species</th>';
        html += '<th style="padding: 4px 6px; text-align: left; border: 1px solid #ddd;">Date</th>';
        html += '<th style="padding: 4px 6px; text-align: center; border: 1px solid #ddd;">Count</th>';
        html += '</tr></thead>';
        html += '<tbody>';
        
        // Show up to 10 most recent observations
        const displayObs = props.observations.slice(0, 10);
        displayObs.forEach(obs => {
          html += '<tr style="border-bottom: 1px solid #eee;">';
          html += '<td style="padding: 4px 6px; border: 1px solid #ddd;">' + (obs.common_name || obs.scientific_name || 'Unknown') + '</td>';
          html += '<td style="padding: 4px 6px; border: 1px solid #ddd;">' + (obs.observation_date || 'N/A') + '</td>';
          html += '<td style="padding: 4px 6px; border: 1px solid #ddd; text-align: center;">' + (obs.observation_count || '1') + '</td>';
          html += '</tr>';
        });
        
        html += '</tbody></table>';
        
        if (props.observations.length > 10) {
          html += '<p style="font-size: 10px; color: #666; margin: 4px 0;">Showing 10 of ' + props.observations.length + ' observations</p>';
        }
      } else {
        html += '<p><em>No observations recorded</em></p>';
      }
      
      if (props.last_observation_date) {
        html += '<p><strong>Last Recorded:</strong> ' + props.last_observation_date + '</p>';
      }
      html += '<hr style="margin: 8px 0;"/>';
      html += '<p style="font-size: 10px; color: #999; margin: 4px 0;"><strong>Icon Attribution:</strong> Bird icon by Vecteezy (CC License)</p>';
      break;
    
    case 'water-quality':
      html += '<h3>' + (props.monitoring_location_name || 'Water Quality Station') + '</h3>';
      html += '<p><strong>Organization:</strong> ' + (props.organization_name || 'N/A') + '</p>';
      // Show Type if available and not empty, otherwise show Provider as fallback
      const locationType = (props.monitoring_location_type && props.monitoring_location_type.trim()) ? props.monitoring_location_type : (props.provider_name || 'Not specified');
      html += '<p><strong>Type:</strong> ' + locationType + '</p>';
      html += '<p><strong>HUC-8:</strong> ' + (props.huc_code || 'N/A') + '</p>';
      html += '<p><strong>Monitoring Location ID:</strong> ' + (props.monitoring_location_identifier || 'N/A') + '</p>';
      html += '<p><strong>Lat/Lon:</strong> ' + formatCoord(props.latitude) + ', ' + formatCoord(props.longitude) + '</p>';
      if (props.drainage_area_square_miles) {
        html += '<p><strong>Drainage Area:</strong> ' + props.drainage_area_square_miles + ' sq mi</p>';
      }
      if (props.site_url) {
        html += '<p><a href="' + props.site_url + '" target="_blank">View Details</a></p>';
      }
      html += '<hr style="margin: 8px 0;"/>';
      html += '<p style="font-size: 10px; color: #999; margin: 4px 0;"><strong>Icon Attribution:</strong> Droplet icon by Vecteezy (CC License)</p>';
      break;
    
    case 'climate':
      html += '<h3>' + (props.station_name || 'Climate Station') + '</h3>';
      html += '<p><strong>Station ID:</strong> ' + (props.station_id || 'N/A') + '</p>';
      html += '<p><strong>Elevation:</strong> ' + (props.elevation_m ? props.elevation_m + ' m' : 'N/A') + '</p>';
      html += '<p><strong>Lat/Lon:</strong> ' + formatCoord(props.latitude) + ', ' + formatCoord(props.longitude) + '</p>';
      html += '<p style="font-size: 11px; color: #666; margin-top: 8px;"><em>Click to load monthly climate normals...</em></p>';
      html += '<hr style="margin: 8px 0;"/>';
      html += '<p style="font-size: 10px; color: #999; margin: 4px 0;"><strong>Icon Attribution:</strong> Thermometer icon by Vecteezy (CC License)</p>';
      break;
    
    case 'inaturalist':
      html += '<h3>' + (props.common_name || props.species_name || 'Observation') + '</h3>';
      if (props.species_name && props.species_name !== (props.common_name || props.species_name)) {
        html += '<p><strong>Species:</strong> ' + props.species_name + '</p>';
      }
      if (props.observed_date) {
        html += '<p><strong>Observed:</strong> ' + props.observed_date + '</p>';
      }
      if (props.location) {
        html += '<p><strong>Location:</strong> ' + props.location + '</p>';
      }
      if (props.quality_grade && props.quality_grade !== 'casual') {
        html += '<p><strong>Quality Grade:</strong> ' + props.quality_grade + '</p>';
      }
      if (props.user_login) {
        html += '<p><strong>Observer:</strong> ' + props.user_login + '</p>';
      }
      if (props.photo_url) {
        html += '<p><img src="' + props.photo_url + '" style="width: 100%; max-width: 200px; border-radius: 4px; margin-top: 8px;" alt="observation" /></p>';
      }
      if (props.url) {
        html += '<p><a href="' + props.url + '" target="_blank" style="color: #0078D4; font-size: 12px;">View on iNaturalist →</a></p>';
      }
      html += '<hr style="margin: 8px 0;"/>';
      html += '<p style="font-size: 10px; color: #999; margin: 4px 0;"><strong>Icon Attribution:</strong> Feather icon by Vecteezy (CC License)</p>';
      break;
    
    default:
      html += '<h3>' + (props.name || 'Data Point') + '</h3>';
      html += '<p><strong>Source:</strong> ' + (props.data_source || 'N/A') + '</p>';
  }
  
  html += '</div>';
  return html;
}

function createPointPopupContent(layerId, feature) {
  // Returns popup HTML without closing div, so we can append results
  const props = feature.properties || {};
  let html = '<div class="popup-content">';
  
  // Debug: Log properties to browser console
  if (layerId === 'water-quality' || layerId === 'flood-zones') {
    console.log(`[${layerId}] Feature properties:`, props);
  }
  
  const formatCoord = (val) => {
    return val ? parseFloat(val).toFixed(4) : 'N/A';
  };
  
  switch(layerId) {
    case 'water-quality':
      html += '<h3>' + (props.monitoring_location_name || 'Water Quality Station') + '</h3>';
      html += '<p><strong>Organization:</strong> ' + (props.organization_name || 'N/A') + '</p>';
      // Show Type if available and not empty, otherwise show Provider as fallback
      const locationType = (props.monitoring_location_type && props.monitoring_location_type.trim()) ? props.monitoring_location_type : (props.provider_name || 'Not specified');
      html += '<p><strong>Type:</strong> ' + locationType + '</p>';
      html += '<p><strong>HUC-8:</strong> ' + (props.huc_code || 'N/A') + '</p>';
      html += '<p><strong>Monitoring Location ID:</strong> ' + (props.monitoring_location_identifier || 'N/A') + '</p>';
      html += '<p><strong>Lat/Lon:</strong> ' + formatCoord(props.latitude) + ', ' + formatCoord(props.longitude) + '</p>';
      if (props.drainage_area_square_miles) {
        html += '<p><strong>Drainage Area:</strong> ' + props.drainage_area_square_miles + ' sq mi</p>';
      }
      if (props.site_url) {
        html += '<p><a href="' + props.site_url + '" target="_blank">View Details</a></p>';
      }
      html += '<hr style="margin: 8px 0;"/>';
      html += '<p style="font-size: 10px; color: #999; margin: 4px 0;"><strong>Icon Attribution:</strong> Droplet icon by Vecteezy (CC License)</p>';
      break;
  }
  
  return html;
}

function createPolygonPopup(layerId, feature) {
  const props = feature.properties || {};
  let html = '<div class="popup-content">';
  
  // Debug: Log properties to browser console
  if (layerId === 'flood-zones') {
    console.log(`[${layerId}] Feature properties:`, props);
  }
  
  switch(layerId) {
    case 'huc12':
      html += '<h3>Watershed</h3>';
      html += '<p><strong>HUC-12 Code:</strong> ' + (props.huc12 || props.code || 'N/A') + '</p>';
      if (props.name) {
        html += '<p><strong>Name:</strong> ' + props.name + '</p>';
      }
      if (props.drainage_area) {
        html += '<p><strong>Drainage Area:</strong> ' + props.drainage_area + '</p>';
      }
      if (props.region) {
        html += '<p><strong>Region:</strong> ' + props.region + '</p>';
      }
      break;
    
    case 'flood-zones':
      html += '<h3>Flood Hazard Zone</h3>';
      
      // Flood Zone code (X, A, AE, etc.)
      const fldZone = props.flood_zone || props.FLD_ZONE || 'Unspecified';
      html += '<p><strong>Flood Zone:</strong> ' + fldZone + '</p>';
      
      // Zone Subtype (descriptive name)
      if (props.zone_subtype && props.zone_subtype.trim()) {
        html += '<p><strong>Zone Type:</strong> ' + props.zone_subtype + '</p>';
      }
      
      // Base Flood Elevation (only if it has a value)
      if (props.base_flood_elevation) {
        html += '<p><strong>Base Flood Elevation:</strong> ' + props.base_flood_elevation + ' ft</p>';
      }
      
      // SFHA (Special Flood Hazard Area) - T/F to Yes/No
      const sfha = props.sfha || 'N';
      const sfhaDisplay = (sfha === 'T' || sfha === true) ? 'Yes (in SFHA)' : (sfha === 'F' || sfha === false) ? 'No (outside SFHA)' : sfha;
      html += '<p><strong>In Special Flood Hazard Area:</strong> ' + sfhaDisplay + '</p>';
      
      // Coastal Barrier - Y/N to Yes/No
      const coastal = props.coastal_barrier || 'N';
      const coastalDisplay = (coastal === 'Y') ? 'Yes' : (coastal === 'N') ? 'No' : coastal;
      html += '<p><strong>Coastal Barrier:</strong> ' + coastalDisplay + '</p>';
      
      // FIRM Date (only if it has a value)
      if (props.firm_date && props.firm_date.trim()) {
        html += '<p><strong>FIRM Date:</strong> ' + props.firm_date + '</p>';
      }
      
      break;
    
    default:
      html += '<h3>' + (props.name || 'Polygon Feature') + '</h3>';
      html += '<p><strong>Source:</strong> ' + (props.data_source || 'N/A') + '</p>';
  }
  
  html += '</div>';
  return html;
}

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png'
});

// Helper function to create project popup content - displays ALL available properties
function createProjectPopup(feature) {
  console.log('[createProjectPopup] Starting popup creation');
  const props = feature.properties || {};
  console.log('[createProjectPopup] Properties:', Object.keys(props).length, 'keys');
  console.log('[createProjectPopup] All property names:', Object.keys(props));
  console.log('[createProjectPopup] All properties:', props);
  
  let html = '<div class="popup-content" style="max-width: 400px; font-size: 12px; max-height: 500px; overflow-y: auto;">';
  
  // Header with PIN and State Project Numbers
  const pin = props.PIN || '';
  const stateProjectNumbers = props.STATE_PROJ_NUMBERS || '';
  const headerParts = [];
  if (pin) headerParts.push(`PIN: ${pin}`);
  if (stateProjectNumbers) headerParts.push(`State #: ${stateProjectNumbers}`);
  const headerText = headerParts.length > 0 ? headerParts.join(' | ') : 'Project';
  html += '<h3 style="margin: 0 0 12px 0; font-size: 14px; border-bottom: 2px solid #0078D4; padding-bottom: 8px;">' + headerText + '</h3>';
  
  console.log('[createProjectPopup] PIN:', pin);
  console.log('[createProjectPopup] State Project Numbers:', stateProjectNumbers);
  
  // Create a list of all properties, sorted and formatted
  const propertyList = [];
  const propsToDelete = [];
  
  // Define order for key fields (these appear first)
  const priorityFields = ['PROJECT_STATUS', 'project_status', 'STATUS', 'status', 'DESCRIPTION', 'description', 'PROJECT_TYPE', 'project_type'];
  
  // Add priority fields first
  priorityFields.forEach(field => {
    if (props[field] && props[field] !== null && props[field] !== '' && props[field] !== 'None') {
      propertyList.push({
        key: field,
        value: props[field]
      });
      propsToDelete.push(field); // Mark for deletion
    }
  });
  
  // Add all remaining properties (excluding data_source which we know about)
  Object.keys(props).forEach(key => {
    if (!propsToDelete.includes(key) && key !== 'data_source' && props[key] !== null && props[key] !== '' && props[key] !== 'None') {
      propertyList.push({
        key: key,
        value: props[key]
      });
    }
  });
  
  // Format and display all properties
  propertyList.forEach(item => {
    // Convert key from UPPER_CASE to Title Case
    const displayKey = item.key
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
    
    // Format value
    let displayValue = String(item.value);
    
    // Special formatting for URLs
    if (displayValue.startsWith('http://') || displayValue.startsWith('https://')) {
      displayValue = '<a href="' + displayValue + '" target="_blank" style="color: #0078D4; text-decoration: underline;">' + displayValue + '</a>';
    }
    
    // Special formatting for dates
    if (displayKey.includes('Date') && displayValue.length === 10 && displayValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const date = new Date(displayValue);
      displayValue = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }
    
    // Special formatting for currency
    if ((displayKey.includes('Cost') || displayKey.includes('Budget') || displayKey.includes('Amount')) && !isNaN(displayValue)) {
      displayValue = '$' + parseFloat(displayValue).toLocaleString('en-US', { maximumFractionDigits: 2 });
    }
    
    html += '<p style="margin: 6px 0; padding: 4px 0; border-bottom: 1px solid #eee;">';
    html += '<strong>' + displayKey + ':</strong> ' + displayValue;
    html += '</p>';
  });
  
  // If no properties found, show message
  if (propertyList.length === 0) {
    html += '<p style="color: #999; font-style: italic;">No additional information available</p>';
  }
  
  html += '</div>';
  return html;
}

// Helper function to create layer-specific icons for data points using image assets
function getLayerIcon(layerId, color) {
  const iconMap = {
    'ebird': '/icons/ebird.jpg',
    'water-quality': '/icons/water-quality.jpg',
    'climate': '/icons/climate.jpg',
    'inaturalist': '/icons/inaturalist.jpg'
  };
  
  const iconPath = iconMap[layerId];
  
  if (iconPath) {
    // Use image-based icon
    return L.icon({
      iconUrl: iconPath,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32],
      className: 'layer-icon'
    });
  }
  
  // Fallback to default icon if no specific icon found
  const svgContent = `
    <svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="14" r="12" fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="14" cy="14" r="6" fill="none" stroke="white" stroke-width="1"/>
    </svg>
  `;
  
  return L.divIcon({ 
    html: svgContent, 
    iconSize: [28, 28], 
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
    className: 'layer-icon'
  });
}

// Helper function to create themed project status icons
function getProjectIcon(status, color) {
  // Normalize status to uppercase
  const normalizedStatus = String(status || '').toUpperCase();
  
  let svgContent = '';
  
  // Create different icons based on status
  if (normalizedStatus.includes('PLANNED')) {
    // Plan/blueprint icon
    svgContent = `
      <svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 2 L28 2 L28 28 L4 28 Z" fill="${color}" stroke="white" stroke-width="2"/>
        <line x1="8" y1="8" x2="24" y2="8" stroke="white" stroke-width="1.5"/>
        <line x1="8" y1="13" x2="24" y2="13" stroke="white" stroke-width="1.5"/>
        <line x1="8" y1="18" x2="20" y2="18" stroke="white" stroke-width="1.5"/>
        <line x1="8" y1="23" x2="16" y2="23" stroke="white" stroke-width="1.5"/>
        <polygon points="16,28 10,38 22,38" fill="${color}" stroke="white" stroke-width="2"/>
      </svg>
    `;
  } else if (normalizedStatus.includes('UNDER_REVIEW') || normalizedStatus.includes('REVIEW')) {
    // Review/checkmark icon
    svgContent = `
      <svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="14" r="12" fill="${color}" stroke="white" stroke-width="2"/>
        <path d="M 10 14 L 14 18 L 22 10" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <polygon points="16,28 10,38 22,38" fill="${color}" stroke="white" stroke-width="2"/>
      </svg>
    `;
  } else if (normalizedStatus.includes('UNDER_CONSTRUCTION') || normalizedStatus.includes('CONSTRUCTION')) {
    // Construction/wrench icon
    svgContent = `
      <svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="14" r="12" fill="${color}" stroke="white" stroke-width="2"/>
        <g transform="translate(16, 14)">
          <path d="M -2 -6 L 2 -6 L 3 0 L 2 2 L -2 2 L -3 0 Z" fill="white"/>
          <path d="M 1 1 L 5 5 M 2 1 L 6 5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
        </g>
        <polygon points="16,28 10,38 22,38" fill="${color}" stroke="white" stroke-width="2"/>
      </svg>
    `;
  } else if (normalizedStatus.includes('COMPLETED') || normalizedStatus.includes('FINISHED')) {
    // Completed/checkmark icon
    svgContent = `
      <svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="14" r="12" fill="${color}" stroke="white" stroke-width="2"/>
        <path d="M 10 14 L 14 18 L 22 10" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <polygon points="16,28 10,38 22,38" fill="${color}" stroke="white" stroke-width="2"/>
      </svg>
    `;
  } else if (normalizedStatus.includes('ARCHIVED')) {
    // Archive/box icon
    svgContent = `
      <svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="6" width="24" height="16" fill="${color}" stroke="white" stroke-width="2"/>
        <line x1="4" y1="12" x2="28" y2="12" stroke="white" stroke-width="1.5"/>
        <circle cx="12" cy="12" r="1.5" fill="white"/>
        <circle cx="20" cy="12" r="1.5" fill="white"/>
        <polygon points="16,28 10,38 22,38" fill="${color}" stroke="white" stroke-width="2"/>
      </svg>
    `;
  } else {
    // Default generic project icon
    svgContent = `
      <svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="14" r="12" fill="${color}" stroke="white" stroke-width="2"/>
        <circle cx="16" cy="14" r="8" fill="none" stroke="white" stroke-width="1"/>
        <polygon points="16,28 10,38 22,38" fill="${color}" stroke="white" stroke-width="2"/>
      </svg>
    `;
  }
  
  return L.divIcon({
    html: svgContent,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -40],
    className: 'project-icon'
  });
}

export default function Map({ projects = [], visibleLayers = {}, layersData = {}, baseMapKey = 'OpenStreetMap', onBoundsChange, openPopupId = null, onPopupChange = null, onExportProject = null }) {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const layersRef = useRef({}); // Track all layers by feature ID to find and open them later
  const layerGroupsRef = useRef({});

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    // Set initial view to Chattanooga area
    mapRef.current = L.map(containerRef.current, { closePopupOnClick: false }).setView([35.0456, -85.2663], 11);
    L.tileLayer(BASE_MAPS[baseMapKey].url, { attribution: BASE_MAPS[baseMapKey].attr, maxZoom: 19 }).addTo(mapRef.current);
    layerGroupsRef.current = {
      projects: L.layerGroup().addTo(mapRef.current),
      ebird: L.layerGroup(),
      'water-quality': L.layerGroup(),
      climate: L.layerGroup(),
      inaturalist: L.layerGroup(),
      huc12: L.layerGroup(),
      'flood-zones': L.layerGroup()
    };
    
    // Listen for map bounds change
    if (onBoundsChange) {
      mapRef.current.on('moveend', () => {
        const bounds = mapRef.current.getBounds();
        onBoundsChange({
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest()
        });
      });
    }
  }, [onBoundsChange]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.eachLayer(l => l instanceof L.TileLayer && mapRef.current.removeLayer(l));
    L.tileLayer(BASE_MAPS[baseMapKey].url, { attribution: BASE_MAPS[baseMapKey].attr, maxZoom: 19 }).addTo(mapRef.current);
  }, [baseMapKey]);

  useEffect(() => {
    if (!layerGroupsRef.current.projects) return;
    
    // Check if any polyline currently has a popup open
    let hasOpenPopup = false;
    layerGroupsRef.current.projects.eachLayer(layer => {
      if (layer.isPopupOpen?.()) {
        hasOpenPopup = true;
      }
    });
    
    // Only clear layers if no popup is open (to preserve popup state)
    if (!hasOpenPopup) {
      layerGroupsRef.current.projects.clearLayers();
    } else {
      console.log('[Map] Skipping layer clear - popup is open');
      return; // Exit early to avoid re-rendering while popup is open
    }
    
    const colors = { 
      planned: '#FFA500', 
      'PLANNED': '#FFA500',
      under_review: '#FFD700', 
      'UNDER_REVIEW': '#FFD700',
      under_construction: '#FF6347', 
      'UNDER_CONSTRUCTION': '#FF6347',
      completed: '#32CD32', 
      'COMPLETED': '#32CD32',
      archived: '#808080',
      'ARCHIVED': '#808080'
    };
    
    console.log('[Map] Rendering', projects.length, 'projects');
    
    projects.forEach((p, idx) => {
      // Handle GeoJSON features from ArcGIS
      if (p.type === 'Feature' && p.geometry) {
        const geometry = p.geometry;
        const props = p.properties || {};
        
        console.log(`[Map] Project ${idx}:`, {
          name: props.PROJECT_NAME || props.project_name,
          status: props.PROJECT_STATUS || props.project_status,
          geomType: geometry.type,
          coordCount: geometry.coordinates?.length || 0
        });
        
        // Extract status/name from properties (handle both uppercase and lowercase)
        const status = props.PROJECT_STATUS || props.project_status || props.STATUS || props.status || 'N/A';
        const name = props.PROJECT_NAME || props.project_name || props.name || 'Project';
        const color = colors[status] || colors[status?.toLowerCase?.()] || '#0078D4';
        
        // Create popup with detailed project information
        const popupContent = createProjectPopup(p);
        console.log(`[Map] Popup created for project ${idx}, length: ${popupContent.length}`);
        
        // Handle different geometry types
        if (geometry.type === 'LineString' && geometry.coordinates) {
          console.log(`[Map] Creating LineString for project ${idx} with ${geometry.coordinates.length} coordinates`);
          // Convert coordinates and draw line
          const latlngs = geometry.coordinates.map(coord => [coord[1], coord[0]]);
          console.log(`[Map] Converted to ${latlngs.length} lat/lng points`);
          
          const polyline = L.polyline(latlngs, {
            color: color,
            weight: 3,
            opacity: 0.8
          }).bindPopup(popupContent).addTo(layerGroupsRef.current.projects);
          
          console.log(`[Map] Polyline created and added to map for project ${idx}`);
          
          // Store reference to this layer by feature ID
          const featureId = p.id || idx;
          layersRef.current[featureId] = polyline;
          
          // Add event listener to track popup opening
          polyline.on('popupopen', function() {
            console.log(`[Map] Popup opening for polyline ${featureId}`);
            console.log(`[Map] Popup element:`, this.getPopup());
            console.log(`[Map] Popup isOpen:`, this.isPopupOpen?.());
            
            const popup = this.getPopup();
            console.log(`[Map] Popup container:`, popup?._container);
            console.log(`[Map] Popup content element:`, popup?._contentNode);
            
            onPopupChange?.(featureId);
            // Add export button after popup opens
            setTimeout(() => {
              const popupPane = document.querySelector('.leaflet-popup-content');
              console.log(`[Map] Looking for popup pane, found:`, !!popupPane);
              
              if (popupPane) {
                console.log(`[Map] Popup pane displayed as:`, {
                  display: window.getComputedStyle(popupPane).display,
                  visibility: window.getComputedStyle(popupPane).visibility,
                  opacity: window.getComputedStyle(popupPane).opacity,
                  zIndex: window.getComputedStyle(popupPane).zIndex
                });
              }
              
              if (popupPane && !popupPane.querySelector('.export-btn-container')) {
                console.log(`[Map] Adding export button to popup`);
                const btnContainer = document.createElement('div');
                btnContainer.className = 'export-btn-container';
                btnContainer.style.cssText = 'margin-top: 12px; padding-top: 12px; border-top: 2px solid #0078D4; text-align: center;';
                
                const btn = document.createElement('button');
                btn.className = 'export-project-btn';
                btn.textContent = '📥 Export Data';
                btn.style.cssText = 'background: #0078D4; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600;';
                btn.onclick = (e) => {
                  e.stopPropagation();
                  // Pass the full project object to ExportTool
                  onExportProject?.(p);
                };
                
                btnContainer.appendChild(btn);
                popupPane.appendChild(btnContainer);
              }
            }, 50);
          });
          polyline.on('popupclose', function() {
            onPopupChange?.(null);
          });
          
          // Add hover effect to highlight the line
          polyline.on('mouseover', function() {
            this.setStyle({ weight: 5, opacity: 1 });
          });
          polyline.on('mouseout', function() {
            this.setStyle({ weight: 3, opacity: 0.8 });
          });
          
        } else if (geometry.type === 'Polygon' && geometry.coordinates) {
          // Convert coordinates and draw polygon
          const latlngs = geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
          
          const polygon = L.polygon(latlngs, {
            color: color,
            weight: 2,
            opacity: 0.8,
            fillOpacity: 0.3
          }).bindPopup(popupContent).addTo(layerGroupsRef.current.projects);
          
          // Store reference to this layer by feature ID
          const featureId = p.id || idx;
          layersRef.current[featureId] = polygon;
          
          // Add event listener to track popup opening
          polygon.on('popupopen', function() {
            onPopupChange?.(featureId);
            // Add export button after popup opens
            setTimeout(() => {
              const popupPane = document.querySelector('.leaflet-popup-content');
              if (popupPane && !popupPane.querySelector('.export-btn-container')) {
                const projectId = props.project_id || props.PROJECT_ID;
                const btnContainer = document.createElement('div');
                btnContainer.className = 'export-btn-container';
                btnContainer.style.cssText = 'margin-top: 12px; padding-top: 12px; border-top: 2px solid #0078D4; text-align: center;';
                
                const btn = document.createElement('button');
                btn.className = 'export-project-btn';
                btn.textContent = '📥 Export Data';
                btn.style.cssText = 'background: #0078D4; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600;';
                btn.onclick = (e) => {
                  e.stopPropagation();
                  onExportProject?.(projectId);
                };
                
                btnContainer.appendChild(btn);
                popupPane.appendChild(btnContainer);
              }
            }, 50);
          });
          polygon.on('popupclose', function() {
            onPopupChange?.(null);
          });
          
          // Add hover effect
          polygon.on('mouseover', function() {
            this.setStyle({ weight: 3, opacity: 1, fillOpacity: 0.5 });
          });
          polygon.on('mouseout', function() {
            this.setStyle({ weight: 2, opacity: 0.8, fillOpacity: 0.3 });
          });
        }
      }
    });
    console.log('[Map] Finished rendering projects');
  }, [projects, onPopupChange, onExportProject]);

  useEffect(() => {
    if (!mapRef.current) return;
    Object.keys(visibleLayers).forEach(layerId => {
      if (layerId === 'watersheds' || layerId === 'flood-hazard-old') return;
      const group = layerGroupsRef.current[layerId];
      if (!group) return;
      
      if (visibleLayers[layerId]) {
        if (!mapRef.current.hasLayer(group)) mapRef.current.addLayer(group);
        
        // Check if any layer in this group has an open popup
        let hasOpenPopup = false;
        group.eachLayer(layer => {
          if (layer.isPopupOpen?.()) {
            hasOpenPopup = true;
          }
        });
        
        // Only clear layers if no popup is open (to preserve popup state)
        if (!hasOpenPopup) {
          group.clearLayers();
        } else {
          console.log(`[Map] Skipping layer clear for ${layerId} - popup is open`);
          return; // Exit early to avoid re-rendering while popup is open
        }
        
        const data = layersData[layerId]?.features || [];
        const config = { 
          ebird: '#FF8C00', 
          'water-quality': '#1E90FF', 
          climate: '#DC143C', 
          inaturalist: '#FF69B4', 
          huc12: '#228B22',
          'flood-zones': '#FF4500'
        };
        const color = config[layerId] || '#0078D4';
        
        // Render features
        data.forEach(f => {
          // Handle polygons (HUC12, Flood Zones)
          if (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon') {
            L.geoJSON(f, {
              style: { 
                color, 
                weight: 2, 
                opacity: 0.6, 
                fillOpacity: 0.2
              },
              onEachFeature: (feature, layer) => {
                const popup = createPolygonPopup(layerId, feature);
                layer.bindPopup(popup);
              }
            }).addTo(group);
            return;
          }
          
          // Handle points (eBird, Water Quality, Climate, iNaturalist)
          if (f.geometry?.type !== 'Point') return;
          const [lon, lat] = f.geometry.coordinates;
          const icon = getLayerIcon(layerId, color);
          
          const marker = L.marker([lat, lon], { icon }).addTo(group);
          
          // Add event listener to prevent clicks within popup content from triggering map events
          // but allow close button to function normally
          marker.on('popupopen', () => {
            const popup = marker.getPopup();
            if (popup) {
              const popupElement = popup.getElement();
              if (popupElement) {
                // Only stop propagation on the popup content, not the entire popup
                const contentElement = popupElement.querySelector('.leaflet-popup-content');
                if (contentElement) {
                  contentElement.addEventListener('click', (e) => {
                    // Don't stop propagation - let it bubble to close button if needed
                    // But still prevent map panning on specific content interactions
                    if (e.target.tagName !== 'A' && e.target.className !== 'leaflet-popup-close-button') {
                      e.stopPropagation();
                      L.DomEvent.stopPropagation(e);
                    }
                  }, false);
                }
              }
            }
          });
          
          // For water quality stations, fetch results on click
          if (layerId === 'water-quality') {
            // Bind an empty popup first so we can update it later on click
            marker.bindPopup('Loading results...');
            marker.on('click', async (e) => {
              L.DomEvent.stopPropagation(e);
              const stationId = f.properties?.monitoring_location_identifier;
              if (stationId) {
                try {
                  const response = await fetch(`${API_URL}/layers/water-quality/station/${stationId}/results?limit=5`);
                  const data = await response.json();
                  
                  console.log(`[water-quality results] Station: ${stationId}, Results: ${data.results_count}, Error: ${data.error}`);
                  
                  // Build popup with results
                  let popup = createPointPopupContent(layerId, f);
                  console.log('[water-quality] Base popup created');
                  
                  if (data.results && data.results.length > 0) {
                    console.log('[water-quality] Adding', data.results.length, 'results to popup');
                    popup += '<hr><h4>Recent Results</h4>';
                    popup += '<table style="font-size: 12px; width: 100%; border-collapse: collapse;">';
                    popup += '<tr style="border-bottom: 1px solid #ccc;"><th style="text-align: left; padding: 4px;">Date</th><th style="text-align: left; padding: 4px;">Parameter</th><th style="text-align: left; padding: 4px;">Value</th></tr>';
                    
                    data.results.slice(0, 5).forEach(result => {
                      popup += '<tr style="border-bottom: 1px solid #eee;">';
                      popup += '<td style="padding: 4px; font-size: 11px;">' + (result.date || 'N/A') + '</td>';
                      popup += '<td style="padding: 4px; font-size: 11px;">' + (result.parameter || 'N/A') + '</td>';
                      popup += '<td style="padding: 4px; font-size: 11px;">' + (result.result_value || 'N/A') + ' ' + (result.units || '') + '</td>';
                      popup += '</tr>';
                    });
                    
                    popup += '</table>';
                    console.log('[water-quality] Table complete');
                    if (data.results_count > 5) {
                      popup += '<p style="font-size: 11px; margin-top: 4px;">...and ' + (data.results_count - 5) + ' more results</p>';
                    }
                  } else {
                    // No results or error - show message
                    console.log('[water-quality] No results - showing message');
                    if (data.error) {
                      popup += '<hr><p style="font-size: 11px; color: #999;"><strong>Results Not Available:</strong> ' + (data.message || data.error) + '</p>';
                    } else {
                      popup += '<hr><p style="font-size: 12px; color: #999; font-style: italic;">No recent results available from EPA WQP database</p>';
                    }
                  }
                  
                  popup += '</div>';
                  console.log('[water-quality] Final popup:', popup.substring(0, 200), '...');
                  marker.setPopupContent(popup);
                  console.log('[water-quality] Opening popup');
                  marker.openPopup();
                } catch (error) {
                  console.error('Error fetching water quality results:', error);
                  const basicPopup = createPointPopupContent(layerId, f);
                  marker.setPopupContent(basicPopup + '<hr><p style="font-size: 11px; color: #999;"><strong>Results Not Available:</strong> Unable to connect to EPA data service</p></div>');
                  marker.openPopup();
                }
              } else {
                const popup = createPointPopup(layerId, f);
                marker.setPopupContent(popup);
                marker.openPopup();
              }
            });
          } else if (layerId === 'climate') {
            // For climate stations, fetch monthly normals on click
            marker.bindPopup('Loading climate data...');
            marker.on('click', async (e) => {
              L.DomEvent.stopPropagation(e);
              const stationId = f.properties?.station_id;
              if (stationId) {
                try {
                  const response = await fetch(`${API_URL}/layers/climate/station/${stationId}/normals`);
                  const data = await response.json();
                  
                  console.log(`[climate] Station: ${stationId}, Months: ${data.monthly_normals?.length || 0}`);
                  
                  // Build popup with climate data
                  let popup = createPointPopup(layerId, f);
                  console.log('[climate] Base popup created');
                  
                  if (data.monthly_normals && data.monthly_normals.length > 0) {
                    console.log('[climate] Adding', data.monthly_normals.length, 'months of climate data');
                    popup = popup.replace('</div>', ''); // Remove closing div to append table
                    popup += '<hr><h4>Monthly Climate Normals</h4>';
                    popup += '<table style="font-size: 11px; width: 100%; border-collapse: collapse;">';
                    popup += '<tr style="background-color: #f0f0f0; border-bottom: 1px solid #ccc;">';
                    popup += '<th style="text-align: left; padding: 4px; border: 1px solid #ddd;">Month</th>';
                    popup += '<th style="text-align: center; padding: 4px; border: 1px solid #ddd;">Avg Temp (°F)</th>';
                    popup += '<th style="text-align: center; padding: 4px; border: 1px solid #ddd;">Precip (in)</th>';
                    popup += '</tr>';
                    
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    data.monthly_normals.forEach(month => {
                      popup += '<tr style="border-bottom: 1px solid #eee;">';
                      popup += '<td style="padding: 4px; border: 1px solid #ddd;">' + (monthNames[month.month - 1] || 'N/A') + '</td>';
                      popup += '<td style="padding: 4px; text-align: center; border: 1px solid #ddd;">' + (month.avg_temp_f ? parseFloat(month.avg_temp_f).toFixed(1) : 'N/A') + '</td>';
                      popup += '<td style="padding: 4px; text-align: center; border: 1px solid #ddd;">' + (month.avg_precip_in ? parseFloat(month.avg_precip_in).toFixed(2) : 'N/A') + '</td>';
                      popup += '</tr>';
                    });
                    
                    popup += '</table>';
                    console.log('[climate] Table complete');
                  } else {
                    // No data - show message
                    console.log('[climate] No data - showing message');
                    popup += '<hr><p style="font-size: 11px; color: #999;"><strong>Climate Data Not Available:</strong> No monthly normals found for this station</p>';
                  }
                  
                  popup += '</div>';
                  console.log('[climate] Final popup created');
                  marker.setPopupContent(popup);
                  console.log('[climate] Opening popup');
                  marker.openPopup();
                } catch (error) {
                  console.error('Error fetching climate data:', error);
                  const basicPopup = createPointPopup(layerId, f);
                  marker.setPopupContent(basicPopup + '<hr><p style="font-size: 11px; color: #999;"><strong>Climate Data Not Available:</strong> Unable to retrieve climate normals</p></div>');
                  marker.openPopup();
                }
              } else {
                const popup = createPointPopup(layerId, f);
                marker.setPopupContent(popup);
                marker.openPopup();
              }
            });
          } else {
            // For other layers (eBird, iNaturalist), just use static popup
            const popup = createPointPopup(layerId, f);
            marker.bindPopup(popup);
          }
        });
      } else {
        if (mapRef.current.hasLayer(group)) mapRef.current.removeLayer(group);
      }
    });
  }, [visibleLayers, layersData]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
