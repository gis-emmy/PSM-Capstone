import boto3
from dotenv import load_dotenv
import os

load_dotenv()

eb = boto3.client(
    'elasticbeanstalk',
    region_name='us-east-1',
    aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY')
)

print("EB Environments:")
try:
    envs = eb.describe_environments()
    if envs.get('Environments'):
        for e in envs['Environments']:
            print(f"  - {e['EnvironmentName']}: {e['Status']}")
            print(f"    App: {e['ApplicationName']}")
            print(f"    URL: {e.get('CNAME', 'N/A')}")
    else:
        print("  No environments found")
except Exception as e:
    print(f"Error: {e}")
