from bs4 import BeautifulSoup
import json

with open("debug_search_page.html", "r", encoding="utf-8") as f:
    html = f.read()

soup = BeautifulSoup(html, "html.parser")
script = soup.find("script", id="__UNIVERSAL_DATA_FOR_REHYDRATION__")

if script:
    try:
        data = json.loads(script.string)
        print("Found SSR Data!")
        
        # Save pretty printed
        with open("ssr_data.json", "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            
        # Search for video list
        # Look in __DEFAULT_SCOPE__ -> webapp.search-video -> searchVideoList (guessing keys)
        # or just traverse and print keys
        
        def find_keys(obj, target_key, path=""):
            if isinstance(obj, dict):
                for k, v in obj.items():
                    current_path = f"{path}.{k}"
                    if target_key.lower() in k.lower():
                        print(f"Found key '{k}' at {current_path}")
                    find_keys(v, target_key, current_path)
            elif isinstance(obj, list):
                for i, item in enumerate(obj):
                    find_keys(item, target_key, f"{path}[{i}]")

        print("\nSearching for 'item' or 'list' keys...")
        find_keys(data, "item")
        find_keys(data, "list")
        
        # Check specific known paths
        default_scope = data.get("__DEFAULT_SCOPE__", {})
        print(f"\nTop level keys: {list(default_scope.keys())}")
        
    except json.JSONDecodeError as e:
        print(f"JSON Error: {e}")
else:
    print("Script tag not found.")
