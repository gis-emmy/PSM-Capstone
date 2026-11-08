import { useState, useEffect } from 'react';
import { healthAPI, projectsAPI, fetchLayerData } from './services/api';
import { LAYER_CONFIG, BASE_MAPS } from './services/constants';
import Map from './components/Map';
import './App.css';

export default function App() {
  const [backendStatus, setBackendStatus] = useState('checking');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projectCount, setProjectCount] = useState(0);
  const [visibleLayers, setVisibleLayers] = useState({
    ebird: false,
    'water-quality': false,
    climate: false,
    inaturalist: false,
    huc12: false,
    'flood-zones': false
  });
  const [layersData, setLayersData] = useState({});
  const [layerCounts, setLayerCounts] = useState({});
  const [layersLoading, setLayersLoading] = useState({});
  const [baseMapKey, setBaseMapKey] = useState('OpenStreetMap');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mapBounds, setMapBounds] = useState({ north: 36.5, south: 35.0, east: -81.5, west: -90.0 });

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        const health = await healthAPI.check();
        if (health.status === 'running') {
          setBackendStatus('running');
          const res = await projectsAPI.getAll({ limit: 1000 });
          if (res.success) {
            setProjects(res.data || []);
            setProjectCount(res.data?.length || 0);
          }
        } else {
          setBackendStatus('offline');
          setError('Backend server is offline');
        }
      } catch (err) {
        console.error('Init error:', err);
        setBackendStatus('offline');
        setError('Error: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    // Load layer data when toggled on
    Object.keys(visibleLayers).forEach(layerId => {
      if (visibleLayers[layerId]) {
        // Check if extent is valid for this layer
        const config = LAYER_CONFIG[layerId];
        if (config && config.displayExtent) {
          const latSpan = mapBounds.north - mapBounds.south;
          const lonSpan = Math.abs(mapBounds.east - mapBounds.west);
          const extent = latSpan * lonSpan;
          
          if (extent > config.displayExtent) {
            console.warn(`Layer ${layerId} extent too large. Current: ${extent.toFixed(3)} sq deg, Max: ${config.displayExtent} sq deg`);
            setError(`Zoom in to view ${LAYER_CONFIG[layerId].name} (current extent: ${extent.toFixed(3)} sq deg)`);
            // Uncheck the layer if extent is too large
            setVisibleLayers(prev => ({ ...prev, [layerId]: false }));
            return;
          }
        }
        
        // Always re-query when layer is turned on
        loadLayerData(layerId);
      }
    });
  }, [visibleLayers, mapBounds]);

  const loadLayerData = async (layerId) => {
    if (layersLoading[layerId]) return;
    
    setLayersLoading(prev => ({ ...prev, [layerId]: true }));
    try {
      let params = {
        // Always include bbox for all layers
        north: mapBounds.north,
        south: mapBounds.south,
        east: mapBounds.east,
        west: mapBounds.west
      };
      
      // All layer endpoints now use direct layer IDs as endpoints
      console.log(`Loading layer: ${layerId} with bbox:`, 
        { north: params.north, south: params.south, east: params.east, west: params.west });
      
      const data = await fetchLayerData(layerId, params);
      
      if (!data) {
        console.error(`Layer ${layerId} returned null`);
        setLayersData(prev => ({ ...prev, [layerId]: { type: "FeatureCollection", features: [] } }));
        setLayerCounts(prev => ({ ...prev, [layerId]: 0 }));
        return;
      }
      
      // All layers use the features array directly
      if (data?.features) {
        console.log(`Layer ${layerId} loaded: ${data.features.length} features`);
        setLayersData(prev => ({ ...prev, [layerId]: data }));
        setLayerCounts(prev => ({ ...prev, [layerId]: data.features.length }));
      } else {
        console.warn(`Layer ${layerId} has no features property`, data);
        setLayersData(prev => ({ ...prev, [layerId]: { type: "FeatureCollection", features: [] } }));
        setLayerCounts(prev => ({ ...prev, [layerId]: 0 }));
      }
    } catch (err) {
      console.error('Error loading layer:', layerId, err);
      setLayersData(prev => ({ ...prev, [layerId]: { type: "FeatureCollection", features: [] } }));
      setLayerCounts(prev => ({ ...prev, [layerId]: 0 }));
    } finally {
      setLayersLoading(prev => ({ ...prev, [layerId]: false }));
    }
  };

  const toggleLayer = (layerId) => {
    setVisibleLayers(prev => ({ ...prev, [layerId]: !prev[layerId] }));
  };

  return (
    <div className='app'>
      <header className='header'>
        <h1>TDOT Environmental Data</h1>
        <div className='status'>
          {backendStatus === 'running' ? '✓ Connected to RDS' : '✗ Backend Offline'}
        </div>
      </header>

      <div className='container'>
        <aside className='sidebar'>
          <button className='toggle-btn' onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
            {sidebarCollapsed ? '▶' : '◀'}
          </button>

          {error && <div className='error'>{error}</div>}
          {loading && <div className='loading'>Loading...</div>}

          <section>
            <h3>Base Maps</h3>
            <div className='basemap-buttons'>
              {Object.keys(BASE_MAPS).map(key => (
                <button key={key} className={baseMapKey === key ? 'active' : ''} onClick={() => setBaseMapKey(key)}>
                  {BASE_MAPS[key].label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3>Projects</h3>
            <p>{projectCount} projects - Always visible</p>
          </section>

          <section>
            <h3>Environmental Layers</h3>
            {Object.keys(LAYER_CONFIG).map(layerId => (
              <label key={layerId} className='layer-check'>
                <input type='checkbox' checked={visibleLayers[layerId]} onChange={() => toggleLayer(layerId)} disabled={loading || backendStatus !== 'running'} />
                <span>{LAYER_CONFIG[layerId].name}</span>
                {layerCounts[layerId] !== undefined && <span className='count'>({layerCounts[layerId]})</span>}
                {layersLoading[layerId] && <span className='loading-text'>Loading...</span>}
              </label>
            ))}
          </section>
        </aside>

        <main className='map-main'>
          <Map projects={projects} visibleLayers={visibleLayers} layersData={layersData} baseMapKey={baseMapKey} onBoundsChange={setMapBounds} />
        </main>
      </div>

      <footer>
        <p>TDOT Environmental Data • RDS Database • Backend: {backendStatus === 'running' ? 'Online' : 'Offline'}</p>
      </footer>
    </div>
  );
}
