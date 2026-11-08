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

env_id = 'e-tvmtduqjmx'

print(f"Querying environment ID: {env_id}")

try:
    envs = eb.describe_environments(EnvironmentIds=[env_id])
    for env in envs['Environments']:
        print(f"\nEnvironment Name: {env['EnvironmentName']}")
        print(f"Application Name: {env['ApplicationName']}")
        print(f"Status: {env['Status']}")
        print(f"Health: {env.get('Health', 'N/A')}")
        print(f"CNAME: {env.get('CNAME', 'N/A')}")
        print(f"Region: {env.get('AvailabilityZones', [])}")
except Exception as e:
    print(f"Error: {e}")
