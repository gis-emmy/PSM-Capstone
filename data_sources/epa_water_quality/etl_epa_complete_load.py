#!/usr/bin/env python3
"""
EPA Water Quality Portal ETL - Complete Station Load
Fetches all monitoring stations and appends to RDS, skipping existing records with progress tracking
"""

import os
import sys
import csv
import logging
import requests
from datetime import datetime
from typing import List, Dict
from io import StringIO
import psycopg2
from dotenv import load_dotenv

# Configuration
# Load from .env file in project root
env_path = os.path.join(os.path.dirname(__file__), '../../.env')
load_dotenv(dotenv_path=env_path)

EPA_WQP_BASE_URL = "https://waterqualitydata.us/data"
DB_HOST = os.getenv('DB_HOST')
DB_PORT = os.getenv('DB_PORT', '5432')
DB_NAME = os.getenv('DB_NAME', 'tdot_env')
DB_USER = os.getenv('DB_USER', 'postgres')
DB_PASSWORD = os.getenv('RDS_PASSWORD')

# Verify credentials are loaded
if not DB_PASSWORD:
    raise ValueError("RDS_PASSWORD not found in environment. Check .env file.")

# Configure logging with both file and console output
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('epa_stations_etl.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class EPAStationsETL:
    """ETL for EPA Water Quality Portal station data"""
    
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
            'updated': 0,
            'skipped': 0,
            'errors': 0,
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
            logger.info("Connected to RDS PostgreSQL")
        except Exception as e:
            logger.error(f"Database connection failed: {e}")
            raise
    
    def close_db(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
    
    def get_existing_stations(self) -> set:
        """Get set of existing station IDs to skip"""
        try:
            cursor = self.conn.cursor()
            cursor.execute("SELECT monitoring_location_identifier FROM water_quality_stations;")
            existing = {row[0] for row in cursor.fetchall()}
            cursor.close()
            logger.info(f"Found {len(existing)} existing stations in database")
            return existing
        except Exception as e:
            logger.error(f"Error fetching existing stations: {e}")
            return set()
    
    def get_wqp_stations(self, state: str = 'US:47') -> List[Dict]:
        """Fetch monitoring stations from EPA WQP"""
        try:
            logger.info(f"Fetching EPA WQP monitoring stations for {state}...")
            
            params = {
                'statecode': state,
                'mimeType': 'csv',
                'zip': 'no'
            }
            
            response = self.session.get(
                f"{EPA_WQP_BASE_URL}/Station/search",
                params=params,
                timeout=60
            )
            response.raise_for_status()
            
            # Parse CSV response
            csv_reader = csv.DictReader(StringIO(response.text))
            stations = []
            for row in csv_reader:
                stations.append(row)
            
            self.stats['fetched'] = len(stations)
            logger.info(f"Retrieved {len(stations)} monitoring stations from EPA WQP")
            return stations
            
        except Exception as e:
            logger.error(f"Error fetching WQP stations: {e}")
            return []
    
    def transform_station(self, station: Dict) -> Dict:
        """Transform EPA WQP Station CSV row to our schema"""
        try:
            try:
                lat = float(station.get('LatitudeMeasure', 0)) if station.get('LatitudeMeasure') else None
                lon = float(station.get('LongitudeMeasure', 0)) if station.get('LongitudeMeasure') else None
            except (ValueError, TypeError):
                lat = None
                lon = None
            
            return {
                'monitoring_location_identifier': station.get('MonitoringLocationIdentifier', ''),
                'monitoring_location_name': station.get('MonitoringLocationName', ''),
                'organization_identifier': station.get('OrganizationIdentifier', ''),
                'organization_name': station.get('OrganizationFormalName', ''),
                'latitude': lat,
                'longitude': lon,
                'monitoring_location_type': station.get('MonitoringLocationType', ''),
                'huc_code': station.get('HUCEightDigitCode', ''),
                'provider_name': station.get('ProviderName', 'EPA WQP'),
            }
        except Exception as e:
            logger.warning(f"Error transforming station: {e}")
            return None
    
    def insert_station(self, station: Dict) -> bool:
        """Insert station into water_quality_stations table"""
        try:
            if not station:
                return False
            
            # Skip if no coordinates
            if not station.get('latitude') or not station.get('longitude'):
                self.stats['skipped'] += 1
                return False
            
            cursor = self.conn.cursor()
            
            sql = """
            INSERT INTO water_quality_stations (
                monitoring_location_identifier,
                monitoring_location_name,
                organization_identifier,
                organization_name,
                latitude,
                longitude,
                monitoring_location_type,
                huc_code,
                provider_name,
                last_updated,
                created_at,
                updated_at
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
            ON CONFLICT (monitoring_location_identifier) 
            DO UPDATE SET
                monitoring_location_name = EXCLUDED.monitoring_location_name,
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                monitoring_location_type = EXCLUDED.monitoring_location_type,
                huc_code = EXCLUDED.huc_code,
                provider_name = EXCLUDED.provider_name,
                updated_at = CURRENT_TIMESTAMP
            """
            
            cursor.execute(sql, (
                station['monitoring_location_identifier'],
                station['monitoring_location_name'],
                station['organization_identifier'],
                station['organization_name'],
                station['latitude'],
                station['longitude'],
                station['monitoring_location_type'],
                station['huc_code'],
                station['provider_name']
            ))
            
            cursor.close()
            self.conn.commit()
            return True
            
        except psycopg2.IntegrityError:
            # Record already exists, this is expected
            self.conn.rollback()
            self.stats['updated'] += 1
            return False
        except Exception as e:
            logger.error(f"Error inserting station {station.get('monitoring_location_identifier', 'UNKNOWN')}: {e}")
            try:
                self.conn.rollback()
            except:
                pass
            self.stats['errors'] += 1
            return False
    
    def run(self):
        """Execute full ETL pipeline for stations"""
        try:
            self.connect_db()
            
            logger.info("=" * 80)
            logger.info("EPA Water Quality Portal - Complete Station Load ETL")
            logger.info(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            logger.info("=" * 80)
            
            # Get list of existing stations to skip
            existing_stations = self.get_existing_stations()
            
            # Get WQP stations
            stations = self.get_wqp_stations(state='US:47')
            if not stations:
                logger.warning("No stations found from EPA WQP")
                return
            
            # Process each station
            logger.info(f"Processing {len(stations)} stations...")
            logger.info("-" * 80)
            
            for idx, station in enumerate(stations, 1):
                station_id = station.get('MonitoringLocationIdentifier', 'UNKNOWN')
                
                # Skip if already exists
                if station_id in existing_stations:
                    self.stats['skipped'] += 1
                else:
                    transformed = self.transform_station(station)
                    if self.insert_station(transformed):
                        self.stats['inserted'] += 1
                
                self.stats['total_processed'] += 1
                
                # Progress indicator every 1000 records
                if idx % 1000 == 0:
                    logger.info(f"Progress: {idx}/{len(stations)} records processed")
                    logger.info(f"  Inserted: {self.stats['inserted']} | Updated: {self.stats['updated']} | Skipped: {self.stats['skipped']} | Errors: {self.stats['errors']}")
            
            logger.info("-" * 80)
            logger.info("=" * 80)
            logger.info("ETL Complete")
            logger.info(f"Completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            logger.info("=" * 80)
            logger.info(f"Total Fetched from EPA:  {self.stats['fetched']}")
            logger.info(f"Total Processed:         {self.stats['total_processed']}")
            logger.info(f"Newly Inserted:          {self.stats['inserted']}")
            logger.info(f"Updated (Existed):       {self.stats['updated']}")
            logger.info(f"Skipped (No Coords):     {self.stats['skipped']}")
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
    etl = EPAStationsETL()
    etl.run()
