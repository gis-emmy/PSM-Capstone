#!/usr/bin/env python3
"""
iNaturalist Biodiversity Data ETL Script - UPDATED
Fetches species observations from iNaturalist and loads into PostgreSQL
Fixed: Correct Place ID (45 = Tennessee), Correct coordinate fields (geojson)
"""

import os
import sys
import logging
import requests
from datetime import datetime, timedelta
from typing import List, Dict
import psycopg2
from dotenv import load_dotenv

# Configuration
env_path = os.path.join(os.path.dirname(__file__), '../../.env')
load_dotenv(dotenv_path=env_path)

INATURALIST_API = "https://api.inaturalist.org/v1"
TN_PLACE_ID = 45  # FIXED: Correct Tennessee Place ID (was 38394 = Mongolia)

DB_HOST = os.getenv('DB_HOST')
DB_PORT = os.getenv('DB_PORT', '5432')
DB_NAME = os.getenv('DB_NAME', 'tdot_env')
DB_USER = os.getenv('DB_USER', 'postgres')
DB_PASSWORD = os.getenv('RDS_PASSWORD')

if not DB_PASSWORD:
    raise ValueError("RDS_PASSWORD not found in environment. Check .env file.")

# Configure logging with both file and console output
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('etl_inaturalist_biodiversity.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class iNaturalistETL:
    """ETL for iNaturalist biodiversity data"""
    
    def __init__(self):
        self.conn = None
        self.session = requests.Session()
        self.session.timeout = 60
        self.session.headers.update({
            'User-Agent': 'TDOT-Environmental-Viewer/1.0'
        })
        self.stats = {
            'fetched': 0,
            'inserted': 0,
            'skipped_no_coords': 0,
            'skipped_duplicate': 0,
            'errors': 0,
            'total_pages': 0,
            'total_processed': 0
        }
    
    def connect_db(self):
        """Connect to PostgreSQL database"""
        try:
            self.conn = psycopg2.connect(
                host=DB_HOST,
                port=DB_PORT,
                database=DB_NAME,
                user=DB_USER,
                password=DB_PASSWORD
            )
            logger.info("✓ Connected to RDS PostgreSQL")
        except Exception as e:
            logger.error(f"✗ Database connection failed: {e}")
            raise
    
    def close_db(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
    
    def check_table_exists(self) -> bool:
        """Check if citizen_science_observations table exists"""
        try:
            cursor = self.conn.cursor()
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'citizen_science_observations'
                )
            """)
            exists = cursor.fetchone()[0]
            cursor.close()
            return exists
        except Exception as e:
            logger.error(f"Error checking table: {e}")
            return False
    
    def get_tn_observations_30days(self, 
                                   per_page: int = 200,
                                   pages: int = None) -> List[Dict]:
        """Fetch research-grade observations from Tennessee (last 30 days)"""
        try:
            logger.info(f"Fetching iNaturalist observations for Tennessee (last 30 days)...")
            logger.info(f"  Place ID: {TN_PLACE_ID} (Tennessee)")
            logger.info(f"  Quality: research-grade only")
            logger.info(f"  Per page: {per_page}")
            
            # Calculate date range (last 30 days)
            end_date = datetime.now().date()
            start_date = end_date - timedelta(days=30)
            
            logger.info(f"  Date range: {start_date} to {end_date}")
            
            all_observations = []
            page = 1
            max_pages = pages if pages else 999  # Fetch all pages if not limited
            
            while page <= max_pages:
                logger.info(f"  Fetching page {page}...")
                
                params = {
                    'place_id': TN_PLACE_ID,
                    'quality_grade': 'research',
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
                
                all_observations.extend(observations)
                self.stats['total_pages'] += 1
                
                logger.info(f"    Page {page}: {len(observations)} observations (total so far: {len(all_observations):,})")
                
                # Check if we've fetched enough or reached last page
                if len(observations) < per_page:
                    logger.info(f"  Final page reached")
                    break
                
                page += 1
            
            self.stats['fetched'] = len(all_observations)
            logger.info(f"✓ Retrieved {len(all_observations):,} observations total")
            
            return all_observations
            
        except Exception as e:
            logger.error(f"✗ Error fetching iNaturalist data: {e}")
            return []
    
    def extract_observation_data(self, obs: Dict) -> Dict:
        """Extract relevant data from iNaturalist observation"""
        try:
            # Get taxonomy
            taxon = obs.get('taxon', {})
            species_name = taxon.get('name', 'Unknown')
            
            # FIXED: Get coordinates from geojson field (not geom)
            geojson = obs.get('geojson', {})
            coords = geojson.get('coordinates', [])
            
            # GeoJSON format is [longitude, latitude] - need to swap
            longitude = coords[0] if len(coords) > 0 else None
            latitude = coords[1] if len(coords) > 1 else None
            
            # Alternative: Try location field if geojson not available
            if not latitude or not longitude:
                location_str = obs.get('location', '')
                if location_str:
                    parts = location_str.split(',')
                    if len(parts) == 2:
                        try:
                            latitude = float(parts[0])
                            longitude = float(parts[1])
                        except ValueError:
                            pass
            
            return {
                'species_name': species_name,
                'scientific_name': taxon.get('name', ''),
                'longitude': longitude,
                'latitude': latitude,
                'observation_date': obs.get('observed_on', datetime.now().strftime('%Y-%m-%d')),
                'inaturalist_id': obs.get('id'),
                'photo_url': obs.get('photos', [{}])[0].get('medium_url') if obs.get('photos') else None,
                'quality_grade': obs.get('quality_grade', 'unknown'),
                'description': obs.get('description', ''),
                'place_guess': obs.get('place_guess', ''),
                'user_name': obs.get('user', {}).get('login', ''),
                'positional_accuracy': obs.get('positional_accuracy'),
                'license_code': obs.get('license_code')
            }
        except Exception as e:
            logger.warning(f"Error extracting observation data: {e}")
            return None
    
    def insert_citizen_science_observation(self, obs_data: Dict) -> bool:
        """Insert observation into Citizen_Science_Observations table"""
        try:
            if not obs_data or not obs_data.get('latitude') or not obs_data.get('longitude'):
                self.stats['skipped_no_coords'] += 1
                return False
            
            cursor = self.conn.cursor()
            
            sql = """
            INSERT INTO citizen_science_observations (
                species_observed, observation_type, location,
                observation_date, photo_url, observation_description,
                status, verified, created_at, updated_at
            ) VALUES (
                %s, %s, ST_GeomFromText(%s, 4326),
                %s, %s, %s,
                'verified', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
            ON CONFLICT (species_observed, observation_date, location) 
            DO NOTHING
            """
            
            point_wkt = f"POINT({obs_data['longitude']} {obs_data['latitude']})"
            
            cursor.execute(sql, (
                obs_data['species_name'],
                'species_sighting',
                point_wkt,
                obs_data['observation_date'],
                obs_data['photo_url'],
                obs_data['description'],
            ))
            
            self.conn.commit()
            cursor.close()
            return True
            
        except psycopg2.IntegrityError:
            try:
                self.conn.rollback()
            except:
                pass
            self.stats['skipped_duplicate'] += 1
            return False
        except Exception as e:
            logger.error(f"Error inserting observation: {e}")
            try:
                self.conn.rollback()
            except:
                pass
            self.stats['errors'] += 1
            return False
    
    def run(self):
        """Execute full ETL pipeline"""
        try:
            self.connect_db()
            
            logger.info("=" * 80)
            logger.info("iNaturalist Biodiversity ETL - 30-Day Data Load")
            logger.info(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            logger.info("=" * 80)
            
            # Check if table exists
            if not self.check_table_exists():
                logger.error("✗ citizen_science_observations table does not exist!")
                logger.error("  Create the table first using database schema script")
                return
            
            logger.info("✓ citizen_science_observations table exists")
            
            # Get observations from last 30 days
            observations = self.get_tn_observations_30days()
            if not observations:
                logger.warning("No observations found")
                return
            
            # Process each observation
            logger.info(f"\nProcessing {len(observations):,} observations...")
            logger.info("-" * 80)
            
            for idx, obs in enumerate(observations, 1):
                obs_data = self.extract_observation_data(obs)
                if self.insert_citizen_science_observation(obs_data):
                    self.stats['inserted'] += 1
                
                self.stats['total_processed'] += 1
                
                # Progress indicator every 500 records
                if idx % 500 == 0:
                    logger.info(f"Progress: {idx:,}/{len(observations):,} records processed")
                    logger.info(f"  Inserted: {self.stats['inserted']} | Duplicates: {self.stats['skipped_duplicate']} | No Coords: {self.stats['skipped_no_coords']} | Errors: {self.stats['errors']}")
            
            logger.info("-" * 80)
            logger.info("=" * 80)
            logger.info("ETL Complete")
            logger.info(f"Completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            logger.info("=" * 80)
            logger.info(f"Total Fetched:           {self.stats['fetched']:,}")
            logger.info(f"Total Processed:         {self.stats['total_processed']:,}")
            logger.info(f"Total Pages:             {self.stats['total_pages']}")
            logger.info(f"Successfully Inserted:   {self.stats['inserted']:,}")
            logger.info(f"Skipped (No Coords):     {self.stats['skipped_no_coords']:,}")
            logger.info(f"Skipped (Duplicates):    {self.stats['skipped_duplicate']:,}")
            logger.info(f"Errors:                  {self.stats['errors']}")
            logger.info("=" * 80)
            
        except Exception as e:
            logger.error(f"ETL Failed: {e}")
            if self.conn:
                try:
                    self.conn.rollback()
                except:
                    pass
        finally:
            self.close_db()

if __name__ == "__main__":
    etl = iNaturalistETL()
    etl.run()
