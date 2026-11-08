#!/usr/bin/env python
"""
Deploy backend using boto3 EB API
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import boto3
from botocore.exceptions import ClientError
from datetime import datetime

load_dotenv()

AWS_ACCESS_KEY = os.getenv('AWS_ACCESS_KEY_ID')
AWS_SECRET_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')
AWS_REGION = os.getenv('AWS_DEFAULT_REGION', 'us-east-1')
EB_ENV = os.getenv('EB_BACKEND_ENV')
EB_BUCKET = "tdot-eb-deployments-79412"
APP_NAME = "tdot-api"

eb = boto3.client(
    'elasticbeanstalk',
    region_name=AWS_REGION,
    aws_access_key_id=AWS_ACCESS_KEY,
    aws_secret_access_key=AWS_SECRET_KEY
)

print(f"\n{'='*70}")
print(f"🚀 DEPLOYING BACKEND TO EB")
print(f"{'='*70}")

print(f"\nConfiguration:")
print(f"  Application: {APP_NAME}")
print(f"  Environment: {EB_ENV}")
print(f"  S3 Source: s3://{EB_BUCKET}/backend-deployment.zip")
print(f"  Region: {AWS_REGION}")

try:
    # Create application version
    timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    version_label = f"backend-{timestamp}"
    
    print(f"\n📝 Creating application version: {version_label}")
    
    response = eb.create_application_version(
        ApplicationName=APP_NAME,
        VersionLabel=version_label,
        SourceBundle={
            'S3Bucket': EB_BUCKET,
            'S3Key': 'backend-deployment.zip'
        }
    )
    
    print(f"✓ Application version created")
    print(f"  Version: {response['ApplicationVersion']['VersionLabel']}")
    
    # Deploy to environment
    print(f"\n📝 Deploying to {EB_ENV}...")
    
    response = eb.update_environment(
        EnvironmentName=EB_ENV,
        VersionLabel=version_label
    )
    
    print(f"✓ Deployment initiated")
    print(f"  Status: {response['Status']}")
    print(f"  Environment: {response['EnvironmentName']}")
    
    print(f"\n{'='*70}")
    print(f"✓ DEPLOYMENT SUCCESSFUL")
    print(f"{'='*70}")
    print(f"\nMonitor progress in AWS EB Console")
    
except ClientError as e:
    error_code = e.response['Error']['Code']
    error_msg = e.response['Error']['Message']
    print(f"\n❌ Deployment Error: {error_code}")
    print(f"   {error_msg}")
    sys.exit(1)

except Exception as e:
    print(f"\n❌ Error: {e}")
    sys.exit(1)
