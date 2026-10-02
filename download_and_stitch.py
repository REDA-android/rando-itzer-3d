import math
import urllib.request
import io
import os
import json
import time
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

def num2deg(xtile, ytile, zoom):
    n = 2.0 ** zoom
    lon_deg = xtile / n * 360.0 - 180.0
    lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * ytile / n)))
    lat_deg = math.degrees(lat_rad)
    return (lat_deg, lon_deg)

zoom = 12
x_min, x_max = 1987, 1992 # 6 columns
y_min, y_max = 1649, 1652 # 4 rows
cols = x_max - x_min + 1 # 6
rows = y_max - y_min + 1 # 4

top_lat, left_lon = num2deg(x_min, y_min, zoom)
bottom_lat, right_lon = num2deg(x_max + 1, y_max + 1, zoom)

bounds = {
    "zoom": zoom,
    "cols": cols,
    "rows": rows,
    "width": cols * 256,
    "height": rows * 256,
    "x_range": [x_min, x_max],
    "y_range": [y_min, y_max],
    "lat_range": [bottom_lat, top_lat],
    "lon_range": [left_lon, right_lon]
}

print(f"Stitching grid {cols}x{rows} = {cols*rows} tiles ({bounds['width']}x{bounds['height']} px)")
print(f"BBOX: Lat [{bottom_lat:.5f}, {top_lat:.5f}], Lon [{left_lon:.5f}, {right_lon:.5f}]")

def fetch_tile(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.read()
        except Exception as e:
            if attempt == 2:
                print(f"Failed {url}: {e}")
                return None
            time.sleep(0.5)

# 1. Fetch Elevation Tiles (AWS Terrarium)
print("Downloading Elevation Tiles (Terrarium)...")
dem_canvas = Image.new('RGB', (bounds['width'], bounds['height']))

def get_dem_tile(task):
    xi, yi, x, y = task
    url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{zoom}/{x}/{y}.png"
    data = fetch_tile(url)
    return (xi, yi, data)

tasks = []
for yi, y in enumerate(range(y_min, y_max + 1)):
    for xi, x in enumerate(range(x_min, x_max + 1)):
        tasks.append((xi, yi, x, y))

with ThreadPoolExecutor(max_workers=8) as ex:
    dem_results = list(ex.map(get_dem_tile, tasks))

for xi, yi, data in dem_results:
    if data:
        tile_img = Image.open(io.BytesIO(data)).convert('RGB')
        dem_canvas.paste(tile_img, (xi * 256, yi * 256))

dem_canvas.save("dem_terrarium_z12.png")
print("Saved dem_terrarium_z12.png")

# 2. Fetch Satellite Tiles (ESRI World Imagery)
print("Downloading Satellite Tiles (ESRI World Imagery)...")
sat_canvas = Image.new('RGB', (bounds['width'], bounds['height']))

def get_sat_tile(task):
    xi, yi, x, y = task
    url = f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{zoom}/{y}/{x}"
    data = fetch_tile(url)
    return (xi, yi, data)

with ThreadPoolExecutor(max_workers=8) as ex:
    sat_results = list(ex.map(get_sat_tile, tasks))

for xi, yi, data in sat_results:
    if data:
        tile_img = Image.open(io.BytesIO(data)).convert('RGB')
        sat_canvas.paste(tile_img, (xi * 256, yi * 256))

sat_canvas.save("satellite_z12.jpg", quality=85)
print("Saved satellite_z12.jpg")

# 3. Fetch Topo / OSM Tiles (OpenStreetMap)
print("Downloading Topo Tiles (OpenStreetMap)...")
osm_canvas = Image.new('RGB', (bounds['width'], bounds['height']))

def get_osm_tile(task):
    xi, yi, x, y = task
    url = f"https://tile.openstreetmap.org/{zoom}/{x}/{y}.png"
    data = fetch_tile(url)
    return (xi, yi, data)

with ThreadPoolExecutor(max_workers=4) as ex:
    osm_results = list(ex.map(get_osm_tile, tasks))

for xi, yi, data in osm_results:
    if data:
        tile_img = Image.open(io.BytesIO(data)).convert('RGB')
        osm_canvas.paste(tile_img, (xi * 256, yi * 256))

osm_canvas.save("osm_z12.jpg", quality=85)
print("Saved osm_z12.jpg")

# 4. Generate decoded elevation array and 16-bit / normalized heightmap & metadata
print("Processing elevation grid...")
w, h = bounds['width'], bounds['height']
raw_pixels = list(dem_canvas.get_flattened_data())
# raw_pixels is a flat sequence of (r, g, b, r, g, b...) or list
# Let's decode elevation per pixel
# For fast 3D mesh in JS, we can downsample to e.g. 192x128 or 256x170 or 384x256 grid of floats
grid_w = 192
grid_h = 128
resized_dem = dem_canvas.resize((grid_w, grid_h), Image.Resampling.BILINEAR)

grid_elevations = []
min_alt = 99999.0
max_alt = -99999.0

for y in range(grid_h):
    row = []
    for x in range(grid_w):
        r, g, b = resized_dem.getpixel((x, y))
        ele = (r * 256.0 + g + b / 256.0) - 32768.0
        row.append(round(ele, 1))
        if ele < min_alt: min_alt = ele
        if ele > max_alt: max_alt = ele
    grid_elevations.append(row)

bounds["min_elevation"] = round(min_alt, 1)
bounds["max_elevation"] = round(max_alt, 1)
bounds["grid_width"] = grid_w
bounds["grid_height"] = grid_h

with open("terrain_metadata.json", "w", encoding="utf-8") as f:
    json.dump({
        "bounds": bounds,
        "grid": grid_elevations
    }, f)

print(f"Elevation grid generated: {grid_w}x{grid_h}, Min: {min_alt:.1f}m, Max: {max_alt:.1f}m")
