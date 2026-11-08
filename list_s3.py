import boto3
from dotenv import load_dotenv
import os

load_dotenv(override=True)

s3 = boto3.client(
    's3',
    region_name=os.getenv('AWS_DEFAULT_REGION'),
    aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY')
)

bucket = os.getenv('S3_FRONTEND_BUCKET')

print(f"Files in S3 bucket: {bucket}\n")

response = s3.list_objects_v2(Bucket=bucket)

if 'Contents' in response:
    for obj in response['Contents']:
        size_kb = obj['Size'] / 1024
        print(f"  {obj['Key']} ({size_kb:.2f} KB)")
else:
    print("  No files found")
