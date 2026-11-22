import { useState, useEffect, useRef } from 'react';
import { healthAPI, projectsAPI, fetchLayerData } from './services/api';
import { LAYER_CONFIG, BASE_MAPS } from './services/constants';
import Map from './components/Map';
import ExportTool from './components/ExportTool';
import './App.css';

export default function App() {
  const exportToolRef = useRef(null);
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
  // Chattanooga-centered default extent (approximately 20 miles radius)
  const [mapBounds, setMapBounds] = useState({ north: 35.15, south: 34.95, east: -85.15, west: -85.38 });
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  // Track the currently open popup to restore it after data refresh
  const [openPopupId, setOpenPopupId] = useState(null);
  // Track selected project for export
  const [selectedProject, setSelectedProject] = useState(null);

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        const health = await healthAPI.check();
        if (health.status === 'running') {
          setBackendStatus('running');
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
        setInitialLoadDone(true);
      }
    };
    init();
  }, []);

  // Refetch projects when map bounds change (after initial load)
  useEffect(() => {
    if (!initialLoadDone || backendStatus !== 'running') {
      console.log('[App] Skipping projects fetch: initialLoadDone=', initialLoadDone, 'backendStatus=', backendStatus);
      return;
    }
    
    const refreshProjects = async () => {
      console.log('[App] Map bounds changed, refetching projects:', mapBounds);
      try {
        const res = await projectsAPI.getByBbox(
          [mapBounds.west, mapBounds.south, mapBounds.east, mapBounds.north],
          { limit: 1000 }
        );
        
        console.log('[App] API response:', res);
        if (res.success) {
          const projectData = res.features || res.data || [];
          console.log('[App] Updated projects:', projectData.length, 'features');
          setProjects(projectData);
          setProjectCount(projectData?.length || 0);
        } else {
          console.warn('[App] API response not successful:', res);
        }
      } catch (err) {
        console.error('[App] Error refreshing projects:', err);
      }
    };

    // Debounce the refresh - only refresh after map has stopped moving
    // This prevents constant API calls while user is panning
    const timer = setTimeout(refreshProjects, 500);
    return () => clearTimeout(timer);
  }, [mapBounds, initialLoadDone, backendStatus]);

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
    setVisibleLayers(prev => {
      const newVisibleLayers = { ...prev, [layerId]: !prev[layerId] };
      // Clear the count when layer is turned off
      if (!newVisibleLayers[layerId]) {
        setLayerCounts(prevCounts => ({ ...prevCounts, [layerId]: undefined }));
      }
      return newVisibleLayers;
    });
  };

  return (
    <div className='app'>
      <header className='header'>
        <h1>TDOT Projects and Environmental Data Viewer</h1>
      </header>

      <div className='container'>
        <aside className='sidebar'>
          {error && <div className='error'>{error}</div>}
          {loading && <div className='loading'>Loading...</div>}

          <ExportTool ref={exportToolRef} mapBounds={mapBounds} projects={projects} />

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
            <p>{projectCount} projects</p>
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

          <section>
            <h3>Legend</h3>
            <div className='legend'>
              <div className='legend-item'>
                <div className='legend-symbol legend-line'></div>
                <span>TDOT Projects</span>
              </div>
              <div className='legend-item'>
                <img src='/icons/ebird.jpg' alt='eBird' className='legend-icon' />
                <span>eBird Locations</span>
              </div>
              <div className='legend-item'>
                <img src='/icons/water-quality.jpg' alt='Water Quality' className='legend-icon' />
                <span>Water Quality</span>
              </div>
              <div className='legend-item'>
                <img src='/icons/climate.jpg' alt='Climate' className='legend-icon' />
                <span>Climate Stations</span>
              </div>
              <div className='legend-item'>
                <img src='/icons/inaturalist.jpg' alt='iNaturalist' className='legend-icon' />
                <span>iNaturalist</span>
              </div>
              <div className='legend-item'>
                <div className='legend-symbol' style={{ background: 'none', border: '2px solid #9467bd', width: '12px', height: '12px' }}></div>
                <span>HUC-12 Watersheds</span>
              </div>
              <div className='legend-item'>
                <div className='legend-symbol' style={{ background: 'rgba(200, 100, 100, 0.3)', width: '12px', height: '12px' }}></div>
                <span>Flood Hazard Zones</span>
              </div>
            </div>
          </section>
        </aside>

        <main className='map-main'>
          <Map 
            projects={projects} 
            visibleLayers={visibleLayers} 
            layersData={layersData} 
            baseMapKey={baseMapKey} 
            onBoundsChange={setMapBounds}
            openPopupId={openPopupId}
            onPopupChange={setOpenPopupId}
            onExportProject={(projectObj) => exportToolRef.current?.openWithProject(projectObj)}
          />
        </main>
      </div>

      <footer>
        <p>TDOT Environmental Data • Backend: {backendStatus === 'running' ? 'Online' : 'Offline'}</p>
        <p>Developed by Emmy Averill To Fulfill Requirements of PSM Capstone</p>
      </footer>
    </div>
  );
}
