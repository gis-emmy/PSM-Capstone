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
    
    # Create eBird observations table
    create_table_sql = """
    CREATE TABLE IF NOT EXISTS ebird_observations (
        observation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ebird_id VARCHAR(255) UNIQUE,
        species_code VARCHAR(50) NOT NULL,
        common_name VARCHAR(255),
        scientific_name VARCHAR(255),
        latitude NUMERIC NOT NULL,
        longitude NUMERIC NOT NULL,
        location_name VARCHAR(255),
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
    
    create_indexes_sql = [
        "CREATE INDEX IF NOT EXISTS idx_ebird_species_code ON ebird_observations(species_code);",
        "CREATE INDEX IF NOT EXISTS idx_ebird_observation_date ON ebird_observations(observation_date);",
        "CREATE INDEX IF NOT EXISTS idx_ebird_location ON ebird_observations(latitude, longitude);",
        "CREATE INDEX IF NOT EXISTS idx_ebird_is_protected ON ebird_observations(is_protected);",
        "CREATE INDEX IF NOT EXISTS idx_ebird_created_at ON ebird_observations(created_at);"
    ]
    
    cursor.execute(create_table_sql)
    conn.commit()
    
    # Create indexes
    for index_sql in create_indexes_sql:
        cursor.execute(index_sql)
    conn.commit()
    
    print("✓ Table 'ebird_observations' created successfully")
    print("✓ Indexes created")
    
    # Verify the table
    cursor.execute("""
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'ebird_observations'
        ORDER BY ordinal_position
    """)
    
    print("\nTable schema:")
    print("="*70)
    for col_name, data_type, is_nullable, col_default in cursor.fetchall():
        nullable = "NULL" if is_nullable == 'YES' else "NOT NULL"
        default_str = f" DEFAULT {col_default}" if col_default else ""
        print(f"  {col_name:<25} {data_type:<25} {nullable:<10}{default_str}")
    
    cursor.close()
    conn.close()
    
except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()
