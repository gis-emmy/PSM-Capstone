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

print("All EB Applications:")
apps = eb.describe_applications()
for app in apps.get('Applications', []):
    print(f"\nApplication: {app['ApplicationName']}")
    
    envs = eb.describe_environments(ApplicationName=app['ApplicationName'])
    print(f"  Environments ({len(envs['Environments'])}):")
    for env in envs['Environments']:
        print(f"    - {env['EnvironmentName']}")
        print(f"      Status: {env['Status']}")
        print(f"      Health: {env.get('Health', 'N/A')}")
        print(f"      CNAME: {env.get('CNAME', 'N/A')}")
