import boto3
from dotenv import load_dotenv
import os

load_dotenv()

eb = boto3.client(
    'elasticbeanstalk',
    region_name=os.getenv('AWS_DEFAULT_REGION'),
    aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY')
)

print("EB Applications and Environments:")
try:
    apps = eb.describe_applications()
    for app in apps['Applications']:
        print(f"\nApplication: {app['ApplicationName']}")
        envs = eb.describe_environments(ApplicationName=app['ApplicationName'])
        for env in envs['Environments']:
            print(f"  - {env['EnvironmentName']}: {env['Status']}")
except Exception as e:
    print(f"Error: {e}")
