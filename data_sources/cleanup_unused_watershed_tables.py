#!/usr/bin/env python3
"""
Cleanup Unused Tables from RDS

This script removes unused tables from the RDS database:
  - flowlines (0 records) - Not using USGS NHD geometry
  - catchments (0 records) - Not using catchment boundaries
  - watersheds (8 records) - Using TDEC REST API for HUC12 instead
  - environmental_data (120 records) - Generic/unused data

We're using TDEC's HUC12 REST service for watershed geometry instead of
storing polygons in the database.

Usage:
    python cleanup_unused_watershed_tables.py

Database:
    Target: tdot-env-db.crcyswsm6fi8.us-east-2.rds.amazonaws.com
    
Dropped Tables:
    - flowlines (0 records)
    - catchments (0 records)
    - watersheds (8 records) - Replaced by TDEC REST API
    - environmental_data (120 records) - Generic/unused
    
Status: Safe to run
"""

import os
import psycopg2
from psycopg2 import sql
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables
load_dotenv(Path(__file__).parent / '.env')

# Database configuration
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'tdot-env-db.crcyswsm6fi8.us-east-2.rds.amazonaws.com'),
    'port': int(os.getenv('DB_PORT', 5432)),
    'database': os.getenv('DB_NAME', 'tdot_environment_db'),
    'user': os.getenv('DB_USER', 'postgres'),
    'password': os.getenv('DB_PASSWORD', ''),
}

def cleanup_tables():
    """Remove unused watershed tables from RDS."""
    
    try:
        # Connect to database
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        print("=" * 100)
        print("CLEANUP UNUSED WATERSHED TABLES - RDS DATABASE")
        print("=" * 100)
        print()
        
        # Tables to remove
        tables_to_drop = ['flowlines', 'catchments', 'watersheds', 'environmental_data']
        
        # Check table status before dropping
        print("Checking table status before cleanup...")
        print("-" * 100)
        
        cursor.execute("""
            SELECT table_name, (SELECT COUNT(*) FROM information_schema.columns 
                                WHERE table_name = t.table_name) as column_count
            FROM information_schema.tables t
            WHERE table_schema = 'public' 
            AND table_name IN ('flowlines', 'catchments', 'watersheds', 'environmental_data')
            ORDER BY table_name
        """)
        
        existing_tables = cursor.fetchall()
        
        for table_name, col_count in existing_tables:
            cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            record_count = cursor.fetchone()[0]
            print(f"  {table_name:20} | {record_count:10,} records | {col_count} columns")
        
        print()
        print("Tables to be removed:")
        print("-" * 100)
        for table in tables_to_drop:
            print(f"  ✓ {table}")
        
        print()
        print("Tables to be kept:")
        print("-" * 100)
        print(f"  ✓ climate_monthly_normals (600 climate records)")
        print(f"  ✓ weather_stations (50 weather station references)")
        print(f"  ✓ ebird_locations (114 eBird hotspots)")
        print(f"  ✓ ebird_observations_new (243 cached observations)")
        print(f"  ✓ water_quality_stations (30,627 EPA monitoring stations)")
        print(f"  ✓ tdot_projects (empty, reserved for future use)")
        
        print()
        print("Removing unused tables...")
        print("-" * 100)
        
        # Drop tables
        for table in tables_to_drop:
            try:
                # Check if table exists first
                cursor.execute("""
                    SELECT EXISTS (
                        SELECT 1 FROM information_schema.tables 
                        WHERE table_schema = 'public' AND table_name = %s
                    )
                """, (table,))
                
                if cursor.fetchone()[0]:
                    cursor.execute(sql.SQL("DROP TABLE IF EXISTS {} CASCADE").format(
                        sql.Identifier(table)
                    ))
                    print(f"  ✓ Dropped: {table}")
                else:
                    print(f"  ⊘ Already missing: {table}")
            
            except Exception as e:
                print(f"  ✗ Error dropping {table}: {e}")
                raise
        
        conn.commit()
        
        print()
        print("=" * 100)
        print("VERIFICATION - Final Database Structure")
        print("=" * 100)
        print()
        
        # Verify final state
        cursor.execute("""
            SELECT table_name, (SELECT COUNT(*) FROM information_schema.columns 
                                WHERE table_name = t.table_name) as column_count
            FROM information_schema.tables t
            WHERE table_schema = 'public' 
            ORDER BY table_name
        """)
        
        print("Remaining watershed-related tables:")
        print("-" * 100)
        for table_name, col_count in cursor.fetchall():
            if 'water' in table_name.lower() or 'watershed' in table_name.lower() or 'climate' in table_name.lower():
                cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
                record_count = cursor.fetchone()[0]
                print(f"  {table_name:30} | {record_count:10,} records")
        
        print()
        print("=" * 100)
        print("CLEANUP COMPLETE")
        print("=" * 100)
        print()
        print("Summary:")
        print("  ✓ Removed: flowlines (empty table)")
        print("  ✓ Removed: catchments (empty table)")
        print("  ✓ Removed: watersheds (using TDEC REST API instead)")
        print("  ✓ Removed: environmental_data (unused)")
        print()
        print("New architecture:")
        print("  - Watershed geometry (HUC12 polygons): TDEC REST API")
        print("  - Climate data: RDS (weather_stations + climate_monthly_normals)")
        print("  - Water quality: RDS (water_quality_stations)")
        print("  - eBird data: RDS (ebird_locations + observations)")
        print()
        
        cursor.close()
        conn.close()
        
        return True
    
    except Exception as e:
        print(f"✗ Error: {e}")
        return False

if __name__ == "__main__":
    success = cleanup_tables()
    exit(0 if success else 1)
