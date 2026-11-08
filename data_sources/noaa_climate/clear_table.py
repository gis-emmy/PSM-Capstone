#!/usr/bin/env python3
"""
Clear climate_monthly_normals table before fresh load
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
    
    cursor.execute("DELETE FROM climate_monthly_normals")
    conn.commit()
    
    cursor.execute("SELECT COUNT(*) FROM climate_monthly_normals")
    count = cursor.fetchone()[0]
    
    print(f"✓ Cleared climate_monthly_normals table (remaining records: {count})")
    
    cursor.close()
    conn.close()

except Exception as e:
    print(f"✗ Error: {e}")
