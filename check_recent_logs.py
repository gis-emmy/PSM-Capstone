import boto3
from dotenv import load_dotenv
import os

load_dotenv(override=True)

eb = boto3.client(
    'elasticbeanstalk',
    region_name=os.getenv('AWS_DEFAULT_REGION'),
    aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY')
)

env_name = 'tdot-api-manual'

print(f"Retrieving recent events for {env_name}...\n")

try:
    response = eb.describe_events(
        EnvironmentName=env_name,
        MaxRecords=20
    )
    
    for event in response['Events']:
        print(f"[{event['EventDate'].strftime('%Y-%m-%d %H:%M:%S')}] {event['Severity']}")
        print(f"  {event['Message']}\n")
        
except Exception as e:
    print(f"Error: {e}")
