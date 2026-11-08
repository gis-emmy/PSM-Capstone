#!/usr/bin/env python
"""
Enable S3 static website hosting
"""
import os
from dotenv import load_dotenv
import boto3

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
print(f"⚙️  CONFIGURING S3 STATIC WEBSITE HOSTING")
print(f"{'='*70}")

print(f"\nBucket: {S3_BUCKET}")

# Enable static website hosting
print(f"\n📝 Enabling static website hosting...")

website_config = {
    'IndexDocument': {'Suffix': 'index.html'},
    'ErrorDocument': {'Key': 'index.html'}  # Route errors back to index.html for React routing
}

try:
    s3.put_bucket_website(Bucket=S3_BUCKET, WebsiteConfiguration=website_config)
    print(f"✓ Static website hosting enabled")
except Exception as e:
    print(f"⚠️  {e}")

# Make bucket public (add bucket policy)
print(f"\n📝 Making bucket public...")

bucket_policy = {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": f"arn:aws:s3:::{S3_BUCKET}/*"
        }
    ]
}

try:
    s3.put_bucket_policy(Bucket=S3_BUCKET, Policy=__import__('json').dumps(bucket_policy))
    print(f"✓ Bucket policy set to public")
except Exception as e:
    print(f"⚠️  {e}")

print(f"\n{'='*70}")
print(f"✓ S3 CONFIGURATION COMPLETE")
print(f"{'='*70}")
print(f"\n🌐 Access your frontend at:")
print(f"  http://{S3_BUCKET}.s3-website.{AWS_REGION}.amazonaws.com")
print(f"  or")
print(f"  http://{S3_BUCKET}.s3-website-{AWS_REGION}.amazonaws.com")
