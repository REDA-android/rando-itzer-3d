import urllib.request
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

bbox = '32.78,-5.31,33.01,-4.88'
query = f"""[out:json][timeout:15];
(
  node["natural"="peak"]({bbox});
  node["place"]({bbox});
);
out body;
"""
url = 'https://overpass-api.de/api/interpreter'
req = urllib.request.Request(url, data=query.encode('utf-8'), headers={'User-Agent': 'AntigravityGIS/1.0'})
try:
    with urllib.request.urlopen(req, timeout=12) as res:
        data = json.loads(res.read().decode('utf-8'))
        print(f"Total elements: {len(data['elements'])}")
        for el in data['elements']:
            tags = el.get('tags', {})
            name = tags.get('name', tags.get('name:fr', tags.get('name:ar', 'Sans nom')))
            nat = tags.get('natural', tags.get('place', ''))
            ele = tags.get('ele', '')
            print(f"- [{nat}] {name} (ele: {ele}) at {el.get('lat')}, {el.get('lon')}")
        with open('poi_data.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
except Exception as e:
    print("Overpass error:", e)
