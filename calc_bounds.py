import math

def num2deg(xtile, ytile, zoom):
    n = 2.0 ** zoom
    lon_deg = xtile / n * 360.0 - 180.0
    lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * ytile / n)))
    lat_deg = math.degrees(lat_rad)
    return (lat_deg, lon_deg)

def deg2num(lat_deg, lon_deg, zoom):
    lat_rad = math.radians(lat_deg)
    n = 2.0 ** zoom
    xtile = int((lon_deg + 180.0) / 360.0 * n)
    ytile = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return (xtile, ytile)

min_lon, min_lat = -5.307525, 32.782114
max_lon, max_lat = -4.887808, 33.007947

for z in [11, 12]:
    x_min, y_min = deg2num(max_lat, min_lon, z)
    x_max, y_max = deg2num(min_lat, max_lon, z)
    print(f"Zoom {z}:")
    print(f"  X: {x_min} to {x_max} ({x_max - x_min + 1} tiles)")
    print(f"  Y: {y_min} to {y_max} ({y_max - y_min + 1} tiles)")
    top_lat, left_lon = num2deg(x_min, y_min, z)
    bottom_lat, right_lon = num2deg(x_max + 1, y_max + 1, z)
    print(f"  Coverage: Lat [{bottom_lat:.4f} to {top_lat:.4f}], Lon [{left_lon:.4f} to {right_lon:.4f}]")
