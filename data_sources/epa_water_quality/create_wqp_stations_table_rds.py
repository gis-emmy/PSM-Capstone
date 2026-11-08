#!/usr/bin/env python3
"""Create water_quality_stations table on RDS database"""

import psycopg2
import logging
from dotenv import load_dotenv
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

# RDS Connection details
DB_HOST = os.getenv('DB_HOST')
DB_PORT = os.getenv('DB_PORT', '5432')
DB_NAME = os.getenv('DB_NAME', 'tdot_env')
DB_USER = os.getenv('DB_USER', 'postgres')
DB_PASSWORD = os.getenv('RDS_PASSWORD')  # Use RDS_PASSWORD from .env

print(f"Connecting to RDS: {DB_HOST}:{DB_PORT}/{DB_NAME}")

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS water_quality_stations (
    station_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- WQP identifiers
    monitoring_location_identifier VARCHAR(255) UNIQUE NOT NULL,
    monitoring_location_name VARCHAR(255),
    organization_identifier VARCHAR(255),
    organization_name VARCHAR(255),
    
    -- Location data
    latitude NUMERIC(10, 8) NOT NULL,
    longitude NUMERIC(11, 8) NOT NULL,
    
    -- Station metadata
    monitoring_location_type VARCHAR(100),
    huc_code VARCHAR(12),
    drainage_area_square_miles NUMERIC(12, 4),
    
    -- Contact and attribution
    site_url VARCHAR(500),
    provider_name VARCHAR(255),
    
    -- Data management
    data_source VARCHAR(255) DEFAULT 'EPA WQP',
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

CREATE_INDEXES_SQL = [
    "CREATE INDEX IF NOT EXISTS idx_wqs_lat_lon ON water_quality_stations(latitude, longitude);",
    "CREATE INDEX IF NOT EXISTS idx_wqs_organization ON water_quality_stations(organization_identifier);",
    "CREATE INDEX IF NOT EXISTS idx_wqs_huc ON water_quality_stations(huc_code);",
    "CREATE INDEX IF NOT EXISTS idx_wqs_provider ON water_quality_stations(provider_name);",
    "CREATE INDEX IF NOT EXISTS idx_wqs_updated ON water_quality_stations(updated_at DESC);",
]

try:
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )
    
    cur = conn.cursor()
    
    # Create the table
    logger.info("Creating water_quality_stations table on RDS...")
    cur.execute(CREATE_TABLE_SQL)
    
    # Create indexes
    logger.info("Creating indexes...")
    for index_sql in CREATE_INDEXES_SQL:
        cur.execute(index_sql)
    
    conn.commit()
    logger.info("SUCCESS! water_quality_stations table created on RDS with indexes")
    
    # Verify table was created
    cur.execute("""
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'water_quality_stations'
        ORDER BY ordinal_position
    """)
    
    print("\nwater_quality_stations table columns:")
    print("=" * 60)
    for col_name, col_type in cur.fetchall():
        print(f"  {col_name:<40} {col_type}")
    
    cur.close()
    conn.close()
    
except Exception as e:
    logger.error(f"Error: {e}")
    import traceback
    traceback.print_exc()
