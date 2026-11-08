import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BASE_MAPS } from '../services/constants';
import './Map.css';

// Popup builders for different layer types
function createPointPopup(layerId, feature) {
  const props = feature.properties || {};
  let html = '<div class="popup-content">';
  
  const formatCoord = (val) => {
    return val ? parseFloat(val).toFixed(4) : 'N/A';
  };
  
  switch(layerId) {
    case 'ebird':
      html += '<h3>' + (props.location_name || 'eBird Location') + '</h3>';
      html += '<p><strong>Observations:</strong> ' + (props.observation_count || 'N/A') + '</p>';
      html += '<p><strong>Unique Species:</strong> ' + (props.unique_species_count || 'N/A') + '</p>';
      html += '<p><strong>Location ID:</strong> ' + (props.location_id || 'N/A') + '</p>';
      html += '<p><strong>Lat/Lon:</strong> ' + formatCoord(props.latitude) + ', ' + formatCoord(props.longitude) + '</p>';
      if (props.last_observation_date) {
        html += '<p><strong>Last Observation:</strong> ' + props.last_observation_date + '</p>';
      }
      break;
    
    case 'water-quality':
      html += '<h3>' + (props.monitoring_location_name || 'Water Quality Station') + '</h3>';
      html += '<p><strong>Organization:</strong> ' + (props.organization_name || 'N/A') + '</p>';
      html += '<p><strong>Type:</strong> ' + (props.monitoring_location_type || 'N/A') + '</p>';
      html += '<p><strong>HUC-12:</strong> ' + (props.huc_code || 'N/A') + '</p>';
      html += '<p><strong>Lat/Lon:</strong> ' + formatCoord(props.latitude) + ', ' + formatCoord(props.longitude) + '</p>';
      if (props.drainage_area_square_miles) {
        html += '<p><strong>Drainage Area:</strong> ' + props.drainage_area_square_miles + ' sq mi</p>';
      }
      break;
    
    case 'climate':
      html += '<h3>' + (props.station_name || 'Climate Station') + '</h3>';
      html += '<p><strong>Station ID:</strong> ' + (props.station_id || 'N/A') + '</p>';
      html += '<p><strong>Avg Temperature:</strong> ' + (props.avg_temp_f || 'N/A') + '°F</p>';
      html += '<p><strong>Avg Precipitation:</strong> ' + (props.avg_precip_in || 'N/A') + ' in</p>';
      html += '<p><strong>Lat/Lon:</strong> ' + formatCoord(props.latitude) + ', ' + formatCoord(props.longitude) + '</p>';
      if (props.month) {
        html += '<p><strong>Month:</strong> ' + props.month + '</p>';
      }
      break;
    
    case 'inaturalist':
      html += '<h3>' + (props.common_name || props.scientific_name || 'Observation') + '</h3>';
      html += '<p><strong>Scientific Name:</strong> ' + (props.scientific_name || 'N/A') + '</p>';
      html += '<p><strong>Date Observed:</strong> ' + (props.observation_date || props.observed_on || 'N/A') + '</p>';
      html += '<p><strong>Quality Grade:</strong> ' + (props.quality_grade || 'N/A') + '</p>';
      if (props.species_code) {
        html += '<p><strong>Species Code:</strong> ' + props.species_code + '</p>';
      }
      if (props.photo_url) {
        html += '<p><img src="' + props.photo_url + '" style="width: 100%; max-width: 200px; border-radius: 4px; margin-top: 8px;" alt="observation" /></p>';
      }
      break;
    
    default:
      html += '<h3>' + (props.name || 'Data Point') + '</h3>';
      html += '<p><strong>Source:</strong> ' + (props.data_source || 'N/A') + '</p>';
  }
  
  html += '</div>';
  return html;
}

function createPolygonPopup(layerId, feature) {
  const props = feature.properties || {};
  let html = '<div class="popup-content">';
  
  switch(layerId) {
    case 'huc12':
      html += '<h3>Watershed</h3>';
      html += '<p><strong>HUC-12 Code:</strong> ' + (props.huc12 || props.code || 'N/A') + '</p>';
      html += '<p><strong>Name:</strong> ' + (props.name || 'N/A') + '</p>';
      html += '<p><strong>Drainage Area:</strong> ' + (props.drainage_area || 'N/A') + '</p>';
      html += '<p><strong>Region:</strong> ' + (props.region || 'N/A') + '</p>';
      break;
    
    case 'flood-zones':
      html += '<h3>Flood Hazard Zone</h3>';
      html += '<p><strong>Zone:</strong> ' + (props.flood_zone || props.zone || 'N/A') + '</p>';
      html += '<p><strong>County:</strong> ' + (props.county || 'N/A') + '</p>';
      html += '<p><strong>FIPS Code:</strong> ' + (props.fips_code || 'N/A') + '</p>';
      html += '<p><strong>Description:</strong> ' + (props.description || 'N/A') + '</p>';
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

export default function Map({ projects = [], visibleLayers = {}, layersData = {}, baseMapKey = 'OpenStreetMap', onBoundsChange }) {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const layerGroupsRef = useRef({});

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = L.map(containerRef.current).setView([35.7478, -86.6923], 7);
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
    layerGroupsRef.current.projects.clearLayers();
    const colors = { planned: '#FFA500', under_review: '#FFD700', under_construction: '#FF6347', completed: '#32CD32', archived: '#808080' };
    projects.forEach(p => {
      const lat = p.latitude || p.location?.y || p.location?.coordinates?.[1];
      const lon = p.longitude || p.location?.x || p.location?.coordinates?.[0];
      if (!lat || !lon) return;
      const projectSvg = '<svg width="30" height="40" viewBox="0 0 24 40" xmlns="http://www.w3.org/2000/svg"><path d="M12 0c6.627 0 12 5.373 12 12 0 6.627-12 28-12 28S0 18.627 0 12C0 5.373 5.373 0 12 0z" fill="' + (colors[p.project_status] || colors[p.status] || '#0078D4') + '" stroke="white" stroke-width="2"/></svg>';
      const icon = L.divIcon({
        html: projectSvg,
        iconSize: [30, 40],
        iconAnchor: [15, 40],
        popupAnchor: [0, -40]
      });
      L.marker([lat, lon], { icon }).bindPopup('<b>' + (p.project_name || p.name || 'Project') + '</b><br>' + (p.project_status || p.status || 'N/A')).addTo(layerGroupsRef.current.projects);
    });
  }, [projects]);

  useEffect(() => {
    if (!mapRef.current) return;
    Object.keys(visibleLayers).forEach(layerId => {
      if (layerId === 'watersheds' || layerId === 'flood-hazard-old') return;
      const group = layerGroupsRef.current[layerId];
      if (!group) return;
      
      if (visibleLayers[layerId]) {
        if (!mapRef.current.hasLayer(group)) mapRef.current.addLayer(group);
        group.clearLayers();
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
          const svgHtml = `<svg width='20' height='20' viewBox='0 0 20 20'><circle cx='10' cy='10' r='8' fill='${color}' stroke='white' stroke-width='2'/></svg>`;
          const icon = L.divIcon({ html: svgHtml, iconSize: [20, 20], iconAnchor: [10, 10] });
          const popup = createPointPopup(layerId, f);
          L.marker([lat, lon], { icon }).bindPopup(popup).addTo(group);
        });
      } else {
        if (mapRef.current.hasLayer(group)) mapRef.current.removeLayer(group);
      }
    });
  }, [visibleLayers, layersData]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
