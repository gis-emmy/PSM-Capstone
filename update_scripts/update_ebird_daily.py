#!/usr/bin/env python3
"""
Daily eBird Data Update Script
Truncates existing eBird tables and replaces with latest 30-day data from eBird API

This script should be run daily via cron job or task scheduler
Usage: python update_ebird_daily.py
"""

import os
import logging
import requests
from datetime import datetime
import psycopg2
from dotenv import load_dotenv

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'data_sources', '.env'))

EBIRD_API = "https://api.ebird.org/v2"
EBIRD_API_KEY = os.getenv('EBIRD_API_KEY', '')
TN_REGION = "US-TN"

DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_PORT = os.getenv('DB_PORT', '5432')
DB_NAME = os.getenv('DB_NAME', 'tdot_env')
DB_USER = os.getenv('DB_USER', 'postgres')
DB_PASSWORD = os.getenv('DB_PASSWORD', 'dev-password')

# Configure logging
log_file = os.path.join(os.path.dirname(__file__), 'ebird_update.log')
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class eBirdDailyUpdate:
    """Daily update for eBird observation data"""
    
    def __init__(self):
        self.conn = None
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
            return True
        except Exception as e:
            logger.error(f"✗ Database connection failed: {e}")
            return False
    
    def close_db(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
    
    def truncate_tables(self):
        """Truncate existing eBird tables"""
        try:
            cursor = self.conn.cursor()
            
            # Truncate observations first (foreign key constraint)
            cursor.execute("TRUNCATE TABLE ebird_observations_new")
            logger.info("✓ Truncated ebird_observations_new")
            
            # Truncate locations
            cursor.execute("TRUNCATE TABLE ebird_locations")
            logger.info("✓ Truncated ebird_locations")
            
            self.conn.commit()
            cursor.close()
            return True
        except Exception as e:
            logger.error(f"✗ Error truncating tables: {e}")
            self.conn.rollback()
            return False
    
    def fetch_observations(self, days_back: int = 30):
        """Fetch eBird observations for the past N days"""
        try:
            if not EBIRD_API_KEY:
                logger.error("EBIRD_API_KEY not set in environment variables")
                return []
            
            # Cap days_back at 30 (API limit)
            days_back = min(days_back, 30)
            
            logger.info(f"Fetching eBird observations for {TN_REGION} (last {days_back} days)...")
            
            url = f"{EBIRD_API}/data/obs/{TN_REGION}/recent?back={days_back}&key={EBIRD_API_KEY}&fmt=json"
            
            response = requests.get(url, timeout=120)
            response.raise_for_status()
            
            observations = response.json()
            logger.info(f"✓ Retrieved {len(observations)} observations")
            
            return observations
            
        except Exception as e:
            logger.error(f"✗ Error fetching observations: {e}")
            return []
    
    def extract_observation_data(self, obs: dict) -> dict:
        """Extract relevant data from eBird observation"""
        try:
            species_code = obs.get('speciesCode')
            
            return {
                'ebird_id': obs.get('obsID'),
                'species_code': species_code,
                'common_name': obs.get('comName', 'Unknown'),
                'scientific_name': obs.get('sciName', ''),
                'latitude': obs.get('lat'),
                'longitude': obs.get('lng'),
                'location_name': obs.get('locName', 'Unknown'),
                'observation_date': obs.get('obsDt', datetime.now().strftime('%Y-%m-%d')),
                'observation_count': obs.get('howMany', 1),
                'is_protected': species_code in self.protected_species,
                'data_quality_flag': obs.get('obsValid', 'valid') if obs.get('obsValid') else 'valid',
                'is_validated': obs.get('obsValid', True)
            }
        except Exception as e:
            logger.warning(f"Error extracting observation data: {e}")
            return None
    
    def insert_observation(self, obs_data: dict) -> bool:
        """Insert observation into database with location relationship"""
        try:
            if not obs_data or not obs_data.get('latitude') or not obs_data.get('longitude'):
                return False
            
            cursor = self.conn.cursor()
            
            # Insert or get location
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
            
            # Insert observation
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
            logger.debug(f"Error inserting observation: {e}")
            self.conn.rollback()
            return False
    
    def update_location_statistics(self):
        """Update location statistics after loading all observations"""
        try:
            cursor = self.conn.cursor()
            
            cursor.execute("""
                UPDATE ebird_locations l
                SET 
                    observation_count = (
                        SELECT COUNT(*) FROM ebird_observations_new 
                        WHERE location_id = l.location_id
                    ),
                    unique_species_count = (
                        SELECT COUNT(DISTINCT species_code) FROM ebird_observations_new 
                        WHERE location_id = l.location_id
                    ),
                    first_observation_date = (
                        SELECT MIN(observation_date) FROM ebird_observations_new 
                        WHERE location_id = l.location_id
                    ),
                    last_observation_date = (
                        SELECT MAX(observation_date) FROM ebird_observations_new 
                        WHERE location_id = l.location_id
                    ),
                    updated_at = CURRENT_TIMESTAMP
            """)
            
            self.conn.commit()
            logger.info("✓ Location statistics updated")
            cursor.close()
            return True
            
        except Exception as e:
            logger.error(f"✗ Error updating location statistics: {e}")
            self.conn.rollback()
            return False
    
    def run(self):
        """Execute daily update"""
        try:
            logger.info("="*70)
            logger.info("eBIRD DAILY UPDATE - Starting")
            logger.info("="*70)
            
            # Connect to database
            if not self.connect_db():
                return False
            
            # Truncate existing data
            if not self.truncate_tables():
                return False
            
            # Fetch new observations
            observations = self.fetch_observations(days_back=30)
            if not observations:
                logger.warning("No observations returned from API")
                return False
            
            # Load observations
            logger.info(f"Processing {len(observations)} observations...")
            inserted_count = 0
            
            for obs in observations:
                obs_data = self.extract_observation_data(obs)
                if self.insert_observation(obs_data):
                    inserted_count += 1
            
            logger.info(f"✓ Inserted {inserted_count} observations")
            
            # Update statistics
            if not self.update_location_statistics():
                return False
            
            # Verify final counts
            cursor = self.conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM ebird_locations")
            location_count = cursor.fetchone()[0]
            cursor.execute("SELECT COUNT(*) FROM ebird_observations_new")
            obs_count = cursor.fetchone()[0]
            cursor.close()
            
            logger.info("="*70)
            logger.info(f"eBIRD DAILY UPDATE - Complete")
            logger.info(f"  Locations: {location_count}")
            logger.info(f"  Observations: {obs_count}")
            logger.info("="*70)
            
            return True
            
        except Exception as e:
            logger.error(f"✗ Update failed: {e}")
            return False
        
        finally:
            self.close_db()


if __name__ == "__main__":
    update = eBirdDailyUpdate()
    success = update.run()
    exit(0 if success else 1)
