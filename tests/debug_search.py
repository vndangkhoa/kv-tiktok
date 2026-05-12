import json
import urllib.request
import urllib.parse
import os
import sys

def debug_search():
    base_url = "http://localhost:8002/api/user/search"
    query = "hot trend"
    params = urllib.parse.urlencode({"query": query, "limit": 10})
    url = f"{base_url}?{params}"
    
    print(f"Testing search for: '{query}'")
    print(f"URL: {url}")
    
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=60) as response:
            status_code = response.getcode()
            print(f"Status Code: {status_code}")
            
            if status_code == 200:
                data = json.loads(response.read().decode('utf-8'))
                print(f"Source: {data.get('source')}")
                print(f"Count: {data.get('count')}")
                videos = data.get("videos", [])
                if not videos:
                    print("ERROR: No videos returned!")
                else:
                    print(f"First video: {videos[0].get('id')} - {videos[0].get('desc', 'No desc')}")
            else:
                print(f"Error: Status {status_code}")
                
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} - {e.reason}")
        print(e.read().decode('utf-8'))
    except Exception as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    debug_search()
