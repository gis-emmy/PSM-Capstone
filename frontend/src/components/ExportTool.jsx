import { useState, useImperativeHandle, forwardRef } from 'react';
import './ExportTool.css';

const ExportTool = forwardRef(({ mapBounds, projects = [], selectedProject: initialProject = null }, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [areaMode, setAreaMode] = useState('bbox'); // 'bbox' or 'radius'
  const [selectedProject, setSelectedProject] = useState(null);
  const [radiusKm, setRadiusKm] = useState(25);
  const [selectedDatasets, setSelectedDatasets] = useState({
    ebird: false,
    'water-quality': false,
    climate: false,
    inaturalist: false,
    huc12: false,
    'flood-zones': false
  });
  const [format, setFormat] = useState('geojson');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState(null);

  // Store the clicked project's geometry for calculating center coordinates
  const [selectedProjectGeometry, setSelectedProjectGeometry] = useState(null);

  // Expose openWithProject method to parent via ref
  useImperativeHandle(ref, () => ({
    openWithProject(projectObj) {
      // Extract properties from project object - handle both Feature objects and properties objects
      const props = projectObj?.properties || projectObj;
      const geometry = projectObj?.geometry;
      // Use OBJECTID as the project identifier (database unique ID)
      const projectId = props?.OBJECTID?.toString() || '';
      console.log('[ExportTool] Opening with project:', projectObj);
      console.log('[ExportTool] Extracted OBJECTID:', projectId);
      setSelectedProject(projectId);
      setSelectedProjectGeometry(geometry); // Store geometry for center calculation
      setAreaMode('radius');
      setIsOpen(true);
    }
  }));

  // Function to open export tool with a specific project pre-selected
  const openWithProject = (projectId) => {
    setSelectedProject(projectId);
    setAreaMode('radius');
    setIsOpen(true);
  };

  const datasets = [
    { id: 'ebird', label: 'eBird Observations', description: 'Bird observations + locations' },
    { id: 'water-quality', label: 'Water Quality', description: 'Stations + monitoring results' },
    { id: 'climate', label: 'Climate Data', description: 'Stations + monthly normals' },
    { id: 'inaturalist', label: 'iNaturalist', description: 'Species observations' },
    { id: 'huc12', label: 'HUC-12 Watersheds', description: 'Watershed boundaries' },
    { id: 'flood-zones', label: 'Flood Zones', description: 'Flood hazard areas' }
  ];

  const toggleDataset = (id) => {
    setSelectedDatasets(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleExport = async () => {
    try {
      setError(null);
      setIsExporting(true);

      // Build area object
      let area;
      if (areaMode === 'bbox') {
        area = {
          type: 'bbox',
          north: mapBounds.north,
          south: mapBounds.south,
          east: mapBounds.east,
          west: mapBounds.west
        };
      } else {
        if (!selectedProject) {
          setError('Please select a project');
          setIsExporting(false);
          return;
        }
        
        // Use line geometry buffering approach
        if (selectedProjectGeometry && selectedProjectGeometry.type === 'LineString') {
          area = {
            type: 'line_buffer',
            coordinates: selectedProjectGeometry.coordinates, // Array of [lon, lat] pairs in WGS84
            radius_km: radiusKm
          };
          console.log('[ExportTool] Using line buffer area with', selectedProjectGeometry.coordinates.length, 'coordinates and', radiusKm, 'km buffer');
        } else {
          setError('Selected project has no valid line geometry for buffering');
          setIsExporting(false);
          return;
        }
      }

      // Build request
      const requestBody = {
        area,
        datasets: Object.keys(selectedDatasets).filter(k => selectedDatasets[k]),
        format
      };

      if (requestBody.datasets.length === 0) {
        setError('Please select at least one dataset');
        setIsExporting(false);
        return;
      }

      // Make request
      const response = await fetch('http://tdot-api-manual.eba-muthcmmp.us-east-2.elasticbeanstalk.com/api/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || 'Export failed');
      }

      // Download file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      let extension;
      if (format === 'excel') {
        extension = 'xlsx';
      } else if (format === 'geojson') {
        extension = 'zip';  // GeoJSON now exports as ZIP with individual files
      } else {
        throw new Error('Invalid export format');
      }
      
      a.download = `export_${new Date().toISOString().split('T')[0]}.${extension}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setIsOpen(false);
    } catch (err) {
      console.error('Export error:', err);
      setError(err.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className='export-tool'>
      <button 
        className='export-button'
        onClick={() => setIsOpen(true)}
        title='Export data as GeoJSON or Excel'
      >
        📥 Export Data
      </button>

      {isOpen && (
        <div className='export-modal-overlay' onClick={() => !isExporting && setIsOpen(false)}>
          <div className='export-modal' onClick={e => e.stopPropagation()}>
            <div className='export-header'>
              <h2>Export Environmental Data</h2>
              <button 
                className='export-close' 
                onClick={() => setIsOpen(false)}
                disabled={isExporting}
              >
                ✕
              </button>
            </div>

            <div className='export-content'>
              {/* Area Selection */}
              <div className='export-section'>
                <h3>1. Define Area</h3>
                
                <div className='export-radio-group'>
                  <label>
                    <input 
                      type='radio' 
                      value='bbox' 
                      checked={areaMode === 'bbox'}
                      onChange={(e) => setAreaMode(e.target.value)}
                      disabled={isExporting}
                    />
                    <span>Use Current Map View</span>
                  </label>
                  {areaMode === 'bbox' && (
                    <div className='export-bbox-info'>
                      <p>N: {mapBounds.north.toFixed(4)}</p>
                      <p>S: {mapBounds.south.toFixed(4)}</p>
                      <p>E: {mapBounds.east.toFixed(4)}</p>
                      <p>W: {mapBounds.west.toFixed(4)}</p>
                    </div>
                  )}
                </div>

                <div className='export-radio-group'>
                  <label>
                    <input 
                      type='radio' 
                      value='radius' 
                      checked={areaMode === 'radius'}
                      onChange={(e) => setAreaMode(e.target.value)}
                      disabled={isExporting}
                    />
                    <span>Project + Radius</span>
                  </label>
                  {areaMode === 'radius' && (
                    <div className='export-radius-controls'>
                      <select 
                        value={selectedProject || ''} 
                        onChange={(e) => setSelectedProject(e.target.value || null)}
                        disabled={isExporting}
                      >
                        <option value=''>Select a project...</option>
                        {projects.map((p, idx) => {
                          // Extract properties from Feature object
                          const props = p.properties || p;
                          
                          // Use OBJECTID as the unique project identifier (backend expects this)
                          const projectId = props.OBJECTID?.toString() || '';
                          
                          // Display PIN and State project numbers
                          const pin = props.PIN || '';
                          const stateProjectNumbers = props.STATE_PROJ_NUMBERS || '';
                          
                          const projectStatus = props.PROJECT_STATUS || props.project_status || props.status || props.STATUS || '';
                          const region = props.REGION || props.region || props.REGION_NAME || '';
                          
                          // Build display label: PIN | State # [Status] (Region)
                          const displayParts = [];
                          if (pin) displayParts.push(`PIN: ${pin}`);
                          if (stateProjectNumbers) displayParts.push(`State #: ${stateProjectNumbers}`);
                          
                          let displayLabel = displayParts.length > 0 ? displayParts.join(' | ') : 'Project';
                          if (projectStatus) displayLabel += ` [${projectStatus}]`;
                          if (region) displayLabel += ` (${region})`;
                          
                          console.log(`[ExportTool] Project ${idx}: objectId="${projectId}" pin="${pin}" stateNum="${stateProjectNumbers}" label="${displayLabel}"`);
                          
                          return (
                            <option key={projectId || idx} value={projectId}>
                              {displayLabel}
                            </option>
                          );
                        })}
                      </select>
                      <div className='export-radius-input'>
                        <label>Radius (km):</label>
                        <input 
                          type='number' 
                          min='1' 
                          max='100' 
                          value={radiusKm}
                          onChange={(e) => setRadiusKm(Number(e.target.value))}
                          disabled={isExporting}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Dataset Selection */}
              <div className='export-section'>
                <h3>2. Select Datasets</h3>
                <div className='export-dataset-list'>
                  {datasets.map(ds => (
                    <label key={ds.id} className='export-dataset-item'>
                      <input 
                        type='checkbox' 
                        checked={selectedDatasets[ds.id]}
                        onChange={() => toggleDataset(ds.id)}
                        disabled={isExporting}
                      />
                      <div className='export-dataset-info'>
                        <span className='export-dataset-label'>{ds.label}</span>
                        <span className='export-dataset-desc'>{ds.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Format Selection */}
              <div className='export-section'>
                <h3>3. Select Format</h3>
                <div className='export-radio-group'>
                  <label>
                    <input 
                      type='radio' 
                      value='geojson' 
                      checked={format === 'geojson'}
                      onChange={(e) => setFormat(e.target.value)}
                      disabled={isExporting}
                    />
                    <span>GeoJSON (.zip) - Multiple layers in ZIP, each fully readable in QGIS</span>
                  </label>
                </div>
                <div className='export-radio-group'>
                  <label>
                    <input 
                      type='radio' 
                      value='excel' 
                      checked={format === 'excel'}
                      onChange={(e) => setFormat(e.target.value)}
                      disabled={isExporting}
                    />
                    <span>Excel (.xlsx) - Tabular data with geometry as text</span>
                  </label>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className='export-error'>
                  ⚠️ {error}
                </div>
              )}
            </div>

            <div className='export-footer'>
              <button 
                className='export-cancel-btn' 
                onClick={() => setIsOpen(false)}
                disabled={isExporting}
              >
                Cancel
              </button>
              <button 
                className='export-submit-btn' 
                onClick={handleExport}
                disabled={isExporting}
              >
                {isExporting ? '⟳ Exporting...' : '📥 Export'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

ExportTool.displayName = 'ExportTool';
export default ExportTool;
