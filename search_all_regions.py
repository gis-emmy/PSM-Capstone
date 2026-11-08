import boto3
from dotenv import load_dotenv
import os

load_dotenv()

# Try all regions to find the environment
regions = ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'eu-west-1']

env_id = 'e-tvmtduqjmx'

print(f"Searching for environment ID: {env_id}\n")

for region in regions:
    try:
        eb = boto3.client(
            'elasticbeanstalk',
            region_name=region,
            aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY')
        )
        
        envs = eb.describe_environments(EnvironmentIds=[env_id])
        if envs['Environments']:
            for env in envs['Environments']:
                print(f"✓ FOUND in region: {region}")
                print(f"  Environment Name: {env['EnvironmentName']}")
                print(f"  Application Name: {env['ApplicationName']}")
                print(f"  Status: {env['Status']}")
                print(f"  Health: {env.get('Health', 'N/A')}")
                print(f"  CNAME: {env.get('CNAME', 'N/A')}")
    except Exception as e:
        pass

print(f"\nDone searching.")
