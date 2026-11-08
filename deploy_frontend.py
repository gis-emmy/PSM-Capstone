#!/usr/bin/env python
"""
Deploy frontend to S3 - extract and upload files
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import boto3
from botocore.exceptions import ClientError
import zipfile
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
print(f"📤 DEPLOYING FRONTEND TO S3")
print(f"{'='*70}")

print(f"\nConfiguration:")
print(f"  S3 Bucket: {S3_BUCKET}")
print(f"  Region: {AWS_REGION}")

# Extract frontend zip
frontend_zip = Path('frontend-deployment.zip')
extract_dir = Path('frontend-extracted')

if extract_dir.exists():
    import shutil
    shutil.rmtree(extract_dir)

print(f"\n📂 Extracting frontend...")
with zipfile.ZipFile(frontend_zip, 'r') as zip_ref:
    zip_ref.extractall(extract_dir)

print(f"✓ Extracted to {extract_dir}")

# Upload all files from extracted frontend to S3
print(f"\n📤 Uploading files to S3...")
uploaded = 0

for root, dirs, files in os.walk(extract_dir):
    for file in files:
        file_path = Path(root) / file
        # S3 key: remove 'frontend-extracted/' prefix
        s3_key = str(file_path.relative_to(extract_dir))
        
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
                    ContentType=content_type
                )
            print(f"  ✓ {s3_key}")
            uploaded += 1
        except ClientError as e:
            print(f"  ✗ {s3_key}: {e}")

print(f"\n✓ Uploaded {uploaded} files")

print(f"\n{'='*70}")
print(f"✓ FRONTEND DEPLOYMENT SUCCESSFUL")
print(f"{'='*70}")
print(f"\n🌐 Frontend URL:")
print(f"  http://{S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com/index.html")
print(f"\n📝 Note: Enable S3 static website hosting or use CloudFront for public access")
