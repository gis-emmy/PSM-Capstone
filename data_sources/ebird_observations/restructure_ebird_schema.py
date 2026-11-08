import psycopg2

try:
    conn = psycopg2.connect(
        host='tdot-env-db.crcyswsm6fi8.us-east-2.rds.amazonaws.com',
        port=5432,
        database='tdot_env',
        user='postgres',
        password='tdotdeveloperpassword',
        sslmode='require'
    )
    cursor = conn.cursor()
    
    print("="*70)
    print("Creating eBird location-based schema")
    print("="*70)
    
    # 1. Create ebird_locations table (unique locations)
    create_locations_sql = """
    CREATE TABLE IF NOT EXISTS ebird_locations (
        location_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        location_name VARCHAR(255) NOT NULL,
        latitude NUMERIC NOT NULL,
        longitude NUMERIC NOT NULL,
        observation_count INT DEFAULT 0,
        unique_species_count INT DEFAULT 0,
        first_observation_date TIMESTAMP,
        last_observation_date TIMESTAMP,
        data_source VARCHAR(255) DEFAULT 'eBird',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        UNIQUE(latitude, longitude)
    )
    """
    
    cursor.execute(create_locations_sql)
    conn.commit()
    print("✓ Table 'ebird_locations' created")
    
    # Create indexes for locations
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ebird_loc_name ON ebird_locations(location_name);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ebird_loc_coords ON ebird_locations(latitude, longitude);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ebird_loc_updated ON ebird_locations(updated_at DESC);")
    conn.commit()
    print("✓ Indexes created for ebird_locations")
    
    # 2. Create new ebird_observations table with foreign key to locations
    create_observations_sql = """
    CREATE TABLE IF NOT EXISTS ebird_observations_new (
        observation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        location_id UUID NOT NULL REFERENCES ebird_locations(location_id) ON DELETE CASCADE,
        ebird_id VARCHAR(255) UNIQUE,
        species_code VARCHAR(50) NOT NULL,
        common_name VARCHAR(255),
        scientific_name VARCHAR(255),
        observation_date TIMESTAMP NOT NULL,
        observation_count INT DEFAULT 1,
        is_protected BOOLEAN DEFAULT false,
        data_quality_flag VARCHAR(50),
        is_validated BOOLEAN DEFAULT false,
        data_source VARCHAR(255) DEFAULT 'eBird',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """
    
    cursor.execute(create_observations_sql)
    conn.commit()
    print("✓ Table 'ebird_observations_new' created")
    
    # Create indexes for observations
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ebird_obs_location ON ebird_observations_new(location_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ebird_obs_species ON ebird_observations_new(species_code);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ebird_obs_date ON ebird_observations_new(observation_date);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ebird_obs_ebird_id ON ebird_observations_new(ebird_id);")
    conn.commit()
    print("✓ Indexes created for ebird_observations_new")
    
    # 3. Migrate data from old ebird_observations to new structure
    print("\nMigrating data...")
    
    # Insert unique locations
    cursor.execute("""
        INSERT INTO ebird_locations (location_name, latitude, longitude)
        SELECT DISTINCT location_name, latitude, longitude
        FROM ebird_observations
        ON CONFLICT (latitude, longitude) DO NOTHING
    """)
    conn.commit()
    
    cursor.execute("SELECT COUNT(*) FROM ebird_locations")
    location_count = cursor.fetchone()[0]
    print(f"✓ Inserted {location_count} unique locations")
    
    # Insert observations with location_id
    cursor.execute("""
        INSERT INTO ebird_observations_new (
            location_id, ebird_id, species_code, common_name, scientific_name,
            observation_date, observation_count, is_protected, data_quality_flag,
            is_validated, data_source
        )
        SELECT 
            l.location_id, o.ebird_id, o.species_code, o.common_name, o.scientific_name,
            o.observation_date, o.observation_count, o.is_protected, o.data_quality_flag,
            o.is_validated, o.data_source
        FROM ebird_observations o
        JOIN ebird_locations l ON o.latitude = l.latitude AND o.longitude = l.longitude
        ON CONFLICT (ebird_id) DO NOTHING
    """)
    conn.commit()
    
    cursor.execute("SELECT COUNT(*) FROM ebird_observations_new")
    obs_count = cursor.fetchone()[0]
    print(f"✓ Inserted {obs_count} observations")
    
    # 4. Update location statistics
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
    conn.commit()
    print("✓ Updated location statistics")
    
    # Verify
    cursor.execute("""
        SELECT l.location_name, l.observation_count, l.unique_species_count, 
               l.first_observation_date, l.last_observation_date
        FROM ebird_locations l
        ORDER BY l.observation_count DESC
        LIMIT 5
    """)
    
    print("\nTop 5 Locations (Updated Schema):")
    print("-"*70)
    for loc_name, obs_count, species_count, first_date, last_date in cursor.fetchall():
        print(f"  {loc_name[:40]:<40} | Obs: {obs_count:>3} | Species: {species_count:>3}")
        print(f"    Date Range: {first_date} to {last_date}")
    
    print("\n" + "="*70)
    print("✓ eBird schema restructuring complete!")
    print("="*70)
    
    cursor.close()
    conn.close()
    
except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()
