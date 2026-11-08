#!/usr/bin/env python3
"""
Create citizen_science_observations table on RDS
Required before running iNaturalist ETL
"""

import os
import psycopg2
from dotenv import load_dotenv

# Configuration
env_path = os.path.join(os.path.dirname(__file__), '../../.env')
load_dotenv(dotenv_path=env_path)

DB_HOST = os.getenv('DB_HOST')
DB_PORT = os.getenv('DB_PORT', '5432')
DB_NAME = os.getenv('DB_NAME', 'tdot_env')
DB_USER = os.getenv('DB_USER', 'postgres')
DB_PASSWORD = os.getenv('RDS_PASSWORD')

# Verify credentials loaded
if not DB_PASSWORD or not DB_HOST:
    raise ValueError("Database credentials not found in .env file. Check DB_HOST and RDS_PASSWORD.")

print("=" * 90)
print("Creating citizen_science_observations Table on RDS")
print("=" * 90)

try:
    # Connect to database
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )
    cursor = conn.cursor()
    
    print("\n✓ Connected to RDS")
    
    # Check if table exists
    cursor.execute("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'citizen_science_observations'
        )
    """)
    table_exists = cursor.fetchone()[0]
    
    if table_exists:
        print("✓ Table already exists, dropping and recreating...")
        cursor.execute("DROP TABLE IF EXISTS citizen_science_observations CASCADE;")
        conn.commit()
    
    # Create table with PostGIS geometry support
    print("\nCreating table schema...")
    
    create_table_sql = """
    CREATE TABLE citizen_science_observations (
        id SERIAL PRIMARY KEY,
        species_observed VARCHAR(500) NOT NULL,
        observation_type VARCHAR(100),
        location GEOMETRY(Point, 4326) NOT NULL,
        observation_date DATE NOT NULL,
        photo_url TEXT,
        observation_description TEXT,
        status VARCHAR(50) DEFAULT 'verified',
        verified BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        -- Unique constraint to prevent duplicates
        UNIQUE (species_observed, observation_date, location)
    );
    """
    
    cursor.execute(create_table_sql)
    conn.commit()
    
    print("✓ Table created successfully")
    
    # Create indexes for common queries
    print("Creating indexes...")
    
    indexes = [
        ("citizen_science_observations_location_idx", 
         "CREATE INDEX citizen_science_observations_location_idx ON citizen_science_observations USING GIST(location);"),
        
        ("citizen_science_observations_species_idx",
         "CREATE INDEX citizen_science_observations_species_idx ON citizen_science_observations (species_observed);"),
        
        ("citizen_science_observations_date_idx",
         "CREATE INDEX citizen_science_observations_date_idx ON citizen_science_observations (observation_date DESC);"),
        
        ("citizen_science_observations_created_idx",
         "CREATE INDEX citizen_science_observations_created_idx ON citizen_science_observations (created_at DESC);"),
    ]
    
    for idx_name, idx_sql in indexes:
        try:
            cursor.execute(idx_sql)
            conn.commit()
            print(f"  ✓ {idx_name}")
        except Exception as e:
            print(f"  ⚠ {idx_name}: {e}")
            conn.rollback()
    
    # Verify table
    cursor.execute("""
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'citizen_science_observations'
        ORDER BY ordinal_position;
    """)
    
    print("\nTable schema:")
    for col_name, data_type in cursor.fetchall():
        print(f"  - {col_name}: {data_type}")
    
    cursor.close()
    conn.close()
    
    print("\n" + "=" * 90)
    print("✓ Table creation complete!")
    print("=" * 90)
    print("\nNext steps:")
    print("1. Run: python data_sources/inaturalist_biodiversity/etl_inaturalist_biodiversity_updated.py")
    print("2. This will fetch and load 30 days of iNaturalist observations")
    print("3. Expected to load: 5,000-10,000 biodiversity observations")
    print("=" * 90)
    
except Exception as e:
    print(f"\n✗ Error: {e}")
    import traceback
    traceback.print_exc()
