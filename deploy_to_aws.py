#!/usr/bin/env python
"""
Direct AWS S3 and EB deployment using boto3-like approach with requests
"""
import os
import sys
import json
import hashlib
import hmac
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
import requests
from urllib.parse import urlencode
import base64

load_dotenv()

AWS_ACCESS_KEY = os.getenv('AWS_ACCESS_KEY_ID')
AWS_SECRET_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')
AWS_REGION = os.getenv('AWS_DEFAULT_REGION', 'us-east-1')
S3_BUCKET = os.getenv('S3_FRONTEND_BUCKET')
EB_ENV = os.getenv('EB_BACKEND_ENV')

def sign_aws_request(method, service, host, path, payload='', query_params=''):
    """Create AWS Signature Version 4"""
    amzdate = datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')
    datestamp = datetime.utcnow().strftime('%Y%m%d')
    
    canonical_uri = path
    canonical_querystring = query_params
    payload_hash = hashlib.sha256(payload.encode()).hexdigest()
    
    canonical_headers = f'host:{host}\nx-amz-date:{amzdate}\n'
    signed_headers = 'host;x-amz-date'
    
    canonical_request = f'{method}\n{canonical_uri}\n{canonical_querystring}\n{canonical_headers}\n{signed_headers}\n{payload_hash}'
    
    credential_scope = f'{datestamp}/{AWS_REGION}/{service}/aws4_request'
    canonical_request_hash = hashlib.sha256(canonical_request.encode()).hexdigest()
    string_to_sign = f'AWS4-HMAC-SHA256\n{amzdate}\n{credential_scope}\n{canonical_request_hash}'
    
    kdate = hmac.new(f'AWS4{AWS_SECRET_KEY}'.encode(), datestamp.encode(), hashlib.sha256).digest()
    kregion = hmac.new(kdate, AWS_REGION.encode(), hashlib.sha256).digest()
    kservice = hmac.new(kregion, service.encode(), hashlib.sha256).digest()
    ksigning = hmac.new(kservice, b'aws4_request', hashlib.sha256).digest()
    
    signature = hmac.new(ksigning, string_to_sign.encode(), hashlib.sha256).hexdigest()
    
    authorization_header = f'AWS4-HMAC-SHA256 Credential={AWS_ACCESS_KEY}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}'
    
    return {
        'Authorization': authorization_header,
        'x-amz-date': amzdate,
        'x-amz-content-sha256': payload_hash
    }

def upload_to_s3(file_path, s3_key, bucket):
    """Upload file to S3"""
    print(f"\n📤 Uploading {file_path} to S3...")
    
    if not Path(file_path).exists():
        print(f"❌ File not found: {file_path}")
        return False
    
    try:
        with open(file_path, 'rb') as f:
            file_data = f.read()
        
        host = f'{bucket}.s3.{AWS_REGION}.amazonaws.com'
        path = f'/{s3_key}'
        
        # Create AWS signature
        payload_hash = hashlib.sha256(file_data).hexdigest()
        amzdate = datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')
        datestamp = datetime.utcnow().strftime('%Y%m%d')
        
        canonical_uri = path
        canonical_headers = f'host:{host}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amzdate}\n'
        signed_headers = 'host;x-amz-content-sha256;x-amz-date'
        
        canonical_request = f'PUT\n{canonical_uri}\n\n{canonical_headers}\n{signed_headers}\n{payload_hash}'
        
        credential_scope = f'{datestamp}/{AWS_REGION}/s3/aws4_request'
        canonical_request_hash = hashlib.sha256(canonical_request.encode()).hexdigest()
        string_to_sign = f'AWS4-HMAC-SHA256\n{amzdate}\n{credential_scope}\n{canonical_request_hash}'
        
        kdate = hmac.new(f'AWS4{AWS_SECRET_KEY}'.encode(), datestamp.encode(), hashlib.sha256).digest()
        kregion = hmac.new(kdate, AWS_REGION.encode(), hashlib.sha256).digest()
        kservice = hmac.new(kregion, b's3', hashlib.sha256).digest()
        ksigning = hmac.new(kservice, b'aws4_request', hashlib.sha256).digest()
        
        signature = hmac.new(ksigning, string_to_sign.encode(), hashlib.sha256).hexdigest()
        
        auth_header = f'AWS4-HMAC-SHA256 Credential={AWS_ACCESS_KEY}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}'
        
        url = f'https://{host}{path}'
        headers = {
            'Authorization': auth_header,
            'x-amz-date': amzdate,
            'x-amz-content-sha256': payload_hash
        }
        
        response = requests.put(url, data=file_data, headers=headers, timeout=120)
        
        if response.status_code in [200, 201]:
            size_mb = len(file_data) / (1024 * 1024)
            print(f"✓ Uploaded {file_path} ({size_mb:.2f} MB)")
            return True
        else:
            print(f"❌ Upload failed: {response.status_code} - {response.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ Upload error: {e}")
        return False

def main():
    print("=" * 60)
    print("TDOT Capstone AWS Deployment")
    print("=" * 60)
    
    if not all([AWS_ACCESS_KEY, AWS_SECRET_KEY, AWS_REGION, S3_BUCKET, EB_ENV]):
        print("❌ Missing configuration")
        return 1
    
    print(f"\n✓ AWS Configuration:")
    print(f"  Region: {AWS_REGION}")
    print(f"  S3 Bucket: {S3_BUCKET}")
    print(f"  EB Environment: {EB_ENV}")
    
    # Upload frontend to S3
    print("\n" + "=" * 60)
    print("FRONTEND DEPLOYMENT")
    print("=" * 60)
    
    frontend_zip = Path("frontend-deployment.zip")
    if frontend_zip.exists():
        success = upload_to_s3(str(frontend_zip), 'frontend-deployment.zip', S3_BUCKET)
        if not success:
            print("⚠️ Frontend upload failed, continuing...")
    else:
        print("⚠️ frontend-deployment.zip not found")
    
    # Upload backend to S3 for EB deployment
    print("\n" + "=" * 60)
    print("BACKEND DEPLOYMENT")
    print("=" * 60)
    
    backend_zip = Path("backend-deployment.zip")
    if backend_zip.exists():
        # Upload to deployment bucket
        deploy_bucket = f"{S3_BUCKET}-deployments"
        success = upload_to_s3(str(backend_zip), 'backend-deployment.zip', deploy_bucket)
        if success:
            print(f"✓ Backend uploaded to {deploy_bucket}")
            print(f"  Next: Deploy via EB Console or 'eb deploy {EB_ENV}'")
    else:
        print("⚠️ backend-deployment.zip not found")
    
    print("\n" + "=" * 60)
    print("✓ Deployment files uploaded!")
    print("=" * 60)
    return 0

if __name__ == '__main__':
    sys.exit(main())
