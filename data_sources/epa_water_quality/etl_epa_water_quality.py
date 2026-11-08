#!/usr/bin/env python3
"""
EPA Water Quality Portal ETL Script - Stations Only
Fetches monitoring stations from EPA WQP and loads into PostgreSQL
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
load_dotenv()  # Load from .env in root directory

EPA_WQP_BASE_URL = "https://waterqualitydata.us/data"
DB_HOST = os.getenv('DB_HOST')
DB_PORT = os.getenv('DB_PORT', '5432')
DB_NAME = os.getenv('DB_NAME', 'tdot_env')
DB_USER = os.getenv('DB_USER', 'postgres')
DB_PASSWORD = os.getenv('RDS_PASSWORD')  # Use RDS password from .env

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class EPAWaterQualityETL:
    """ETL for EPA Water Quality Portal station data"""
    
    def __init__(self):
        self.conn = None
        self.session = requests.Session()
        self.session.timeout = 60
        # Set user agent for EPA
        self.session.headers.update({
            'User-Agent': 'TDOT-Environmental-Viewer/1.0'
        })
    
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
            logger.info("Connected to PostgreSQL")
        except Exception as e:
            logger.error(f"Database connection failed: {e}")
            raise
    
    def close_db(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
    
    def get_wqp_stations(self, state: str = 'US:47', limit: int = None) -> List[Dict]:
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
                if limit and len(stations) >= limit:
                    break
            
            logger.info(f"Retrieved {len(stations)} monitoring stations")
            return stations
            
        except Exception as e:
            logger.error(f"Error fetching WQP stations: {e}")
            return []
    
    def transform_station(self, station: Dict) -> Dict:
        """Transform EPA WQP Station CSV row to our schema"""
        try:
            # Extract coordinates - handle cases where they might be missing
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
                logger.debug(f"Skipping station {station.get('monitoring_location_identifier')} - no coordinates")
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
            # Commit after each successful insert
            self.conn.commit()
            return True
            
        except Exception as e:
            logger.error(f"Error inserting station {station.get('monitoring_location_identifier', 'UNKNOWN')}: {e}")
            # Rollback the failed transaction
            try:
                self.conn.rollback()
            except:
                pass
            return False
    
    def run(self):
        """Execute full ETL pipeline for stations"""
        try:
            self.connect_db()
            
            logger.info("=" * 70)
            logger.info("EPA Water Quality Portal ETL - Stations")
            logger.info("=" * 70)
            
            # Get WQP stations
            stations = self.get_wqp_stations(state='US:47')
            if not stations:
                logger.warning("No stations found")
                return
            
            # Process each station
            total_inserted = 0
            total_skipped = 0
            
            for station in stations:
                transformed = self.transform_station(station)
                if self.insert_station(transformed):
                    total_inserted += 1
                else:
                    total_skipped += 1
            
            logger.info("=" * 70)
            logger.info(f"ETL Complete")
            logger.info(f"  Inserted/Updated: {total_inserted} stations")
            logger.info(f"  Skipped: {total_skipped} stations")
            logger.info("=" * 70)
            
        except Exception as e:
            logger.error(f"ETL Failed: {e}")
            if self.conn:
                self.conn.rollback()
        finally:
            self.close_db()

if __name__ == "__main__":
    etl = EPAWaterQualityETL()
    etl.run()
