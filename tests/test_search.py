import requests
import json
import time

BASE_URL = "http://localhost:8002/api/user/search"

def test_search():
    print("Testing Search API...")
    try:
        # Simple query
        params = {
            "query": "dance",
            "limit": 50,
            "cursor": 0
        }
        start = time.time()
        res = requests.get(BASE_URL, params=params)
        duration = time.time() - start
        
        print(f"Status Code: {res.status_code}")
        print(f"Duration: {duration:.2f}s")
        
        if res.status_code == 200:
            data = res.json()
            print(f"Videos Found: {len(data.get('videos', []))}")
            # print(json.dumps(data, indent=2))
        else:
            print("Error Response:")
            print(res.text)
            
    except Exception as e:
        print(f"Request Failed: {e}")

if __name__ == "__main__":
    test_search()
