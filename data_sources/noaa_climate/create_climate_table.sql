-- Create climate_monthly_normals table
-- Stores NOAA monthly climate normals for Tennessee weather stations
-- Updated annually in December

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

-- Create index for faster lookups by station
CREATE INDEX IF NOT EXISTS idx_climate_station_id ON climate_monthly_normals(station_id);

-- Create index for faster lookups by coordinates (for nearest station queries)
CREATE INDEX IF NOT EXISTS idx_climate_location ON climate_monthly_normals(latitude, longitude);
