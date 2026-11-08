#!/usr/bin/env python3
"""
iNaturalist Runtime Query Service
Fetches observations at runtime and returns as GeoJSON
No database storage required
"""

import requests
from datetime import datetime, timedelta
from typing import Dict, List
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

INATURALIST_API = "https://api.inaturalist.org/v1"
TN_PLACE_ID = 45  # Tennessee

class iNaturalistRuntimeService:
    """Query iNaturalist API at runtime for biodiversity data"""
    
    def __init__(self):
        self.session = requests.Session()
        self.session.timeout = 60
        self.session.headers.update({
            'User-Agent': 'TDOT-Environmental-Viewer/1.0'
        })
    
    def get_observations_geojson(self, 
                                 days_back: int = 30,
                                 quality_grade: str = 'research',
                                 per_page: int = 200,
                                 limit_pages: int = None) -> Dict:
        """
        Fetch iNaturalist observations for Tennessee as GeoJSON
        
        Args:
            days_back: Number of days back to query (default 30)
            quality_grade: 'research' or 'needs_id' (default 'research')
            per_page: Results per page (default 200, max 200)
            limit_pages: Maximum pages to fetch (None = all)
        
        Returns:
            GeoJSON FeatureCollection ready for mapping
        """
        
        try:
            logger.info(f"Fetching iNaturalist observations for Tennessee (last {days_back} days)")
            
            # Calculate date range
            end_date = datetime.now().date()
            start_date = end_date - timedelta(days=days_back)
            
            all_features = []
            page = 1
            max_pages = limit_pages if limit_pages else 999
            
            while page <= max_pages:
                logger.info(f"  Fetching page {page}...")
                
                params = {
                    'place_id': TN_PLACE_ID,
                    'quality_grade': quality_grade,
                    'order_by': 'observed_on',
                    'per_page': per_page,
                    'page': page,
                    'd1': start_date.strftime('%Y-%m-%d'),
                    'd2': end_date.strftime('%Y-%m-%d')
                }
                
                response = self.session.get(
                    f"{INATURALIST_API}/observations",
                    params=params
                )
                response.raise_for_status()
                
                data = response.json()
                observations = data.get('results', [])
                total_results = data.get('total_results', 0)
                
                if page == 1:
                    logger.info(f"  Total results available: {total_results:,}")
                
                if not observations:
                    logger.info(f"  No more observations (end of results)")
                    break
                
                # Convert observations to GeoJSON features
                for obs in observations:
                    feature = self._observation_to_feature(obs)
                    if feature:
                        all_features.append(feature)
                
                logger.info(f"    Page {page}: {len(observations)} observations (total features: {len(all_features):,})")
                
                if len(observations) < per_page:
                    logger.info(f"  Final page reached")
                    break
                
                page += 1
            
            # Build GeoJSON FeatureCollection
            geojson = {
                'type': 'FeatureCollection',
                'features': all_features,
                'metadata': {
                    'source': 'iNaturalist',
                    'place': 'Tennessee, US',
                    'date_range': {
                        'start': start_date.isoformat(),
                        'end': end_date.isoformat()
                    },
                    'total_features': len(all_features),
                    'quality_grade': quality_grade,
                    'fetched_at': datetime.now().isoformat()
                }
            }
            
            logger.info(f"✓ Successfully generated GeoJSON with {len(all_features):,} features")
            
            return geojson
            
        except Exception as e:
            logger.error(f"Error fetching iNaturalist data: {e}")
            # Return empty GeoJSON on error
            return {
                'type': 'FeatureCollection',
                'features': [],
                'error': str(e)
            }
    
    def _observation_to_feature(self, obs: Dict) -> Dict:
        """Convert single observation to GeoJSON Feature"""
        
        try:
            # Extract geometry
            geojson = obs.get('geojson', {})
            if geojson.get('type') != 'Point':
                return None
            
            coords = geojson.get('coordinates', [])
            if not coords or len(coords) < 2:
                return None
            
            # Extract properties
            taxon = obs.get('taxon', {})
            species_name = taxon.get('name', 'Unknown species')
            common_name = taxon.get('preferred_common_name', '')
            
            photos = obs.get('photos', [])
            photo_url = photos[0].get('medium_url') if photos else None
            
            # Build feature
            feature = {
                'type': 'Feature',
                'geometry': {
                    'type': 'Point',
                    'coordinates': coords  # [lon, lat]
                },
                'properties': {
                    'id': obs.get('id'),
                    'species_name': species_name,
                    'common_name': common_name,
                    'scientific_name': taxon.get('name', ''),
                    'observed_date': obs.get('observed_on'),
                    'place_guess': obs.get('place_guess', ''),
                    'quality_grade': obs.get('quality_grade'),
                    'photo_url': photo_url,
                    'description': obs.get('description', ''),
                    'user_name': obs.get('user', {}).get('login', ''),
                    'positional_accuracy': obs.get('positional_accuracy'),
                    'url': obs.get('uri', ''),
                    'license': obs.get('license_code', 'CC0'),
                    'verified': obs.get('quality_grade') == 'research'
                }
            }
            
            return feature
            
        except Exception as e:
            logger.warning(f"Error converting observation {obs.get('id')}: {e}")
            return None
    
    def get_species_list(self, days_back: int = 30, quality_grade: str = 'research') -> List[str]:
        """Get unique list of species observed in Tennessee"""
        
        geojson = self.get_observations_geojson(days_back, quality_grade, limit_pages=10)
        species = set()
        
        for feature in geojson.get('features', []):
            props = feature.get('properties', {})
            species_name = props.get('species_name')
            if species_name:
                species.add(species_name)
        
        return sorted(list(species))
    
    def get_observations_by_species(self, 
                                   species_name: str,
                                   days_back: int = 30) -> List[Dict]:
        """Get all observations of a specific species"""
        
        geojson = self.get_observations_geojson(days_back)
        observations = []
        
        for feature in geojson.get('features', []):
            props = feature.get('properties', {})
            if props.get('species_name') == species_name:
                observations.append(feature)
        
        return observations


# Example usage / testing
if __name__ == "__main__":
    
    print("=" * 80)
    print("iNaturalist Runtime Query Service - Demo")
    print("=" * 80)
    
    service = iNaturalistRuntimeService()
    
    # Example 1: Get recent observations as GeoJSON
    print("\n1. Fetching 30 days of Tennessee observations as GeoJSON...")
    geojson = service.get_observations_geojson(days_back=30, limit_pages=2)
    
    print(f"\nGeoJSON Summary:")
    print(f"  Type: {geojson.get('type')}")
    print(f"  Total features: {len(geojson.get('features', []))}")
    print(f"  Metadata: {geojson.get('metadata')}")
    
    if geojson.get('features'):
        first_feature = geojson['features'][0]
        print(f"\nFirst observation:")
        print(f"  Species: {first_feature['properties'].get('species_name')}")
        print(f"  Common name: {first_feature['properties'].get('common_name')}")
        print(f"  Location: {first_feature['properties'].get('place_guess')}")
        print(f"  Coordinates: {first_feature['geometry']['coordinates']}")
        print(f"  Observed: {first_feature['properties'].get('observed_date')}")
        print(f"  Photo: {first_feature['properties'].get('photo_url')}")
    
    # Example 2: Get unique species list
    print("\n\n2. Getting unique species list (from first few pages)...")
    species_list = service.get_species_list()
    print(f"Found {len(species_list)} unique species")
    print(f"Sample species: {species_list[:5]}")
    
    # Example 3: Ready to use with frontend
    print("\n\n3. GeoJSON ready for frontend:")
    print("   The returned GeoJSON can be directly used with:")
    print("   - Leaflet: L.geoJSON(geojson).addTo(map)")
    print("   - Mapbox: map.addSource('obs', {type: 'geojson', data: geojson})")
    print("   - Any standard GeoJSON viewer")
    
    print("\n" + "=" * 80)
