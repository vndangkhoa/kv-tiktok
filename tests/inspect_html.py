from bs4 import BeautifulSoup
import re

with open("debug_search_page.html", "r", encoding="utf-8") as f:
    html = f.read()

soup = BeautifulSoup(html, "html.parser")

# Inspect text occurrences
print("\n--- Searching for 'trend' text ---")
text_matches = soup.find_all(string=re.compile("trend", re.IGNORECASE))
print(f"Found {len(text_matches)} text matches.")

unique_parents = set()
for text in text_matches:
    parent = text.parent
    if parent and parent.name != "script" and parent.name != "style":
        # Get up to 3 levels of parents
        chain = []
        curr = parent
        for _ in range(3):
            if curr:
                chain.append(f"<{curr.name} class='{'.'.join(curr.get('class', []))}'>")
                curr = curr.parent
        unique_parents.add(" -> ".join(chain))

for p in list(unique_parents)[:10]:
    print(p)

