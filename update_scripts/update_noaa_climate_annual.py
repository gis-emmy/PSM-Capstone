#!/usr/bin/env python3
"""
Annual NOAA Climate Monthly Normals Update Script
Loads Tennessee climate normals from NOAA NCEI API into RDS database

This script should be run once per year in December after NOAA publishes updated normals
Usage: python update_noaa_climate_annual.py

Schedule: December (recommended: December 15-31)
Rate limits: 5 requests/second, 10,000 requests/day
Expected runtime: ~2-3 minutes
"""

import os
import sys
import logging
import requests
import psycopg2
import time
from datetime import datetime
from typing import List, Dict
from dotenv import load_dotenv

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'data_sources', '.env'))

# API Configuration
NCEI_TOKEN = os.getenv('ncei_token')
NCEI_BASE = "https://www.ncei.noaa.gov/cdo-web/api/v2"

# Database Configuration
DB_HOST = os.getenv('DB_HOST')
DB_PORT = os.getenv('DB_PORT', '5432')
DB_NAME = os.getenv('DB_NAME')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')

if not NCEI_TOKEN:
    print("ERROR: ncei_token not found in .env file")
    sys.exit(1)

# Configure logging
log_filename = f"noaa_climate_update_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s',
    handlers=[
        logging.FileHandler(log_filename),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# NOAA API session setup
session = requests.Session()
session.headers.update({
    'token': NCEI_TOKEN,
    'User-Agent': 'TDOT-Environmental-Viewer/1.0'
})
session.timeout = 30

# ============================================================================
# FUNCTIONS
# ============================================================================

def get_tennessee_stations() -> List[Dict]:
    """Fetch all Tennessee weather stations with NORMAL_MLY data"""
    logger.info("Fetching Tennessee weather stations...")
    
    # First get Tennessee location
    response = session.get(
        f"{NCEI_BASE}/locations",
        params={'locationcategoryid': 'ST', 'limit': 50}
    )
    response.raise_for_status()
    locations = response.json()
    
    tn_location = None
    for loc in locations.get('results', []):
        if 'Tennessee' in loc.get('name', ''):
            tn_location = loc
            break
    
    if not tn_location:
        raise ValueError("Tennessee location not found")
    
    logger.info(f"Found Tennessee location: {tn_location['id']}")
    
    # Get all stations in Tennessee with NORMAL_MLY data
    response = session.get(
        f"{NCEI_BASE}/stations",
        params={
            'locationid': tn_location['id'],
            'datasetid': 'NORMAL_MLY',
            'limit': 50
        }
    )
    response.raise_for_status()
    stations_data = response.json()
    
    stations = stations_data.get('results', [])
    logger.info(f"Found {len(stations)} stations with NORMAL_MLY data")
    
    return stations

def fetch_station_normals(station_id: str, station_name: str, lat: float, lon: float, elev: float) -> List[Dict]:
    """Fetch 12 months of normals for a station"""
    records = []
    
    # Main temperature and precipitation data types
    datatypes = [
        'MLY-TMAX-NORMAL',   # Average max temperature
        'MLY-TMIN-NORMAL',   # Average min temperature
        'MLY-TAVG-NORMAL',   # Average temperature
        'MLY-PRCP-NORMAL',   # Average precipitation
        'MLY-SNOW-NORMAL',   # Average snowfall
    ]
    
    for datatype in datatypes:
        try:
            # Retry logic for rate limiting (429)
            max_retries = 3
            retry_count = 0
            response = None
            
            while retry_count < max_retries:
                response = session.get(
                    f"{NCEI_BASE}/data",
                    params={
                        'datasetid': 'NORMAL_MLY',
                        'stationid': station_id,
                        'datatypeid': datatype,
                        'startdate': '2010-01-01',
                        'enddate': '2010-12-01',
                        'limit': 100
                    }
                )
                
                if response.status_code == 429:
                    # Rate limited - wait and retry
                    retry_count += 1
                    wait_time = 2 ** retry_count  # Exponential backoff: 2, 4, 8 seconds
                    if retry_count < max_retries:
                        logger.warning(f"Rate limited (429). Retrying in {wait_time}s...")
                        time.sleep(wait_time)
                    continue
                else:
                    break
            
            if response.status_code != 200:
                logger.warning(f"{station_name} - {datatype} returned {response.status_code}")
                continue
            
            data = response.json()
            results = data.get('results', [])
            
            # Map datatype to column name
            datatype_mapping = {
                'MLY-TMAX-NORMAL': 'max_temp_f',
                'MLY-TMIN-NORMAL': 'min_temp_f',
                'MLY-TAVG-NORMAL': 'avg_temp_f',
                'MLY-PRCP-NORMAL': 'avg_precip_in',
                'MLY-SNOW-NORMAL': 'avg_snowfall_in',
            }
            
            column_name = datatype_mapping.get(datatype)
            
            # Process results
            for result in results:
                date_str = result.get('date', '')
                value = result.get('value')
                
                if not date_str or value is None:
                    continue
                
                # Extract month (2010-01-01 → month 1)
                try:
                    month = int(date_str.split('-')[1])
                except (IndexError, ValueError):
                    continue
                
                # NOAA stores as tenths (e.g., 1000 = 100.0°F)
                normalized_value = value / 10.0
                
                # Find or create record for this month
                month_record = None
                for rec in records:
                    if rec['month'] == month:
                        month_record = rec
                        break
                
                if not month_record:
                    month_record = {
                        'station_id': station_id,
                        'station_name': station_name,
                        'latitude': lat,
                        'longitude': lon,
                        'elevation_m': elev,
                        'month': month,
                        'avg_temp_f': None,
                        'max_temp_f': None,
                        'min_temp_f': None,
                        'avg_precip_in': None,
                        'avg_snowfall_in': None,
                    }
                    records.append(month_record)
                
                # Update the specific field
                if column_name:
                    month_record[column_name] = normalized_value
        
        except Exception as e:
            logger.error(f"Error fetching {datatype} for {station_name}: {str(e)}")
            continue
    
    return records

def insert_records(conn, records: List[Dict]) -> int:
    """Insert records into database with conflict resolution"""
    cursor = conn.cursor()
    inserted = 0
    
    # First pass: Insert/update all stations in weather_stations table
    for record in records:
        try:
            cursor.execute("""
                INSERT INTO weather_stations 
                (station_id, station_name, latitude, longitude, elevation_m, data_source)
                VALUES (%s, %s, %s, %s, %s, 'NOAA_NCEI')
                ON CONFLICT (station_id) DO UPDATE SET
                    station_name = EXCLUDED.station_name,
                    latitude = EXCLUDED.latitude,
                    longitude = EXCLUDED.longitude,
                    elevation_m = EXCLUDED.elevation_m,
                    updated_at = CURRENT_TIMESTAMP
            """, (
                record['station_id'],
                record['station_name'],
                record['latitude'],
                record['longitude'],
                record['elevation_m'],
            ))
        except Exception as e:
            logger.error(f"Error upserting station {record['station_id']}: {e}")
    
    conn.commit()
    
    # Second pass: Insert climate data using FK lookup
    insert_sql = """
    INSERT INTO climate_monthly_normals 
    (station_id, month, avg_temp_f, max_temp_f, min_temp_f, avg_precip_in, avg_snowfall_in, updated_at)
    VALUES ((SELECT id FROM weather_stations WHERE station_id = %s), %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
    ON CONFLICT (station_id, month) DO UPDATE SET
        avg_temp_f = EXCLUDED.avg_temp_f,
        max_temp_f = EXCLUDED.max_temp_f,
        min_temp_f = EXCLUDED.min_temp_f,
        avg_precip_in = EXCLUDED.avg_precip_in,
        avg_snowfall_in = EXCLUDED.avg_snowfall_in,
        updated_at = CURRENT_TIMESTAMP
    """
    
    for record in records:
        try:
            cursor.execute(insert_sql, (
                record['station_id'],
                record['month'],
                record['avg_temp_f'],
                record['max_temp_f'],
                record['min_temp_f'],
                record['avg_precip_in'],
                record['avg_snowfall_in'],
            ))
            inserted += 1
        except Exception as e:
            logger.error(f"Error inserting climate record for {record['station_id']}: {e}")
    
    conn.commit()
    cursor.close()
    return inserted

# ============================================================================
# MAIN
# ============================================================================

def main():
    """Main ETL process"""
    logger.info("=" * 80)
    logger.info("NOAA CLIMATE MONTHLY NORMALS - ANNUAL UPDATE")
    logger.info("=" * 80)
    
    start_time = time.time()
    total_records_fetched = 0
    total_records_inserted = 0
    stations_processed = 0
    stations_failed = 0
    
    try:
        # Connect to database
        logger.info("Connecting to RDS database...")
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD
        )
        logger.info("Connected to database")
        
        # Get Tennessee stations
        stations = get_tennessee_stations()
        logger.info(f"Processing {len(stations)} stations...")
        
        # Process each station
        for i, station in enumerate(stations, 1):
            station_id = station['id']
            station_name = station['name']
            lat = station.get('latitude', 0)
            lon = station.get('longitude', 0)
            elev = station.get('elevation', {})
            
            if isinstance(elev, dict):
                elev_value = elev.get('value', 0)
            else:
                elev_value = elev if elev else 0
            
            try:
                # Fetch normals for this station
                normals = fetch_station_normals(station_id, station_name, lat, lon, elev_value)
                
                if normals:
                    # Insert records
                    inserted = insert_records(conn, normals)
                    total_records_fetched += len(normals)
                    total_records_inserted += inserted
                    stations_processed += 1
                    
                    if i % 10 == 0:
                        logger.info(f"Progress: {i}/{len(stations)} stations processed")
            
            except Exception as e:
                logger.error(f"Failed to process {station_name}: {str(e)}")
                stations_failed += 1
                continue
            
            # Rate limiting: wait 0.2 seconds between stations to stay under 5 req/sec
            time.sleep(0.2)
        
        conn.close()
        
        # Summary
        elapsed = time.time() - start_time
        
        logger.info("=" * 80)
        logger.info("UPDATE SUMMARY")
        logger.info("=" * 80)
        logger.info(f"Stations processed: {stations_processed}/{len(stations)}")
        logger.info(f"Stations failed: {stations_failed}")
        logger.info(f"Total records fetched: {total_records_fetched}")
        logger.info(f"Total records loaded: {total_records_inserted}")
        logger.info(f"Elapsed time: {elapsed:.1f} seconds")
        logger.info(f"Records/sec: {total_records_inserted/elapsed:.1f}")
        logger.info("=" * 80)
        
        if stations_failed == 0:
            logger.info("UPDATE COMPLETE - SUCCESS")
            return 0
        else:
            logger.warning(f"UPDATE COMPLETE - {stations_failed} stations failed")
            return 1

    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        return 1

if __name__ == "__main__":
    sys.exit(main())
