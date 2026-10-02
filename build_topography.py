import numpy as np
from PIL import Image, ImageDraw, ImageFont
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import json
import math
import os

print("Loading DEM image...")
dem_img = Image.open("dem_terrarium_z12.png").convert("RGB")
w, h = dem_img.size
print(f"DEM dimensions: {w}x{h}")

# Decode elevations into numpy array
rgb = np.array(dem_img, dtype=np.float32)
r = rgb[:, :, 0]
g = rgb[:, :, 1]
b = rgb[:, :, 2]
ele = (r * 256.0 + g + b / 256.0) - 32768.0

min_ele = float(np.min(ele))
max_ele = float(np.max(ele))
mean_ele = float(np.mean(ele))
print(f"Elevation range: {min_ele:.1f}m to {max_ele:.1f}m (mean: {mean_ele:.1f}m)")

# Calculate resolution in meters per pixel
# Around latitude 32.9°:
lat_center_rad = math.radians(32.895)
meters_per_deg_lat = 111320.0
meters_per_deg_lon = 111320.0 * math.cos(lat_center_rad)
# At zoom 12:
deg_per_px_lon = 360.0 / (2**12 * 256.0)
# Approx meters per pixel:
res_x = deg_per_px_lon * meters_per_deg_lon # ~23.5m
res_y = deg_per_px_lon * meters_per_deg_lat # ~28m
print(f"Pixel resolution: ~{res_x:.1f}m x ~{res_y:.1f}m")

# 1. Slope and Hillshade
print("Computing slope and hillshade...")
dy, dx = np.gradient(ele, res_y, res_x)
slope_rad = np.arctan(np.sqrt(dx**2 + dy**2))
slope_deg = np.degrees(slope_rad)
aspect_rad = np.arctan2(-dy, dx)

# Sun position: azimuth 315 deg (NW), altitude 45 deg
sun_azimuth = np.radians(315.0)
sun_altitude = np.radians(45.0)

shaded = (np.sin(sun_altitude) * np.cos(slope_rad) + 
          np.cos(sun_altitude) * np.sin(slope_rad) * np.cos(sun_azimuth - aspect_rad))
shaded = np.clip(shaded, 0, 1)

# Save pure Hillshade
hillshade_uint8 = (shaded * 255.0).astype(np.uint8)
hillshade_img = Image.fromarray(hillshade_uint8)
hillshade_img.save("hillshade_z12.jpg", quality=90)
print("Saved hillshade_z12.jpg")

# 2. Hypsometric Topo Tinting
print("Generating hypsometric tint colormap...")
# Custom mountain colormap: green valley -> khaki -> warm brown -> rocky slate -> summit snow
topo_colors = [
    (0.0,  "#4a7c59"), # Deep valleys ~1100m
    (0.15, "#7fa069"), # Lower plains ~1300m
    (0.3,  "#c9b077"), # Foothills ~1500m
    (0.45, "#d69f65"), # Cedar plateaus ~1700m
    (0.65, "#a66847"), # High plateaus ~2000m
    (0.85, "#725752"), # Rocky ridges ~2250m
    (1.0,  "#ece4db")  # Highest peaks ~2450m
]
cmap_topo = mcolors.LinearSegmentedColormap.from_list("atlas_topo", [(p[0], p[1]) for p in topo_colors])
norm_ele = (ele - min_ele) / (max_ele - min_ele)
topo_rgb = (cmap_topo(norm_ele)[:, :, :3] * 255.0).astype(np.uint8)

# Blend hypsometric tint with hillshade for realistic 3D relief texture
blend = (topo_rgb.astype(np.float32) * (shaded[:, :, None] * 0.75 + 0.35))
blend = np.clip(blend, 0, 255).astype(np.uint8)
topo_relief_img = Image.fromarray(blend)

# 3. Contour Lines (50m standard, 250m index)
print("Drawing contour lines...")
contours_canvas = topo_relief_img.copy()
draw = ImageDraw.Draw(contours_canvas)

# Generate contour lines using matplotlib to get paths
fig, ax = plt.subplots(figsize=(w/100, h/100), dpi=100)
ax.set_position([0, 0, 1, 1])
ax.axis('off')

# Standard contours every 50m
levels_50 = np.arange(math.ceil(min_ele/50)*50, math.floor(max_ele/50)*50 + 50, 50)
levels_250 = np.arange(math.ceil(min_ele/250)*250, math.floor(max_ele/250)*250 + 250, 250)

# Display topo relief as background
ax.imshow(blend)
ax.contour(ele, levels=levels_50, colors='brown', linewidths=0.35, alpha=0.5)
cs250 = ax.contour(ele, levels=levels_250, colors='darkred', linewidths=0.85, alpha=0.75)
ax.clabel(cs250, inline=True, fontsize=6, fmt='%dm')

plt.subplots_adjust(left=0, right=1, top=1, bottom=0)
fig.savefig("topomap_contours_z12.jpg", dpi=100, bbox_inches='tight', pad_inches=0)
plt.close(fig)
print("Saved topomap_contours_z12.jpg")

# 4. Slope Safety Map (for hikers & mountain bikers)
print("Generating slope safety map...")
slope_colors = [
    (0.0,  "#2ecc71"), # 0-10 deg (Easy green)
    (0.2,  "#f1c40f"), # 10-20 deg (Moderate yellow)
    (0.4,  "#e67e22"), # 20-30 deg (Steep orange)
    (0.65, "#e74c3c"), # 30-40 deg (Very steep red)
    (1.0,  "#8e44ad")  # >40 deg (Cliff purple)
]
cmap_slope = mcolors.LinearSegmentedColormap.from_list("hiking_slope", [(p[0], p[1]) for p in slope_colors])
norm_slope = np.clip(slope_deg / 45.0, 0, 1)
slope_rgb = (cmap_slope(norm_slope)[:, :, :3] * 255.0).astype(np.uint8)
slope_blend = (slope_rgb.astype(np.float32) * (shaded[:, :, None] * 0.6 + 0.4))
slope_blend = np.clip(slope_blend, 0, 255).astype(np.uint8)
slope_img = Image.fromarray(slope_blend)
slope_img.save("slope_map_z12.jpg", quality=90)
print("Saved slope_map_z12.jpg")

# 5. Hiking Perimeter & Waypoint Overlay
print("Generating hiking route overlay...")
route_overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
draw = ImageDraw.Draw(route_overlay)

with open("zone_rando.geojson", "r", encoding="utf-8") as f:
    geojson = json.load(f)

coords = geojson["features"][0]["geometry"]["coordinates"][0]

def latlon_to_px(lat, lon):
    n = 2.0 ** 12
    x_world = (lon + 180.0) / 360.0 * n * 256.0
    lat_rad = math.radians(lat)
    y_world = (1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n * 256.0
    return x_world - 1987 * 256.0, y_world - 1649 * 256.0

pixel_poly = [latlon_to_px(c[1], c[0]) for c in coords]

# Fill polygon with transparent cyan
draw.polygon(pixel_poly, fill=(0, 230, 180, 45))

# Outer glowing line
for width, alpha in [(12, 40), (8, 90), (4, 180), (2, 255)]:
    draw.line(pixel_poly, fill=(0, 240, 255, alpha), width=width, joint="curve")

# Draw waypoints
for i, pt in enumerate(pixel_poly[:-1]):
    px, py = pt
    # Outer pulse ring
    draw.ellipse([px-12, py-12, px+12, py+12], fill=(255, 60, 100, 120), outline=(255, 255, 255, 200), width=2)
    # Inner dot
    draw.ellipse([px-5, py-5, px+5, py+5], fill=(255, 255, 255, 255))

route_overlay.save("route_overlay.png")
print("Saved route_overlay.png")

# Also composite onto satellite
sat_img = Image.open("satellite_z12.jpg").convert("RGBA")
sat_with_route = Image.alpha_composite(sat_img, route_overlay).convert("RGB")
sat_with_route.save("satellite_route_z12.jpg", quality=90)
print("Saved satellite_route_z12.jpg")

# 6. Detailed Elevation Profile along the Hiking Perimeter
print("Calculating hiking perimeter elevation profile...")
profile_points = []
cum_dist = 0.0

def haversine(lon1, lat1, lon2, lat2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

for i in range(len(coords) - 1):
    c1 = coords[i]
    c2 = coords[i+1]
    seg_dist = haversine(c1[0], c1[1], c2[0], c2[1])
    # Sample every ~200 meters
    steps = max(10, int(seg_dist / 0.2))
    for s in range(steps):
        frac = s / float(steps)
        lon = c1[0] + frac * (c2[0] - c1[0])
        lat = c1[1] + frac * (c2[1] - c1[1])
        px, py = latlon_to_px(lat, lon)
        px_i = int(np.clip(round(px), 0, w-1))
        py_i = int(np.clip(round(py), 0, h-1))
        altitude = float(ele[py_i, px_i])
        slope_val = float(slope_deg[py_i, px_i])
        step_dist = seg_dist / steps if s > 0 else 0
        cum_dist += step_dist
        profile_points.append({
            "distance_km": round(cum_dist, 2),
            "lat": round(lat, 5),
            "lon": round(lon, 5),
            "elevation_m": round(altitude, 1),
            "slope_deg": round(slope_val, 1),
            "segment": i + 1
        })

# Total D+ and D-
d_plus = 0.0
d_minus = 0.0
for i in range(1, len(profile_points)):
    diff = profile_points[i]["elevation_m"] - profile_points[i-1]["elevation_m"]
    if diff > 0:
        d_plus += diff
    else:
        d_minus += abs(diff)

hiking_stats = {
    "total_distance_km": round(cum_dist, 2),
    "elevation_gain_dplus": round(d_plus),
    "elevation_loss_dminus": round(d_minus),
    "min_elevation_m": round(min(p["elevation_m"] for p in profile_points), 1),
    "max_elevation_m": round(max(p["elevation_m"] for p in profile_points), 1),
    "average_elevation_m": round(sum(p["elevation_m"] for p in profile_points) / len(profile_points), 1),
    "profile": profile_points
}

with open("elevation_profile.json", "w", encoding="utf-8") as f:
    json.dump(hiking_stats, f, indent=2)

print(f"Profile computed: Total {cum_dist:.1f} km, D+ {d_plus:.0f} m, D- {d_minus:.0f} m")

# 7. Curate Local Points of Interest with exact altitudes from DEM
pois = [
    {"name": "Itzer (Centre Ville)", "category": "town", "lat": 32.8791, "lon": -5.0541, "desc": "Commune et centre d'accueil de la randonnée"},
    {"name": "Forêt de Cèdres de Zaghfouland", "category": "forest", "lat": 32.9150, "lon": -5.1850, "desc": "Majestueuse cédraie de l'Atlas et hauts plateaux sauvages"},
    {"name": "Col du Zad (Pass 2178m)", "category": "pass", "lat": 33.0035, "lon": -5.0580, "desc": "Col panoramique sur la RN13 reliant le Moyen Atlas à la Moulouya"},
    {"name": "Djebel Aberdouz", "category": "peak", "lat": 32.9650, "lon": -5.2300, "desc": "Sommet dominant les vallées de l'Oued Guigou"},
    {"name": "Djebel Hayane", "category": "peak", "lat": 32.8150, "lon": -5.2100, "desc": "Crête montagneuse offrant un panorama à 360° sur le Moyen Atlas"},
    {"name": "Sources d'Oued Guigou", "category": "water", "lat": 32.9420, "lon": -5.1120, "desc": "Sources pérennes alimentant le réseau hydrographique du Sebou"},
    {"name": "Plateau d'Arid / Haute Moulouya", "category": "viewpoint", "lat": 32.8250, "lon": -4.9500, "desc": "Vastes steppes pastorales au pied des falaises calcaires"},
    {"name": "Zaïda (Carrefour Moulouya)", "category": "town", "lat": 32.8200, "lon": -4.9100, "desc": "Carrefour commercial et porte sud du Moyen Atlas"},
    {"name": "Point Culminant Projet (2450m)", "category": "peak", "lat": 32.9920, "lon": -5.2280, "desc": "Point le plus élevé de la zone d'étude"},
    {"name": "Vallée des Vergers d'Itzer", "category": "attraction", "lat": 32.8680, "lon": -5.0350, "desc": "Cultures en terrasses de pommiers et noyers"}
]

for p in pois:
    px, py = latlon_to_px(p["lat"], p["lon"])
    px_i = int(np.clip(round(px), 0, w-1))
    py_i = int(np.clip(round(py), 0, h-1))
    p["elevation_m"] = round(float(ele[py_i, px_i]))

with open("points_of_interest.json", "w", encoding="utf-8") as f:
    json.dump(pois, f, indent=2, ensure_ascii=False)

print(f"POIs saved with exact DEM altitudes ({len(pois)} points).")
