#!/usr/bin/env python3
"""
eBird Observations ETL Script
Fetches bird observation data from eBird API and loads into PostgreSQL
"""

import os
import logging
import requests
from datetime import datetime, timedelta
from typing import List, Dict
import psycopg2
from dotenv import load_dotenv

# Configuration
load_dotenv()

EBIRD_API = "https://api.ebird.org/v2"
EBIRD_API_KEY = os.getenv('EBIRD_API_KEY', '')
TN_REGION = "US-TN"  # Region code for Tennessee

DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_PORT = os.getenv('DB_PORT', '5432')
DB_NAME = os.getenv('DB_NAME', 'tdot_env')
DB_USER = os.getenv('DB_USER', 'postgres')
DB_PASSWORD = os.getenv('DB_PASSWORD', 'dev-password')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class eBirdETL:
    """ETL for eBird observation data"""
    
    def __init__(self):
        self.conn = None
        self.session = requests.Session()
        self.session.timeout = 30
        self.session.headers.update({
            'User-Agent': 'TDOT-Environmental-Viewer/1.0'
        })
        
        # Protected/threatened bird species
        self.protected_species = [
            'baegl',  # Bald Eagle
            'gwhow',  # Great Horned Owl
            'puma',   # Puma
            'kipe',   # Kestrel (some populations)
        ]
    
    def connect_db(self):
        """Connect to PostgreSQL database"""
        try:
            self.conn = psycopg2.connect(
                host=DB_HOST,
                port=DB_PORT,
                database=DB_NAME,
                user=DB_USER,
                password=DB_PASSWORD,
                sslmode='require'
            )
            logger.info("✓ Connected to PostgreSQL")
        except Exception as e:
            logger.error(f"✗ Database connection failed: {e}")
            raise
    
    def close_db(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
    
    def get_recent_observations(self, 
                               region: str = TN_REGION,
                               days_back: int = 30) -> List[Dict]:
        """Fetch bird observations from eBird for the past 30 days"""
        try:
            if not EBIRD_API_KEY:
                logger.error("EBIRD_API_KEY not set in environment variables")
                return []
            
            # Cap days_back at 30 (API limit)
            days_back = min(days_back, 30)
            
            logger.info(f"Fetching eBird observations for {region} (last {days_back} days)...")
            
            # eBird API v2 requires key as query parameter
            url = f"{EBIRD_API}/data/obs/{region}/recent?back={days_back}&key={EBIRD_API_KEY}&fmt=json"
            
            # Use direct requests.get instead of session to avoid interference
            response = requests.get(url, timeout=120)
            response.raise_for_status()
            
            observations = response.json()
            logger.info(f"Retrieved {len(observations)} observations from past {days_back} days")
            
            return observations
            
        except Exception as e:
            logger.error(f"Error fetching eBird observations: {e}")
            return []
    
    def get_hotspots(self, region: str = TN_REGION) -> List[Dict]:
        """Fetch popular birding locations (hotspots)"""
        try:
            logger.info(f"Fetching eBird hotspots for {region}...")
            
            response = self.session.get(
                f"{EBIRD_API}/ref/hotspot/{region}",
                params={'fmt': 'json'}
            )
            response.raise_for_status()
            
            hotspots = response.json()
            logger.info(f"Retrieved {len(hotspots)} hotspots")
            
            return hotspots
            
        except Exception as e:
            logger.error(f"Error fetching hotspots: {e}")
            return []
    
    def get_observations_from_map_service(self, 
                                         min_lat: float = 35.0,
                                         max_lat: float = 36.9,
                                         min_lon: float = -89.8,
                                         max_lon: float = -81.6,
                                         months: str = None) -> List[Dict]:
        """Fetch observations using eBird map services endpoint (higher data volume)"""
        try:
            logger.info(f"Fetching eBird observations via map service...")
            logger.info(f"  Bounds: ({min_lat}, {min_lon}) to ({max_lat}, {max_lon})")
            
            # eBird map services endpoint - returns all observations in bounding box
            map_service_url = "https://ebird.org/mapServices/genHsForWindow.do"
            
            params = {
                'minY': min_lat,
                'maxY': max_lat,
                'minX': min_lon,
                'maxX': max_lon,
                'yr': 'all',  # All years
                'm': 'all' if not months else months  # All months or specific months
            }
            
            response = self.session.get(map_service_url, params=params, timeout=60)
            response.raise_for_status()
            
            # Parse response (typically returns XML or JSON hotspot data with observations)
            data = response.json()
            
            # Extract observations from response
            observations = []
            if isinstance(data, list):
                observations = data
            elif isinstance(data, dict) and 'features' in data:
                # GeoJSON format
                for feature in data['features']:
                    observations.append(feature['properties'])
            
            logger.info(f"Retrieved {len(observations)} observations from map service")
            return observations
            
        except Exception as e:
            logger.error(f"Error fetching observations from map service: {e}")
            return []
    
    def get_species_info(self, species_code: str) -> Dict:
        """Get species information from eBird taxonomy"""
        try:
            response = self.session.get(
                f"{EBIRD_API}/ref/taxonomy/ebird",
                params={'fmt': 'json', 'cat': 'species'}
            )
            response.raise_for_status()
            
            species_list = response.json()
            
            # Find species by code
            for species in species_list:
                if species.get('code') == species_code:
                    return species
            
            return {}
            
        except Exception as e:
            logger.error(f"Error fetching species info: {e}")
            return {}
    
    def extract_observation_data(self, obs: Dict, species_info: Dict) -> Dict:
        """Extract relevant data from eBird observation"""
        try:
            species_code = obs.get('speciesCode')
            common_name = obs.get('comName', 'Unknown')
            scientific_name = obs.get('sciName', '')
            
            # Determine if protected
            is_protected = species_code in self.protected_species
            
            return {
                'ebird_id': obs.get('obsID'),
                'species_code': species_code,
                'common_name': common_name,
                'scientific_name': scientific_name,
                'latitude': obs.get('lat'),
                'longitude': obs.get('lng'),
                'location_name': obs.get('locName', 'Unknown'),
                'observation_date': obs.get('obsDt', datetime.now().strftime('%Y-%m-%d')),
                'observation_count': obs.get('howMany', 1),
                'is_protected': is_protected,
                'data_quality_flag': obs.get('obsValid', 'valid') if obs.get('obsValid') else 'valid',
                'is_validated': obs.get('obsValid', True)
            }
        except Exception as e:
            logger.warning(f"Error extracting observation data: {e}")
            return None
    
    def insert_ebird_observation(self, obs_data: Dict) -> bool:
        """Insert bird observation into ebird_observations_new table with location lookup"""
        try:
            if not obs_data or not obs_data.get('latitude') or not obs_data.get('longitude'):
                return False
            
            cursor = self.conn.cursor()
            
            # First, get or create location
            location_sql = """
            INSERT INTO ebird_locations (location_name, latitude, longitude)
            VALUES (%s, %s, %s)
            ON CONFLICT (latitude, longitude) DO UPDATE
            SET updated_at = CURRENT_TIMESTAMP
            RETURNING location_id
            """
            
            cursor.execute(location_sql, (
                obs_data['location_name'],
                obs_data['latitude'],
                obs_data['longitude']
            ))
            
            location_id = cursor.fetchone()[0]
            
            # Then insert observation with location_id reference
            obs_sql = """
            INSERT INTO ebird_observations_new (
                location_id, ebird_id, species_code, common_name, scientific_name,
                observation_date, observation_count, is_protected, data_quality_flag,
                is_validated, data_source
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            ON CONFLICT (ebird_id) DO NOTHING
            """
            
            cursor.execute(obs_sql, (
                location_id,
                obs_data['ebird_id'],
                obs_data['species_code'],
                obs_data['common_name'],
                obs_data['scientific_name'],
                obs_data['observation_date'],
                obs_data['observation_count'],
                obs_data['is_protected'],
                obs_data['data_quality_flag'],
                obs_data['is_validated'],
                'eBird'
            ))
            
            self.conn.commit()
            cursor.close()
            return True
            
        except Exception as e:
            logger.error(f"Error inserting observation: {e}")
            self.conn.rollback()
            return False
    
    def run(self):
        """Execute full ETL pipeline"""
        try:
            self.connect_db()
            
            logger.info("=" * 60)
            logger.info("eBird Observations ETL - Starting")
            logger.info("=" * 60)
            
            # Fetch eBird observations from API (30-day limit)
            observations = self.get_recent_observations(days_back=30)
            
            logger.info(f"Processing {len(observations)} observations...")
            
            total_inserted = 0
            for obs in observations:
                obs_data = self.extract_observation_data(obs, {})
                if self.insert_ebird_observation(obs_data):
                    total_inserted += 1
            
            logger.info("=" * 60)
            logger.info(f"ETL Complete - Inserted {total_inserted} observations")
            logger.info("=" * 60)
            
        except Exception as e:
            logger.error(f"ETL Failed: {e}")
        finally:
            self.close_db()

if __name__ == "__main__":
    etl = eBirdETL()
    etl.run()
