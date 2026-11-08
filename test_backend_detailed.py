import urllib.request
import json
import ssl
import time

ssl._create_default_https_context = ssl._create_unverified_context

backend_url = "https://tdot-api-manual.eba-muthcmmp.us-east-2.elasticbeanstalk.com/api/health"

print(f"Testing backend API: {backend_url}\n")

for attempt in range(3):
    try:
        resp = urllib.request.urlopen(backend_url, timeout=5)
        data = json.loads(resp.read())
        print(f"✓ Backend is responding!")
        print(f"Response: {json.dumps(data, indent=2)}")
        break
    except Exception as e:
        print(f"Attempt {attempt + 1}: {type(e).__name__}: {e}")
        if attempt < 2:
            time.sleep(2)
