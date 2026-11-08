#!/usr/bin/env python
"""
Deploy built frontend to S3
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import boto3
from botocore.exceptions import ClientError
import mimetypes

load_dotenv(override=True)

AWS_ACCESS_KEY = os.getenv('AWS_ACCESS_KEY_ID')
AWS_SECRET_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')
AWS_REGION = os.getenv('AWS_DEFAULT_REGION')
S3_BUCKET = os.getenv('S3_FRONTEND_BUCKET')

s3 = boto3.client(
    's3',
    region_name=AWS_REGION,
    aws_access_key_id=AWS_ACCESS_KEY,
    aws_secret_access_key=AWS_SECRET_KEY
)

print(f"\n{'='*70}")
print(f"📤 DEPLOYING BUILT FRONTEND TO S3")
print(f"{'='*70}")

print(f"\nConfiguration:")
print(f"  S3 Bucket: {S3_BUCKET}")
print(f"  Region: {AWS_REGION}")

# Upload all files from dist folder
dist_dir = Path('frontend/dist')

if not dist_dir.exists():
    print(f"❌ dist folder not found at {dist_dir}")
    sys.exit(1)

print(f"\n📂 Uploading from {dist_dir}...")
uploaded = 0

# First, clear the old files from S3
print(f"\n🗑️  Clearing old files from S3...")
try:
    response = s3.list_objects_v2(Bucket=S3_BUCKET)
    if 'Contents' in response:
        for obj in response['Contents']:
            if obj['Key'] not in ['package.json', 'package-lock.json', 'vite.config.js']:
                s3.delete_object(Bucket=S3_BUCKET, Key=obj['Key'])
        print(f"  ✓ Cleared old files")
except Exception as e:
    print(f"  ⚠️  {e}")

# Upload new files
print(f"\n📤 Uploading new files...")

for root, dirs, files in os.walk(dist_dir):
    for file in files:
        file_path = Path(root) / file
        # S3 key: remove 'frontend/dist/' prefix and use forward slashes
        s3_key = str(file_path.relative_to(dist_dir)).replace('\\', '/')
        
        # Determine content type
        content_type, _ = mimetypes.guess_type(str(file_path))
        if content_type is None:
            content_type = 'application/octet-stream'
        
        try:
            with open(file_path, 'rb') as f:
                s3.put_object(
                    Bucket=S3_BUCKET,
                    Key=s3_key,
                    Body=f,
                    ContentType=content_type,
                    CacheControl='no-cache' if s3_key == 'index.html' else 'max-age=31536000'
                )
            print(f"  ✓ {s3_key}")
            uploaded += 1
        except ClientError as e:
            print(f"  ✗ {s3_key}: {e}")

print(f"\n✓ Uploaded {uploaded} files")

print(f"\n{'='*70}")
print(f"✓ FRONTEND DEPLOYMENT SUCCESSFUL")
print(f"{'='*70}")
print(f"\n🌐 Access your frontend at:")
print(f"  http://{S3_BUCKET}.s3-website.us-east-2.amazonaws.com")
print(f"\nBackend API:")
print(f"  https://tdot-api-manual.eba-muthcmmp.us-east-2.elasticbeanstalk.com")
