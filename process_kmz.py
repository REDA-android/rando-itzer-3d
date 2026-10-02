import zipfile
import xml.etree.ElementTree as ET
import json
import math
import os

kmz_path = r"C:\Users\Mr Elkrouchni\Downloads\Projet Rando Zaghfouland - ITZER.kmz"

def parse_kmz(path):
    with zipfile.ZipFile(path, 'r') as z:
        kml_content = z.read('doc.kml')
    
    root = ET.fromstring(kml_content)
    # Namespace handling
    ns = {'kml': 'http://www.opengis.net/kml/2.2'}
    
    # Find coordinates inside LinearRing
    coords_elem = root.find('.//kml:coordinates', ns)
    if coords_elem is None:
        # Try without namespace
        coords_elem = root.find('.//coordinates')
    
    raw_coords = coords_elem.text.strip().split()
    polygon_coords = []
    for c in raw_coords:
        parts = c.split(',')
        if len(parts) >= 2:
            lon = float(parts[0])
            lat = float(parts[1])
            ele = float(parts[2]) if len(parts) > 2 else 0.0
            polygon_coords.append((lon, lat, ele))
            
    return polygon_coords

def compute_metrics(coords):
    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    eles = [c[2] for c in coords]
    
    min_lon, max_lon = min(lons), max(lons)
    min_lat, max_lat = min(lats), max(lats)
    min_ele, max_ele = min(eles), max(eles)
    center_lon = (min_lon + max_lon) / 2
    center_lat = (min_lat + max_lat) / 2
    
    # Calculate perimeter using Haversine
    def haversine(p1, p2):
        R = 6371.0 # km
        dlat = math.radians(p2[1] - p1[1])
        dlon = math.radians(p2[0] - p1[0])
        a = math.sin(dlat/2)**2 + math.cos(math.radians(p1[1])) * math.cos(math.radians(p2[1])) * math.sin(dlon/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        return R * c
        
    perimeter_km = 0
    for i in range(len(coords) - 1):
        perimeter_km += haversine(coords[i], coords[i+1])
        
    # Polygon Area using Shoelace on planar approximation
    def polygon_area_km2(coords):
        area = 0.0
        n = len(coords)
        for i in range(n - 1):
            x1 = math.radians(coords[i][0]) * 6371.0 * math.cos(math.radians(center_lat))
            y1 = math.radians(coords[i][1]) * 6371.0
            x2 = math.radians(coords[i+1][0]) * 6371.0 * math.cos(math.radians(center_lat))
            y2 = math.radians(coords[i+1][1]) * 6371.0
            area += (x1 * y2 - x2 * y1)
        return abs(area) / 2.0

    area_km2 = polygon_area_km2(coords)
    
    return {
        "bounds": {
            "minLon": min_lon,
            "maxLon": max_lon,
            "minLat": min_lat,
            "maxLat": max_lat
        },
        "center": {
            "lon": center_lon,
            "lat": center_lat
        },
        "elevation": {
            "min": min_ele,
            "max": max_ele,
            "avg": sum(eles) / len(eles)
        },
        "metrics": {
            "perimeter_km": round(perimeter_km, 2),
            "area_km2": round(area_km2, 2),
            "area_ha": round(area_km2 * 100, 1),
            "vertices_count": len(coords)
        }
    }

if __name__ == '__main__':
    coords = parse_kmz(kmz_path)
    metrics = compute_metrics(coords)
    
    geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "name": "Projet Rando Zaghfouland - ITZER",
                    "description": "Périmètre d'étude et zone de randonnée - Forêt de Zaghfouland & Itzer (Moyen Atlas)",
                    "perimeter_km": metrics["metrics"]["perimeter_km"],
                    "area_km2": metrics["metrics"]["area_km2"],
                    "area_ha": metrics["metrics"]["area_ha"],
                    "min_ele": metrics["elevation"]["min"],
                    "max_ele": metrics["elevation"]["max"]
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[ [c[0], c[1], c[2]] for c in coords ]]
                }
            }
        ]
    }
    
    out_dir = r"C:\Users\Mr Elkrouchni\.gemini\antigravity\scratch\projet-rando-itzer-3d"
    with open(os.path.join(out_dir, "zone_rando.geojson"), "w", encoding="utf-8") as f:
        json.dump(geojson, f, indent=2, ensure_ascii=False)
        
    with open(os.path.join(out_dir, "metadata.json"), "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2, ensure_ascii=False)
        
    print("GeoJSON and metadata generated successfully!")
    print(json.dumps(metrics, indent=2))
