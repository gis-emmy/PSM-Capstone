# Scheduled Jobs

This directory contains maintenance scripts designed to run on a schedule (via cron, Windows Task Scheduler, or similar automation tools).

## eBird Daily Update (`update_ebird_daily.py`)

### Purpose
Maintains a fresh 30-day rolling window of eBird observation data from Tennessee. Fetches the latest observations from the eBird API and replaces existing data to ensure the application displays current bird activity.

### How It Works
1. Connects to RDS PostgreSQL database using SSL
2. Truncates existing eBird data (ebird_locations and ebird_observations_new)
3. Fetches observations from the past 30 days via eBird API
4. Loads observations into the database with location aggregation
5. Updates location statistics (observation counts, unique species, date ranges)
6. Logs all activity to `ebird_update.log`

### Dependencies
- Python 3.8+
- psycopg2 (PostgreSQL adapter)
- requests (HTTP library)
- python-dotenv (environment variable loader)

All dependencies are in the project's `requirements.txt` and installed in `.venv`

### Configuration
The script uses environment variables from `data_sources/.env`:
- `EBIRD_API_KEY` - API key for eBird API access
- `DB_HOST` - RDS database hostname
- `DB_PORT` - Database port (5432)
- `DB_NAME` - Database name (tdot_env)
- `DB_USER` - Database user (postgres)
- `DB_PASSWORD` - Database password

### Running the Script

#### Using venv (Recommended)
```powershell
cd "c:\Users\austi\Documents\Graduate Capstone"
& ".\.venv\Scripts\Activate.ps1"
python scheduled-jobs/update_ebird_daily.py
```

#### Scheduling on Windows Task Scheduler
1. Open Task Scheduler
2. Create Basic Task
3. Set trigger to desired schedule (e.g., daily at 3 AM)
4. Set action to:
   - Program: `C:\Users\austi\Documents\Graduate Capstone\.venv\Scripts\python.exe`
   - Arguments: `scheduled-jobs/update_ebird_daily.py`
   - Start in: `C:\Users\austi\Documents\Graduate Capstone`

#### Scheduling on Linux/macOS (Cron)
Add to crontab:
```bash
0 3 * * * cd /path/to/Graduate\ Capstone && ./.venv/bin/python scheduled-jobs/update_ebird_daily.py
```

This runs daily at 3 AM.

### Output
- **Console Output**: Real-time progress messages
- **Log File**: `ebird_update.log` in the project root
  - Includes timestamps, log levels (INFO/ERROR), and detailed messages
  - Useful for troubleshooting and monitoring

### Success Indicators
- Final summary shows locations and observations counts
- All operations complete without exceptions
- Exit code 0 (success) or 1 (failure)

### Troubleshooting

**UnicodeEncodeError on Windows Console**
- These are display encoding issues only, not actual errors
- The script functions correctly despite the warnings
- Logging to file works without issues

**Database Connection Failed**
- Verify `.env` file exists and has correct RDS credentials
- Check RDS database is accessible from your network
- Confirm SSL mode is enabled for RDS

**API Errors**
- Verify EBIRD_API_KEY is set and valid
- Check internet connectivity
- Review eBird API status

### Performance
- Typical run time: 15-30 seconds
- API fetch: ~2-5 seconds
- Database operations: ~20 seconds (depending on observation volume)
- Last successful run: 237 observations, 124 locations (Nov 22, 2026)
