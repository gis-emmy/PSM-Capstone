import urllib.request
import json
import ssl

# Ignore SSL warnings for self-signed certs
ssl._create_default_https_context = ssl._create_unverified_context

backend_url = "https://tdot-api-manual.eba-muthcmmp.us-east-2.elasticbeanstalk.com/api/health"

print(f"Testing backend API: {backend_url}\n")

try:
    resp = urllib.request.urlopen(backend_url, timeout=10)
    data = json.loads(resp.read())
    print(f"✓ Backend is responding!")
    print(f"Response: {json.dumps(data, indent=2)}")
except Exception as e:
    print(f"✗ Error: {e}")
