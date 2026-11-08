#!/usr/bin/env python
"""
Simple deployment without boto3 - uses AWS REST API directly
"""
import os
import sys
import shutil
import zipfile
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

AWS_ACCESS_KEY = os.getenv('AWS_ACCESS_KEY_ID')
AWS_SECRET_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')
AWS_REGION = os.getenv('AWS_DEFAULT_REGION', 'us-east-1')
S3_BUCKET = os.getenv('S3_FRONTEND_BUCKET')
EB_ENV = os.getenv('EB_BACKEND_ENV')

def create_backend_zip():
    """Create deployment-ready zip of backend"""
    print("\n📦 Creating backend deployment package...")
    
    zip_path = Path("backend-deployment.zip")
    if zip_path.exists():
        zip_path.unlink()
    
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        backend_dir = Path("backend")
        for file_path in backend_dir.rglob('*'):
            if file_path.is_file():
                arcname = file_path.relative_to(backend_dir.parent)
                zf.write(file_path, arcname)
    
    size_mb = zip_path.stat().st_size / (1024 * 1024)
    print(f"✓ Created backend-deployment.zip ({size_mb:.1f} MB)")
    return zip_path

def create_frontend_zip():
    """Create deployment-ready zip of frontend build"""
    print("\n📦 Creating frontend deployment package...")
    
    zip_path = Path("frontend-deployment.zip")
    if zip_path.exists():
        zip_path.unlink()
    
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        frontend_dir = Path("frontend")
        for file_path in frontend_dir.rglob('*'):
            if file_path.is_file():
                # Skip node_modules and build artifacts
                if 'node_modules' in str(file_path) or '.git' in str(file_path):
                    continue
                arcname = file_path.relative_to(frontend_dir.parent)
                zf.write(file_path, arcname)
    
    size_mb = zip_path.stat().st_size / (1024 * 1024)
    print(f"✓ Created frontend-deployment.zip ({size_mb:.1f} MB)")
    return zip_path

def main():
    print("=" * 60)
    print("TDOT Capstone Deployment Package Builder")
    print("=" * 60)
    
    if not all([AWS_ACCESS_KEY, AWS_SECRET_KEY, AWS_REGION, S3_BUCKET, EB_ENV]):
        print("❌ Missing configuration in .env")
        return 1
    
    print("\n✓ Configuration loaded:")
    print(f"  S3 Bucket: {S3_BUCKET}")
    print(f"  EB Environment: {EB_ENV}")
    
    try:
        backend_zip = create_backend_zip()
        frontend_zip = create_frontend_zip()
        
        print("\n" + "=" * 60)
        print("✓ Deployment packages ready!")
        print("\nNext steps:")
        print(f"1. Upload {backend_zip.name} to EB for {EB_ENV}")
        print(f"2. Upload {frontend_zip.name} to S3 bucket {S3_BUCKET}")
        print("\nFiles are ready in the project root directory.")
        print("=" * 60)
        return 0
    except Exception as e:
        print(f"❌ Error: {e}")
        return 1

if __name__ == '__main__':
    sys.exit(main())
