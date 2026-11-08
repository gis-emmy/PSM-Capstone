import boto3
from dotenv import load_dotenv
import os

load_dotenv()

s3 = boto3.client(
    's3',
    region_name=os.getenv('AWS_DEFAULT_REGION'),
    aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY')
)

print("Available S3 Buckets:")
buckets = s3.list_buckets()['Buckets']
for b in buckets:
    if 'tdot' in b['Name'].lower() or 'capstone' in b['Name'].lower() or 'deployment' in b['Name'].lower():
        print(f"  - {b['Name']}")
