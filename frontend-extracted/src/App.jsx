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
    'flood-hazard': false
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
        if (health.status === 'error') {
          setBackendStatus('offline');
          setError('Backend server is offline');
          return;
        }
        setBackendStatus('running');
        const res = await projectsAPI.getAll({ limit: 1000 });
        if (res.success) {
          setProjects(res.data || []);
          setProjectCount(res.data?.length || 0);
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
    Object.keys(visibleLayers).forEach(layerId => {
      if (visibleLayers[layerId] && !layersData[layerId]) {
        loadLayerData(layerId);
      }
    });
  }, [visibleLayers]);

  const loadLayerData = async (layerId) => {
    if (layersLoading[layerId]) return;
    setLayersLoading(prev => ({ ...prev, [layerId]: true }));
    try {
      // HUC12 and Flood Hazard layers require bbox params
      let params = {};
      if (layerId === 'huc12' || layerId === 'flood-hazard') {
        params = {
          north: mapBounds.north,
          south: mapBounds.south,
          east: mapBounds.east,
          west: mapBounds.west
        };
      } else {
        params = { limit: 500 };
      }
      
      const data = await fetchLayerData(layerId, params);
      if (data?.features) {
        setLayersData(prev => ({ ...prev, [layerId]: data }));
        setLayerCounts(prev => ({ ...prev, [layerId]: data.features.length }));
      }
    } catch (err) {
      console.error('Error loading layer:', err);
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
        <h1>🗺️ TDOT Environmental Data</h1>
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
            <h3>🗺️ Base Maps</h3>
            <div className='basemap-buttons'>
              {Object.keys(BASE_MAPS).map(key => (
                <button key={key} className={baseMapKey === key ? 'active' : ''} onClick={() => setBaseMapKey(key)}>
                  {BASE_MAPS[key].label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3>📍 Projects</h3>
            <p>{projectCount} projects - Always visible</p>
          </section>

          <section>
            <h3>🌍 Environmental Layers</h3>
            {Object.keys(LAYER_CONFIG).map(layerId => (
              <label key={layerId} className='layer-check'>
                <input type='checkbox' checked={visibleLayers[layerId]} onChange={() => toggleLayer(layerId)} disabled={loading || backendStatus !== 'running'} />
                <span>{LAYER_CONFIG[layerId].name}</span>
                {layerCounts[layerId] !== undefined && <span className='count'>({layerCounts[layerId]})</span>}
                {layersLoading[layerId] && <span className='loading-spinner'>⟳</span>}
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
