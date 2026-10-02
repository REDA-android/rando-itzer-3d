import base64
import json
import math
import os
import unittest
from PIL import Image

PROJECT_DIR = r"C:\Users\Mr Elkrouchni\.gemini\antigravity\scratch\projet-rando-itzer-3d"

class TestRandoTopography3D(unittest.TestCase):

    def test_01_geojson_validity(self):
        geojson_path = os.path.join(PROJECT_DIR, "zone_rando.geojson")
        self.assertTrue(os.path.exists(geojson_path), "zone_rando.geojson does not exist")
        with open(geojson_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data["type"], "FeatureCollection")
        self.assertGreater(len(data["features"]), 0)
        feat = data["features"][0]
        self.assertEqual(feat["geometry"]["type"], "Polygon")
        coords = feat["geometry"]["coordinates"][0]
        self.assertGreaterEqual(len(coords), 4) # At least 3 points + closed ring
        # Check closed ring
        self.assertEqual(coords[0], coords[-1], "Polygon must be closed ring")
        # Check coordinates in Morocco Atlas range
        for c in coords:
            lon, lat, ele = c
            self.assertTrue(-6.0 <= lon <= -4.0, f"Longitude {lon} out of expected range")
            self.assertTrue(32.0 <= lat <= 34.0, f"Latitude {lat} out of expected range")
            self.assertTrue(1000 <= ele <= 3000, f"Elevation {ele} out of expected range")

    def test_02_web_data_structure(self):
        data_path = os.path.join(PROJECT_DIR, "web_data.json")
        self.assertTrue(os.path.exists(data_path), "web_data.json does not exist")
        with open(data_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        self.assertIn("bounds", data)
        self.assertIn("elevation", data)
        self.assertIn("grid", data)
        self.assertIn("pois", data)
        self.assertIn("profile", data)
        self.assertIn("stats", data)

        grid = data["grid"]
        self.assertEqual(len(grid), 128)
        self.assertEqual(len(grid[0]), 192)

        # Check POIs
        self.assertGreaterEqual(len(data["pois"]), 5)
        for p in data["pois"]:
            self.assertIn("name", p)
            self.assertIn("elevation_m", p)
            self.assertGreater(p["elevation_m"], 1000)

        # Check Profile
        profile = data["profile"]
        self.assertGreater(len(profile), 100)
        self.assertEqual(profile[0]["distance_km"], 0.0)
        self.assertGreater(profile[-1]["distance_km"], 90.0) # >90km total distance

    def test_03_texture_images(self):
        textures = [
            "satellite_route_z12.jpg",
            "satellite_z12.jpg",
            "topomap_contours_z12.jpg",
            "slope_map_z12.jpg",
            "hillshade_z12.jpg",
            "osm_z12.jpg"
        ]
        for tex in textures:
            tex_path = os.path.join(PROJECT_DIR, tex)
            self.assertTrue(os.path.exists(tex_path), f"Texture {tex} missing")
            with Image.open(tex_path) as img:
                w, h = img.size
                self.assertGreater(w, 1000, f"{tex} width too small: {w}")
                self.assertGreater(h, 700, f"{tex} height too small: {h}")

    def test_04_html_and_libs(self):
        html_path = os.path.join(PROJECT_DIR, "index.html")
        self.assertTrue(os.path.exists(html_path))
        with open(html_path, "r", encoding="utf-8") as f:
            html = f.read()

        libs = [
            "lib/three.min.js",
            "lib/OrbitControls.js",
            "lib/chart.min.js",
            "lib/maplibre-gl.js",
            "lib/maplibre-gl.css",
            "lib/qrcode.min.js",
            "web_data.js",
            "textures_data.js",
            "style.css",
            "app.js"
        ]
        for lib in libs:
            self.assertIn(lib, html, f"HTML does not reference {lib}")
            full_path = os.path.join(PROJECT_DIR, lib)
            self.assertTrue(os.path.exists(full_path), f"Referenced file {lib} does not exist on disk")

    def test_05_http_server_endpoints(self):
        import http.server
        import socketserver
        import threading
        import urllib.request

        handler = http.server.SimpleHTTPRequestHandler
        server = socketserver.TCPServer(("127.0.0.1", 0), lambda *args: http.server.SimpleHTTPRequestHandler(*args, directory=PROJECT_DIR))
        port = server.server_address[1]
        
        server_thread = threading.Thread(target=server.serve_forever)
        server_thread.daemon = True
        server_thread.start()

        try:
            endpoints = ["/index.html", "/style.css", "/app.js", "/web_data.js", "/zone_rando.geojson"]
            for ep in endpoints:
                url = f"http://127.0.0.1:{port}{ep}"
                with urllib.request.urlopen(url, timeout=3) as resp:
                    self.assertEqual(resp.status, 200, f"Failed GET {ep}")
                    content = resp.read()
                    self.assertGreater(len(content), 0)
        finally:
            server.shutdown()
            server.server_close()

    def test_06_web_data_geojson_present(self):
        data_path = os.path.join(PROJECT_DIR, "web_data.json")
        with open(data_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertIn("geojson", data, "web_data.json must contain full geojson FeatureCollection")
        gj = data["geojson"]
        self.assertEqual(gj.get("type"), "FeatureCollection")
        self.assertGreater(len(gj.get("features", [])), 0)
        feat = gj["features"][0]
        self.assertEqual(feat["geometry"]["type"], "Polygon")
        self.assertGreaterEqual(len(feat["geometry"]["coordinates"][0]), 4)

    def test_07_export_geojson_spec(self):
        # Verify that GeoJSON conforms to RFC 7946
        data_path = os.path.join(PROJECT_DIR, "web_data.json")
        with open(data_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        poly = data["polygon"]
        exported = {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "properties": data.get("stats", {}),
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[ [pt["lon"], pt["lat"], pt["elevation_m"]] for pt in poly ]]
                }
            }]
        }
        self.assertEqual(exported["type"], "FeatureCollection")
        coords = exported["features"][0]["geometry"]["coordinates"][0]
        self.assertEqual(coords[0], coords[-1], "Ring must close")
        self.assertTrue(all(len(c) == 3 for c in coords))

    def test_08_headless_browser_e2e(self):
        import subprocess, time, urllib.request, asyncio
        import websockets

        chrome_candidates = [
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        ]
        browser_exe = next((p for p in chrome_candidates if os.path.exists(p)), None)
        if not browser_exe:
            self.skipTest("No compatible Chrome/Edge browser found for E2E headless test")

        port = 9345
        index_url = "file:///" + os.path.join(PROJECT_DIR, "index.html").replace("\\", "/")
        proc = subprocess.Popen([
            browser_exe, "--headless=new", f"--remote-debugging-port={port}",
            "--window-size=1280,800", index_url
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(2)

        async def run_cdp():
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/json") as r:
                tabs = json.loads(r.read())
                target = next((t for t in tabs if "index.html" in t.get("url", "")), None)
            self.assertIsNotNone(target, "Browser tab for index.html not found")
            ws_url = target["webSocketDebuggerUrl"]

            async with websockets.connect(ws_url) as ws:
                msg_id = 0
                async def send_cmd(method, params=None):
                    nonlocal msg_id
                    msg_id += 1
                    req_id = msg_id
                    await ws.send(json.dumps({"id": req_id, "method": method, "params": params or {}}))
                    while True:
                        raw = await ws.recv()
                        d = json.loads(raw)
                        if d.get("id") == req_id:
                            return d

                await send_cmd("Runtime.enable")
                await send_cmd("Console.enable")

                # Check window.RANDO_DATA loaded
                resp = await send_cmd("Runtime.evaluate", {"expression": "!!window.RANDO_DATA"})
                self.assertTrue(resp.get("result", {}).get("result", {}).get("value", False))

                # Test dynamic KPI initialization
                resp_kpi = await send_cmd("Runtime.evaluate", {
                    "expression": "document.getElementById('kpi-perimeter').textContent",
                    "returnByValue": True
                })
                self.assertIn("105.0", resp_kpi.get("result", {}).get("result", {}).get("value", ""))

                # Test POI 3D click simulation
                resp_poi = await send_cmd("Runtime.evaluate", {
                    "expression": "(() => { document.querySelector('.poi-item').click(); return document.getElementById('probe-poi-card').style.display; })()",
                    "returnByValue": True
                })
                self.assertEqual(resp_poi.get("result", {}).get("result", {}).get("value"), "block")

                # Test 3D measure mode toggle
                await send_cmd("Runtime.evaluate", {
                    "expression": "(() => { const btn = document.getElementById('btn-measure'); btn.click(); return 'ok'; })()"
                })

                # Test switching to MapLibre without error
                resp_map = await send_cmd("Runtime.evaluate", {
                    "expression": "(() => { document.getElementById('btn-switch-engine').click(); return document.getElementById('maplibre-container').style.display; })()",
                    "returnByValue": True
                })
                self.assertEqual(resp_map.get("result", {}).get("result", {}).get("value"), "block")

                # Test Stage Selector J1 click
                resp_stage1 = await send_cmd("Runtime.evaluate", {
                    "expression": "(() => { document.querySelector('.stage-btn[data-stage=\"1\"]').click(); return document.getElementById('dock-dist').textContent; })()",
                    "returnByValue": True
                })
                self.assertIn("26.", resp_stage1.get("result", {}).get("result", {}).get("value", ""))

                # Test Stage Selector All reset
                resp_stage_all = await send_cmd("Runtime.evaluate", {
                    "expression": "(() => { document.querySelector('.stage-btn[data-stage=\"all\"]').click(); return document.getElementById('dock-dist').textContent; })()",
                    "returnByValue": True
                })
                self.assertIn("105.0", resp_stage_all.get("result", {}).get("result", {}).get("value", ""))

                # Test POI Modal Open on click
                resp_poi_modal = await send_cmd("Runtime.evaluate", {
                    "expression": "(() => { document.querySelector('.poi-item').click(); return { display: document.getElementById('poi-modal').style.display, title: document.getElementById('poi-modal-title').textContent, water: document.getElementById('poi-modal-water').textContent }; })()",
                    "returnByValue": True
                })
                poi_val = resp_poi_modal.get("result", {}).get("result", {}).get("value", {})
                self.assertEqual(poi_val.get("display"), "flex")
                self.assertTrue(len(poi_val.get("title", "")) > 0)
                self.assertTrue(len(poi_val.get("water", "")) > 0)

                # Test Close POI Modal
                resp_close_poi = await send_cmd("Runtime.evaluate", {
                    "expression": "(() => { document.getElementById('btn-close-poi-modal').click(); return document.getElementById('poi-modal').style.display; })()",
                    "returnByValue": True
                })
                self.assertEqual(resp_close_poi.get("result", {}).get("result", {}).get("value"), "none")

                # Test Topoguide Modal Open
                resp_topoguide = await send_cmd("Runtime.evaluate", {
                    "expression": "(() => { document.getElementById('btn-topoguide').click(); return { display: document.getElementById('topoguide-modal').style.display, rows: document.querySelectorAll('.topoguide-table tbody tr').length }; })()",
                    "returnByValue": True
                })
                topo_val = resp_topoguide.get("result", {}).get("result", {}).get("value", {})
                self.assertEqual(topo_val.get("display"), "flex")
                self.assertEqual(topo_val.get("rows"), 4)

                # Test Close Topoguide Modal
                resp_close_topo = await send_cmd("Runtime.evaluate", {
                    "expression": "(() => { document.getElementById('btn-close-topoguide').click(); return document.getElementById('topoguide-modal').style.display; })()",
                    "returnByValue": True
                })
                self.assertEqual(resp_close_topo.get("result", {}).get("result", {}).get("value"), "none")

                # Test toggle-fill controls stage ribbons visibility
                resp_toggle_fill = await send_cmd("Runtime.evaluate", {
                    "expression": "(() => { const toggle = document.getElementById('toggle-fill'); toggle.checked = false; toggle.dispatchEvent(new Event('change')); const rg = window.__routeGroup || window.routeGroup; const r1 = rg?.getObjectByName('stageRibbon_1')?.visible; toggle.checked = true; toggle.dispatchEvent(new Event('change')); const r2 = rg?.getObjectByName('stageRibbon_1')?.visible; return { before: r1, after: r2 }; })()",
                    "returnByValue": True
                })
                fill_val = resp_toggle_fill.get("result", {}).get("result", {}).get("value", {})
                self.assertFalse(fill_val.get("before"))
                self.assertTrue(fill_val.get("after"))

                # Test dock time format
                resp_time = await send_cmd("Runtime.evaluate", {
                    "expression": "document.getElementById('dock-time').textContent",
                    "returnByValue": True
                })
                self.assertRegex(resp_time.get("result", {}).get("result", {}).get("value", ""), r"^\d+h\d{2}$")

                # 1. Test GPS Direct toggle & HUD
                resp_gps = await send_cmd("Runtime.evaluate", {
                    "expression": "(() => { document.getElementById('btn-gps').click(); return { display: document.getElementById('gps-hud').style.display, active: document.getElementById('btn-gps').classList.contains('btn-gps-active') }; })()",
                    "returnByValue": True
                })
                gps_val = resp_gps.get("result", {}).get("result", {}).get("value", {})
                self.assertEqual(gps_val.get("display"), "flex")
                self.assertTrue(gps_val.get("active"))

                # 2. Test GPS Demo mode trigger
                resp_gps_demo = await send_cmd("Runtime.evaluate", {
                    "expression": "(() => { document.getElementById('btn-gps-demo').click(); return window.__state.isGpsDemo; })()",
                    "returnByValue": True
                })
                self.assertTrue(resp_gps_demo.get("result", {}).get("result", {}).get("value"))

                # Turn off GPS demo
                await send_cmd("Runtime.evaluate", {
                    "expression": "(() => { document.getElementById('btn-close-gps-hud').click(); })()"
                })

                # 3. Test Weather Modal Open, Tab switch & Close
                resp_weather = await send_cmd("Runtime.evaluate", {
                    "expression": "(() => { document.getElementById('btn-weather').click(); return { display: document.getElementById('weather-modal').style.display, temp: document.getElementById('weather-current-temp').textContent }; })()",
                    "returnByValue": True
                })
                w_val = resp_weather.get("result", {}).get("result", {}).get("value", {})
                self.assertEqual(w_val.get("display"), "flex")
                self.assertIn("°C", w_val.get("temp", ""))

                # Switch to Zad tab
                resp_w_tab = await send_cmd("Runtime.evaluate", {
                    "expression": "(() => { document.querySelector('.weather-tab[data-location=\"zad\"]').click(); return window.__state.activeWeatherLoc; })()",
                    "returnByValue": True
                })
                self.assertEqual(resp_w_tab.get("result", {}).get("result", {}).get("value"), "zad")

                # Close weather modal
                resp_close_w = await send_cmd("Runtime.evaluate", {
                    "expression": "(() => { document.getElementById('btn-close-weather').click(); return document.getElementById('weather-modal').style.display; })()",
                    "returnByValue": True
                })
                self.assertEqual(resp_close_w.get("result", {}).get("result", {}).get("value"), "none")

                # 4. Test Water Calculator Modal & Dry Stage Alert
                resp_water = await send_cmd("Runtime.evaluate", {
                    "expression": "(() => { document.getElementById('btn-water-calc').click(); return { display: document.getElementById('water-modal').style.display, liters: document.getElementById('calc-result-liters').textContent }; })()",
                    "returnByValue": True
                })
                water_val = resp_water.get("result", {}).get("result", {}).get("value", {})
                self.assertEqual(water_val.get("display"), "flex")
                self.assertIn("Litres", water_val.get("liters", ""))

                # Select Stage 3 (Plateau d'Arid) -> Check Dry Stage Alert
                resp_dry_alert = await send_cmd("Runtime.evaluate", {
                    "expression": "(() => { document.querySelector('.calc-stage-btn[data-stage=\"3\"]').click(); return document.getElementById('calc-dry-alert').style.display; })()",
                    "returnByValue": True
                })
                self.assertEqual(resp_dry_alert.get("result", {}).get("result", {}).get("value"), "flex")

                # Close water modal
                await send_cmd("Runtime.evaluate", {
                    "expression": "document.getElementById('btn-close-water-modal').click()"
                })

                # 5. Test 1st-Person Walker View Mode
                resp_walker = await send_cmd("Runtime.evaluate", {
                    "expression": "(() => { document.getElementById('btn-walker-view').click(); return { display: document.getElementById('walker-hud').style.display, active: window.__state.isWalkerActive, km: document.getElementById('walker-km').textContent }; })()",
                    "returnByValue": True
                })
                walker_val = resp_walker.get("result", {}).get("result", {}).get("value", {})
                self.assertEqual(walker_val.get("display"), "flex")
                self.assertTrue(walker_val.get("active"))
                self.assertIn("Km", walker_val.get("km", ""))

                # Exit Walker mode
                resp_exit_walker = await send_cmd("Runtime.evaluate", {
                    "expression": "(() => { document.getElementById('btn-exit-walker').click(); return { display: document.getElementById('walker-hud').style.display, active: window.__state.isWalkerActive }; })()",
                    "returnByValue": True
                })
                exit_w_val = resp_exit_walker.get("result", {}).get("result", {}).get("value", {})
                self.assertEqual(exit_w_val.get("display"), "none")
                self.assertFalse(exit_w_val.get("active"))

                # 6. Verify cedarGroup is empty (no 3D trees)
                resp_cedars = await send_cmd("Runtime.evaluate", {
                    "expression": "(() => { const cg = window.__cedarGroup; return { exists: !!cg, count: cg ? cg.children.length : 0 }; })()",
                    "returnByValue": True
                })
                cedars_val = resp_cedars.get("result", {}).get("result", {}).get("value", {})
                self.assertTrue(cedars_val.get("exists"))
                self.assertEqual(cedars_val.get("count"), 0)

                # 7. Test QR Code Share Modal
                resp_share = await send_cmd("Runtime.evaluate", {
                    "expression": "(() => { document.getElementById('btn-share').click(); return { display: document.getElementById('share-modal').style.display, canvasWidth: document.getElementById('qr-code-canvas').width }; })()",
                    "returnByValue": True
                })
                share_val = resp_share.get("result", {}).get("result", {}).get("value", {})
                self.assertEqual(share_val.get("display"), "flex")
                self.assertGreater(share_val.get("canvasWidth", 0), 100)

                # Close share modal
                resp_close_share = await send_cmd("Runtime.evaluate", {
                    "expression": "(() => { document.getElementById('btn-close-share').click(); return document.getElementById('share-modal').style.display; })()",
                    "returnByValue": True
                })
                self.assertEqual(resp_close_share.get("result", {}).get("result", {}).get("value"), "none")

                # Capture fresh render screenshot
                await send_cmd("Runtime.evaluate", {
                    "expression": "(() => { const s = document.getElementById('splash-screen'); if (s) s.classList.add('hidden'); })()"
                })
                await asyncio.sleep(0.6)
                await send_cmd("Page.enable")
                shot_resp = await send_cmd("Page.captureScreenshot", {"format": "png"})
                shot_data = shot_resp.get("result", {}).get("data")
                if shot_data:
                    with open(os.path.join(PROJECT_DIR, "render_check.png"), "wb") as f_img:
                        f_img.write(base64.b64decode(shot_data))

        try:
            asyncio.run(run_cdp())
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=2)
            except Exception:
                pass

    def test_09_stages_data_structure(self):
        data_path = os.path.join(PROJECT_DIR, "web_data.json")
        with open(data_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.assertIn("stages", data, "web_data.json must contain stages breakdown")
        stages = data["stages"]
        self.assertEqual(len(stages), 4, "Loop must be divided into exactly 4 stages")

        total_stage_dist = 0.0
        for s in stages:
            self.assertIn("id", s)
            self.assertIn("name", s)
            self.assertIn("short_name", s)
            self.assertIn("distance_km", s)
            self.assertIn("d_plus_m", s)
            self.assertIn("d_minus_m", s)
            self.assertIn("estimated_time", s)
            self.assertIn("color", s)
            self.assertIn("bivouac_id", s)
            self.assertIn("water_info", s)
            self.assertGreater(s["distance_km"], 20.0, "Each stage should be around 25-27 km")
            self.assertLess(s["distance_km"], 30.0)
            self.assertGreater(s["d_plus_m"], 100)
            total_stage_dist += s["distance_km"]

        self.assertAlmostEqual(total_stage_dist, 105.0, delta=2.0)

    def test_10_enriched_pois_categories(self):
        data_path = os.path.join(PROJECT_DIR, "web_data.json")
        with open(data_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        pois = data["pois"]
        self.assertGreaterEqual(len(pois), 10)

        expected_cats = {"Sommet", "Bivouac", "Source d'eau", "Flore / Cédraie", "Village / Ravitaillement"}
        found_cats = set(p["category"] for p in pois)
        self.assertTrue(expected_cats.issubset(found_cats), f"Missing categories: {expected_cats - found_cats}")

        # Check Bivouacs 1, 2, 3
        bivouac_names = [p["name"] for p in pois if p["category"] == "Bivouac"]
        self.assertGreaterEqual(len(bivouac_names), 3)
        self.assertTrue(any("Cédraie" in n for n in bivouac_names))
        self.assertTrue(any("Zad" in n or "Guigou" in n for n in bivouac_names))
        self.assertTrue(any("Arid" in n for n in bivouac_names))

        # Check water status and terrain tip fields
        for p in pois:
            self.assertIn("water_status", p)
            self.assertIn("terrain_tip", p)
            self.assertGreater(len(p["water_status"]), 5)
            self.assertGreater(len(p["terrain_tip"]), 5)

    def test_11_stage_endpoints_match_bivouacs(self):
        import math
        data_path = os.path.join(PROJECT_DIR, "web_data.json")
        with open(data_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        profile = data["profile"]
        stages = data["stages"]
        pois = {p["id"]: p for p in data["pois"]}

        # Stage 1 endpoint matches Bivouac 1
        s1 = stages[0]
        biv1 = pois[s1["bivouac_id"]]
        p_end1 = profile[s1["end_index"]]
        d1 = math.hypot((p_end1["lat"] - biv1["lat"]) * 111.0, (p_end1["lon"] - biv1["lon"]) * 111.0 * math.cos(math.radians(biv1["lat"])))
        self.assertLess(d1, 0.05, f"Stage 1 end is {d1:.3f} km from Bivouac 1 (must be < 50m)")

        # Stage 2 endpoint matches Bivouac 2
        s2 = stages[1]
        biv2 = pois[s2["bivouac_id"]]
        p_end2 = profile[s2["end_index"]]
        d2 = math.hypot((p_end2["lat"] - biv2["lat"]) * 111.0, (p_end2["lon"] - biv2["lon"]) * 111.0 * math.cos(math.radians(biv2["lat"])))
        self.assertLess(d2, 0.05, f"Stage 2 end is {d2:.3f} km from Bivouac 2 (must be < 50m)")

        # Stage 3 endpoint matches Bivouac 3
        s3 = stages[2]
        biv3 = pois[s3["bivouac_id"]]
        p_end3 = profile[s3["end_index"]]
        d3 = math.hypot((p_end3["lat"] - biv3["lat"]) * 111.0, (p_end3["lon"] - biv3["lon"]) * 111.0 * math.cos(math.radians(biv3["lat"])))
        self.assertLess(d3, 0.05, f"Stage 3 end is {d3:.3f} km from Bivouac 3 (must be < 50m)")

        # Closed Loop: Stage 4 ends adjacent to Stage 1 start at Itzer
        p_start = profile[0]
        p_end = profile[-1]
        loop_gap = math.hypot((p_end["lat"] - p_start["lat"]) * 111.0, (p_end["lon"] - p_start["lon"]) * 111.0 * math.cos(math.radians(p_start["lat"])))
        self.assertLess(loop_gap, 0.3, f"Loop end-to-start gap {loop_gap:.3f} km exceeds tolerance")

        # Itzer proximity: Stage 1 start is within 6 km of Itzer centre (gateway valley)
        itzer = pois["itzer-centre"]
        itzer_dist = math.hypot((p_start["lat"] - itzer["lat"]) * 111.0, (p_start["lon"] - itzer["lon"]) * 111.0 * math.cos(math.radians(itzer["lat"])))
        self.assertLess(itzer_dist, 6.0, f"Trailhead distance {itzer_dist:.2f} km too far from Itzer")

    def test_12_print_styles_and_topoguide_structure(self):
        css_path = os.path.join(PROJECT_DIR, "style.css")
        with open(css_path, "r", encoding="utf-8") as f:
            css = f.read()

        self.assertIn("@media print", css)
        self.assertIn("@page", css)
        self.assertIn("table-header-group", css)
        self.assertIn("page-break-inside", css)

        html_path = os.path.join(PROJECT_DIR, "index.html")
        with open(html_path, "r", encoding="utf-8") as f:
            html = f.read()

        self.assertIn('id="btn-topoguide"', html)
        self.assertIn('id="topoguide-modal"', html)
        self.assertIn('class="topoguide-header"', html)
        self.assertNotIn('class="topoguide-header no-print"', html, "Topoguide title must print")
        self.assertIn('class="topoguide-actions no-print"', html, "Buttons must not print")

    def test_13_pwa_manifest_and_sw(self):
        # 1. Check manifest.json
        manifest_path = os.path.join(PROJECT_DIR, "manifest.json")
        self.assertTrue(os.path.exists(manifest_path), "manifest.json does not exist")
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        self.assertIn("name", manifest)
        self.assertIn("short_name", manifest)
        self.assertIn("start_url", manifest)
        self.assertEqual(manifest.get("display"), "standalone")
        self.assertEqual(manifest.get("theme_color"), "#0f172a")
        self.assertIn("icons", manifest)
        self.assertGreaterEqual(len(manifest["icons"]), 2)

        # Check icons on disk
        for icon in manifest["icons"]:
            src = icon["src"]
            icon_path = os.path.join(PROJECT_DIR, src)
            self.assertTrue(os.path.exists(icon_path), f"PWA icon {src} missing")
            with Image.open(icon_path) as img:
                w, h = img.size
                if "192" in src:
                    self.assertEqual((w, h), (192, 192))
                elif "512" in src:
                    self.assertEqual((w, h), (512, 512))

        # 2. Check sw.js (Service Worker)
        sw_path = os.path.join(PROJECT_DIR, "sw.js")
        self.assertTrue(os.path.exists(sw_path), "sw.js does not exist")
        with open(sw_path, "r", encoding="utf-8") as f:
            sw_code = f.read()

        self.assertIn("CACHE_NAME", sw_code)
        self.assertIn("addEventListener('install'", sw_code)
        self.assertIn("addEventListener('activate'", sw_code)
        self.assertIn("addEventListener('fetch'", sw_code)
        self.assertIn("index.html", sw_code)
        self.assertIn("web_data.js", sw_code)
        self.assertIn("app.js", sw_code)

        # 3. Check HTML references PWA
        html_path = os.path.join(PROJECT_DIR, "index.html")
        with open(html_path, "r", encoding="utf-8") as f:
            html = f.read()

        self.assertIn('rel="manifest"', html)
        self.assertIn('href="manifest.json"', html)
        self.assertIn('name="theme-color"', html)

    def test_14_mountain_weather_and_fallback(self):
        # Verify weather logic and fallback data in app.js
        app_path = os.path.join(PROJECT_DIR, "app.js")
        with open(app_path, "r", encoding="utf-8") as f:
            app_code = f.read()

        self.assertIn("api.open-meteo.com/v1/forecast", app_code)
        self.assertIn("32.8791", app_code, "Must target Itzer latitude 32.8791")
        self.assertIn("-5.0541", app_code, "Must target Itzer longitude -5.0541")
        self.assertIn("32.9980", app_code, "Must target Col du Zad latitude 32.9980")
        self.assertIn("-5.0740", app_code, "Must target Col du Zad longitude -5.0740")

        self.assertIn("FALLBACK_WEATHER", app_code)
        self.assertIn("Itzer - Vallée", app_code)
        self.assertIn("Col du Zad", app_code)
        self.assertIn("windGusts", app_code)
        self.assertIn("uvIndex", app_code)

        # Verify HTML contains weather UI elements
        html_path = os.path.join(PROJECT_DIR, "index.html")
        with open(html_path, "r", encoding="utf-8") as f:
            html = f.read()

        self.assertIn('id="weather-modal"', html)
        self.assertIn('id="btn-weather"', html)
        self.assertIn('id="weather-current-temp"', html)
        self.assertIn('id="weather-wind"', html)
        self.assertIn('id="forecast-grid"', html)

    def test_15_water_calculator_logic(self):
        # Verify water calculation formulas in app.js and HTML
        app_path = os.path.join(PROJECT_DIR, "app.js")
        with open(app_path, "r", encoding="utf-8") as f:
            app_code = f.read()

        self.assertIn("calculateWater", app_code)
        self.assertIn("walkHours", app_code)
        self.assertIn("tempEffect", app_code)
        self.assertIn("campAllowance", app_code)
        self.assertIn("isDryStage", app_code)
        self.assertIn("Plateau d'Arid", app_code)

        # Verify HTML elements
        html_path = os.path.join(PROJECT_DIR, "index.html")
        with open(html_path, "r", encoding="utf-8") as f:
            html = f.read()

        self.assertIn('id="water-modal"', html)
        self.assertIn('id="btn-water-calc"', html)
        self.assertIn('id="calc-dry-alert"', html)
        self.assertIn('id="calc-result-liters"', html)
        self.assertIn('id="slider-calc-temp"', html)

        # Test formula programmatically
        def py_calc_water(dist_km, d_plus_m, pace_kmh, temp_c, is_dry=False):
            walk_h = (dist_km / pace_kmh) + (d_plus_m / 450)
            base_w = walk_h * 0.50
            temp_eff = max(0, (temp_c - 20) * 0.03 * walk_h)
            camp = 1.5
            total = math.ceil((base_w + temp_eff + camp) * 10) / 10
            return total

        # Stage 1: 26.2km, D+1350m at 26°C with pace 4.2 km/h
        w1 = py_calc_water(26.2, 1350, 4.2, 26)
        self.assertGreaterEqual(w1, 5.0)
        self.assertLessEqual(w1, 8.0)

        # High heat 35°C should require significantly more water
        w_hot = py_calc_water(26.2, 1350, 4.2, 35)
        self.assertGreater(w_hot, w1 + 1.5)

    def test_16_clean_terrain_without_trees(self):
        app_path = os.path.join(PROJECT_DIR, "app.js")
        with open(app_path, "r", encoding="utf-8") as f:
            app_code = f.read()

        self.assertIn("setupCedarForest", app_code)
        self.assertIn("Arbres 3D retirés à la demande de l'utilisateur", app_code)

        html_path = os.path.join(PROJECT_DIR, "index.html")
        with open(html_path, "r", encoding="utf-8") as f:
            html = f.read()

        self.assertNotIn('id="toggle-cedars"', html)
        self.assertIn('id="toggle-fog"', html)

    def test_17_modern_ui_and_arcgis_integration(self):
        html_path = os.path.join(PROJECT_DIR, "index.html")
        with open(html_path, "r", encoding="utf-8") as f:
            html = f.read()

        # 1. Splash screen elements
        self.assertIn('id="splash-screen"', html)
        self.assertIn('id="splash-progress-bar"', html)

        # 2. Toast container
        self.assertIn('id="toast-container"', html)

        # 3. Command palette
        self.assertIn('id="command-palette"', html)
        self.assertIn('id="command-palette-input"', html)

        # 4. Keyboard shortcuts modal
        self.assertIn('id="shortcuts-modal"', html)
        self.assertIn('id="btn-shortcuts"', html)

        # 5. Sidebar 4 tabs
        self.assertIn('data-tab="couches"', html)
        self.assertIn('data-tab="outils"', html)
        self.assertIn('data-tab="poi"', html)
        self.assertIn('data-tab="etapes"', html)

        # 6. ArcGIS integration
        self.assertIn('id="arcgis-container"', html)
        self.assertIn('id="btn-switch-arcgis"', html)

        # 7. JavaScript functions in app.js
        app_path = os.path.join(PROJECT_DIR, "app.js")
        with open(app_path, "r", encoding="utf-8") as f:
            app_code = f.read()

        self.assertIn("function showToast", app_code)
        self.assertIn("function setupCommandPalette", app_code)
        self.assertIn("function switchToArcGIS", app_code)
        self.assertIn("function setupSidebarTabs", app_code)

    def test_18_zaghfouland_loops(self):
        # 1. Verify loops data in web_data.json
        web_data_path = os.path.join(PROJECT_DIR, "web_data.json")
        with open(web_data_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        loops = data.get("zaghfouland_loops", [])
        self.assertEqual(len(loops), 5, "Must have exactly 5 loops (10, 15, 20, 25, 30 km)")

        expected_targets = [10.0, 15.0, 20.0, 25.0, 30.0]
        for idx, loop in enumerate(loops):
            self.assertEqual(loop["target_km"], expected_targets[idx])
            # Actual distance should be within +/- 0.5 km of target
            self.assertAlmostEqual(loop["actual_km"], expected_targets[idx], delta=0.5)
            # Starts and ends at Zaghfouland (~32.915, -5.185)
            p_start = loop["path"][0]
            p_end = loop["path"][-1]
            self.assertAlmostEqual(p_start["lat"], 32.915, delta=0.01)
            self.assertAlmostEqual(p_start["lon"], -5.185, delta=0.01)
            self.assertAlmostEqual(p_end["lat"], 32.915, delta=0.01)
            self.assertAlmostEqual(p_end["lon"], -5.185, delta=0.01)
            # Must have highlights with icons for rest, panoramas, and stargazing camps
            icons = [h["icon"] for h in loop.get("highlights", [])]
            self.assertIn("🌌", icons, "Must include stargazing celestial camp")
            self.assertIn("🔭", icons, "Must include panoramic viewpoint")

        # 2. Verify UI elements in index.html
        html_path = os.path.join(PROJECT_DIR, "index.html")
        with open(html_path, "r", encoding="utf-8") as f:
            html = f.read()

        self.assertIn('data-tab="boucles"', html)
        self.assertIn('id="tab-boucles"', html)
        self.assertIn('id="sidebar-loops"', html)
        self.assertIn('id="btn-boucles-zaghfouland"', html)

        # 3. Verify JS functions in app.js
        app_path = os.path.join(PROJECT_DIR, "app.js")
        with open(app_path, "r", encoding="utf-8") as f:
            app_code = f.read()

        self.assertIn("setupZaghfoulandLoops", app_code)
        self.assertIn("setZaghfoulandLoop", app_code)
        self.assertIn("updateElevationChartWithLoop", app_code)

    def test_19_four_pillars_enhancements(self):
        # Read files
        html_path = os.path.join(PROJECT_DIR, "index.html")
        with open(html_path, "r", encoding="utf-8") as f:
            html = f.read()

        css_path = os.path.join(PROJECT_DIR, "style.css")
        with open(css_path, "r", encoding="utf-8") as f:
            css = f.read()

        app_path = os.path.join(PROJECT_DIR, "app.js")
        with open(app_path, "r", encoding="utf-8") as f:
            app_code = f.read()

        # Pillar 1: GPX 1.1 Export & Celestial Dome
        self.assertIn("downloadLoopGPX", app_code)
        self.assertIn("loop-action-btn-gpx", app_code)
        self.assertIn("loop-action-btn-gpx", css)
        self.assertIn("setupCelestialDome", app_code)
        self.assertIn("toggleBivouacCeleste", app_code)
        self.assertIn('id="btn-bivouac-celeste"', html)

        # Verify GPX generation logic with valid XML parsing
        import xml.etree.ElementTree as ET
        import xml.sax.saxutils as saxutils
        web_data_path = os.path.join(PROJECT_DIR, "web_data.json")
        with open(web_data_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        loop0 = data["zaghfouland_loops"][0]
        escaped_name = saxutils.escape(loop0['name'])
        # Simulate GPX construction matching app.js escapeXml
        gpx_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Rando Itzer 3D" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>{escaped_name}</name></metadata>
  <trk><name>{escaped_name}</name><trkseg>
"""
        for pt in loop0["path"]:
            gpx_xml += f'    <trkpt lat="{pt["lat"]}" lon="{pt["lon"]}"><ele>{pt["elevation_m"]}</ele></trkpt>\n'
        gpx_xml += "  </trkseg></trk></gpx>"
        root = ET.fromstring(gpx_xml)
        self.assertEqual(root.tag, "{http://www.topografix.com/GPX/1/1}gpx")

        # Pillar 2: Visual 3D Rendering (Soft Shadows & 24h Sun)
        self.assertIn("PCFSoftShadowMap", app_code)
        self.assertIn("isNight", app_code)
        self.assertIn('min="0" max="24"', html)

        # Pillar 3: SIG Layers & Water Source Beacons & POI Quick Filters
        self.assertIn("poi-quick-filters", html)
        self.assertIn("poi-filter-chip", html)
        self.assertIn("poi-filter-chip", css)
        self.assertIn("setupWaterSourceBeacons", app_code)
        self.assertIn("updateWaterBeacons", app_code)

        # Pillar 4: Zen / Fullscreen Mode & Loop Drone Follow Flight
        self.assertIn('id="btn-fullscreen"', html)
        self.assertIn('id="zen-exit-btn"', html)
        self.assertIn('id="drone-loop-hud"', html)
        self.assertIn("toggleFullscreenMode", app_code)
        self.assertIn("startLoopDroneFly", app_code)
        self.assertIn("stopLoopDroneFly", app_code)
        self.assertIn("updateLoopDroneFlight", app_code)
        self.assertIn("zen-mode", css)
        self.assertIn("drone-loop-hud", css)

if __name__ == '__main__':
    unittest.main()



