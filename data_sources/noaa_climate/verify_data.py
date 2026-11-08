#!/usr/bin/env python3
"""
Verify climate_monthly_normals data loaded correctly
"""

import os
import psycopg2
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), '../.env')
load_dotenv(dotenv_path=env_path)

DB_HOST = os.getenv('DB_HOST')
DB_PORT = os.getenv('DB_PORT', '5432')
DB_NAME = os.getenv('DB_NAME')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')

try:
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )
    cursor = conn.cursor()
    
    print("=" * 80)
    print("CLIMATE_MONTHLY_NORMALS DATA VERIFICATION")
    print("=" * 80 + "\n")
    
    # Total records
    cursor.execute("SELECT COUNT(*) FROM climate_monthly_normals")
    total = cursor.fetchone()[0]
    print(f"Total records in database: {total}\n")
    
    # Unique stations
    cursor.execute("SELECT COUNT(DISTINCT station_id) FROM climate_monthly_normals")
    stations = cursor.fetchone()[0]
    print(f"Unique stations: {stations}\n")
    
    # Sample data from Nashville
    print("Sample data (Nashville International Airport):")
    print("-" * 80)
    cursor.execute("""
        SELECT month, avg_temp_f, max_temp_f, min_temp_f, avg_precip_in
        FROM climate_monthly_normals
        WHERE station_name LIKE '%Nashville%'
        ORDER BY month
    """)
    
    results = cursor.fetchall()
    if results:
        print(f"{'Month':<8} {'Avg Temp':<12} {'Max Temp':<12} {'Min Temp':<12} {'Precip':<10}")
        print("-" * 80)
        months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        for month, avg, max_t, min_t, precip in results:
            precip_str = f"{precip:.1f}\"" if precip else "N/A"
            print(f"{months[month-1]:<8} {avg:.1f}°F{'':<5} {max_t:.1f}°F{'':<5} {min_t:.1f}°F{'':<5} {precip_str:<10}")
    
    # Geographic coverage
    print("\n\nGeographic coverage (sample stations):")
    print("-" * 80)
    cursor.execute("""
        SELECT DISTINCT station_name, latitude, longitude, elevation_m
        FROM climate_monthly_normals
        ORDER BY station_name
        LIMIT 10
    """)
    
    print(f"{'Station':<45} {'Latitude':<12} {'Longitude':<12} {'Elev (m)':<10}")
    print("-" * 80)
    for station, lat, lon, elev in cursor.fetchall():
        print(f"{station:<45} {lat:<12.4f} {lon:<12.4f} {elev:<10.1f}")
    
    cursor.close()
    conn.close()
    
    print("\n" + "=" * 80)
    print("✓ DATA VERIFICATION COMPLETE")
    print("=" * 80)

except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()
