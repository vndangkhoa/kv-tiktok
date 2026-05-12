import urllib.request
import json
import os

with open("temp_cookies.json", "r") as f:
    data = json.load(f)

# Ensure data is in the expected dict format for the request body
if isinstance(data, list):
    # If temp_cookies is just the list, wrap it
    body = {"credentials": data}
elif "credentials" not in data:
     body = {"credentials": data}
else:
    body = data

req = urllib.request.Request(
    "http://localhost:8002/api/feed",
    data=json.dumps(body).encode('utf-8'),
    headers={'Content-Type': 'application/json'}
)

try:
    with urllib.request.urlopen(req) as response:
        print(response.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code}")
    print(e.read().decode('utf-8'))
except Exception as e:
    print(f"Error: {e}")
