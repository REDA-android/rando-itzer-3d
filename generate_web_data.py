import json
import math
import numpy as np
from PIL import Image

# Load terrain metadata and dem
with open("terrain_metadata.json", "r", encoding="utf-8") as f:
    meta = json.load(f)

bounds = meta["bounds"]
grid = np.array(meta["grid"], dtype=np.float32) # shape: (128, 192)
gh, gw = grid.shape

min_ele = float(np.min(grid))
max_ele = float(np.max(grid))

# Load polygon
with open("zone_rando.geojson", "r", encoding="utf-8") as f:
    geojson = json.load(f)

poly_coords = geojson["features"][0]["geometry"]["coordinates"][0]

# Load elevation profile
with open("elevation_profile.json", "r", encoding="utf-8") as f:
    profile_data = json.load(f)

# Load POIs
with open("points_of_interest.json", "r", encoding="utf-8") as f:
    pois = json.load(f)

# Coordinate conversion helper
# Map tile space to normalized (u, v) in [0, 1]
def latlon_to_uv(lat, lon):
    n = 2.0 ** 12
    x_world = (lon + 180.0) / 360.0 * n * 256.0
    lat_rad = math.radians(lat)
    y_world = (1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n * 256.0
    u = (x_world - 1987 * 256.0) / 1536.0
    v = (y_world - 1649 * 256.0) / 1024.0
    return u, v

# Sample elevation from grid for a given (u, v)
def sample_elevation(u, v):
    gx = np.clip(u * (gw - 1), 0, gw - 1)
    gy = np.clip(v * (gh - 1), 0, gh - 1)
    
    x0, y0 = int(math.floor(gx)), int(math.floor(gy))
    x1, y1 = min(x0 + 1, gw - 1), min(y0 + 1, gh - 1)
    
    dx, dy = gx - x0, gy - y0
    
    val = (grid[y0, x0] * (1 - dx) * (1 - dy) +
           grid[y0, x1] * dx * (1 - dy) +
           grid[y1, x0] * (1 - dx) * dy +
           grid[y1, x1] * dx * dy)
    return float(val)

# Add 3D coordinates to POIs
for p in pois:
    u, v = latlon_to_uv(p["lat"], p["lon"])
    ele = sample_elevation(u, v)
    p["u"] = round(u, 5)
    p["v"] = round(v, 5)
    p["elevation_m"] = round(ele, 1)
    p["x3d"] = round((u - 0.5) * 300, 2)
    p["z3d"] = round((v - 0.5) * 200, 2)

# Add 3D coordinates to polygon vertices
poly_3d = []
for c in poly_coords:
    u, v = latlon_to_uv(c[1], c[0])
    ele = sample_elevation(u, v)
    poly_3d.append({
        "lon": c[0],
        "lat": c[1],
        "elevation_m": round(ele, 1),
        "u": round(u, 5),
        "v": round(v, 5),
        "x3d": round((u - 0.5) * 300, 2),
        "z3d": round((v - 0.5) * 200, 2)
    })

# Process and rotate Profile so it starts at Itzer (closest point: index 322, lat 32.8297, lon -5.0401)
raw_profile = profile_data["profile"]
n = len(raw_profile)
itzer_target_lat, itzer_target_lon = 32.8791, -5.0541
itzer_idx = min(
    range(n),
    key=lambda i: math.hypot(
        (raw_profile[i]["lat"] - itzer_target_lat) * 111.0,
        (raw_profile[i]["lon"] - itzer_target_lon) * 111.0 * math.cos(math.radians(itzer_target_lat))
    )
)

rotated_profile = []
for i in range(n):
    orig_idx = (itzer_idx + i) % n
    pt = dict(raw_profile[orig_idx])
    rotated_profile.append(pt)

# Recompute cumulative distance_km from 0.0 to 105.02 km
cum_dist = 0.0
rotated_profile[0]["distance_km"] = 0.0
for i in range(1, n):
    dlat = (rotated_profile[i]["lat"] - rotated_profile[i-1]["lat"]) * 111.0
    dlon = (rotated_profile[i]["lon"] - rotated_profile[i-1]["lon"]) * 111.0 * math.cos(math.radians(rotated_profile[i]["lat"]))
    step_d = math.hypot(dlat, dlon)
    cum_dist += step_d
    rotated_profile[i]["distance_km"] = round(cum_dist, 2)

# Normalize slightly to hit exact 105.0 km
scale_factor = 105.02 / cum_dist
for i in range(1, n):
    rotated_profile[i]["distance_km"] = round(rotated_profile[i]["distance_km"] * scale_factor, 2)
rotated_profile[-1]["distance_km"] = 105.02

# Add 3D coordinates, elevations, and stage tags to rotated profile points
chunk_size = n // 4
for i, pt in enumerate(rotated_profile):
    u, v = latlon_to_uv(pt["lat"], pt["lon"])
    ele = sample_elevation(u, v)
    pt["u"] = round(u, 5)
    pt["v"] = round(v, 5)
    pt["x3d"] = round((u - 0.5) * 300, 2)
    pt["z3d"] = round((v - 0.5) * 200, 2)
    pt["elevation_m"] = round(ele, 1)
    
    # Assign stage 1, 2, 3, 4
    stg = min(4, i // chunk_size + 1)
    pt["stage"] = stg

# Calculate detailed statistics for each of the 4 stages
stage_defs = [
    {
        "id": 1,
        "name": "Étape 1 : Itzer ➔ Bivouac Cédraie de Zaghfouland Sud",
        "short_name": "Jour 1",
        "subtitle": "Traversée des vergers d'Itzer et ascension des contreforts sud vers la cédraie",
        "color": "#10b981",
        "start_point": "Itzer (Centre Ville & Vergers, 1 597 m)",
        "end_point": "Bivouac 1 - Cédraie de Zaghfouland Sud (1 498 m)",
        "bivouac_id": "bivouac-cedraie",
        "water_info": "Prévoir réserve de 3 à 4L au départ d'Itzer. Pas de source immédiate au bivouac.",
        "difficulty": "Soutenu (D+ 1 200m)",
        "desc": "Au départ des vergers d'Itzer, la trace s'élève vers les contreforts du Djebel Hayane avant de pénétrer sous l'ombrage des cèdres de la forêt de Zaghfouland. Bivouac sauvage sous les grands cèdres."
    },
    {
        "id": 2,
        "name": "Étape 2 : Cédraie Sud ➔ Bivouac Cédraie de Zaghfouland / Sources Guigou",
        "short_name": "Jour 2",
        "subtitle": "Traversée des hautes crêtes calcaires, du Djebel Aberdouz et des résurgences du Guigou",
        "color": "#f59e0b",
        "start_point": "Bivouac 1 - Cédraie de Zaghfouland Sud (1 498 m)",
        "end_point": "Bivouac 2 - Cédraie de Zaghfouland / Sources Guigou (2 022 m)",
        "bivouac_id": "bivouac-zad-guigou",
        "water_info": "Eau abondante et glacée aux sources de l'Oued Guigou (filtration conseillée).",
        "difficulty": "Alpin & Technique (Crêtes calcaires)",
        "desc": "L'étape reine du trek : crêtes calcaires aériennes au-dessus de 2 100 m, panoramas à 360° et descente vers les sources pérennes du Guigou avant d'établir le camp face au Col du Zad."
    },
    {
        "id": 3,
        "name": "Étape 3 : Sources Guigou / Col du Zad ➔ Bivouac Plateau d'Arid",
        "short_name": "Jour 3",
        "subtitle": "Descente panoramique vers les immenses steppes d'alfa de la Haute Moulouya",
        "color": "#8b5cf6",
        "start_point": "Bivouac 2 - Cédraie de Zaghfouland / Sources Guigou (2 022 m)",
        "end_point": "Bivouac 3 - Plateau d'Arid / Haute Moulouya (1 540 m)",
        "bivouac_id": "bivouac-arid",
        "water_info": "Bivouac sec ! Réserve de 4L par personne impérative depuis le Col du Zad ou Zaïda.",
        "difficulty": "Modéré / Endurance (Ambiance aride)",
        "desc": "Descente progressive depuis les alpages humides du Zad vers les grands horizons désertiques du Plateau d'Arid. Immensité minérale, falaises calcaires et bivouac sous un ciel étoilé d'une pureté absolue."
    },
    {
        "id": 4,
        "name": "Étape 4 : Plateau d'Arid ➔ Itzer (Centre Ville & Vergers)",
        "short_name": "Jour 4",
        "subtitle": "Traversée des steppes de Haute Moulouya et retour verdoyant par les vergers d'Itzer",
        "color": "#f43f5e",
        "start_point": "Bivouac 3 - Plateau d'Arid / Haute Moulouya (1 540 m)",
        "end_point": "Itzer (Centre Ville & Vergers, 1 597 m)",
        "bivouac_id": "itzer-centre",
        "water_info": "Eau disponible aux sources et seguias de la vallée des vergers d'Itzer.",
        "difficulty": "Moyen (Sentiers pastoraux & vergers)",
        "desc": "Dernière étape traversant les steppes de la Haute Moulouya pour replonger dans la fraîcheur ombragée des vergers en terrasses et canaux d'irrigation d'Itzer. Clôture en beauté des 105 km de circuit."
    }
]

stages = []
for s_idx, s_def in enumerate(stage_defs):
    start_i = s_idx * chunk_size
    end_i = (s_idx + 1) * chunk_size if s_idx < 3 else n - 1
    chunk = rotated_profile[start_i:end_i + 1]
    
    dist_km = round(rotated_profile[end_i]["distance_km"] - rotated_profile[start_i]["distance_km"], 1)
    
    dplus = 0.0
    dminus = 0.0
    min_e = float(chunk[0]["elevation_m"])
    max_e = float(chunk[0]["elevation_m"])
    
    for k in range(1, len(chunk)):
        de = chunk[k]["elevation_m"] - chunk[k-1]["elevation_m"]
        if de > 0: dplus += de
        else: dminus += abs(de)
        min_e = min(min_e, float(chunk[k]["elevation_m"]))
        max_e = max(max_e, float(chunk[k]["elevation_m"]))
        
    t_h = dist_km / 4.0
    t_v = (dplus / 400.0) + (dminus / 800.0)
    t_tot = max(t_h, t_v) + min(t_h, t_v) / 2.0
    hrs = int(t_tot)
    mins = int(round((t_tot - hrs) * 60))
    if mins == 60:
        hrs += 1
        mins = 0
        
    stg = dict(s_def)
    stg.update({
        "start_index": start_i,
        "end_index": end_i,
        "distance_km": dist_km,
        "d_plus_m": round(dplus),
        "d_minus_m": round(dminus),
        "min_ele_m": round(min_e),
        "max_ele_m": round(max_e),
        "estimated_time": f"{hrs}h{mins:02d}",
        "hours_decimal": round(t_tot, 2)
    })
    stages.append(stg)

# Total stats computation
total_dplus = sum(s["d_plus_m"] for s in stages)
total_dminus = sum(s["d_minus_m"] for s in stages)
all_eles = [p["elevation_m"] for p in rotated_profile]

total_hrs_dec = sum(s["hours_decimal"] for s in stages)
t_hrs = int(total_hrs_dec)
t_mins = int(round((total_hrs_dec - t_hrs) * 60))
if t_mins == 60:
    t_hrs += 1
    t_mins = 0
total_time_str = f"{t_hrs}h{t_mins:02d}"

web_data = {
    "project": {
        "title": "Projet Rando Zaghfouland - ITZER",
        "region": "Moyen Atlas, Province de Midelt, Maroc",
        "description": "Carte topographique 3D interactive du périmètre de randonnée de Zaghfouland et de la région d'Itzer",
        "source_file": "Projet Rando Zaghfouland - ITZER.kmz"
    },
    "bounds": bounds,
    "elevation": {
        "min": min_ele,
        "max": max_ele,
        "base": min_ele,
        "grid_w": gw,
        "grid_h": gh
    },
    "grid": grid.tolist(),
    "geojson": geojson,
    "polygon": poly_3d,
    "pois": pois,
    "stages": stages,
    "stats": {
        "perimeter_km": 105.0,
        "area_km2": 612.4,
        "area_ha": 61241,
        "d_plus_m": total_dplus,
        "d_minus_m": total_dminus,
        "min_ele_m": round(min(all_eles)),
        "max_ele_m": round(max(all_eles)),
        "avg_ele_m": round(float(np.mean(all_eles)), 1),
        "total_estimated_time": total_time_str,
        "total_hours_decimal": round(total_hrs_dec, 2)
    },
    "profile": rotated_profile
}

# Export as JSON
with open("web_data.json", "w", encoding="utf-8") as f:
    json.dump(web_data, f, ensure_ascii=False, indent=2)

# Export as JS object so it can be loaded without CORS over file:// protocol
with open("web_data.js", "w", encoding="utf-8") as f:
    f.write("window.RANDO_DATA = " + json.dumps(web_data, ensure_ascii=False) + ";\n")

for s in stages:
    print(f"  {s['short_name']}: {s['distance_km']} km, D+{s['d_plus_m']}m, D-{s['d_minus_m']}m, temps: {s['estimated_time']}")
