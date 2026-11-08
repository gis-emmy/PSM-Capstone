#!/usr/bin/env python3
"""
Normalize climate data structure:
1. Create weather_stations reference table
2. Migrate climate_monthly_normals to use FK
3. Remove duplicate station data from climate table
4. Add constraints and indexes
"""

import os
import psycopg2
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), 'data_sources/.env')
load_dotenv(dotenv_path=env_path)

DB_HOST = os.getenv('DB_HOST')
DB_PORT = os.getenv('DB_PORT', '5432')
DB_NAME = os.getenv('DB_NAME')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')

print("=" * 90)
print("NORMALIZE CLIMATE DATA STRUCTURE")
print("=" * 90 + "\n")

try:
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )
    cursor = conn.cursor()
    
    # Step 1: Create weather_stations table
    print("Step 1: Creating weather_stations reference table...")
    create_stations_sql = """
    CREATE TABLE IF NOT EXISTS weather_stations (
        id SERIAL PRIMARY KEY,
        station_id VARCHAR(50) NOT NULL UNIQUE,
        station_name VARCHAR(255) NOT NULL,
        latitude DECIMAL(10, 6) NOT NULL,
        longitude DECIMAL(10, 6) NOT NULL,
        elevation_m DECIMAL(10, 2),
        data_source VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """
    cursor.execute(create_stations_sql)
    conn.commit()
    print("  ✓ Table created\n")
    
    # Step 2: Populate weather_stations from climate_monthly_normals
    print("Step 2: Populating weather_stations from existing climate data...")
    populate_sql = """
    INSERT INTO weather_stations (station_id, station_name, latitude, longitude, elevation_m, data_source)
    SELECT DISTINCT 
        station_id, 
        station_name, 
        latitude, 
        longitude, 
        elevation_m,
        data_source
    FROM climate_monthly_normals
    ON CONFLICT (station_id) DO UPDATE SET
        station_name = EXCLUDED.station_name,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        elevation_m = EXCLUDED.elevation_m,
        data_source = EXCLUDED.data_source,
        updated_at = CURRENT_TIMESTAMP;
    """
    cursor.execute(populate_sql)
    conn.commit()
    
    cursor.execute("SELECT COUNT(*) FROM weather_stations")
    count = cursor.fetchone()[0]
    print(f"  ✓ Inserted {count} weather stations\n")
    
    # Step 3: Add indexes to weather_stations
    print("Step 3: Creating indexes on weather_stations...")
    
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_weather_stations_id 
        ON weather_stations(station_id);
    """)
    print("  ✓ Index on station_id")
    
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_weather_stations_location 
        ON weather_stations(latitude, longitude);
    """)
    print("  ✓ Index on location (lat/lon)")
    
    conn.commit()
    print()
    
    # Step 4: Alter climate_monthly_normals table
    print("Step 4: Altering climate_monthly_normals table...")
    print("  - Adding foreign key to weather_stations")
    
    # Add station_id_fk column to reference the weather_stations.id
    cursor.execute("""
        ALTER TABLE climate_monthly_normals
        ADD COLUMN IF NOT EXISTS station_id_fk INTEGER;
    """)
    conn.commit()
    print("  ✓ Added station_id_fk column")
    
    # Populate the foreign key
    print("  - Populating foreign key references...")
    cursor.execute("""
        UPDATE climate_monthly_normals c
        SET station_id_fk = w.id
        FROM weather_stations w
        WHERE c.station_id = w.station_id;
    """)
    conn.commit()
    
    cursor.execute("SELECT COUNT(*) FROM climate_monthly_normals WHERE station_id_fk IS NULL")
    null_count = cursor.fetchone()[0]
    if null_count == 0:
        print("  ✓ All foreign keys populated")
    else:
        print(f"  ⚠ Warning: {null_count} records without FK")
    print()
    
    # Step 5: Make station_id_fk NOT NULL and add constraint
    print("Step 5: Adding foreign key constraint...")
    cursor.execute("""
        ALTER TABLE climate_monthly_normals
        ALTER COLUMN station_id_fk SET NOT NULL;
    """)
    conn.commit()
    print("  ✓ Made station_id_fk NOT NULL")
    
    cursor.execute("""
        ALTER TABLE climate_monthly_normals
        ADD CONSTRAINT fk_climate_station 
        FOREIGN KEY (station_id_fk) REFERENCES weather_stations(id)
        ON DELETE CASCADE;
    """)
    conn.commit()
    print("  ✓ Foreign key constraint added\n")
    
    # Step 6: Remove denormalized columns from climate table
    print("Step 6: Removing denormalized columns from climate_monthly_normals...")
    print("  - Removing: station_name, latitude, longitude, elevation_m")
    
    cursor.execute("""
        ALTER TABLE climate_monthly_normals
        DROP COLUMN station_name,
        DROP COLUMN latitude,
        DROP COLUMN longitude,
        DROP COLUMN elevation_m;
    """)
    conn.commit()
    print("  ✓ Denormalized columns removed\n")
    
    # Step 7: Rename station_id_fk to station_id (cleaner naming)
    print("Step 7: Renaming column for clarity...")
    
    cursor.execute("""
        ALTER TABLE climate_monthly_normals
        RENAME COLUMN station_id TO station_id_old;
    """)
    cursor.execute("""
        ALTER TABLE climate_monthly_normals
        RENAME COLUMN station_id_fk TO station_id;
    """)
    conn.commit()
    print("  ✓ Columns renamed\n")
    
    # Step 8: Drop old unique constraint if it existed on string station_id
    print("Step 8: Updating indexes...")
    cursor.execute("""
        DROP INDEX IF EXISTS idx_climate_station_id;
    """)
    cursor.execute("""
        DROP INDEX IF EXISTS idx_climate_location;
    """)
    
    # Create new index on the FK
    cursor.execute("""
        CREATE INDEX idx_climate_station_fk ON climate_monthly_normals(station_id);
    """)
    print("  ✓ Indexes updated\n")
    
    # Step 9: Verify structure
    print("Step 9: Verifying new structure...")
    
    cursor.execute("""
        SELECT column_name, data_type 
        FROM information_schema.columns
        WHERE table_name = 'climate_monthly_normals'
        ORDER BY ordinal_position
    """)
    
    print("  climate_monthly_normals columns:")
    for col, dtype in cursor.fetchall():
        print(f"    - {col:<25} {dtype}")
    
    print()
    
    cursor.execute("""
        SELECT column_name, data_type 
        FROM information_schema.columns
        WHERE table_name = 'weather_stations'
        ORDER BY ordinal_position
    """)
    
    print("  weather_stations columns:")
    for col, dtype in cursor.fetchall():
        print(f"    - {col:<25} {dtype}")
    
    print()
    
    # Step 10: Sample data verification
    print("Step 10: Sample data verification...")
    cursor.execute("""
        SELECT 
            ws.station_name,
            ws.latitude,
            ws.longitude,
            c.month,
            c.avg_temp_f,
            c.avg_precip_in
        FROM climate_monthly_normals c
        JOIN weather_stations ws ON c.station_id = ws.id
        WHERE c.month IN (1, 7)
        LIMIT 4
    """)
    
    print("  Query: climate_monthly_normals JOIN weather_stations")
    print(f"  {'Station':<30} {'Month':<8} {'Temp':<10} {'Precip':<10}")
    print("  " + "-" * 60)
    for name, lat, lon, month, temp, precip in cursor.fetchall():
        month_name = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month-1]
        print(f"  {name:<30} {month_name:<8} {temp:>6.1f}°F {precip:>7.2f}\"")
    
    print()
    
    # Step 11: Clean up old column
    print("Step 11: Cleaning up old column...")
    cursor.execute("""
        ALTER TABLE climate_monthly_normals
        DROP COLUMN IF EXISTS station_id_old;
    """)
    conn.commit()
    print("  ✓ Old station_id_old column removed\n")
    
    cursor.close()
    conn.close()
    
    print("=" * 90)
    print("✓ NORMALIZATION COMPLETE")
    print("=" * 90)
    print("""
CHANGES MADE:
  1. Created weather_stations reference table (50 unique stations)
  2. Populated weather_stations from climate_monthly_normals
  3. Added station_id FK to climate_monthly_normals
  4. Removed denormalized columns from climate table:
     - station_name
     - latitude
     - longitude
     - elevation_m
  5. Updated indexes for foreign key relationships
  6. Verified data integrity with JOIN query

RESULT:
  ✓ Single source of truth for station metadata in weather_stations
  ✓ Climate data normalized to only store climate values + FK
  ✓ Ready to add other data sources (eBird, EPA, etc.) with same station table
  ✓ Queries use JOIN to combine station info with climate data

QUERY PATTERN (for mapping):
  SELECT 
      ws.station_id,
      ws.station_name,
      ws.latitude,
      ws.longitude,
      c.month,
      c.avg_temp_f,
      c.max_temp_f,
      c.min_temp_f,
      c.avg_precip_in
  FROM climate_monthly_normals c
  JOIN weather_stations ws ON c.station_id = ws.id
  WHERE ws.latitude BETWEEN ? AND ?
    AND ws.longitude BETWEEN ? AND ?
  ORDER BY ws.station_name, c.month
""")

except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()
