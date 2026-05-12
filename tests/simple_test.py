import urllib.request
import json

try:
    print("Testing /health...")
    with urllib.request.urlopen("http://localhost:8002/health", timeout=5) as r:
        print(f"Health: {r.status}")

    print("Testing /api/feed...")
    with open("temp_cookies.json", "r") as f:
        data = json.load(f)
    
    # Ensure list format 
    if isinstance(data, dict) and "credentials" in data:
        data = data["credentials"]
    
    # Prepare body as dict for safety with new Union type
    body = {"credentials": data}

    req = urllib.request.Request(
        "http://localhost:8002/api/feed",
        data=json.dumps(body).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        print(f"Feed: {r.status}")
        print(r.read().decode('utf-8')[:100])

except Exception as e:
    print(f"Error: {e}")
