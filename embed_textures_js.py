import base64
import os
import json

textures = {
    "satellite": "satellite_route_z12.jpg",
    "satellite_raw": "satellite_z12.jpg",
    "topomap": "topomap_contours_z12.jpg",
    "slope": "slope_map_z12.jpg",
    "hillshade": "hillshade_z12.jpg",
    "osm": "osm_z12.jpg"
}

data_urls = {}
for key, fname in textures.items():
    if os.path.exists(fname):
        with open(fname, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
            mime = "image/jpeg" if fname.endswith(".jpg") else "image/png"
            data_urls[key] = f"data:{mime};base64,{b64}"
            print(f"Encoded {key} ({fname}): {len(b64)} chars")

with open("textures_data.js", "w", encoding="utf-8") as f:
    f.write("window.RANDO_TEXTURES = " + json.dumps(data_urls) + ";\n")

print("Generated textures_data.js successfully!")
