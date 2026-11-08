import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BASE_MAPS } from '../services/constants';
import './Map.css';

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
      'flood-hazard': L.layerGroup()
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
      if (!p.location) return;
      const lat = p.location.y || p.location.coordinates?.[1];
      const lon = p.location.x || p.location.coordinates?.[0];
      if (!lat || !lon) return;
      const icon = L.divIcon({
        html: `<svg width='30' height='40' viewBox='0 0 24 40' xmlns='http://www.w3.org/2000/svg'><path d='M12 0c6.627 0 12 5.373 12 12 0 6.627-12 28-12 28S0 18.627 0 12C0 5.373 5.373 0 12 0z' fill='${colors[p.status] || '#0078D4'}' stroke='white' stroke-width='2'/></svg>`,
        iconSize: [30, 40],
        iconAnchor: [15, 40],
        popupAnchor: [0, -40]
      });
      L.marker([lat, lon], { icon }).bindPopup(`<b>${p.name || 'Project'}</b><br>${p.status || 'N/A'}`).addTo(layerGroupsRef.current.projects);
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
        const config = { ebird: '#FF8C00', 'water-quality': '#1E90FF', climate: '#DC143C', inaturalist: '#FF69B4', huc12: '#228B22', 'flood-hazard': '#FF4500' };
        const color = config[layerId] || '#0078D4';
        
        data.forEach(f => {
          // Handle polygons (HUC12, Flood Hazard)
          if (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon') {
            L.geoJSON(f, {
              style: { color, weight: 2, opacity: 0.6, fillOpacity: 0.2 },
              onEachFeature: (feature, layer) => {
                const name = feature.properties?.name || feature.properties?.huc12 || feature.properties?.flood_zone || 'Feature';
                layer.bindPopup(`<b>${name}</b>`);
              }
            }).addTo(group);
            return;
          }
          
          // Handle points (eBird, Water Quality, Climate, iNaturalist)
          if (f.geometry?.type !== 'Point') return;
          const [lon, lat] = f.geometry.coordinates;
          const icon = L.divIcon({ html: `<svg width='20' height='20' viewBox='0 0 20 20'><circle cx='10' cy='10' r='8' fill='${color}' stroke='white' stroke-width='2'/></svg>`, iconSize: [20, 20], iconAnchor: [10, 10] });
          L.marker([lat, lon], { icon }).bindPopup(`<b>${f.properties?.name || 'Feature'}</b>`).addTo(group);
        });
      } else {
        if (mapRef.current.hasLayer(group)) mapRef.current.removeLayer(group);
      }
    });
  }, [visibleLayers, layersData]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
