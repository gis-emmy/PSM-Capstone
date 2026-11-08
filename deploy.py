#!/usr/bin/env python
"""
AWS Deployment using boto3
Uploads frontend to S3 and backend to EB
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import boto3
from botocore.exceptions import ClientError

load_dotenv()

AWS_ACCESS_KEY = os.getenv('AWS_ACCESS_KEY_ID')
AWS_SECRET_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')
AWS_REGION = os.getenv('AWS_DEFAULT_REGION', 'us-east-1')
S3_BUCKET = os.getenv('S3_FRONTEND_BUCKET')
EB_ENV = os.getenv('EB_BACKEND_ENV')

def upload_to_s3():
    """Upload frontend to S3"""
    print("\n" + "=" * 70)
    print("📤 UPLOADING FRONTEND TO S3")
    print("=" * 70)
    
    s3_client = boto3.client(
        's3',
        region_name=AWS_REGION,
        aws_access_key_id=AWS_ACCESS_KEY,
        aws_secret_access_key=AWS_SECRET_KEY
    )
    
    frontend_zip = Path("frontend-deployment.zip")
    
    if not frontend_zip.exists():
        print(f"❌ {frontend_zip} not found")
        return False
    
    try:
        file_size = frontend_zip.stat().st_size / (1024 * 1024)
        print(f"\nBucket: {S3_BUCKET}")
        print(f"File: frontend-deployment.zip ({file_size:.2f} MB)")
        
        with open(frontend_zip, 'rb') as f:
            s3_client.put_object(
                Bucket=S3_BUCKET,
                Key='frontend-deployment.zip',
                Body=f
            )
        
        print(f"✓ Successfully uploaded frontend-deployment.zip to s3://{S3_BUCKET}/")
        return True
    
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_msg = e.response['Error']['Message']
        print(f"❌ S3 Upload Failed: {error_code}")
        print(f"   {error_msg}")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def upload_to_eb():
    """Upload backend to EB deployment bucket"""
    print("\n" + "=" * 70)
    print("📤 UPLOADING BACKEND FOR ELASTIC BEANSTALK")
    print("=" * 70)
    
    backend_zip = Path("backend-deployment.zip")
    
    if not backend_zip.exists():
        print(f"❌ {backend_zip} not found")
        return False
    
    try:
        file_size = backend_zip.stat().st_size / (1024 * 1024)
        eb_deployment_bucket = "tdot-eb-deployments-79412"
        
        print(f"\nFile: backend-deployment.zip ({file_size:.2f} MB)")
        print(f"Deployment Bucket: {eb_deployment_bucket}")
        print(f"EB Environment: {EB_ENV}")
        
        s3_client = boto3.client(
            's3',
            region_name=AWS_REGION,
            aws_access_key_id=AWS_ACCESS_KEY,
            aws_secret_access_key=AWS_SECRET_KEY
        )
        
        with open(backend_zip, 'rb') as f:
            s3_client.put_object(
                Bucket=eb_deployment_bucket,
                Key='backend-deployment.zip',
                Body=f
            )
        
        print(f"✓ Successfully uploaded backend-deployment.zip to s3://{eb_deployment_bucket}/")
        print(f"\n📝 EB Deployment Instructions:")
        print(f"   1. Go to AWS EB Console")
        print(f"   2. Select environment: {EB_ENV}")
        print(f"   3. Click 'Upload and Deploy'")
        print(f"   4. Select: s3://{eb_deployment_bucket}/backend-deployment.zip")
        print(f"   5. Click 'Deploy'")
        
        return True
    
    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_msg = e.response['Error']['Message']
        print(f"❌ Upload Failed: {error_code}")
        print(f"   {error_msg}")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def main():
    print("\n" + "=" * 70)
    print("🚀 TDOT CAPSTONE AWS DEPLOYMENT")
    print("=" * 70)
    
    # Validate configuration
    if not all([AWS_ACCESS_KEY, AWS_SECRET_KEY, AWS_REGION, S3_BUCKET, EB_ENV]):
        print("\n❌ Missing AWS configuration in .env file")
        print("   Required: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,")
        print("            AWS_DEFAULT_REGION, S3_FRONTEND_BUCKET, EB_BACKEND_ENV")
        return 1
    
    print(f"\n✓ Configuration Loaded:")
    print(f"  Region: {AWS_REGION}")
    print(f"  S3 Frontend Bucket: {S3_BUCKET}")
    print(f"  EB Backend Environment: {EB_ENV}")
    
    # Deploy frontend
    frontend_success = upload_to_s3()
    
    # Deploy backend
    backend_success = upload_to_eb()
    
    # Summary
    print("\n" + "=" * 70)
    if frontend_success and backend_success:
        print("✓ DEPLOYMENT SUCCESSFUL")
        print("=" * 70)
        print("\n📋 Summary:")
        print(f"  ✓ Frontend: Uploaded to s3://{S3_BUCKET}/")
        print(f"  ✓ Backend: Uploaded for {EB_ENV} deployment")
        return 0
    else:
        print("⚠️  DEPLOYMENT INCOMPLETE")
        print("=" * 70)
        if not frontend_success:
            print("  ✗ Frontend upload failed")
        if not backend_success:
            print("  ✗ Backend upload failed")
        return 1

if __name__ == '__main__':
    sys.exit(main())
