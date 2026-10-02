import json
import math
import os

PROJECT_DIR = r"C:\Users\Mr Elkrouchni\.gemini\antigravity\scratch\projet-rando-itzer-3d"
WEB_DATA_PATH = os.path.join(PROJECT_DIR, "web_data.json")

with open(WEB_DATA_PATH, "r", encoding="utf-8") as f:
    web_data = json.load(f)

bounds = web_data["bounds"]
grid = web_data["grid"] # 128 rows x 192 cols
lat_min, lat_max = bounds["lat_range"]
lon_min, lon_max = bounds["lon_range"]
grid_h = len(grid)
grid_w = len(grid[0])

def sample_elevation(lat, lon):
    u = (lon - lon_min) / (lon_max - lon_min)
    v = (lat_max - lat) / (lat_max - lat_min)
    u = max(0.0, min(1.0, u))
    v = max(0.0, min(1.0, v))
    
    col = u * (grid_w - 1)
    row = v * (grid_h - 1)
    c0 = int(col)
    r0 = int(row)
    c1 = min(grid_w - 1, c0 + 1)
    r1 = min(grid_h - 1, r0 + 1)
    
    du = col - c0
    dv = row - r0
    
    e00 = grid[r0][c0]
    e10 = grid[r0][c1]
    e01 = grid[r1][c0]
    e11 = grid[r1][c1]
    
    top = e00 * (1.0 - du) + e10 * du
    bot = e01 * (1.0 - du) + e11 * du
    return round(top * (1.0 - dv) + bot * dv, 1)

def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0 # km
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2.0)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

# Center start/end for Zaghfouland
# Zaghfouland Trailhead Base Camp
START_LAT = 32.9150
START_LON = -5.1850

print(f"Zaghfouland base elevation: {sample_elevation(START_LAT, START_LON)} m")

# Define the 5 circuits with control points shaping natural mountain ridges, thalwegs, and plateaus
circuit_configs = [
    {
        "id": "loop-10k",
        "target_km": 10.0,
        "name": "Boucle 10 km – Sentier des Cèdres Géants & Belvédère de Zaghfouland",
        "short_name": "Boucle 10 km",
        "color": "#06b6d4", # Cyan
        "theme": "Cédraie Majestueuse & Vue Panoramique",
        "difficulty": "Modéré",
        "control_points": [
            (32.9150, -5.1850), # Début: Zaghfouland Camp de Base
            (32.9230, -5.1810), # Crête Est des Cèdres
            (32.9300, -5.1740), # Belvédère Tizi n'Zaghfou (2210m)
            (32.9270, -5.1630), # Halte Clairière des Bergers d'Aït Zaghfou
            (32.9190, -5.1670), # Bivouac sous les étoiles: Clairière Céleste
            (32.9110, -5.1740), # Vallon des Sources Sèches
            (32.9150, -5.1850), # Retour: Zaghfouland
        ],
        "highlights": [
            {"name": "Cédraie Multiséculaire de Zaghfouland", "icon": "🌲", "km": 1.8, "desc": "Arbres vénérables de plus de 450 ans aux frondaisons étagées impressionnantes."},
            {"name": "Belvédère Tizi n'Zaghfou", "icon": "🔭", "km": 3.8, "desc": "Panorama spectaculaire sur les plissements du Moyen Atlas et les gorges de Guigou."},
            {"name": "Clairière des Bergers d'Aït Zaghfou", "icon": "☕", "km": 5.2, "desc": "Halte ombragée idéale pour le repos, sol herbeux et murets en pierres sèches."},
            {"name": "Bivouac « Clairière Céleste »", "icon": "🌌", "km": 6.8, "desc": "Site de camping en plein ciel abrité du vent. Fenêtre céleste dégagée sur la Voie Lactée (Bortle 2)."},
        ]
    },
    {
        "id": "loop-15k",
        "target_km": 15.0,
        "name": "Boucle 15 km – Circuit des Crêtes & Résurgences d'Oued Guigou",
        "short_name": "Boucle 15 km",
        "color": "#10b981", # Émeraude
        "theme": "Gorges Sauvages & Eaux Vives",
        "difficulty": "Moyen +",
        "control_points": [
            (32.9150, -5.1850), # Début: Zaghfouland
            (32.9280, -5.1950), # Montée vers les crêtes nord
            (32.9420, -5.2040), # Crête panoramique du Guigou
            (32.9510, -5.1920), # Descente vers les Sources d'Oued Guigou
            (32.9460, -5.1780), # Bivouac Plateau des Étoiles
            (32.9320, -5.1680), # Traversée du plateau karstique
            (32.9200, -5.1760), # Sentier pastoral de retour
            (32.9150, -5.1850), # Retour: Zaghfouland
        ],
        "highlights": [
            {"name": "Crête Panoramique du Guigou", "icon": "🔭", "km": 4.1, "desc": "Point de vue plongeant à pic sur les gorges et falaises calcaires du versant nord."},
            {"name": "Sources & Résurgences d'Oued Guigou", "icon": "💧", "km": 7.5, "desc": "Eaux cristallines pérennes jaillissant de la roche calcaire. Ravitaillement et halte de fraîcheur."},
            {"name": "Bivouac « Plateau des Étoiles de Guigou »", "icon": "🌌", "km": 9.2, "desc": "Vaste terrasse herbeuse à 2100m. Horizon à 360° parfait pour le bivouac à ciel ouvert."},
            {"name": "Lapiaz & Arches Karstiques", "icon": "🪨", "km": 12.0, "desc": "Formations géologiques sculptées par le gel et la neige de l'Atlas."},
        ]
    },
    {
        "id": "loop-20k",
        "target_km": 20.0,
        "name": "Boucle 20 km – Tour Panoramique du Djebel Aberdouz",
        "short_name": "Boucle 20 km",
        "color": "#f59e0b", # Ambre
        "theme": "Haute Montagne & Sommets Karstiques",
        "difficulty": "Soutenu",
        "control_points": [
            (32.9150, -5.1850), # Début: Zaghfouland
            (32.9300, -5.2050), # Flanc Ouest de la cédraie
            (32.9480, -5.2210), # Vallée suspendue
            (32.9650, -5.2300), # Ascension Djebel Aberdouz (2074m)
            (32.9600, -5.2120), # Bivouac Le Balcon d'Aberdouz
            (32.9450, -5.1880), # Bergerie traditionnelle d'Azib
            (32.9300, -5.1720), # Descente par le vallon d'Aït Daoud
            (32.9150, -5.1850), # Retour: Zaghfouland
        ],
        "highlights": [
            {"name": "Belvédère du Sommet du Djebel Aberdouz (2074m)", "icon": "🔭", "km": 8.8, "desc": "Sommet emblématique. Vue plongeante sur les forêts de Zaghfouland, la Moulouya et le Djebel Ayachi au sud."},
            {"name": "Bivouac « Balcon Céleste d'Aberdouz »", "icon": "🌌", "km": 10.8, "desc": "Emplacement de camping sous les étoiles abrité du vent dominant. Coucher de soleil grandiose sur l'Atlas."},
            {"name": "Azibs Traditionnels des Bergers", "icon": "🏡", "km": 14.5, "desc": "Bergeries séculaires en pierres sèches et toits de genévriers lors de la transhumance estivale."},
            {"name": "Thalweg aux Chênes Verts Centenaires", "icon": "☕", "km": 17.2, "desc": "Halte ombragée et reposante avant la remontée finale vers Zaghfouland."},
        ]
    },
    {
        "id": "loop-25k",
        "target_km": 25.0,
        "name": "Boucle 25 km – Grande Traversée des Hauts Plateaux & Cédraies Reliques",
        "short_name": "Boucle 25 km",
        "color": "#8b5cf6", # Violet
        "theme": "Grands Espaces Sauvages & Steppes d'Altitude",
        "difficulty": "Exigeant",
        "control_points": [
            (32.9150, -5.1850), # Début: Zaghfouland
            (32.9000, -5.2100), # Contreforts Sud-Ouest
            (32.9120, -5.2350), # Falaises d'Ighrem
            (32.9380, -5.2480), # Gorges d'Aguelmam
            (32.9620, -5.2380), # Plateau de Haute Altitude (2250m)
            (32.9550, -5.2050), # Bivouac « La Haute Tente Céleste »
            (32.9350, -5.1700), # Forêt relique de Zaghfouland Est
            (32.9150, -5.1850), # Retour: Zaghfouland
        ],
        "highlights": [
            {"name": "Gorges & Falaises d'Aguelmam", "icon": "🦅", "km": 7.8, "desc": "Canyon profond entaillant le plateau calcaire, refuge de l'Aigle royal et des faucons pèlerins."},
            {"name": "Belvédère de la Haute Moulouya", "icon": "🔭", "km": 12.5, "desc": "Perspective panoramique infinie s'étendant jusqu'aux confins du désert et du Djebel Ayachi."},
            {"name": "Bivouac « La Haute Tente Céleste »", "icon": "🌌", "km": 15.2, "desc": "Replat herbeux à 2220m. Absence totale de pollution lumineuse, idéal pour contempler les étoiles filantes."},
            {"name": "Boisement de Genévriers Thurifères", "icon": "🌲", "km": 20.0, "desc": "Arbres millénaires aux troncs tourmentés résistant aux hivers les plus rudes de l'Atlas."},
        ]
    },
    {
        "id": "loop-30k",
        "target_km": 30.0,
        "name": "Boucle 30 km – L'Intégrale Épique de Zaghfouland & Points Culminants",
        "short_name": "Boucle 30 km",
        "color": "#ec4899", # Rose Magenta
        "theme": "Défi Haute Randonnée & Dôme Céleste 360°",
        "difficulty": "Expert / Très Soutenu",
        "control_points": [
            (32.9150, -5.1850), # Début: Zaghfouland
            (32.8900, -5.1950), # Descente vers les vergers amont
            (32.8750, -5.1650), # Halte Vallée des Vergers (1680m)
            (32.8950, -5.1380), # Remontée par la crête d'Itzer Sud
            (32.9250, -5.1450), # Haute Crête de Zaghfouland (2388m)
            (32.9550, -5.1750), # Bivouac « Le Nid d'Aigle »
            (32.9680, -5.2150), # Point culminant du massif (2410m)
            (32.9450, -5.2280), # Crête du Zad Amont
            (32.9250, -5.2050), # Descente par la combe des cèdres
            (32.9150, -5.1850), # Retour: Zaghfouland
        ],
        "highlights": [
            {"name": "Vallée des Vergers d'Itzer", "icon": "🍎", "km": 6.8, "desc": "Cultures en terrasses de pommiers de montagne et canaux d'irrigation traditionnels (Seguias)."},
            {"name": "Belvédère de la Crête Sommitale (2388m)", "icon": "🔭", "km": 13.5, "desc": "Ligne de crête grandiose battue par les vents, sensation d'immensité."},
            {"name": "Bivouac « Le Nid d'Aigle de Zaghfouland »", "icon": "🌌", "km": 17.5, "desc": "Spot de bivouac mythique perché à 2280m. Vue spectaculaire sur mer de nuages matinale et nuit étoilée inoubliable."},
            {"name": "Point Culminant du Massif (2410m)", "icon": "📍", "km": 21.0, "desc": "Le sommet du trek. Borne géodésique et vue à 360° embrassant le Moyen Atlas et le Haut Atlas."},
        ]
    }
]

# Generate smooth realistic trail points for each circuit with iterative scaling to match exact target distances
zaghfouland_loops = []

for cfg in circuit_configs:
    target_km = cfg["target_km"]
    base_ctrl = cfg["control_points"]
    
    # Scale control points around start point to match exact target distance
    scale_factor = 1.0
    actual_dist = 0.0
    profile = []
    dplus = 0.0
    dminus = 0.0
    min_e = 0.0
    max_e = 0.0
    
    for iteration in range(6):
        # Scale control points relative to start
        ctrl = []
        for p in base_ctrl:
            d_lat = (p[0] - START_LAT) * scale_factor
            d_lon = (p[1] - START_LON) * scale_factor
            ctrl.append((START_LAT + d_lat, START_LON + d_lon))
            
        raw_pts = []
        target_samples = int(target_km * 10)
        n_segs = len(ctrl) - 1
        samples_per_seg = max(5, target_samples // n_segs)
        
        for seg_idx in range(n_segs):
            p1 = ctrl[seg_idx]
            p2 = ctrl[seg_idx + 1]
            for s in range(samples_per_seg):
                t = s / float(samples_per_seg)
                wiggle = math.sin(t * math.pi) * 0.0016 * math.sin(seg_idx * 1.5 + t * 3.5)
                lat = p1[0] * (1.0 - t) + p2[0] * t + wiggle
                lon = p1[1] * (1.0 - t) + p2[1] * t + wiggle * 0.7
                ele = sample_elevation(lat, lon)
                raw_pts.append({
                    "lat": round(lat, 5),
                    "lon": round(lon, 5),
                    "elevation_m": ele
                })
                
        raw_pts.append({
            "lat": ctrl[-1][0],
            "lon": ctrl[-1][1],
            "elevation_m": sample_elevation(ctrl[-1][0], ctrl[-1][1])
        })
        
        profile = []
        cum_d = 0.0
        dplus = 0.0
        dminus = 0.0
        min_e = raw_pts[0]["elevation_m"]
        max_e = raw_pts[0]["elevation_m"]
        
        profile.append({
            "distance_km": 0.0,
            "lat": raw_pts[0]["lat"],
            "lon": raw_pts[0]["lon"],
            "elevation_m": raw_pts[0]["elevation_m"],
            "u": round((raw_pts[0]["lon"] - lon_min) / (lon_max - lon_min), 5),
            "v": round((lat_max - raw_pts[0]["lat"]) / (lat_max - lat_min), 5)
        })
        
        for k in range(1, len(raw_pts)):
            d_step = haversine(raw_pts[k-1]["lat"], raw_pts[k-1]["lon"], raw_pts[k]["lat"], raw_pts[k]["lon"])
            cum_d += d_step
            diff = raw_pts[k]["elevation_m"] - raw_pts[k-1]["elevation_m"]
            if diff > 0:
                dplus += diff
            else:
                dminus += abs(diff)
            min_e = min(min_e, raw_pts[k]["elevation_m"])
            max_e = max(max_e, raw_pts[k]["elevation_m"])
            profile.append({
                "distance_km": round(cum_d, 2),
                "lat": raw_pts[k]["lat"],
                "lon": raw_pts[k]["lon"],
                "elevation_m": raw_pts[k]["elevation_m"],
                "u": round((raw_pts[k]["lon"] - lon_min) / (lon_max - lon_min), 5),
                "v": round((lat_max - raw_pts[k]["lat"]) / (lat_max - lat_min), 5)
            })
            
        actual_dist = round(cum_d, 1)
        if abs(actual_dist - target_km) <= 0.2:
            break
        scale_factor *= (target_km / actual_dist)
    
    # Time estimation (Munter method)
    t_h = actual_dist / 4.0
    t_v = (dplus / 400.0) + (dminus / 800.0)
    t_tot = max(t_h, t_v) + min(t_h, t_v) / 2.0
    hrs = int(t_tot)
    mins = int(round((t_tot - hrs) * 60))
    if mins == 60:
        hrs += 1
        mins = 0
        
    loop_data = {
        "id": cfg["id"],
        "name": cfg["name"],
        "short_name": cfg["short_name"],
        "target_km": cfg["target_km"],
        "actual_km": actual_dist,
        "d_plus_m": round(dplus),
        "d_minus_m": round(dminus),
        "min_ele_m": round(min_e),
        "max_ele_m": round(max_e),
        "estimated_time": f"{hrs}h{mins:02d}",
        "color": cfg["color"],
        "theme": cfg["theme"],
        "difficulty": cfg["difficulty"],
        "highlights": cfg["highlights"],
        "path": profile
    }
    
    zaghfouland_loops.append(loop_data)
    print(f"Generated {cfg['short_name']}: {actual_dist} km | D+ {round(dplus)}m / D- {round(dminus)}m | Time: {hrs}h{mins:02d}")

# Update web_data.json and web_data.js
web_data["zaghfouland_loops"] = zaghfouland_loops

with open(WEB_DATA_PATH, "w", encoding="utf-8") as f:
    json.dump(web_data, f, ensure_ascii=False)

WEB_DATA_JS_PATH = os.path.join(PROJECT_DIR, "web_data.js")
with open(WEB_DATA_JS_PATH, "w", encoding="utf-8") as f:
    f.write("window.RANDO_DATA = " + json.dumps(web_data, ensure_ascii=False) + ";\n")

print(f"Successfully saved {len(zaghfouland_loops)} loops into web_data.json and web_data.js!")
