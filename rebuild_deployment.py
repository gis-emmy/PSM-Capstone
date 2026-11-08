#!/usr/bin/env python
"""
Build correct deployment packages for AWS
"""
import os
import shutil
import zipfile
from pathlib import Path

print("=" * 70)
print("BUILDING DEPLOYMENT PACKAGES")
print("=" * 70)

# Clean up old extracted folder
if Path("backend-extracted").exists():
    shutil.rmtree("backend-extracted")

# Remove old zips
for f in ['backend-deployment.zip', 'frontend-deployment.zip']:
    if Path(f).exists():
        Path(f).unlink()
        print(f"✓ Removed old {f}")

print("\n" + "=" * 70)
print("BUILDING BACKEND DEPLOYMENT PACKAGE")
print("=" * 70)

# Create backend zip with correct structure (files at root, not in backend/ folder)
backend_zip = zipfile.ZipFile('backend-deployment.zip', 'w', zipfile.ZIP_DEFLATED)

backend_dir = Path('backend')
exclude_dirs = {'.git', 'node_modules', '.env', '__pycache__', '.pytest_cache'}

for root, dirs, files in os.walk(backend_dir):
    # Filter out excluded directories
    dirs[:] = [d for d in dirs if d not in exclude_dirs]
    
    for file in files:
        if file.startswith('.'):
            continue
            
        file_path = Path(root) / file
        # Remove 'backend/' prefix from the archive path so files are at root
        rel_path = file_path.relative_to(backend_dir)
        arcname = str(rel_path)
        
        backend_zip.write(file_path, arcname)
        print(f"  + {arcname}")

backend_zip.close()
backend_size = Path('backend-deployment.zip').stat().st_size / (1024 * 1024)
print(f"\n✓ backend-deployment.zip ({backend_size:.2f} MB)")

print("\n" + "=" * 70)
print("BUILDING FRONTEND DEPLOYMENT PACKAGE")
print("=" * 70)

# Create frontend zip
frontend_zip = zipfile.ZipFile('frontend-deployment.zip', 'w', zipfile.ZIP_DEFLATED)

frontend_dir = Path('frontend')
for root, dirs, files in os.walk(frontend_dir):
    dirs[:] = [d for d in dirs if d not in exclude_dirs]
    
    for file in files:
        if file.startswith('.'):
            continue
            
        file_path = Path(root) / file
        arcname = str(file_path.relative_to(frontend_dir))
        
        frontend_zip.write(file_path, arcname)
        print(f"  + {arcname}")

frontend_zip.close()
frontend_size = Path('frontend-deployment.zip').stat().st_size / (1024 * 1024)
print(f"\n✓ frontend-deployment.zip ({frontend_size:.2f} MB)")

print("\n" + "=" * 70)
print("✓ DEPLOYMENT PACKAGES READY")
print("=" * 70)
print(f"\nBackend:  backend-deployment.zip ({backend_size:.2f} MB)")
print(f"Frontend: frontend-deployment.zip ({frontend_size:.2f} MB)")
