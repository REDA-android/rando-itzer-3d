import math
import json

zoom = 12
x_min, y_min = 1987, 1649

def latlon_to_pixel(lat, lon):
    n = 2.0 ** zoom
    x_world = (lon + 180.0) / 360.0 * n * 256.0
    lat_rad = math.radians(lat)
    y_world = (1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n * 256.0
    px = x_world - x_min * 256.0
    py = y_world - y_min * 256.0
    return px, py

with open("zone_rando.geojson", "r", encoding="utf-8") as f:
    geojson = json.load(f)

poly_coords = geojson["features"][0]["geometry"]["coordinates"][0]
print("Image dimensions: 1536 x 1024")
print("Projected polygon vertices in pixel space:")
for i, c in enumerate(poly_coords):
    px, py = latlon_to_pixel(c[1], c[0])
    print(f"Vertex {i}: Lon={c[0]:.4f}, Lat={c[1]:.4f} -> px={px:.1f}, py={py:.1f}")
