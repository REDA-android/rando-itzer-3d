import urllib.request
import json

bbox = '32.75,-5.35,33.05,-4.85'
query = f"""[out:json][timeout:30];
(
  node["natural"="peak"]({bbox});
  node["place"~"town|village|hamlet"]({bbox});
  node["tourism"~"viewpoint|attraction|camp_site|chalet"]({bbox});
  way["highway"~"path|track|footway"]({bbox});
  way["waterway"~"river|stream"]({bbox});
);
out tags center 150;
"""

url = 'https://overpass-api.de/api/interpreter'
req = urllib.request.Request(url, data=query.encode('utf-8'), headers={'User-Agent': 'Antigravity3DMap/1.0'})
try:
    with urllib.request.urlopen(req, timeout=20) as res:
        data = json.loads(res.read().decode('utf-8'))
        print(f"Total elements: {len(data['elements'])}")
        peaks = [e for e in data['elements'] if e.get('tags', {}).get('natural') == 'peak']
        places = [e for e in data['elements'] if 'place' in e.get('tags', {})]
        tracks = [e for e in data['elements'] if e.get('tags', {}).get('highway') in ['path', 'track', 'footway']]
        waterways = [e for e in data['elements'] if 'waterway' in e.get('tags', {})]
        print(f"Peaks: {len(peaks)}")
        for p in peaks:
            print(" - Peak:", p.get('tags', {}).get('name', 'Sans nom'), "ele:", p.get('tags', {}).get('ele', 'N/A'), "lat:", p.get('lat'), "lon:", p.get('lon'))
        print(f"Places: {len(places)}")
        for pl in places[:10]:
            print(" - Place:", pl.get('tags', {}).get('name', 'Sans nom'), pl.get('tags', {}).get('place'), "lat:", pl.get('lat'), "lon:", pl.get('lon'))
        print(f"Hiking tracks/paths: {len(tracks)}")
        print(f"Waterways/Streams: {len(waterways)}")
        with open('osm_features.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
except Exception as e:
    print("Error querying Overpass:", e)
