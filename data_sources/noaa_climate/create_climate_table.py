#!/usr/bin/env python3
"""
Create climate_monthly_normals table in RDS database
"""

import os
import psycopg2
from psycopg2 import sql
from dotenv import load_dotenv

# Load env
env_path = os.path.join(os.path.dirname(__file__), '../.env')
load_dotenv(dotenv_path=env_path)

DB_HOST = os.getenv('DB_HOST')
DB_PORT = os.getenv('DB_PORT', '5432')
DB_NAME = os.getenv('DB_NAME')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')

print("=" * 80)
print("CREATE CLIMATE_MONTHLY_NORMALS TABLE")
print("=" * 80)

try:
    print("\nConnecting to database...")
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )
    cursor = conn.cursor()
    print("✓ Connected to database\n")
    
    # Create table
    print("Creating climate_monthly_normals table...")
    create_table_sql = """
    CREATE TABLE IF NOT EXISTS climate_monthly_normals (
        id SERIAL PRIMARY KEY,
        station_id VARCHAR(50) NOT NULL,
        station_name VARCHAR(255),
        latitude DECIMAL(10, 6),
        longitude DECIMAL(10, 6),
        elevation_m DECIMAL(10, 2),
        month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
        avg_temp_f DECIMAL(5, 1),
        max_temp_f DECIMAL(5, 1),
        min_temp_f DECIMAL(5, 1),
        avg_precip_in DECIMAL(5, 2),
        avg_snowfall_in DECIMAL(5, 2),
        data_source VARCHAR(50) DEFAULT 'NOAA_NCEI',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(station_id, month)
    );
    """
    
    cursor.execute(create_table_sql)
    conn.commit()
    print("✓ Table created\n")
    
    # Create indexes
    print("Creating indexes...")
    
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_climate_station_id ON climate_monthly_normals(station_id);")
    conn.commit()
    print("  ✓ Index on station_id")
    
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_climate_location ON climate_monthly_normals(latitude, longitude);")
    conn.commit()
    print("  ✓ Index on location (lat/lon)\n")
    
    # Verify table exists
    cursor.execute("""
        SELECT table_name FROM information_schema.tables 
        WHERE table_name = 'climate_monthly_normals'
    """)
    result = cursor.fetchone()
    
    if result:
        print("✓ Verification: Table climate_monthly_normals exists in database\n")
        
        # Show table structure
        cursor.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'climate_monthly_normals'
            ORDER BY ordinal_position
        """)
        
        print("Table structure:")
        print("-" * 80)
        for col in cursor.fetchall():
            nullable = "NULL" if col[2] == 'YES' else "NOT NULL"
            print(f"  {col[0]:25} {col[1]:20} {nullable}")
        print()
    
    cursor.close()
    conn.close()
    print("=" * 80)
    print("✓ TABLE CREATION COMPLETE")
    print("=" * 80)

except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()
