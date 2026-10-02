/**
 * Application Carte Topographique 3D Interactive
 * Projet Rando Zaghfouland - ITZER (Moyen Atlas, Maroc)
 */

(function () {
  'use strict';

  // Global state
  const state = {
    data: window.RANDO_DATA || null,
    textures: window.RANDO_TEXTURES || {},
    currentLayer: 'satellite',
    exaggeration: 2.0,
    sunHour: 14.0,
    droneSpeed: 1.0,
    isDroneTourActive: false,
    droneAngle: 0,
    isMeasuring: false,
    measurePoints: [],
    measureLine: null,
    measureMarkers: [],
    activeEngine: 'three', // 'three' or 'maplibre'
    activeStage: 'all', // 'all', 1, 2, 3, 4
    currentSubProfile: null,
    selectedPOI: null,
    maplibreMap: null,
    hikerMarker: null,
    hoverMarker: null,
    chart: null,
    // 4 Axes State Additions
    isGpsActive: false,
    isGpsFollow: true,
    isGpsDemo: false,
    gpsDemoIndex: 0,
    gpsDemoTimer: null,
    watchId: null,
    cedarsVisible: true,
    fogVisible: true,
    isWalkerActive: false,
    walkerIndex: 0,
    isWalkerAuto: false,
    savedOrbitPos: null,
    savedOrbitTarget: null,
    weatherData: null,
    activeWeatherLoc: 'itzer',
    waterCalcStage: 1,
    waterCalcTemp: 26,
    waterCalcPace: 4.2,
    waterCalcPack: 'medium'
  };

  // Dimensions & Scale constants
  const TERRAIN_W = 300.0;
  const TERRAIN_H = 200.0;
  const ELEVATION_BASE = state.data ? state.data.elevation.min : 1000.0;
  // World units per meter elevation: 1 unit ~ 164.1m on ground
  const ELEVATION_SCALE = 0.015;

  // DOM Elements
  const threeCanvas = document.getElementById('three-canvas');
  const maplibreContainer = document.getElementById('maplibre-container');
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const probeHud = document.getElementById('probe-hud');
  const probeEle = document.getElementById('probe-ele');
  const probeSlope = document.getElementById('probe-slope');
  const probeGps = document.getElementById('probe-gps');
  const probePoiCard = document.getElementById('probe-poi-card');
  const probePoiText = document.getElementById('probe-poi-text');
  const compassNeedle = document.getElementById('compass-needle');
  const compassBtn = document.getElementById('compass-btn');
  const profileDock = document.getElementById('profile-dock');
  const profileCanvas = document.getElementById('profile-canvas');
  const btnToggleDock = document.getElementById('btn-toggle-dock');
  const btnDroneTour = document.getElementById('btn-drone-tour');
  const btnMeasure = document.getElementById('btn-measure');
  const btnMeasureReset = document.getElementById('btn-measure-reset');
  const measureHud = document.getElementById('measure-hud');
  const measureResult = document.getElementById('measure-result');
  const btnScreenshot = document.getElementById('btn-screenshot');
  const btnExportGeoJSON = document.getElementById('btn-export-geojson');
  const btnSwitchEngine = document.getElementById('btn-switch-engine');

  // Sliders
  const sliderExaggeration = document.getElementById('slider-exaggeration');
  const valExaggeration = document.getElementById('val-exaggeration');
  const sliderSun = document.getElementById('slider-sun');
  const valSun = document.getElementById('val-sun');
  const sliderSpeed = document.getElementById('slider-speed');
  const valSpeed = document.getElementById('val-speed');

  // Toggles
  const toggleRoute = document.getElementById('toggle-route');
  const toggleFill = document.getElementById('toggle-fill');
  const togglePois = document.getElementById('toggle-pois');
  const toggleDock = document.getElementById('toggle-dock');

  // Three.js variables
  let scene, camera, renderer, controls;
  let terrainMesh, terrainGeo, terrainMat, skirtMesh;
  let dirLight, hemiLight;
  let routeGroup, poiGroup;
  let raycaster, mouseVec;
  let loadedTextures = {};
  let animationFrameId;

  // Initialize Application
  function init() {
    if (!state.data) {
      console.error("Données topographiques RANDO_DATA introuvables!");
      showToast("Erreur: Les données topographiques (web_data.js) n'ont pas pu être chargées.", 'error', 6000);
      return;
    }

    setupThreeScene();
    buildTerrain();
    buildPerimeter3D();
    buildPOIMarkers();
    setupGPS();
    setupCedarForest();
    setupWalkerMode();
    setupWeather();
    setupWaterCalculator();
    setupShareQRCode();
    setupElevationProfileChart();
    populateSidebarStages();
    populatePOIList();
    setupTopoguide();
    setupEventListeners();
    updateKPIs();
    registerServiceWorker();

    // Expose references for tests and debugging
    window.__cedarGroup = cedarGroup;
    window.__gpsGroup = gpsGroup;
    window.__toggleGPS = toggleGPS;
    window.__toggleGpsDemo = toggleGpsDemo;
    window.__toggleWalkerMode = toggleWalkerMode;
    window.__calculateWater = calculateWater;
    window.__fetchOpenMeteo = fetchOpenMeteo;

    // Start render loop
    animate();

    console.log("Carte Topographique 3D initialisée avec succès (4 axes prioritaires actifs).");
  }

  // 1. Setup Three.js Scene, Camera, Lighting & Controls
  function setupThreeScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.FogExp2(0x0f172a, 0.0018);

    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(45, aspect, 0.5, 4000);
    // Position camera looking south-east at the Middle Atlas mountains
    camera.position.set(0, 180, 240);

    renderer = new THREE.WebGLRenderer({
      canvas: threeCanvas,
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.05; // Prevent camera from going under ground
    controls.minDistance = 30;
    controls.maxDistance = 650;
    controls.target.set(0, 10, 0);

    // Dynamic Lighting
    hemiLight = new THREE.HemisphereLight(0xddeeff, 0x1a2436, 0.65);
    scene.add(hemiLight);

    dirLight = new THREE.DirectionalLight(0xfff8e7, 1.25);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 700;
    const d = 220;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    updateSunPosition(state.sunHour);

    // Groups
    routeGroup = new THREE.Group();
    poiGroup = new THREE.Group();
    scene.add(routeGroup);
    scene.add(poiGroup);
    window.__routeGroup = routeGroup;
    window.__state = state;
    window.routeGroup = routeGroup;
    window.poiGroup = poiGroup;

    // Raycaster for HUD Probe
    raycaster = new THREE.Raycaster();
    mouseVec = new THREE.Vector2();

    // 3D Hover Marker (probe ring)
    const hoverGeo = new THREE.RingGeometry(1.2, 1.8, 32);
    hoverGeo.rotateX(-Math.PI / 2);
    const hoverMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    state.hoverMarker = new THREE.Mesh(hoverGeo, hoverMat);
    state.hoverMarker.visible = false;
    scene.add(state.hoverMarker);

    // 3D Hiker Marker (synced with profile chart)
    const hikerGeo = new THREE.SphereGeometry(2.2, 16, 16);
    const hikerMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xff0044,
      emissiveIntensity: 0.6,
      roughness: 0.3
    });
    state.hikerMarker = new THREE.Mesh(hikerGeo, hikerMat);
    state.hikerMarker.visible = false;
    scene.add(state.hikerMarker);
  }

  // Calculate Sun & Moon Position from Hour (0h to 24h)
  function updateSunPosition(hour) {
    const isNight = hour < 6.5 || hour > 19.5;
    const isTwilight = (hour >= 6.5 && hour < 8.5) || (hour >= 17.5 && hour <= 19.5);

    // Celestial angle
    const angle = ((hour - 6) / 12.0) * Math.PI; // Daytime arc
    const altitude = Math.sin(angle) * 75;
    const azimuth = Math.PI * 0.75 - angle * 0.8;

    const radius = 320;
    const x = radius * Math.cos(azimuth) * Math.cos(THREE.MathUtils.degToRad(Math.abs(altitude)));
    const y = Math.max(25, radius * Math.sin(THREE.MathUtils.degToRad(Math.abs(altitude))));
    const z = radius * Math.sin(azimuth) * Math.cos(THREE.MathUtils.degToRad(Math.abs(altitude)));

    dirLight.position.set(x, y, z);
    dirLight.target.position.set(0, 0, 0);

    if (isNight) {
      // Midnight / Starry Bivouac mode
      dirLight.color.setHex(0x60a5fa); // Silvery moonlight
      dirLight.intensity = 0.35;
      if (hemiLight) {
        hemiLight.color.setHex(0x1e1b4b);
        hemiLight.groundColor.setHex(0x020617);
        hemiLight.intensity = 0.25;
      }
      renderer.toneMappingExposure = 0.65;
      if (scene) {
        scene.background.setHex(0x020617);
        if (scene.fog) scene.fog.color.setHex(0x020617);
      }
      if (window.__celestialDome) window.__celestialDome.visible = true;
    } else if (isTwilight) {
      // Golden hour dawn/dusk
      dirLight.color.setHex(0xf97316); // Warm golden sunset
      dirLight.intensity = 1.0;
      if (hemiLight) {
        hemiLight.color.setHex(0xfef08a);
        hemiLight.groundColor.setHex(0x292524);
        hemiLight.intensity = 0.55;
      }
      renderer.toneMappingExposure = 0.95;
      if (scene) {
        scene.background.setHex(0x1c1917);
        if (scene.fog) scene.fog.color.setHex(0x292524);
      }
      if (window.__celestialDome) window.__celestialDome.visible = (hour < 7.0 || hour > 19.0);
    } else {
      // Crisp mountain daylight
      dirLight.color.setHex(0xfff8e7);
      dirLight.intensity = 1.25;
      if (hemiLight) {
        hemiLight.color.setHex(0xddeeff);
        hemiLight.groundColor.setHex(0x1a2436);
        hemiLight.intensity = 0.65;
      }
      renderer.toneMappingExposure = 1.2;
      if (scene) {
        scene.background.setHex(0x0f172a);
        if (scene.fog) scene.fog.color.setHex(0x0f172a);
      }
      if (window.__celestialDome) window.__celestialDome.visible = false;
    }

    // Atmospheric altitude fog matching time-of-day
    if (typeof updateFogState === 'function') {
      updateFogState(hour);
    }
  }

  // 2. Build 3D Terrain Mesh from Elevation Grid
  function buildTerrain() {
    const grid = state.data.grid;
    const gh = grid.length;
    const gw = grid[0].length;

    // Plane geometry with vertices matching the grid
    terrainGeo = new THREE.PlaneGeometry(TERRAIN_W, TERRAIN_H, gw - 1, gh - 1);
    terrainGeo.rotateX(-Math.PI / 2);

    updateTerrainHeights();

    // Default Texture Material
    const texture = getTexture('satellite');
    terrainMat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.85,
      metalness: 0.1,
      flatShading: false
    });

    terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = true;
    scene.add(terrainMesh);

    // Build 3D Skirt / Base Pedestal
    buildTerrainSkirt(gw, gh);
  }

  // Update vertex heights according to exaggeration slider
  function updateTerrainHeights() {
    const grid = state.data.grid;
    const gh = grid.length;
    const gw = grid[0].length;
    const pos = terrainGeo.attributes.position;

    let idx = 0;
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const ele = grid[j][i];
        const h = (ele - ELEVATION_BASE) * ELEVATION_SCALE * state.exaggeration;
        pos.setY(idx, h);
        idx++;
      }
    }
    pos.needsUpdate = true;
    terrainGeo.computeVertexNormals();

    // Also update perimeter line and POI marker heights
    if (routeGroup) updatePerimeterHeights();
    if (poiGroup) updatePOIHeights();
    if (skirtMesh) updateSkirtHeights(gw, gh);
    updateMeasureHeights();
    if (typeof updateCedarHeights === 'function') updateCedarHeights();
    if (typeof updateGpsMarkerHeight === 'function') updateGpsMarkerHeight();
    if (typeof updateLoopHeights === 'function') updateLoopHeights();
    if (typeof updateWaterBeaconsHeights === 'function') updateWaterBeaconsHeights();
  }

  // Build Skirt around the terrain for architectural model effect
  function buildTerrainSkirt(gw, gh) {
    const skirtGeo = new THREE.BufferGeometry();
    const skirtPositions = [];
    const skirtIndices = [];
    const baseDepth = -25.0; // bottom of pedestal

    // Edge vertices
    const edges = [];
    // North edge (j = 0)
    for (let i = 0; i < gw; i++) edges.push({ i, j: 0 });
    // East edge (i = gw - 1)
    for (let j = 1; j < gh; j++) edges.push({ i: gw - 1, j });
    // South edge (j = gh - 1)
    for (let i = gw - 2; i >= 0; i--) edges.push({ i, j: gh - 1 });
    // West edge (i = 0)
    for (let j = gh - 2; j > 0; j--) edges.push({ i: 0, j });

    const totalEdge = edges.length;
    for (let k = 0; k < totalEdge; k++) {
      const e = edges[k];
      const x = (e.i / (gw - 1) - 0.5) * TERRAIN_W;
      const z = (e.j / (gh - 1) - 0.5) * TERRAIN_H;
      const ele = state.data.grid[e.j][e.i];
      const yTop = (ele - ELEVATION_BASE) * ELEVATION_SCALE * state.exaggeration;

      // Top vertex
      skirtPositions.push(x, yTop, z);
      // Bottom vertex
      skirtPositions.push(x, baseDepth, z);

      const next = (k + 1) % totalEdge;
      const p1 = k * 2;
      const p2 = k * 2 + 1;
      const p3 = next * 2;
      const p4 = next * 2 + 1;

      skirtIndices.push(p1, p2, p3);
      skirtIndices.push(p3, p2, p4);
    }

    skirtGeo.setAttribute('position', new THREE.Float32BufferAttribute(skirtPositions, 3));
    skirtGeo.setIndex(skirtIndices);
    skirtGeo.computeVertexNormals();

    const skirtMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.9,
      metalness: 0.2
    });
    skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
    scene.add(skirtMesh);
  }

  function updateSkirtHeights(gw, gh) {
    const pos = skirtMesh.geometry.attributes.position;
    const edges = [];
    for (let i = 0; i < gw; i++) edges.push({ i, j: 0 });
    for (let j = 1; j < gh; j++) edges.push({ i: gw - 1, j });
    for (let i = gw - 2; i >= 0; i--) edges.push({ i, j: gh - 1 });
    for (let j = gh - 2; j > 0; j--) edges.push({ i: 0, j });

    for (let k = 0; k < edges.length; k++) {
      const e = edges[k];
      const ele = state.data.grid[e.j][e.i];
      const yTop = (ele - ELEVATION_BASE) * ELEVATION_SCALE * state.exaggeration;
      pos.setY(k * 2, yTop);
    }
    pos.needsUpdate = true;
    skirtMesh.geometry.computeVertexNormals();
  }

  // Texture loader helper with base64 / URL fallback
  function getTexture(layerKey) {
    if (loadedTextures[layerKey]) return loadedTextures[layerKey];

    const loader = new THREE.TextureLoader();
    let src = state.textures[layerKey];
    if (!src) {
      if (layerKey === 'satellite') src = 'satellite_route_z12.jpg';
      else if (layerKey === 'satellite_raw') src = state.textures['satellite_raw'] || 'satellite_z12.jpg';
      else if (layerKey === 'topomap') src = 'topomap_contours_z12.jpg';
      else if (layerKey === 'slope') src = 'slope_map_z12.jpg';
      else if (layerKey === 'hillshade') src = 'hillshade_z12.jpg';
      else if (layerKey === 'osm') src = 'osm_z12.jpg';
    }

    const tex = loader.load(src);
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    loadedTextures[layerKey] = tex;
    return tex;
  }

  // Switch Texture Layer
  function setLayer(layerKey) {
    state.currentLayer = layerKey;
    document.querySelectorAll('.layer-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.layer === layerKey);
    });

    const layerNames = {
      satellite: 'Satellite Réel',
      topomap: 'Courbes 50m & Topo',
      slope: 'Carte des Pentes',
      hillshade: 'Relief Ombré',
      osm: 'Réseau & Pistes',
      wireframe: 'Fil de Fer 3D'
    };
    document.getElementById('current-layer-name').textContent = layerNames[layerKey] || layerKey;

    if (layerKey === 'wireframe') {
      terrainMat.wireframe = true;
      terrainMat.map = null;
      terrainMat.color.setHex(0x334155); // Sleek slate wireframe so routes/POIs pop with contrast
      terrainMat.needsUpdate = true;
    } else {
      terrainMat.wireframe = false;
      terrainMat.color.setHex(0xffffff);
      const isRouteVisible = toggleRoute ? toggleRoute.checked : true;
      const effectiveKey = (layerKey === 'satellite' && !isRouteVisible && state.textures['satellite_raw']) ? 'satellite_raw' : layerKey;
      terrainMat.map = getTexture(effectiveKey);
      terrainMat.needsUpdate = true;
    }
  }

  // 3. Build 3D Hiking Perimeter (Ribbon & Boundary Line per Stage)
  function buildPerimeter3D() {
    routeGroup.clear();

    const profile = state.data.profile;
    const stages = state.data.stages || [];

    // Build stage lines and ribbons
    stages.forEach(stg => {
      const sPts = profile.slice(stg.start_index, stg.end_index + 1);
      const points = [];
      const ribbonGeo = new THREE.BufferGeometry();
      const ribbonPos = [];
      const ribbonIndices = [];

      for (let i = 0; i < sPts.length; i++) {
        const p = sPts[i];
        const y = (p.elevation_m - ELEVATION_BASE) * ELEVATION_SCALE * state.exaggeration + 0.8;
        points.push(new THREE.Vector3(p.x3d, y, p.z3d));

        // Ribbon fence: Top and bottom points
        ribbonPos.push(p.x3d, y + 2.5, p.z3d);
        ribbonPos.push(p.x3d, y, p.z3d);

        if (i > 0) {
          const prev = (i - 1) * 2;
          const curr = i * 2;
          ribbonIndices.push(prev, prev + 1, curr);
          ribbonIndices.push(curr, prev + 1, curr + 1);
        }
      }

      const colorHex = parseInt(stg.color.replace('#', '0x'));
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineBasicMaterial({
        color: colorHex,
        linewidth: 3,
        transparent: true,
        opacity: 0.95
      });
      const line = new THREE.Line(lineGeo, lineMat);
      line.name = `stageLine_${stg.id}`;
      line.userData = { stageId: stg.id, color: colorHex };
      routeGroup.add(line);

      ribbonGeo.setAttribute('position', new THREE.Float32BufferAttribute(ribbonPos, 3));
      ribbonGeo.setIndex(ribbonIndices);
      ribbonGeo.computeVertexNormals();

      const ribbonMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide
      });
      const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
      ribbon.name = `stageRibbon_${stg.id}`;
      ribbon.userData = { stageId: stg.id, color: colorHex };
      routeGroup.add(ribbon);
    });

    // Provide perimeterLine and perimeterRibbon aliases for backward compatibility with existing toggles
    const allPoints = profile.map(p => {
      const y = (p.elevation_m - ELEVATION_BASE) * ELEVATION_SCALE * state.exaggeration + 0.8;
      return new THREE.Vector3(p.x3d, y, p.z3d);
    });
    const fullLineGeo = new THREE.BufferGeometry().setFromPoints(allPoints);
    const fullLine = new THREE.Line(fullLineGeo, new THREE.LineBasicMaterial({ visible: false }));
    fullLine.name = 'perimeterLine';
    routeGroup.add(fullLine);

    const fullRibbon = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ visible: false }));
    fullRibbon.name = 'perimeterRibbon';
    routeGroup.add(fullRibbon);

    // Waypoint Milestone Pin Markers at Stage Transitions
    const profilePts = state.data.profile;
    stages.forEach((stg, sIdx) => {
      const p = profilePts[stg.start_index];
      const pinGeo = new THREE.CylinderGeometry(0.8, 0.2, 5, 16);
      pinGeo.translate(0, 2.5, 0);
      const isStart = (sIdx === 0);
      const pinMat = new THREE.MeshStandardMaterial({
        color: isStart ? 0x10b981 : 0x06b6d4,
        emissive: isStart ? 0x059669 : 0x0891b2,
        emissiveIntensity: 0.5
      });
      const pin = new THREE.Mesh(pinGeo, pinMat);
      const y = (p.elevation_m - ELEVATION_BASE) * ELEVATION_SCALE * state.exaggeration;
      pin.position.set(p.x3d, y, p.z3d);
      pin.name = `waypoint_${sIdx}`;
      routeGroup.add(pin);
    });
  }

  function updatePerimeterHeights() {
    const profile = state.data.profile;
    const stages = state.data.stages || [];

    stages.forEach(stg => {
      const line = routeGroup.getObjectByName(`stageLine_${stg.id}`);
      const ribbon = routeGroup.getObjectByName(`stageRibbon_${stg.id}`);
      if (!line || !ribbon) return;

      const sPts = profile.slice(stg.start_index, stg.end_index + 1);
      const linePos = line.geometry.attributes.position;
      const ribPos = ribbon.geometry.attributes.position;

      for (let i = 0; i < sPts.length; i++) {
        const p = sPts[i];
        const y = (p.elevation_m - ELEVATION_BASE) * ELEVATION_SCALE * state.exaggeration + 0.8;
        linePos.setY(i, y);

        ribPos.setY(i * 2, y + 2.5);
        ribPos.setY(i * 2 + 1, y);
      }
      linePos.needsUpdate = true;
      ribPos.needsUpdate = true;
    });

    // Update waypoints
    stages.forEach((stg, sIdx) => {
      const pin = routeGroup.getObjectByName(`waypoint_${sIdx}`);
      if (pin) {
        const p = profile[stg.start_index];
        const y = (p.elevation_m - ELEVATION_BASE) * ELEVATION_SCALE * state.exaggeration;
        pin.position.y = y;
      }
    });
  }

  // Stage Switcher Function: highlights active stage in 3D & updates bottom elevation profile
  function setStage(stageId) {
    state.activeStage = stageId;

    if (state.hikerMarker) {
      state.hikerMarker.visible = false;
    }

    // 1. Update Stage Buttons
    document.querySelectorAll('.stage-btn').forEach(btn => {
      const isTarget = (stageId === 'all' && btn.dataset.stage === 'all') ||
                       (btn.dataset.stage === String(stageId));
      btn.classList.toggle('active', isTarget);
    });

    // 2. Update Sidebar Stage Cards
    document.querySelectorAll('.sidebar-stage-card').forEach(card => {
      const isTarget = card.dataset.stage === String(stageId);
      card.classList.toggle('active', isTarget);
    });

    // 3. Highlight Stage in 3D Scene
    const stages = state.data.stages || [];
    const isFillVisible = toggleFill ? toggleFill.checked : true;
    stages.forEach(stg => {
      const line = routeGroup.getObjectByName(`stageLine_${stg.id}`);
      const rib = routeGroup.getObjectByName(`stageRibbon_${stg.id}`);
      if (!line || !rib) return;

      if (stageId === 'all') {
        rib.material.opacity = 0.35;
        line.material.opacity = 0.95;
      } else if (stg.id === parseInt(stageId)) {
        rib.material.opacity = 0.70;
        line.material.opacity = 1.0;
      } else {
        rib.material.opacity = 0.12;
        line.material.opacity = 0.25;
      }
      rib.visible = isFillVisible;
      rib.material.needsUpdate = true;
      line.material.needsUpdate = true;
    });

    // 4. Update Bottom Dock Stats Chips & Title
    const dockTitleText = document.getElementById('dock-title-text');
    const dockDist = document.getElementById('dock-dist');
    const dockDplus = document.getElementById('dock-dplus');
    const dockDminus = document.getElementById('dock-dminus');
    const dockRange = document.getElementById('dock-range');
    const dockTime = document.getElementById('dock-time');

    if (stageId === 'all') {
      const s = state.data.stats;
      if (dockTitleText) dockTitleText.textContent = '📈 Profil Altimétrique du Circuit (Périmètre KMZ - 105 km)';
      if (dockDist) dockDist.textContent = `${s.perimeter_km.toFixed(1)} km`;
      if (dockDplus) dockDplus.textContent = `${Math.round(s.d_plus_m).toLocaleString()} m`;
      if (dockDminus) dockDminus.textContent = `${Math.round(s.d_minus_m).toLocaleString()} m`;
      if (dockRange) dockRange.textContent = `${Math.round(s.min_ele_m)}m / ${Math.round(s.max_ele_m)}m`;
      if (dockTime) dockTime.textContent = s.total_estimated_time || '36h17';

      if (state.isDroneTourActive) toggleDroneTour();
      const overviewCam = new THREE.Vector3(0, 180, 240);
      const overviewTarget = new THREE.Vector3(0, 10, 0);
      smoothCameraTransition(overviewCam, overviewTarget, 1000);
    } else {
      const stg = stages.find(s => s.id === parseInt(stageId));
      if (stg) {
        if (dockTitleText) dockTitleText.textContent = `📈 Profil Altimétrique - ${stg.name}`;
        if (dockDist) dockDist.textContent = `${stg.distance_km} km`;
        if (dockDplus) dockDplus.textContent = `+${stg.d_plus_m.toLocaleString()} m`;
        if (dockDminus) dockDminus.textContent = `-${stg.d_minus_m.toLocaleString()} m`;
        if (dockRange) dockRange.textContent = `${stg.min_ele_m}m / ${stg.max_ele_m}m`;
        if (dockTime) dockTime.textContent = stg.estimated_time;

        // Smooth camera transition to center of stage
        frameStageIn3D(stg);
      }
    }

    // 5. Update Elevation Profile Chart
    updateElevationChart(stageId);
  }

  function frameStageIn3D(stg) {
    if (state.isDroneTourActive) toggleDroneTour();

    const sPts = state.data.profile.slice(stg.start_index, stg.end_index + 1);
    if (!sPts || sPts.length === 0) return;

    let cx = 0, cz = 0, cy = 0;
    for (let p of sPts) {
      cx += p.x3d;
      cz += p.z3d;
      cy += (p.elevation_m - ELEVATION_BASE) * ELEVATION_SCALE * state.exaggeration;
    }
    cx /= sPts.length;
    cz /= sPts.length;
    cy /= sPts.length;

    const targetPos = new THREE.Vector3(cx, cy, cz);
    const camPos = new THREE.Vector3(cx + 45, cy + 65, cz + 65);
    smoothCameraTransition(camPos, targetPos, 1200);
  }

  // 4. Build 3D POI & Bivouac Markers
  function buildPOIMarkers() {
    poiGroup.clear();

    const pois = state.data.pois;
    pois.forEach((poi, index) => {
      const isBivouac = poi.category === 'Bivouac';
      const isWater = poi.category === "Source d'eau";
      const isSummit = poi.category === 'Sommet';
      const isForest = poi.category === 'Flore / Cédraie';
      const isTown = poi.category === 'Village / Ravitaillement';

      // Determine palette
      let pinColor = 0x06b6d4;
      let badgeStroke = '#06b6d4';
      let icon = poi.category_icon || '📍';

      if (isBivouac) {
        pinColor = 0x10b981;
        badgeStroke = '#10b981';
      } else if (isWater) {
        pinColor = 0x06b6d4;
        badgeStroke = '#06b6d4';
      } else if (isSummit) {
        pinColor = 0xf59e0b;
        badgeStroke = '#f59e0b';
      } else if (isForest) {
        pinColor = 0x14b8a6;
        badgeStroke = '#14b8a6';
      } else if (isTown) {
        pinColor = 0x8b5cf6;
        badgeStroke = '#8b5cf6';
      }

      // Create Canvas Sprite for Label
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 70;
      const ctx = canvas.getContext('2d');

      // Rounded badge with glow
      ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
      ctx.strokeStyle = badgeStroke;
      ctx.lineWidth = 3;
      roundRect(ctx, 4, 4, 292, 62, 12);
      ctx.fill();
      ctx.stroke();

      // Title
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText(`${icon} ${poi.name.split(' (')[0].substring(0, 22)}`, 16, 32);

      // Subtitle
      ctx.font = '14px monospace';
      ctx.fillStyle = badgeStroke;
      ctx.fillText(`${poi.elevation_m}m • ${poi.category}`, 16, 54);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(18, 4.2, 1);

      const markerObj = new THREE.Group();

      if (isBivouac) {
        // Distinctive 3D Tent Shape for Bivouacs
        const tentGeo = new THREE.ConeGeometry(1.8, 3.2, 4);
        tentGeo.rotateY(Math.PI / 4);
        tentGeo.translate(0, 1.6, 0);
        const tentMat = new THREE.MeshStandardMaterial({
          color: 0x10b981,
          roughness: 0.3,
          emissive: 0x059669,
          emissiveIntensity: 0.5
        });
        const tent = new THREE.Mesh(tentGeo, tentMat);

        // Ground beacon ring
        const ringGeo = new THREE.RingGeometry(2.2, 2.7, 24);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0x10b981,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.8
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.y = 0.2;

        markerObj.add(ring);
        markerObj.add(tent);
        sprite.position.y = 9.0;
      } else {
        // Pin Needle
        const needleGeo = new THREE.CylinderGeometry(0.3, 0.1, 7, 8);
        needleGeo.translate(0, 3.5, 0);
        const needleMat = new THREE.MeshBasicMaterial({ color: pinColor });
        const needle = new THREE.Mesh(needleGeo, needleMat);
        markerObj.add(needle);
        sprite.position.y = 8.5;
      }

      markerObj.add(sprite);

      const y = (poi.elevation_m - ELEVATION_BASE) * ELEVATION_SCALE * state.exaggeration;
      markerObj.position.set(poi.x3d, y, poi.z3d);
      markerObj.userData = poi;
      markerObj.name = `poi_${index}`;

      poiGroup.add(markerObj);
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function updatePOIHeights() {
    state.data.pois.forEach((poi, index) => {
      const marker = poiGroup.getObjectByName(`poi_${index}`);
      if (marker) {
        const y = (poi.elevation_m - ELEVATION_BASE) * ELEVATION_SCALE * state.exaggeration;
        marker.position.y = y;
      }
    });
  }

  // 5. Populate Sidebar Stages
  function populateSidebarStages() {
    const container = document.getElementById('sidebar-stages');
    if (!container) return;
    container.innerHTML = '';

    const stages = state.data.stages || [];
    stages.forEach(stg => {
      const card = document.createElement('div');
      card.className = 'sidebar-stage-card';
      card.dataset.stage = stg.id;
      card.style.setProperty('--stg-color', stg.color);

      card.innerHTML = `
        <div class="stage-card-header">
          <span class="stage-card-title">${stg.short_name} : ${stg.name.split(' : ')[1] || stg.name}</span>
          <span class="stage-card-time">${stg.estimated_time}</span>
        </div>
        <div class="stage-card-route">${stg.start_point.split(' (')[0]} ➔ ${stg.end_point.split(' (')[0]}</div>
        <div class="stage-card-metrics">
          <span>Dist: <strong>${stg.distance_km} km</strong></span>
          <span>D+: <strong style="color:#10b981;">+${stg.d_plus_m}m</strong></span>
          <span>D-: <strong style="color:#f43f5e;">-${stg.d_minus_m}m</strong></span>
        </div>
      `;

      card.addEventListener('click', () => {
        setStage(stg.id);
      });

      container.appendChild(card);
    });
  }

  // 6. Populate Sidebar POI List
  function populatePOIList() {
    const container = document.getElementById('poi-list');
    if (!container) return;
    container.innerHTML = '';

    const catClassMap = {
      'Sommet': 'poi-cat-sommet',
      'Bivouac': 'poi-cat-bivouac',
      "Source d'eau": 'poi-cat-source-deau',
      'Flore / Cédraie': 'poi-cat-flore-cedraie',
      'Village / Ravitaillement': 'poi-cat-village-ravitaillement'
    };

    state.data.pois.forEach((poi, idx) => {
      const item = document.createElement('div');
      item.className = 'poi-item';
      const catClass = catClassMap[poi.category] || 'poi-cat-sommet';
      const icon = poi.category_icon || '📍';

      item.innerHTML = `
        <div class="poi-meta">
          <div class="poi-cat-badge ${catClass}">${icon} ${poi.category}</div>
          <div class="poi-name">${poi.name}</div>
          <div class="poi-desc">${poi.desc.substring(0, 65)}...</div>
        </div>
        <div class="poi-ele">${poi.elevation_m}m</div>
      `;

      item.addEventListener('click', () => {
        openPOICard(poi);
        flyToPOI(poi);
      });

      container.appendChild(item);
    });
  }

  // Open Rich POI Modal Sheet
  function openPOICard(poi) {
    state.selectedPOI = poi;

    // 1. Update Probe HUD (for tests & immediate live feedback)
    probeEle.innerHTML = `${poi.elevation_m} <small>m</small>`;
    probeGps.textContent = `${poi.lat.toFixed(4)}°N, ${Math.abs(poi.lon).toFixed(4)}°W`;
    probePoiCard.style.display = 'block';
    probePoiText.textContent = `${poi.name} (${poi.desc})`;

    // 2. Highlight in sidebar list
    document.querySelectorAll('.poi-item').forEach(el => {
      const nameEl = el.querySelector('.poi-name');
      el.classList.toggle('active', !!(nameEl && nameEl.textContent === poi.name));
    });

    // 3. Fill Rich POI Modal Sheet
    const poiModal = document.getElementById('poi-modal');
    if (!poiModal) return;

    const catBadge = document.getElementById('poi-modal-category');
    const catIcon = document.getElementById('poi-modal-icon');
    const catName = document.getElementById('poi-modal-cat-name');
    const title = document.getElementById('poi-modal-title');
    const ele = document.getElementById('poi-modal-ele');
    const stage = document.getElementById('poi-modal-stage');
    const water = document.getElementById('poi-modal-water');
    const coords = document.getElementById('poi-modal-coords');
    const alt = document.getElementById('poi-modal-alt');
    const desc = document.getElementById('poi-modal-desc');
    const tip = document.getElementById('poi-modal-tip');
    const features = document.getElementById('poi-modal-features');

    const catClassMap = {
      'Sommet': 'poi-cat-sommet',
      'Bivouac': 'poi-cat-bivouac',
      "Source d'eau": 'poi-cat-source-deau',
      'Flore / Cédraie': 'poi-cat-flore-cedraie',
      'Village / Ravitaillement': 'poi-cat-village-ravitaillement'
    };

    if (catBadge) {
      catBadge.className = `modal-category-badge ${catClassMap[poi.category] || 'poi-cat-sommet'}`;
    }
    if (catIcon) catIcon.textContent = poi.category_icon || '📍';
    if (catName) catName.textContent = poi.category || 'Point d\'intérêt';
    if (title) title.textContent = poi.name;
    if (ele) ele.textContent = `${poi.elevation_m} m`;
    if (stage) stage.textContent = poi.stage ? `🚩 ${poi.stage}` : '';
    if (water) water.textContent = poi.water_status || 'Non renseigné';
    if (coords) coords.textContent = `${poi.lat.toFixed(4)}° N, ${Math.abs(poi.lon).toFixed(4)}° W`;
    if (alt) alt.textContent = `${poi.elevation_m} m (SRTM / Copernicus DEM)`;
    if (desc) desc.textContent = poi.desc;
    if (tip) tip.textContent = poi.terrain_tip || 'Suivre le tracé GPS et respecter les consignes de sécurité.';

    if (features) {
      features.innerHTML = '';
      (poi.features || []).forEach(f => {
        const span = document.createElement('span');
        span.className = 'feature-tag';
        span.textContent = f;
        features.appendChild(span);
      });
    }

    const waterCard = document.getElementById('poi-modal-water-card');
    if (waterCard) {
      const statusText = poi.water_status || '';
      if (statusText.includes('❌') || statusText.includes('SEC')) {
        waterCard.style.borderColor = 'rgba(239, 68, 68, 0.45)';
        waterCard.style.background = 'rgba(239, 68, 68, 0.08)';
      } else if (statusText.includes('⚠️')) {
        waterCard.style.borderColor = 'rgba(245, 158, 11, 0.45)';
        waterCard.style.background = 'rgba(245, 158, 11, 0.08)';
      } else {
        waterCard.style.borderColor = 'rgba(6, 182, 212, 0.35)';
        waterCard.style.background = 'rgba(6, 182, 212, 0.08)';
      }
    }

    poiModal.style.display = 'flex';
  }

  // Camera Fly-to Animation
  function flyToPOI(poi) {
    if (state.isDroneTourActive) toggleDroneTour();

    if (state.activeEngine === 'maplibre' && state.maplibreMap) {
      state.maplibreMap.flyTo({
        center: [poi.lon, poi.lat],
        zoom: 13,
        pitch: 60,
        bearing: -20,
        essential: true
      });
    } else {
      const targetY = (poi.elevation_m - ELEVATION_BASE) * ELEVATION_SCALE * state.exaggeration;
      const targetPos = new THREE.Vector3(poi.x3d, targetY, poi.z3d);
      const cameraTargetPos = new THREE.Vector3(poi.x3d + 20, targetY + 30, poi.z3d + 35);
      smoothCameraTransition(cameraTargetPos, targetPos, 1200);
    }

    // Show probe HUD
    probeEle.innerHTML = `${poi.elevation_m} <small>m</small>`;
    probeGps.textContent = `${poi.lat.toFixed(4)}°N, ${Math.abs(poi.lon).toFixed(4)}°W`;
    probePoiCard.style.display = 'block';
    probePoiText.textContent = `${poi.name} (${poi.desc})`;

    // Highlight in sidebar list
    document.querySelectorAll('.poi-item').forEach(el => {
      const nameEl = el.querySelector('.poi-name');
      el.classList.toggle('active', !!(nameEl && nameEl.textContent === poi.name));
    });
  }

  function smoothCameraTransition(endCamPos, endTargetPos, durationMs) {
    const startCamPos = camera.position.clone();
    const startTargetPos = controls.target.clone();
    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / durationMs);
      const ease = 0.5 - Math.cos(progress * Math.PI) / 2; // Smooth cosine

      camera.position.lerpVectors(startCamPos, endCamPos, ease);
      controls.target.lerpVectors(startTargetPos, endTargetPos, ease);
      controls.update();

      if (progress < 1.0) {
        requestAnimationFrame(step);
      }
    }
    requestAnimationFrame(step);
  }

  // 7. Interactive Elevation Profile Chart
  function setupElevationProfileChart() {
    const profile = state.data.profile;
    state.currentSubProfile = profile;
    const labels = profile.map(p => `${p.distance_km}km`);
    const elevations = profile.map(p => p.elevation_m);

    const ctx = profileCanvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 140);
    gradient.addColorStop(0, 'rgba(6, 182, 212, 0.45)');
    gradient.addColorStop(1, 'rgba(6, 182, 212, 0.02)');

    state.chart = new Chart(profileCanvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Altitude (m)',
          data: elevations,
          borderColor: '#06b6d4',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#ef4444',
          pointHoverBorderColor: '#ffffff',
          pointHoverBorderWidth: 2,
          fill: true,
          backgroundColor: gradient,
          tension: 0.2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            titleColor: '#06b6d4',
            bodyColor: '#ffffff',
            borderColor: 'rgba(6, 182, 212, 0.4)',
            borderWidth: 1,
            callbacks: {
              title: items => `Distance: ${items[0].label}`,
              label: item => {
                const curProfile = state.currentSubProfile || state.data.profile;
                const pt = curProfile[item.dataIndex] || curProfile[0];
                return `Altitude: ${item.formattedValue} m | Pente: ${pt.slope_deg || 0}°`;
              }
            }
          }
        },
        scales: {
          x: {
            display: true,
            ticks: {
              maxTicksLimit: 12,
              color: '#94a3b8',
              font: { size: 10 },
              maxRotation: 0
            },
            grid: { color: 'rgba(255, 255, 255, 0.05)' }
          },
          y: {
            display: true,
            min: 1200,
            max: 2400,
            suggestedMin: 1200,
            suggestedMax: 2400,
            ticks: {
              color: '#94a3b8',
              font: { size: 10 },
              callback: val => `${val}m`,
              stepSize: 200
            },
            grid: { color: 'rgba(255, 255, 255, 0.07)' }
          }
        },
        layout: {
          padding: {
            left: 0,
            right: 8,
            top: 6,
            bottom: 2
          }
        },
        onHover: (evt, activeElements) => {
          if (activeElements.length > 0) {
            const idx = activeElements[0].index;
            const curProfile = state.currentSubProfile || state.data.profile;
            const pt = curProfile[idx];
            if (!pt) return;

            // Move 3D hiker beacon to corresponding location
            const y = (pt.elevation_m - ELEVATION_BASE) * ELEVATION_SCALE * state.exaggeration + 1.5;
            state.hikerMarker.position.set(pt.x3d, y, pt.z3d);
            state.hikerMarker.visible = true;

            // Update probe HUD
            probeEle.innerHTML = `${pt.elevation_m} <small>m</small>`;
            probeSlope.innerHTML = `${pt.slope_deg || 0}°`;
            probeGps.textContent = `${pt.lat.toFixed(4)}°N, ${Math.abs(pt.lon).toFixed(4)}°W (km ${pt.distance_km})`;
          } else {
            state.hikerMarker.visible = false;
          }
        },
        onClick: (evt, activeElements) => {
          if (activeElements.length > 0) {
            const idx = activeElements[0].index;
            const curProfile = state.currentSubProfile || state.data.profile;
            const pt = curProfile[idx];
            if (!pt) return;

            if (state.activeEngine === 'maplibre' && state.maplibreMap) {
              state.maplibreMap.flyTo({
                center: [pt.lon, pt.lat],
                zoom: 13.5,
                pitch: 60,
                bearing: -20,
                essential: true
              });
            } else {
              const targetY = (pt.elevation_m - ELEVATION_BASE) * ELEVATION_SCALE * state.exaggeration;
              const targetPos = new THREE.Vector3(pt.x3d, targetY, pt.z3d);
              const camPos = new THREE.Vector3(pt.x3d + 15, targetY + 25, pt.z3d + 25);
              smoothCameraTransition(camPos, targetPos, 1000);
            }

            const y = (pt.elevation_m - ELEVATION_BASE) * ELEVATION_SCALE * state.exaggeration + 1.5;
            state.hikerMarker.position.set(pt.x3d, y, pt.z3d);
            state.hikerMarker.visible = true;

            probeEle.innerHTML = `${pt.elevation_m} <small>m</small>`;
            probeSlope.innerHTML = `${pt.slope_deg || 0}°`;
            probeGps.textContent = `${pt.lat.toFixed(4)}°N, ${Math.abs(pt.lon).toFixed(4)}°W (km ${pt.distance_km})`;
            probePoiCard.style.display = 'block';
            probePoiText.textContent = `Point km ${pt.distance_km} (${pt.elevation_m}m)`;
          }
        }
      }
    });
  }

  // Update Chart specifically for a Stage
  function updateElevationChart(stageId) {
    if (!state.chart) return;

    let subProfile = [];
    let color = '#06b6d4';
    let labels = [];

    if (stageId === 'all') {
      subProfile = state.data.profile;
      color = '#06b6d4';
      labels = subProfile.map(p => `${p.distance_km}km`);
    } else {
      const stg = (state.data.stages || []).find(s => s.id === parseInt(stageId));
      if (!stg) return;
      subProfile = state.data.profile.slice(stg.start_index, stg.end_index + 1);
      color = stg.color;
      const baseDist = subProfile[0].distance_km;
      labels = subProfile.map(p => `${(p.distance_km - baseDist).toFixed(1)}km`);
    }

    state.currentSubProfile = subProfile;

    const ctx = profileCanvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 140);
    gradient.addColorStop(0, hexToRgba(color, 0.45));
    gradient.addColorStop(1, hexToRgba(color, 0.02));

    const elevs = subProfile.map(p => p.elevation_m);
    if (elevs.length > 0) {
      const minVal = Math.min(...elevs);
      const maxVal = Math.max(...elevs);
      const span = maxVal - minVal;
      const pad = Math.max(30, Math.round(span * 0.1));
      const minEle = Math.floor((minVal - pad) / 50) * 50;
      const maxEle = Math.ceil((maxVal + pad) / 50) * 50;
      state.chart.options.scales.y.min = minEle;
      state.chart.options.scales.y.max = maxEle;
      state.chart.options.scales.y.suggestedMin = minEle;
      state.chart.options.scales.y.suggestedMax = maxEle;
    }

    state.chart.data.labels = labels;
    state.chart.data.datasets[0].data = elevs;
    state.chart.data.datasets[0].borderColor = color;
    state.chart.data.datasets[0].backgroundColor = gradient;
    state.chart.resize();
    state.chart.update('none');
  }

  function hexToRgba(hex, alpha) {
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // 8. Printable Roadbook / Topoguide Setup
  function setupTopoguide() {
    const topoguideContent = document.getElementById('topoguide-content');
    if (!topoguideContent) return;

    const stages = state.data.stages || [];
    const stats = state.data.stats || {};

    let html = `
      <!-- Trek Overview -->
      <section class="topoguide-section">
        <h3 class="topoguide-heading">🗺️ 1. Présentation & Fiche Technique du Trek</h3>
        <p>
          Le <strong>Grand Tour de Zaghfouland & Itzer</strong> est une grande boucle de montagne et de steppes de <strong>105.0 km</strong> située dans la province de Midelt (Moyen Atlas oriental, Maroc). Traversant les forêts reliques de cèdres de l'Atlas, le Col du Zad (2 178 m), les résurgences karstiques de l'Oued Guigou et les étendues d'alfa de la Haute Moulouya, ce trek d'exception s'effectue en <strong>4 jours en autonomie ou semi-autonomie</strong>.
        </p>
        <div class="topoguide-hero-grid">
          <div class="hero-stat-card">
            <span class="hero-stat-label">Distance Totale</span>
            <span class="hero-stat-val">${stats.perimeter_km ? stats.perimeter_km.toFixed(1) : '105.0'} km</span>
            <span class="hero-stat-sub">Boucle fermée continue</span>
          </div>
          <div class="hero-stat-card">
            <span class="hero-stat-label">Dénivelé Positif (D+)</span>
            <span class="hero-stat-val">+${stats.d_plus_m ? stats.d_plus_m.toLocaleString() : '5 440'} m</span>
            <span class="hero-stat-sub">Cumul altimétrique réel</span>
          </div>
          <div class="hero-stat-card">
            <span class="hero-stat-label">Dénivelé Négatif (D-)</span>
            <span class="hero-stat-val">-${stats.d_minus_m ? stats.d_minus_m.toLocaleString() : '5 456'} m</span>
            <span class="hero-stat-sub">Profil équilibré</span>
          </div>
          <div class="hero-stat-card">
            <span class="hero-stat-label">Altitude Min / Max</span>
            <span class="hero-stat-val">${stats.min_ele_m || 1391}m / ${stats.max_ele_m || 2388}m</span>
            <span class="hero-stat-sub">Moulouya à Crêtes du Zad</span>
          </div>
          <div class="hero-stat-card">
            <span class="hero-stat-label">Durée Conseillée</span>
            <span class="hero-stat-val">4 Jours</span>
            <span class="hero-stat-sub">3 Bivouacs sauvages</span>
          </div>
          <div class="hero-stat-card">
            <span class="hero-stat-label">Difficulté Globale</span>
            <span class="hero-stat-val">Niveau 4 / 5</span>
            <span class="hero-stat-sub">Randonneur montagnard</span>
          </div>
        </div>
      </section>

      <!-- Stage-by-stage itinerary table -->
      <section class="topoguide-section">
        <h3 class="topoguide-heading">📊 2. Tableau Synthétique des 4 Étapes Journalières</h3>
        <div class="topoguide-table-wrap">
          <table class="topoguide-table">
            <thead>
              <tr>
                <th>Étape</th>
                <th>Itinéraire</th>
                <th>Distance</th>
                <th>D+</th>
                <th>D-</th>
                <th>Alt. Min/Max</th>
                <th>Temps Estimé</th>
                <th>Bivouac / Nuitée</th>
                <th>Ravitaillement Eau</th>
              </tr>
            </thead>
            <tbody>
    `;

    stages.forEach(stg => {
      html += `
        <tr>
          <td><strong style="color:${stg.color};">${stg.short_name}</strong></td>
          <td><strong>${stg.name.split(' : ')[1] || stg.name}</strong></td>
          <td><strong>${stg.distance_km} km</strong></td>
          <td style="color:#10b981; font-weight:600;">+${stg.d_plus_m} m</td>
          <td style="color:#f43f5e; font-weight:600;">-${stg.d_minus_m} m</td>
          <td>${stg.min_ele_m}m / ${stg.max_ele_m}m</td>
          <td><span class="sheet-chip" style="color:var(--accent); font-weight:700;">${stg.estimated_time}</span></td>
          <td>⛺ ${stg.end_point.split(' (')[0]}</td>
          <td><small>${stg.water_info}</small></td>
        </tr>
      `;
    });

    html += `
            </tbody>
            <tfoot>
              <tr>
                <td><strong>TOTAL</strong></td>
                <td><strong>Grand Circuit Intégral d'Itzer</strong></td>
                <td><strong>105.0 km</strong></td>
                <td><strong>+${stats.d_plus_m ? stats.d_plus_m.toLocaleString() : '4 874'} m</strong></td>
                <td><strong>-${stats.d_minus_m ? stats.d_minus_m.toLocaleString() : '4 888'} m</strong></td>
                <td><strong>${stats.min_ele_m || 1391}m / ${stats.max_ele_m || 2388}m</strong></td>
                <td><strong>${stats.total_estimated_time || '36h17'}</strong></td>
                <td><strong>3 Bivouacs sauvages</strong></td>
                <td><strong>Points stratégiques</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <!-- Detailed Stage Sheets -->
      <section class="topoguide-section">
        <h3 class="topoguide-heading">📋 3. Feuilles de Route Détaillées Étape par Étape</h3>
    `;

    stages.forEach(stg => {
      html += `
        <div class="topoguide-stage-card" style="--stg-color:${stg.color};">
          <div class="stage-sheet-header">
            <div class="stage-sheet-title" style="color:${stg.color};">${stg.name}</div>
            <div class="stage-sheet-chips">
              <span class="sheet-chip">📏 ${stg.distance_km} km</span>
              <span class="sheet-chip">📈 D+ ${stg.d_plus_m}m</span>
              <span class="sheet-chip">📉 D- ${stg.d_minus_m}m</span>
              <span class="sheet-chip">⏱️ ${stg.estimated_time}</span>
              <span class="sheet-chip">⚡ ${stg.difficulty}</span>
            </div>
          </div>
          <p class="stage-sheet-body">${stg.desc}</p>
          <div class="stage-sheet-grid">
            <div class="sheet-info-item">
              <strong>💧 Gestion de l'eau :</strong> ${stg.water_info}
            </div>
            <div class="sheet-info-item">
              <strong>⛺ Bivouac de fin d'étape :</strong> ${stg.end_point}
            </div>
          </div>
        </div>
      `;
    });

    html += `
      </section>

      <!-- Water Strategy & Hydration -->
      <section class="topoguide-section">
        <h3 class="topoguide-heading">💧 4. Inventaire des Points d'Eau & Hydratation</h3>
        <p>
          L'eau constitue le facteur clé d'autonomie et de sécurité sur ce circuit de 105 km :
        </p>
        <ul style="padding-left:20px; font-size:12px; display:flex; flex-direction:column; gap:6px; color:#cbd5e1;">
          <li><strong>Itzer (Camp de Base) :</strong> Eau courante potable au réseau communal, épiceries et fontaines. Remplir 3 à 4 litres par personne avant le départ.</li>
          <li><strong>Bivouac Cédraie de Zaghfouland (Fin J1) :</strong> Absence de source immédiate sous la futaie. Nécessite l'emport d'une réserve depuis la vallée.</li>
          <li><strong>Sources de l'Oued Guigou (J2) :</strong> Résurgences karstiques d'eau cristalline et glacée toute l'année. Point de réapprovisionnement capital.</li>
          <li><strong>Col du Zad (J2) :</strong> Relais routier au col sur la RN13 (eau minérale en bouteille, ravitaillement rapide).</li>
          <li><strong>Plateau d'Arid (Fin J3) :</strong> BIVOUAC SEC. Prévoir impérativement 4 litres par personne depuis le Col du Zad ou Zaïda.</li>
          <li><strong>Source Aïn Itzer & Seguias (J4) :</strong> Canaux d'irrigation et source pérenne dans les vergers de pommiers d'Itzer.</li>
        </ul>
        <div style="background:rgba(6, 182, 212, 0.08); border-left:3px solid var(--accent); padding:10px 14px; font-size:12px; color:#e0f2fe; border-radius:0 6px 6px 0; margin-top:6px;">
          <strong>Règle de Potabilisation :</strong> Toute eau de source naturelle doit être filtrée à 0.1 micron (filtre type Katadyn/Sawyer) puis traitée avec une pastille de dioxyde de chlore (Micropur Forte / Aquatabs, 30 min d'attente) pour éliminer protozoaires et bactéries.
        </div>
      </section>

      <!-- Safety & Eco-Charter -->
      <section class="topoguide-section">
        <h3 class="topoguide-heading">🛡️ 5. Sécurité Montagne, Bivouac & Charte Éco-responsable</h3>
        <div class="stage-sheet-grid">
          <div class="sheet-info-item">
            <strong>🔥 Protection des Cèdres :</strong> Feux de camp formellement interdits dans toute la zone forestière de Zaghfouland. Utiliser exclusivement un réchaud à gaz sur sol minéral dégagé.
          </div>
          <div class="sheet-info-item">
            <strong>🗑️ Charte Leave No Trace :</strong> Aucun déchet ne doit être abandonné sur le parcours. Remportez tous vos emballages et papier hygiénique.
          </div>
          <div class="sheet-info-item">
            <strong>⚡ Météorologie de l'Atlas :</strong> Traverser les crêtes sommitales tôt le matin pour éviter les orages convectifs fréquents dès 14h00 en saison estivale.
          </div>
          <div class="sheet-info-item">
            <strong>📞 Contacts d'Urgence Secours :</strong> Gendarmerie Royale : 177 • Protection Civile : 150 • Dispensaire médical d'Itzer.
          </div>
        </div>
      </section>
    `;

    topoguideContent.innerHTML = html;
  }

  // 7. Raycasting & Real-time Terrain Probe HUD
  function handlePointerMove(evt) {
    if (!terrainMesh) return;

    const rect = threeCanvas.getBoundingClientRect();
    mouseVec.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    mouseVec.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouseVec, camera);
    const intersects = raycaster.intersectObject(terrainMesh);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const pt = hit.point;

      // Position & align 3D hover ring flush with terrain slope normal
      state.hoverMarker.position.copy(pt);
      if (hit.face && hit.face.normal) {
        state.hoverMarker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hit.face.normal);
        state.hoverMarker.position.addScaledVector(hit.face.normal, 0.35);
      } else {
        state.hoverMarker.position.y += 0.4;
      }
      state.hoverMarker.visible = true;

      // Calculate (u, v) in terrain space
      const u = THREE.MathUtils.clamp(pt.x / TERRAIN_W + 0.5, 0, 1);
      const v = THREE.MathUtils.clamp(pt.z / TERRAIN_H + 0.5, 0, 1);

      // Convert (u, v) to GPS coordinates
      const b = state.data.bounds;
      const lon = b.lon_range[0] + u * (b.lon_range[1] - b.lon_range[0]);
      const lat = b.lat_range[1] - v * (b.lat_range[1] - b.lat_range[0]);

      // Sample exact elevation
      const realEle = hit.point.y / (ELEVATION_SCALE * state.exaggeration) + ELEVATION_BASE;
      probeEle.innerHTML = `${Math.round(realEle)} <small>m</small>`;
      probeGps.textContent = `${lat.toFixed(4)}° N, ${Math.abs(lon).toFixed(4)}° W`;

      // True topographic slope independent of visual exaggeration:
      const normal = hit.face.normal;
      const ny = Math.max(0.001, normal.y);
      const gradX = (-normal.x / ny) * (0.51 / state.exaggeration);
      const gradZ = (-normal.z / ny) * (0.53 / state.exaggeration);
      const physicalSlopeRad = Math.atan(Math.hypot(gradX, gradZ));
      const slopeDeg = THREE.MathUtils.radToDeg(physicalSlopeRad);
      const slopePct = Math.tan(physicalSlopeRad) * 100;
      probeSlope.innerHTML = `${slopeDeg.toFixed(1)}° <small>(${slopePct.toFixed(0)}%)</small>`;

      // Nearest POI
      let nearest = null;
      let minDist = Infinity;
      state.data.pois.forEach(poi => {
        const d = Math.hypot(pt.x - poi.x3d, pt.z - poi.z3d);
        if (d < minDist) {
          minDist = d;
          nearest = poi;
        }
      });
      if (nearest && minDist < 35) {
        probePoiCard.style.display = 'block';
        probePoiText.textContent = `${nearest.name} (~${(minDist * 0.16).toFixed(1)} km)`;
      } else {
        probePoiCard.style.display = 'none';
      }
    } else {
      state.hoverMarker.visible = false;
    }
  }

  // Handle Click for 3D Measurement Tool & 3D POI Selection
  let dragStartPos = { x: 0, y: 0 };

  function handlePointerClick(evt) {
    if (Math.hypot(evt.clientX - dragStartPos.x, evt.clientY - dragStartPos.y) > 6) {
      return; // Ignore drag interaction
    }

    const rect = threeCanvas.getBoundingClientRect();
    mouseVec.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    mouseVec.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouseVec, camera);

    // If NOT measuring, check if a 3D POI marker was clicked
    if (!state.isMeasuring) {
      const poiHits = raycaster.intersectObjects(poiGroup.children, true);
      if (poiHits.length > 0) {
        let cur = poiHits[0].object;
        while (cur && !cur.userData?.name && cur.parent !== poiGroup) {
          cur = cur.parent;
        }
        if (cur && cur.userData?.name) {
          openPOICard(cur.userData);
          flyToPOI(cur.userData);
          return;
        }
      }
      return;
    }

    if (!terrainMesh) return;

    const intersects = raycaster.intersectObject(terrainMesh);
    if (intersects.length > 0) {
      // If already measured 2 points, auto-reset and start a new measurement
      if (state.measurePoints.length >= 2) {
        resetMeasurement();
      }

      const hit = intersects[0];
      const pt = hit.point.clone();
      const realEle = pt.y / (ELEVATION_SCALE * state.exaggeration) + ELEVATION_BASE;

      // Add pin marker
      const markerGeo = new THREE.SphereGeometry(1.5, 16, 16);
      const markerMat = new THREE.MeshStandardMaterial({
        color: state.measurePoints.length === 0 ? 0x10b981 : 0xf59e0b,
        emissive: 0x222222
      });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.copy(pt);
      scene.add(marker);
      state.measureMarkers.push(marker);

      state.measurePoints.push({ pt, ele: realEle });

      if (state.measurePoints.length === 2) {
        finishMeasurement();
      }
    }
  }

  function finishMeasurement() {
    const p1 = state.measurePoints[0];
    const p2 = state.measurePoints[1];

    // Draw connecting line
    const lineGeo = new THREE.BufferGeometry().setFromPoints([p1.pt, p2.pt]);
    const lineMat = new THREE.LineDashedMaterial({
      color: 0xf59e0b,
      dashSize: 3,
      gapSize: 1,
      linewidth: 3
    });
    state.measureLine = new THREE.Line(lineGeo, lineMat);
    state.measureLine.computeLineDistances();
    scene.add(state.measureLine);

    // Compute ground distance in km (1 world unit ~ 0.164 km)
    const dx = (p2.pt.x - p1.pt.x) * 0.1641;
    const dz = (p2.pt.z - p1.pt.z) * 0.1641;
    const dist2d = Math.hypot(dx, dz);
    const dele = p2.ele - p1.ele;
    const dist3d = Math.sqrt(dist2d * dist2d + (dele / 1000) * (dele / 1000));
    const slopeDeg = THREE.MathUtils.radToDeg(Math.atan2(Math.abs(dele), dist2d * 1000));

    measureResult.innerHTML = `Dist: <strong>${dist3d.toFixed(2)} km</strong> | Dénivelé: <strong>${dele > 0 ? '+' : ''}${Math.round(dele)} m</strong> | Pente: <strong>${slopeDeg.toFixed(1)}°</strong>`;
  }

  function resetMeasurement() {
    state.measurePoints = [];
    state.measureMarkers.forEach(m => scene.remove(m));
    state.measureMarkers = [];
    if (state.measureLine) {
      scene.remove(state.measureLine);
      state.measureLine = null;
    }
    measureResult.textContent = '0.0 km';
  }

  function updateMeasureHeights() {
    if (!state.measurePoints || state.measurePoints.length === 0) return;
    for (let i = 0; i < state.measurePoints.length; i++) {
      const p = state.measurePoints[i];
      const y = (p.ele - ELEVATION_BASE) * ELEVATION_SCALE * state.exaggeration + 0.6;
      p.pt.y = y;
      if (state.measureMarkers[i]) {
        state.measureMarkers[i].position.y = y;
      }
    }
    if (state.measureLine && state.measurePoints.length >= 2) {
      const linePos = state.measureLine.geometry.attributes.position;
      linePos.setY(0, state.measurePoints[0].pt.y);
      linePos.setY(1, state.measurePoints[1].pt.y);
      linePos.needsUpdate = true;
      state.measureLine.computeLineDistances();
    }
  }

  function updateKPIs() {
    if (!state.data) return;
    const s = state.data.stats;
    const e = state.data.elevation;
    if (s) {
      const kpiPerimeter = document.getElementById('kpi-perimeter');
      const kpiArea = document.getElementById('kpi-area');
      const kpiGain = document.getElementById('kpi-gain');
      const kpiAlt = document.getElementById('kpi-alt');
      const dockDist = document.getElementById('dock-dist');
      const dockDplus = document.getElementById('dock-dplus');
      const dockDminus = document.getElementById('dock-dminus');
      const dockRange = document.getElementById('dock-range');

      if (kpiPerimeter) kpiPerimeter.innerHTML = `${s.perimeter_km.toFixed(1)} <span>km</span>`;
      if (kpiArea) kpiArea.innerHTML = `${s.area_km2.toFixed(1)} <span>km²</span>`;
      if (kpiGain) kpiGain.innerHTML = `D+ ${Math.round(s.d_plus_m).toLocaleString()} <span>m</span>`;
      if (kpiAlt && e) kpiAlt.innerHTML = `${Math.round(e.min)}m - ${Math.round(e.max)}m`;

      if (dockDist) dockDist.textContent = `${s.perimeter_km.toFixed(1)} km`;
      if (dockDplus) dockDplus.textContent = `${Math.round(s.d_plus_m).toLocaleString()} m`;
      if (dockDminus) dockDminus.textContent = `${Math.round(s.d_minus_m).toLocaleString()} m`;
      if (dockRange) dockRange.textContent = `${Math.round(s.min_ele_m)}m / ${Math.round(s.max_ele_m)}m`;
    }
  }

  // 8. Cinematic Drone Tour Animation
  function toggleDroneTour() {
    state.isDroneTourActive = !state.isDroneTourActive;
    btnDroneTour.classList.toggle('btn-active', state.isDroneTourActive);
    btnDroneTour.querySelector('span').textContent = state.isDroneTourActive ? 'Arrêter Tour' : 'Survol 3D';
  }

  function updateDroneFlight() {
    if (!state.isDroneTourActive) return;

    state.droneAngle += 0.0035 * state.droneSpeed;
    const radius = 175;
    const height = 95 + Math.sin(state.droneAngle * 2) * 20;

    camera.position.x = radius * Math.cos(state.droneAngle);
    camera.position.z = radius * Math.sin(state.droneAngle);
    camera.position.y = height;
    controls.target.set(0, 10, 0);
    controls.update();
  }

  // 9. Compass Sync & North Reset
  function updateCompass() {
    // Rotation of camera around target in horizontal plane
    const angle = controls.getAzimuthalAngle();
    const deg = THREE.MathUtils.radToDeg(angle);
    compassNeedle.style.transform = `rotate(${deg}deg)`;
  }

  function resetNorth() {
    const dist = camera.position.distanceTo(controls.target);
    const newPos = new THREE.Vector3(0, camera.position.y, dist);
    smoothCameraTransition(newPos, controls.target, 800);
  }

  // 10. Switch between Three.js & MapLibre GL JS
  function switchEngine() {
    if (state.activeEngine === 'three') {
      state.activeEngine = 'maplibre';
      threeCanvas.style.display = 'none';
      maplibreContainer.style.display = 'block';
      btnSwitchEngine.querySelector('span').textContent = 'Mode Relief Studio';
      initMapLibre();
    } else {
      state.activeEngine = 'three';
      maplibreContainer.style.display = 'none';
      threeCanvas.style.display = 'block';
      btnSwitchEngine.querySelector('span').textContent = 'Mode Carte Globale';
    }
  }

  function initMapLibre() {
    if (state.maplibreMap) return; // already initialized

    const center = [state.data.bounds.lon_range[0] / 2 + state.data.bounds.lon_range[1] / 2,
                    state.data.bounds.lat_range[0] / 2 + state.data.bounds.lat_range[1] / 2];

    const map = new maplibregl.Map({
      container: 'maplibre-container',
      style: {
        version: 8,
        sources: {
          'osm': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap'
          },
          'satellite': {
            type: 'raster',
            tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
            tileSize: 256,
            attribution: '&copy; Esri'
          },
          'terrarium': {
            type: 'raster-dem',
            tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
            encoding: 'terrarium',
            tileSize: 256
          }
        },
        layers: [
          {
            id: 'satellite-layer',
            type: 'raster',
            source: 'satellite',
            minzoom: 0,
            maxzoom: 19
          }
        ],
        terrain: {
          source: 'terrarium',
          exaggeration: 1.8
        }
      },
      center: center,
      zoom: 10.5,
      pitch: 58,
      bearing: -20
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    map.on('load', () => {
      // Use in-memory GeoJSON from state.data (no CORS / network fetch required)
      const geojsonData = state.data.geojson || {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: state.data.stats || {},
          geometry: {
            type: 'Polygon',
            coordinates: [state.data.polygon.map(pt => [pt.lon, pt.lat, pt.elevation_m])]
          }
        }]
      };

      map.addSource('zone-rando', {
        type: 'geojson',
        data: geojsonData
      });

      map.addLayer({
        id: 'zone-rando-fill',
        type: 'fill',
        source: 'zone-rando',
        paint: {
          'fill-color': '#06b6d4',
          'fill-opacity': 0.25
        }
      });

      map.addLayer({
        id: 'zone-rando-line',
        type: 'line',
        source: 'zone-rando',
        paint: {
          'line-color': '#00f0ff',
          'line-width': 3.5
        }
      });

      // Add POI markers
      state.data.pois.forEach(p => {
        const el = document.createElement('div');
        el.style.backgroundColor = '#06b6d4';
        el.style.width = '14px';
        el.style.height = '14px';
        el.style.borderRadius = '50%';
        el.style.border = '2px solid white';
        el.style.boxShadow = '0 0 10px #06b6d4';
        el.style.cursor = 'pointer';

        new maplibregl.Marker({ element: el })
          .setLngLat([p.lon, p.lat])
          .setPopup(new maplibregl.Popup({ offset: 12 }).setHTML(`<strong>${p.name}</strong><br><span style="color:#06b6d4;font-weight:bold;">Alt: ${p.elevation_m}m</span><br><small>${p.desc}</small>`))
          .addTo(map);

        el.addEventListener('click', () => {
          openPOICard(p);
        });
      });
    });

    state.maplibreMap = map;
  }

  /* ==========================================================================
     4 AXES PRIORITAIRES : ENHANCEMENTS IMPLEMENTATION
     ========================================================================== */

  // Geographic Projection & Elevation Interpolation
  function sampleElevation(u, v) {
    if (!state.data || !state.data.grid) return 1500;
    const grid = state.data.grid;
    const gh = grid.length;
    const gw = grid[0].length;
    const gx = Math.max(0, Math.min(gw - 1, u * (gw - 1)));
    const gy = Math.max(0, Math.min(gh - 1, v * (gh - 1)));
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const x1 = Math.min(x0 + 1, gw - 1), y1 = Math.min(y0 + 1, gh - 1);
    const dx = gx - x0, dy = gy - y0;
    return (grid[y0][x0] * (1 - dx) * (1 - dy) +
            grid[y0][x1] * dx * (1 - dy) +
            grid[y1][x0] * (1 - dx) * dy +
            grid[y1][x1] * dx * dy);
  }

  function latlonToUv(lat, lon) {
    const n = 4096.0; // 2^12
    const x_world = (lon + 180.0) / 360.0 * n * 256.0;
    const lat_rad = (lat * Math.PI) / 180.0;
    const y_world = (1.0 - Math.asinh(Math.tan(lat_rad)) / Math.PI) / 2.0 * n * 256.0;
    const u = (x_world - 1987 * 256.0) / 1536.0;
    const v = (y_world - 1649 * 256.0) / 1024.0;
    return { u: Math.max(0, Math.min(1, u)), v: Math.max(0, Math.min(1, v)) };
  }

  function gpsToWorld3D(lat, lon) {
    const { u, v } = latlonToUv(lat, lon);
    const x = (u - 0.5) * TERRAIN_W;
    const z = (v - 0.5) * TERRAIN_H;
    const ele = sampleElevation(u, v);
    const y = (ele - ELEVATION_BASE) * ELEVATION_SCALE * state.exaggeration;
    return { x, y, z, ele, u, v };
  }

  // --------------------------------------------------------------------------
  // AXE 1: PWA Mobile & Real-Time GPS (3D Pulsating Marker & Accuracy Ring)
  // --------------------------------------------------------------------------
  let gpsGroup = null;
  let gpsMarker = null;
  let gpsPulseRing = null;
  let gpsAccuracyCircle = null;
  let gpsPulseTime = 0;

  function setupGPS() {
    gpsGroup = new THREE.Group();
    gpsGroup.name = "gpsGroup";
    gpsGroup.visible = false;
    scene.add(gpsGroup);

    // Glowing 3D blue marker
    const coreGeo = new THREE.SphereGeometry(1.6, 16, 16);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.8,
      roughness: 0.2
    });
    gpsMarker = new THREE.Mesh(coreGeo, coreMat);
    gpsMarker.position.y = 1.6;
    gpsGroup.add(gpsMarker);

    // White center beacon dot
    const innerGeo = new THREE.SphereGeometry(0.7, 12, 12);
    const innerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    inner.position.y = 1.6;
    gpsGroup.add(inner);

    // Pulsating cyan wave ring
    const pulseGeo = new THREE.RingGeometry(1.6, 3.0, 32);
    pulseGeo.rotateX(-Math.PI / 2);
    const pulseMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75
    });
    gpsPulseRing = new THREE.Mesh(pulseGeo, pulseMat);
    gpsPulseRing.position.y = 0.25;
    gpsGroup.add(gpsPulseRing);

    // Ground accuracy ring (scaled to GPS reported precision in meters)
    const accGeo = new THREE.RingGeometry(0.2, 4.0, 32);
    accGeo.rotateX(-Math.PI / 2);
    const accMat = new THREE.MeshBasicMaterial({
      color: 0x0ea5e9,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.22
    });
    gpsAccuracyCircle = new THREE.Mesh(accGeo, accMat);
    gpsAccuracyCircle.position.y = 0.12;
    gpsGroup.add(gpsAccuracyCircle);
  }

  function updateGpsPulse() {
    if (!state.isGpsActive || !gpsPulseRing || !gpsGroup.visible) return;
    gpsPulseTime += 0.045;
    const s = 1.0 + (Math.sin(gpsPulseTime) + 1.0) * 0.75;
    gpsPulseRing.scale.set(s, 1, s);
    gpsPulseRing.material.opacity = Math.max(0.08, 0.75 - (s - 1.0) * 0.42);
  }

  function updateGpsMarkerHeight() {
    if (!state.isGpsActive || !gpsGroup || !state.gpsCoords) return;
    const world = gpsToWorld3D(state.gpsCoords.lat, state.gpsCoords.lon);
    gpsGroup.position.y = world.y;
  }

  function toggleGPS(forceState) {
    state.isGpsActive = forceState !== undefined ? forceState : !state.isGpsActive;
    const btnGps = document.getElementById('btn-gps');
    const gpsHud = document.getElementById('gps-hud');

    if (btnGps) {
      btnGps.classList.toggle('btn-gps-active', state.isGpsActive);
      btnGps.classList.toggle('btn-active', state.isGpsActive);
    }
    if (gpsHud) gpsHud.style.display = state.isGpsActive ? 'flex' : 'none';
    if (gpsGroup) gpsGroup.visible = state.isGpsActive;

    if (state.isGpsActive) {
      startGeolocation();
    } else {
      stopGeolocation();
    }
  }

  function startGeolocation() {
    if (state.isGpsDemo) {
      startGpsDemo();
      return;
    }

    if (!('geolocation' in navigator)) {
      console.warn("API Géolocalisation absente, activation du mode démo.");
      toggleGpsDemo(true);
      return;
    }

    try {
      state.watchId = navigator.geolocation.watchPosition(
        onGpsSuccess,
        onGpsError,
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 }
      );
    } catch (e) {
      console.warn("Erreur démarrage geolocation:", e);
      toggleGpsDemo(true);
    }
  }

  function stopGeolocation() {
    if (state.watchId !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(state.watchId);
      state.watchId = null;
    }
    stopGpsDemo();
  }

  function onGpsSuccess(pos) {
    if (!pos || !pos.coords) return;
    const coords = pos.coords;
    const lat = coords.latitude;
    const lon = coords.longitude;
    const alt = coords.altitude !== undefined && coords.altitude !== null ? coords.altitude : null;
    const acc = coords.accuracy || 12;

    state.gpsCoords = { lat, lon, alt, acc };

    // Check bounds
    const b = state.data.bounds;
    const inBounds = (lon >= b.lon_range[0] && lon <= b.lon_range[1] &&
                      lat >= b.lat_range[0] && lat <= b.lat_range[1]);

    if (!inBounds) {
      const gpsCoords = document.getElementById('gps-coords');
      if (gpsCoords) {
        gpsCoords.innerHTML = `<span style="color:#f59e0b;">Hors région Atlas (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)</span><br><small>Basculez sur la Démo Maroc ci-dessous</small>`;
      }
      return;
    }

    applyGpsPosition(lat, lon, alt, acc);
  }

  function onGpsError(err) {
    console.warn("Signal GPS indisponible ou permission refusée:", err);
    const gpsCoords = document.getElementById('gps-coords');
    if (gpsCoords) {
      gpsCoords.textContent = "Signal GPS indisponible (Activez Démo Maroc)";
    }
  }

  function applyGpsPosition(lat, lon, reportedAlt, accuracyMeters) {
    state.gpsCoords = { lat, lon, alt: reportedAlt, accuracy: accuracyMeters };
    const world = gpsToWorld3D(lat, lon);
    const finalEle = (reportedAlt !== null && reportedAlt > 500) ? reportedAlt : world.ele;
    const y = (finalEle - ELEVATION_BASE) * ELEVATION_SCALE * state.exaggeration;

    gpsGroup.position.set(world.x, y, world.z);
    gpsGroup.visible = true;

    // Scale accuracy ring (1 unit ~ 164.1 m)
    const accRadius = Math.max(1.2, Math.min(25, accuracyMeters / 164.1));
    gpsAccuracyCircle.scale.set(accRadius, 1, accRadius);

    // Update GPS HUD
    const gpsCoords = document.getElementById('gps-coords');
    const gpsAlt = document.getElementById('gps-alt');
    const gpsAcc = document.getElementById('gps-acc');

    if (gpsCoords) gpsCoords.textContent = `${lat.toFixed(5)}°N, ${Math.abs(lon).toFixed(5)}°W`;
    if (gpsAlt) gpsAlt.innerHTML = `${Math.round(finalEle)} <small>m</small>`;
    if (gpsAcc) gpsAcc.textContent = `±${Math.round(accuracyMeters)} m`;

    // Follow camera if enabled
    if (state.isGpsFollow && !state.isWalkerActive) {
      controls.target.lerp(new THREE.Vector3(world.x, y, world.z), 0.08);
    }
  }

  function toggleGpsDemo(force) {
    state.isGpsDemo = (force !== undefined) ? force : !state.isGpsDemo;
    const btnDemo = document.getElementById('btn-gps-demo');
    if (btnDemo) {
      btnDemo.classList.toggle('btn-primary', state.isGpsDemo);
      btnDemo.textContent = state.isGpsDemo ? 'Arrêter Démo' : '🎮 Démo Maroc';
    }

    if (state.isGpsDemo) {
      startGpsDemo();
    } else {
      stopGpsDemo();
    }
  }

  function startGpsDemo() {
    stopGpsDemo();
    state.isGpsDemo = true;
    if (!state.isGpsActive) toggleGPS(true);

    const profile = state.data.profile;
    state.gpsDemoIndex = state.gpsDemoIndex || 0;

    const initialPt = profile[state.gpsDemoIndex];
    applyGpsPosition(initialPt.lat, initialPt.lon, initialPt.elevation_m, 6.0);

    state.gpsDemoTimer = setInterval(() => {
      state.gpsDemoIndex = (state.gpsDemoIndex + 1) % profile.length;
      const pt = profile[state.gpsDemoIndex];
      applyGpsPosition(pt.lat, pt.lon, pt.elevation_m, 5.0 + (Math.sin(state.gpsDemoIndex) * 2.0));
    }, 750);
  }

  function stopGpsDemo() {
    if (state.gpsDemoTimer) {
      clearInterval(state.gpsDemoTimer);
      state.gpsDemoTimer = null;
    }
    state.isGpsDemo = false;
    const btnDemo = document.getElementById('btn-gps-demo');
    if (btnDemo) {
      btnDemo.classList.remove('btn-primary');
      btnDemo.textContent = '🎮 Démo Maroc';
    }
  }

  // --------------------------------------------------------------------------
  // AXE 3: Procedural Atlas Cedars (THREE.InstancedMesh) & Atmospheric Fog
  // --------------------------------------------------------------------------
  // --------------------------------------------------------------------------
  // Arbres 3D retirés à la demande de l'utilisateur (relief pur)
  // --------------------------------------------------------------------------
  let cedarGroup = new THREE.Group();
  cedarGroup.name = "cedarForest";

  function setupCedarForest() {
    // Arbres 3D supprimés à la demande de l'utilisateur
  }

  function updateCedarHeights() {
    // No-op
  }

  function updateFogState(hour) {
    if (!scene.fog) return;
    const h = hour !== undefined ? hour : state.sunHour;

    if (!state.fogVisible) {
      scene.fog.density = 0.0;
      return;
    }

    if (h < 6.5 || h > 19.5) {
      // Pure, crystal night air for high-altitude stargazing
      scene.fog.density = 0.0009;
      scene.fog.color.setHex(0x020617);
      scene.background.setHex(0x020617);
    } else if (h < 9) {
      // Morning high-altitude mist
      scene.fog.density = 0.0026;
      scene.fog.color.setHex(0x1e293b);
      scene.background.setHex(0x0f172a);
    } else if (h > 17) {
      // Warm alpine sunset glow
      scene.fog.density = 0.0022;
      scene.fog.color.setHex(0x2d2426);
      scene.background.setHex(0x1a162b);
    } else {
      // Crystal clear midday air
      scene.fog.density = 0.0014;
      scene.fog.color.setHex(0x0f172a);
      scene.background.setHex(0x0f172a);
    }
  }

  // --------------------------------------------------------------------------
  // AXE 3 (suite): 1st-Person Walker View Mode (1.8m eye level on trail)
  // --------------------------------------------------------------------------
  function setupWalkerMode() {
    const btnWalker = document.getElementById('btn-walker-view');
    const btnExit = document.getElementById('btn-exit-walker');
    const btnPrev = document.getElementById('btn-walker-prev');
    const btnNext = document.getElementById('btn-walker-next');
    const btnPlay = document.getElementById('btn-walker-play');
    const sliderProg = document.getElementById('walker-progress');

    if (btnWalker) btnWalker.addEventListener('click', () => toggleWalkerMode());
    if (btnExit) btnExit.addEventListener('click', () => toggleWalkerMode(false));
    if (btnPrev) btnPrev.addEventListener('click', () => stepWalker(-1));
    if (btnNext) btnNext.addEventListener('click', () => stepWalker(1));
    if (btnPlay) btnPlay.addEventListener('click', () => toggleWalkerAuto());

    if (sliderProg) {
      sliderProg.addEventListener('input', e => {
        const pct = parseFloat(e.target.value) / 100;
        const total = state.data.profile.length;
        state.walkerIndex = Math.min(total - 1, Math.floor(pct * total));
        updateWalkerPosition();
      });
    }

    // Keyboard navigation
    window.addEventListener('keydown', e => {
      if (!state.isWalkerActive) return;
      if (e.key === 'ArrowUp' || e.key === 'z' || e.key === 'Z' || e.key === 'w' || e.key === 'W') {
        stepWalker(1);
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        stepWalker(-1);
      } else if (e.key === 'Escape') {
        toggleWalkerMode(false);
      }
    });
  }

  function toggleWalkerMode(force) {
    state.isWalkerActive = (force !== undefined) ? force : !state.isWalkerActive;
    const walkerHud = document.getElementById('walker-hud');
    const btnWalker = document.getElementById('btn-walker-view');

    if (btnWalker) btnWalker.classList.toggle('btn-active', state.isWalkerActive);
    if (walkerHud) walkerHud.style.display = state.isWalkerActive ? 'flex' : 'none';

    if (state.isWalkerActive) {
      state.savedOrbitPos = camera.position.clone();
      state.savedOrbitTarget = controls.target.clone();
      controls.enabled = false;

      // Start at active stage start point or current location
      if (state.activeStage !== 'all') {
        const stg = (state.data.stages || []).find(s => s.id === parseInt(state.activeStage));
        if (stg) state.walkerIndex = stg.start_index;
      }
      updateWalkerPosition();
    } else {
      if (state.isWalkerAuto) toggleWalkerAuto(false);
      controls.enabled = true;
      if (state.savedOrbitPos && state.savedOrbitTarget) {
        smoothCameraTransition(state.savedOrbitPos, state.savedOrbitTarget, 900);
      }
    }
  }

  function updateWalkerPosition() {
    const profile = state.data.profile;
    const pt = profile[state.walkerIndex];
    const nextPt = profile[(state.walkerIndex + 1) % profile.length];

    const y = (pt.elevation_m - ELEVATION_BASE) * ELEVATION_SCALE * state.exaggeration + 1.8;
    const nextY = (nextPt.elevation_m - ELEVATION_BASE) * ELEVATION_SCALE * state.exaggeration + 1.8;

    camera.position.set(pt.x3d, y, pt.z3d);

    const forward = new THREE.Vector3(nextPt.x3d - pt.x3d, nextY - y, nextPt.z3d - pt.z3d).normalize();
    const lookTarget = new THREE.Vector3(pt.x3d + forward.x * 30, y + forward.y * 30, pt.z3d + forward.z * 30);
    camera.lookAt(lookTarget);

    const headingRad = Math.atan2(forward.x, -forward.z);
    const headingDeg = (THREE.MathUtils.radToDeg(headingRad) + 360) % 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    const dirTxt = dirs[Math.round(headingDeg / 45) % 8];

    // Update HUD
    const walkerKm = document.getElementById('walker-km');
    const walkerAlt = document.getElementById('walker-alt');
    const walkerSlope = document.getElementById('walker-slope');
    const walkerHeading = document.getElementById('walker-heading');
    const sliderProg = document.getElementById('walker-progress');

    if (walkerKm) walkerKm.textContent = `Km ${pt.distance_km}`;
    if (walkerAlt) walkerAlt.textContent = `${Math.round(pt.elevation_m)} m`;
    if (walkerSlope) walkerSlope.textContent = `Pente: ${pt.slope_deg || 0}°`;
    if (walkerHeading) walkerHeading.textContent = `Cap: ${Math.round(headingDeg)}° ${dirTxt}`;
    if (sliderProg) sliderProg.value = (state.walkerIndex / (profile.length - 1)) * 100;
  }

  function stepWalker(delta) {
    const profile = state.data.profile;
    state.walkerIndex = (state.walkerIndex + delta + profile.length) % profile.length;
    updateWalkerPosition();
  }

  function toggleWalkerAuto(force) {
    state.isWalkerAuto = (force !== undefined) ? force : !state.isWalkerAuto;
    const btnPlay = document.getElementById('btn-walker-play');
    if (btnPlay) {
      btnPlay.textContent = state.isWalkerAuto ? '⏸️ Pause Auto' : '⏯️ Marche Auto';
      btnPlay.classList.toggle('btn-secondary', state.isWalkerAuto);
    }
  }

  function updateWalkerAuto() {
    if (!state.isWalkerActive || !state.isWalkerAuto) return;
    stepWalker(1);
  }

  // --------------------------------------------------------------------------
  // AXE 2: Live Mountain Weather (Open-Meteo) & Water Calculator
  // --------------------------------------------------------------------------
  const FALLBACK_WEATHER = {
    itzer: {
      locationName: "Itzer - Vallée (Camp de Base)",
      elevation: "1 665 m",
      current: {
        temp: 23.5,
        felt: 22.8,
        desc: "Ensoleillé et ciel limpide",
        icon: "☀️",
        windSpeed: 16,
        windGusts: 28,
        rainProb: 5,
        humidity: 34,
        uvIndex: 8
      },
      forecast: [
        { day: "Aujourd'hui", icon: "☀️", min: 11, max: 24, rain: 5, wind: 28 },
        { day: "Demain", icon: "🌤️", min: 12, max: 25, rain: 10, wind: 32 },
        { day: "Après-demain", icon: "⛅", min: 10, max: 22, rain: 20, wind: 36 }
      ]
    },
    zad: {
      locationName: "Col du Zad & Crêtes (Sommets)",
      elevation: "2 178 m - 2 388 m",
      current: {
        temp: 18.2,
        felt: 16.5,
        desc: "Légère brise d'altitude, ciel dégagé",
        icon: "🌤️",
        windSpeed: 28,
        windGusts: 46,
        rainProb: 15,
        humidity: 42,
        uvIndex: 9
      },
      forecast: [
        { day: "Aujourd'hui", icon: "🌤️", min: 7, max: 19, rain: 15, wind: 46 },
        { day: "Demain", icon: "⛅", min: 8, max: 20, rain: 25, wind: 52 },
        { day: "Après-demain", icon: "🌦️", min: 6, max: 17, rain: 40, wind: 58 }
      ]
    }
  };

  function setupWeather() {
    state.activeWeatherLoc = 'itzer';
    state.weatherData = JSON.parse(JSON.stringify(FALLBACK_WEATHER));

    const btnWeather = document.getElementById('btn-weather');
    const weatherModal = document.getElementById('weather-modal');
    const btnCloseWeather = document.getElementById('btn-close-weather');
    const btnCloseWeatherModal = document.getElementById('btn-close-weather-modal');
    const btnRefresh = document.getElementById('btn-refresh-weather');
    const btnSyncWater = document.getElementById('btn-weather-sync-water');

    if (btnWeather && weatherModal) {
      btnWeather.addEventListener('click', () => {
        weatherModal.style.display = 'flex';
        fetchOpenMeteo();
      });
    }

    if (btnCloseWeather && weatherModal) {
      btnCloseWeather.addEventListener('click', () => {
        weatherModal.style.display = 'none';
      });
    }

    if (btnCloseWeatherModal && weatherModal) {
      btnCloseWeatherModal.addEventListener('click', () => {
        weatherModal.style.display = 'none';
      });
    }

    if (weatherModal) {
      weatherModal.addEventListener('click', e => {
        if (e.target === weatherModal) weatherModal.style.display = 'none';
      });
    }

    if (btnRefresh) btnRefresh.addEventListener('click', () => fetchOpenMeteo(true));

    if (btnSyncWater) {
      btnSyncWater.addEventListener('click', () => {
        if (weatherModal) weatherModal.style.display = 'none';
        const curData = state.weatherData[state.activeWeatherLoc];
        if (curData) {
          state.waterCalcTemp = Math.round(curData.current.temp);
          const sliderTemp = document.getElementById('slider-calc-temp');
          const valTemp = document.getElementById('val-calc-temp');
          if (sliderTemp) sliderTemp.value = state.waterCalcTemp;
          if (valTemp) valTemp.textContent = `${state.waterCalcTemp}°C`;
          calculateWater();
        }
        openWaterModal();
      });
    }

    // Location Tabs
    document.querySelectorAll('.weather-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.weather-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.activeWeatherLoc = tab.dataset.location;
        renderWeatherUI();
      });
    });

    renderWeatherUI();
  }

  function fetchOpenMeteo(showFeedback) {
    const itzerUrl = 'https://api.open-meteo.com/v1/forecast?latitude=32.8791&longitude=-5.0541&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_gusts_10m_max&timezone=auto';
    const zadUrl = 'https://api.open-meteo.com/v1/forecast?latitude=32.9980&longitude=-5.0740&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_gusts_10m_max&timezone=auto';

    Promise.all([
      fetch(itzerUrl).then(r => r.json()),
      fetch(zadUrl).then(r => r.json())
    ]).then(([itzerRes, zadRes]) => {
      parseOpenMeteoResponse('itzer', itzerRes);
      parseOpenMeteoResponse('zad', zadRes);
      updateWeatherSourceBadge(true);
      renderWeatherUI();
      if (showFeedback) showToast("Météo du massif actualisée en direct (Open-Meteo API).", 'success');
    }).catch(err => {
      console.warn("Open-Meteo indisponible (utilisation des données météorologiques hors-ligne):", err);
      updateWeatherSourceBadge(false);
      renderWeatherUI();
      if (showFeedback) showToast("Mode hors-ligne : données météo locales chargées.", 'info');
    });
  }

  function parseOpenMeteoResponse(locKey, res) {
    if (!res || !res.current) return;
    const cur = res.current;
    const daily = res.daily;

    const weatherInfo = mapWeatherCode(cur.weather_code);

    state.weatherData[locKey].current = {
      temp: Math.round(cur.temperature_2m * 10) / 10,
      felt: Math.round(cur.apparent_temperature * 10) / 10,
      desc: weatherInfo.desc,
      icon: weatherInfo.icon,
      windSpeed: Math.round(cur.wind_speed_10m),
      windGusts: Math.round(cur.wind_gusts_10m),
      rainProb: daily && daily.precipitation_probability_max ? daily.precipitation_probability_max[0] : 10,
      humidity: Math.round(cur.relative_humidity_2m),
      uvIndex: Math.round(cur.uv_index || 7)
    };

    if (daily && daily.time) {
      state.weatherData[locKey].forecast = [];
      const days = ["Aujourd'hui", "Demain", "Après-demain"];
      for (let i = 0; i < Math.min(3, daily.time.length); i++) {
        const info = mapWeatherCode(daily.weather_code[i]);
        state.weatherData[locKey].forecast.push({
          day: days[i] || `J+${i}`,
          icon: info.icon,
          min: Math.round(daily.temperature_2m_min[i]),
          max: Math.round(daily.temperature_2m_max[i]),
          rain: daily.precipitation_probability_max[i] || 0,
          wind: Math.round(daily.wind_gusts_10m_max[i] || 30)
        });
      }
    }
  }

  function mapWeatherCode(code) {
    if (code === 0) return { desc: "Ensoleillé et ciel limpide", icon: "☀️" };
    if (code >= 1 && code <= 3) return { desc: "Éclaircies et nuages d'altitude", icon: "🌤️" };
    if (code === 45 || code === 48) return { desc: "Brouillard d'altitude", icon: "🌫️" };
    if (code >= 51 && code <= 65) return { desc: "Pluie et averses", icon: "🌧️" };
    if (code >= 71 && code <= 77) return { desc: "Neige sur les crêtes", icon: "❄️" };
    if (code >= 80 && code <= 82) return { desc: "Fortes averses", icon: "🌦️" };
    if (code >= 95) return { desc: "Orage violent de montagne", icon: "⛈️" };
    return { desc: "Ciel variable", icon: "⛅" };
  }

  function updateWeatherSourceBadge(isLive) {
    const badge = document.getElementById('weather-source-badge');
    if (!badge) return;
    if (isLive) {
      badge.innerHTML = '<span class="source-dot live"></span><span id="weather-source-text">Données en direct (Open-Meteo API)</span>';
    } else {
      badge.innerHTML = '<span class="source-dot offline"></span><span id="weather-source-text">Mode Hors-Ligne (Données météo réelles Moyen Atlas)</span>';
    }
  }

  function renderWeatherUI() {
    const data = state.weatherData[state.activeWeatherLoc] || FALLBACK_WEATHER.itzer;
    const cur = data.current;

    const curTemp = document.getElementById('weather-current-temp');
    const curFelt = document.getElementById('weather-current-felt');
    const curDesc = document.getElementById('weather-current-desc');
    const curIcon = document.getElementById('weather-hero-icon');
    const wind = document.getElementById('weather-wind');
    const rain = document.getElementById('weather-rain');
    const hum = document.getElementById('weather-humidity');
    const uv = document.getElementById('weather-uv');
    const diff = document.getElementById('weather-temp-diff');
    const adv = document.getElementById('weather-advisory-text');
    const fGrid = document.getElementById('forecast-grid');

    if (curTemp) curTemp.textContent = `${cur.temp}°C`;
    if (curFelt) curFelt.textContent = `Ressenti ${cur.felt}°C`;
    if (curDesc) curDesc.textContent = cur.desc;
    if (curIcon) curIcon.textContent = cur.icon;
    if (wind) wind.textContent = `${cur.windSpeed} km/h (raf. ${cur.windGusts} km/h)`;
    if (rain) rain.textContent = `${cur.rainProb}% (${cur.rainProb > 40 ? 'Élevé' : 'Faible'})`;
    if (hum) hum.textContent = `${cur.humidity}% (${cur.humidity < 40 ? 'Air sec' : 'Tempéré'})`;
    if (uv) uv.textContent = `Indice ${cur.uvIndex} (${cur.uvIndex >= 8 ? 'Très Élevé' : 'Modéré'})`;

    const itzerT = state.weatherData.itzer.current.temp;
    const zadT = state.weatherData.zad.current.temp;
    const deltaT = Math.round((itzerT - zadT) * 10) / 10;
    if (diff) diff.textContent = `-${deltaT}°C sur les crêtes du Zad`;

    if (adv) {
      if (cur.windGusts > 45) {
        adv.textContent = `⚠️ Rafales fortes (${cur.windGusts} km/h) prévues sur les crêtes et le Col du Zad. Vigilance accrue sur les arêtes rocheuses et arrimage soigné des tentes de bivouac.`;
      } else if (cur.rainProb > 30) {
        adv.textContent = `⛈️ Risque orageux convectif l'après-midi. Passez les crêtes et plateaux dénudés tôt le matin (avant 13h00) et ne restez pas sous les arbres isolés.`;
      } else {
        adv.textContent = `☀️ Conditions optimales pour le trek. Ensoleillement intense à plus de 2000m : couvrez-vous la tête, portez des lunettes catégorie 3-4 et buvez régulièrement.`;
      }
    }

    if (fGrid && data.forecast) {
      fGrid.innerHTML = '';
      data.forecast.forEach(f => {
        const card = document.createElement('div');
        card.className = 'forecast-card';
        card.innerHTML = `
          <div class="forecast-day">${f.day}</div>
          <div class="forecast-icon">${f.icon}</div>
          <div class="forecast-temps">${f.min}° / ${f.max}°C</div>
          <div class="forecast-extra">🌧️ ${f.rain}% • 💨 ${f.wind}km/h</div>
        `;
        fGrid.appendChild(card);
      });
    }
  }

  // Water Calculator Implementation
  function setupWaterCalculator() {
    state.waterCalcStage = 1;
    state.waterCalcTemp = 26;
    state.waterCalcPace = 4.2;
    state.waterCalcPack = 'medium';

    const btnWaterCalc = document.getElementById('btn-water-calc');
    const waterModal = document.getElementById('water-modal');
    const btnCloseWater = document.getElementById('btn-close-water-modal');
    const btnApply = document.getElementById('btn-calc-apply');
    const sliderTemp = document.getElementById('slider-calc-temp');
    const valTemp = document.getElementById('val-calc-temp');

    if (btnWaterCalc && waterModal) {
      btnWaterCalc.addEventListener('click', () => {
        openWaterModal();
      });
    }

    if (btnCloseWater && waterModal) {
      btnCloseWater.addEventListener('click', () => {
        waterModal.style.display = 'none';
      });
    }

    if (btnApply && waterModal) {
      btnApply.addEventListener('click', () => {
        waterModal.style.display = 'none';
      });
    }

    if (waterModal) {
      waterModal.addEventListener('click', e => {
        if (e.target === waterModal) waterModal.style.display = 'none';
      });
    }

    // Stage buttons
    document.querySelectorAll('.calc-stage-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.calc-stage-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.waterCalcStage = parseInt(btn.dataset.stage);
        calculateWater();
      });
    });

    // Temp slider
    if (sliderTemp) {
      sliderTemp.addEventListener('input', e => {
        state.waterCalcTemp = parseInt(e.target.value);
        if (valTemp) valTemp.textContent = `${state.waterCalcTemp}°C`;
        calculateWater();
      });
    }

    // Pace buttons
    document.querySelectorAll('.calc-pace-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.calc-pace-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.waterCalcPace = parseFloat(btn.dataset.pace);
        calculateWater();
      });
    });

    // Pack buttons
    document.querySelectorAll('.calc-pack-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.calc-pack-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.waterCalcPack = btn.dataset.pack;
        calculateWater();
      });
    });

    calculateWater();
  }

  function openWaterModal() {
    const waterModal = document.getElementById('water-modal');
    if (!waterModal) return;
    if (state.activeStage !== 'all') {
      state.waterCalcStage = parseInt(state.activeStage);
      document.querySelectorAll('.calc-stage-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.stage === String(state.waterCalcStage));
      });
    }
    calculateWater();
    waterModal.style.display = 'flex';
  }

  function calculateWater() {
    const stages = state.data.stages || [];
    const stg = stages.find(s => s.id === state.waterCalcStage) || stages[0];
    if (!stg) return;

    // Hiking hours estimation (Naismith formula)
    const walkHours = (stg.distance_km / state.waterCalcPace) + (stg.d_plus_m / 450);
    // Baseline water per hour (0.50 L)
    const baseWater = walkHours * 0.50;
    // Temperature effect above 20°C: +0.03L / hour / °C (standard sports medicine hydration model)
    const tempEffect = Math.max(0, (state.waterCalcTemp - 20) * 0.03 * walkHours);
    // Pack effect
    const packEffect = state.waterCalcPack === 'heavy' ? 0.6 : (state.waterCalcPack === 'medium' ? 0.3 : 0.0);
    // Camp / bivouac allowance: 1.5 L (evening hydration, cooking tagine/tea, breakfast)
    const campAllowance = 1.5;

    const totalLiters = Math.ceil((baseWater + tempEffect + packEffect + campAllowance) * 10) / 10;
    const walkLiters = Math.round((baseWater + tempEffect + packEffect) * 10) / 10;

    const resLiters = document.getElementById('calc-result-liters');
    const resBreakdown = document.getElementById('calc-result-breakdown');
    const dryAlert = document.getElementById('calc-dry-alert');
    const statusText = document.getElementById('calc-water-status-text');

    if (resLiters) resLiters.innerHTML = `${totalLiters.toFixed(1)} <small>Litres / personne</small>`;
    if (resBreakdown) {
      resBreakdown.textContent = `Dont ${walkLiters.toFixed(1)}L pour la marche active (${(walkLiters / walkHours).toFixed(2)}L/h pendant ${walkHours.toFixed(1)}h d'effort) + ${campAllowance}L pour le bivouac et la cuisine du soir.`;
    }

    // High-visibility warning alert for dry stage (Stage 3 = Plateau d'Arid)
    const isDryStage = (stg.id === 3 || stg.name.includes("Arid"));
    if (dryAlert) dryAlert.style.display = isDryStage ? 'flex' : 'none';

    if (statusText) {
      statusText.innerHTML = `<strong>Étape ${stg.id} (${stg.name}) :</strong> ${stg.water_info}`;
    }

    return { totalLiters, walkLiters, walkHours, isDryStage };
  }

  // --------------------------------------------------------------------------
  // AXE 4: 1-Click QR Code & Web Share
  // --------------------------------------------------------------------------
  function setupShareQRCode() {
    const btnShare = document.getElementById('btn-share');
    const shareModal = document.getElementById('share-modal');
    const btnCloseShare = document.getElementById('btn-close-share');
    const btnCloseShareModal = document.getElementById('btn-close-share-modal');
    const btnCopy = document.getElementById('btn-copy-url');
    const shareInput = document.getElementById('share-url-input');
    const copyFeedback = document.getElementById('copy-feedback');
    const qrCanvas = document.getElementById('qr-code-canvas');

    if (btnShare && shareModal) {
      btnShare.addEventListener('click', () => {
        const shareUrl = window.location.protocol.startsWith('http') && !window.location.hostname.includes('localhost') 
          ? window.location.href 
          : 'https://rando-itzer-3d.vercel.app';
        if (shareInput) shareInput.value = shareUrl;
        if (copyFeedback) copyFeedback.style.display = 'none';

        // Render QR Code to Canvas
        if (qrCanvas && window.QRCode) {
          window.QRCode.renderToCanvas(qrCanvas, shareUrl, {
            width: 180,
            height: 180,
            colorDark: '#0f172a',
            colorLight: '#ffffff'
          });
        }
        shareModal.style.display = 'flex';
      });
    }

    if (btnCloseShare && shareModal) {
      btnCloseShare.addEventListener('click', () => {
        shareModal.style.display = 'none';
      });
    }

    if (btnCloseShareModal && shareModal) {
      btnCloseShareModal.addEventListener('click', () => {
        shareModal.style.display = 'none';
      });
    }

    if (shareModal) {
      shareModal.addEventListener('click', e => {
        if (e.target === shareModal) shareModal.style.display = 'none';
      });
    }

    if (btnCopy && shareInput) {
      btnCopy.addEventListener('click', () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(shareInput.value).then(() => {
            if (copyFeedback) copyFeedback.style.display = 'block';
            setTimeout(() => { if (copyFeedback) copyFeedback.style.display = 'none'; }, 3000);
          }).catch(() => {
            shareInput.select();
            document.execCommand('copy');
            if (copyFeedback) copyFeedback.style.display = 'block';
          });
        } else {
          shareInput.select();
          document.execCommand('copy');
          if (copyFeedback) copyFeedback.style.display = 'block';
        }
      });
    }
  }

  // PWA Service Worker Registration & Cache Management
  function registerServiceWorker() {
    // Proactively clear any legacy or outdated caches to ensure immediate live refresh
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => {
          if (name !== 'itzer-3d-v2.4') {
            console.log('[Cache] Purging outdated cache:', name);
            caches.delete(name);
          }
        });
      }).catch(() => {});
    }

    if ('serviceWorker' in navigator && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js?v=2.4')
          .then(reg => {
            reg.update();
            console.log('Service Worker PWA enregistré avec succès (v2.4):', reg.scope);
          })
          .catch(err => console.log('Service Worker non enregistré:', err));
      });
    }
  }

  // 11. Event Listeners Setup
  function setupEventListeners() {
    window.addEventListener('resize', onWindowResize);
    threeCanvas.addEventListener('pointerdown', e => {
      dragStartPos.x = e.clientX;
      dragStartPos.y = e.clientY;
      if (state.isDroneTourActive) {
        toggleDroneTour(); // Smoothly pause tour when user grabs the camera
      }
    });
    threeCanvas.addEventListener('pointermove', handlePointerMove);
    threeCanvas.addEventListener('click', handlePointerClick);

    // Layer buttons
    document.querySelectorAll('.layer-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setLayer(btn.dataset.layer);
      });
    });

    // Sliders
    sliderExaggeration.addEventListener('input', e => {
      state.exaggeration = parseFloat(e.target.value);
      valExaggeration.textContent = `${state.exaggeration.toFixed(1)}x`;
      updateTerrainHeights();
    });

    sliderSun.addEventListener('input', e => {
      state.sunHour = parseFloat(e.target.value);
      const h = Math.floor(state.sunHour);
      const m = state.sunHour % 1 === 0 ? '00' : '30';
      valSun.textContent = `${h}h${m}`;
      updateSunPosition(state.sunHour);
    });

    sliderSpeed.addEventListener('input', e => {
      state.droneSpeed = parseFloat(e.target.value);
      valSpeed.textContent = `${state.droneSpeed.toFixed(1)}x`;
    });

    // Toggles
    toggleRoute.addEventListener('change', e => {
      routeGroup.visible = e.target.checked;
      if (state.currentLayer === 'satellite') {
        const texKey = e.target.checked ? 'satellite' : (state.textures['satellite_raw'] ? 'satellite_raw' : 'satellite');
        terrainMat.map = getTexture(texKey);
        terrainMat.needsUpdate = true;
      }
    });

    toggleFill.addEventListener('change', e => {
      const isVisible = e.target.checked;
      routeGroup.traverse(child => {
        if (child.name && child.name.startsWith('stageRibbon_')) {
          child.visible = isVisible;
        }
      });
      const ribbon = routeGroup.getObjectByName('perimeterRibbon');
      if (ribbon) ribbon.visible = isVisible;
    });

    togglePois.addEventListener('change', e => {
      poiGroup.visible = e.target.checked;
    });

    toggleDock.addEventListener('change', e => {
      const isHidden = !e.target.checked;
      profileDock.classList.toggle('minimized', isHidden);
      btnToggleDock.textContent = isHidden ? '▲' : '▼';
      if (!isHidden && state.chart) {
        setTimeout(() => {
          state.chart.resize();
          state.chart.update('none');
        }, 150);
      }
    });

    btnToggleDock.addEventListener('click', () => {
      const isMin = profileDock.classList.toggle('minimized');
      btnToggleDock.textContent = isMin ? '▲' : '▼';
      if (toggleDock) toggleDock.checked = !isMin;
      if (!isMin && state.chart) {
        setTimeout(() => {
          state.chart.resize();
          state.chart.update('none');
        }, 150);
      }
    });

    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
    });

    compassBtn.addEventListener('click', resetNorth);

    btnDroneTour.addEventListener('click', toggleDroneTour);

    btnMeasure.addEventListener('click', () => {
      state.isMeasuring = !state.isMeasuring;
      btnMeasure.classList.toggle('btn-active', state.isMeasuring);
      measureHud.classList.toggle('active', state.isMeasuring);
      if (!state.isMeasuring) resetMeasurement();
    });

    btnMeasureReset.addEventListener('click', resetMeasurement);

    btnScreenshot.addEventListener('click', () => {
      const link = document.createElement('a');
      link.download = 'carte_topographique_3d_itzer.png';
      if (state.activeEngine === 'maplibre' && state.maplibreMap) {
        link.href = state.maplibreMap.getCanvas().toDataURL('image/png');
      } else {
        renderer.render(scene, camera);
        link.href = threeCanvas.toDataURL('image/png');
      }
      link.click();
    });

    btnExportGeoJSON.addEventListener('click', () => {
      const geojsonData = state.data.geojson || {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {
            name: state.data.project?.title || "Projet Rando Zaghfouland - ITZER",
            description: state.data.project?.description || "Périmètre de randonnée - Moyen Atlas",
            perimeter_km: state.data.stats?.perimeter_km || 105.0,
            area_km2: state.data.stats?.area_km2 || 612.4,
            d_plus_m: state.data.stats?.d_plus_m || 5440,
            d_minus_m: state.data.stats?.d_minus_m || 5456,
            min_elevation_m: state.data.stats?.min_ele_m || 1391,
            max_elevation_m: state.data.stats?.max_ele_m || 1868
          },
          geometry: {
            type: 'Polygon',
            coordinates: [state.data.polygon.map(pt => [pt.lon, pt.lat, pt.elevation_m])]
          }
        }]
      };
      const dataStr = 'data:application/geo+json;charset=utf-8,' + encodeURIComponent(JSON.stringify(geojsonData, null, 2));
      const link = document.createElement('a');
      link.download = 'zone_rando_itzer.geojson';
      link.href = dataStr;
      link.click();
    });

    btnSwitchEngine.addEventListener('click', switchEngine);

    // Stage Selector Buttons
    document.querySelectorAll('.stage-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setStage(btn.dataset.stage);
      });
    });

    // Topoguide Modal Controls
    const btnTopoguide = document.getElementById('btn-topoguide');
    const topoguideModal = document.getElementById('topoguide-modal');
    const btnCloseTopoguide = document.getElementById('btn-close-topoguide');
    const btnPrintTopoguide = document.getElementById('btn-print-topoguide');

    if (btnTopoguide && topoguideModal) {
      btnTopoguide.addEventListener('click', () => {
        topoguideModal.style.display = 'flex';
      });
    }

    if (btnCloseTopoguide && topoguideModal) {
      btnCloseTopoguide.addEventListener('click', () => {
        topoguideModal.style.display = 'none';
      });
    }

    if (topoguideModal) {
      topoguideModal.addEventListener('click', e => {
        if (e.target === topoguideModal) topoguideModal.style.display = 'none';
      });
    }

    if (btnPrintTopoguide) {
      btnPrintTopoguide.addEventListener('click', () => {
        window.print();
      });
    }

    // Rich POI Modal Controls
    const poiModal = document.getElementById('poi-modal');
    const btnClosePoi = document.getElementById('btn-close-poi-modal');
    const btnDismissPoi = document.getElementById('btn-poi-dismiss');
    const btnPoiFly = document.getElementById('btn-poi-fly');

    if (btnClosePoi && poiModal) {
      btnClosePoi.addEventListener('click', () => {
        poiModal.style.display = 'none';
      });
    }

    if (btnDismissPoi && poiModal) {
      btnDismissPoi.addEventListener('click', () => {
        poiModal.style.display = 'none';
      });
    }

    if (poiModal) {
      poiModal.addEventListener('click', e => {
        if (e.target === poiModal) poiModal.style.display = 'none';
      });
    }

    if (btnPoiFly && poiModal) {
      btnPoiFly.addEventListener('click', () => {
        poiModal.style.display = 'none';
        if (state.selectedPOI) flyToPOI(state.selectedPOI);
      });
    }

    // New 4 Axes Event Listeners
    const btnGps = document.getElementById('btn-gps');
    const btnCloseGpsHud = document.getElementById('btn-close-gps-hud');
    const btnGpsDemo = document.getElementById('btn-gps-demo');
    const toggleGpsFollow = document.getElementById('toggle-gps-follow');
    const toggleCedars = document.getElementById('toggle-cedars');
    const toggleFog = document.getElementById('toggle-fog');
    const btnWaterCalc = document.getElementById('btn-water-calc');

    if (btnGps) btnGps.addEventListener('click', () => toggleGPS());
    if (btnCloseGpsHud) btnCloseGpsHud.addEventListener('click', () => toggleGPS(false));
    if (btnGpsDemo) btnGpsDemo.addEventListener('click', () => toggleGpsDemo());
    if (toggleGpsFollow) {
      toggleGpsFollow.addEventListener('change', e => {
        state.isGpsFollow = e.target.checked;
      });
    }

    if (toggleCedars) {
      toggleCedars.addEventListener('change', e => {
        state.cedarsVisible = e.target.checked;
        if (cedarGroup) cedarGroup.visible = e.target.checked;
      });
    }

    if (toggleFog) {
      toggleFog.addEventListener('change', e => {
        state.fogVisible = e.target.checked;
        updateFogState(state.sunHour);
      });
    }

    if (btnWaterCalc) {
      btnWaterCalc.addEventListener('click', () => {
        openWaterModal();
      });
    }

    // Keyboard ESC key closes all active modals
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (poiModal) poiModal.style.display = 'none';
        if (topoguideModal) topoguideModal.style.display = 'none';
        const weatherModal = document.getElementById('weather-modal');
        const waterModal = document.getElementById('water-modal');
        const shareModal = document.getElementById('share-modal');
        if (weatherModal) weatherModal.style.display = 'none';
        if (waterModal) waterModal.style.display = 'none';
        if (shareModal) shareModal.style.display = 'none';
        if (state.isWalkerActive) toggleWalkerMode(false);
      }
    });
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (state.maplibreMap) state.maplibreMap.resize();
    if (state.chart) {
      state.chart.resize();
      state.chart.update('none');
    }
  }

  // 12. Main Animation Render Loop
  function animate() {
    animationFrameId = requestAnimationFrame(animate);

    if (state.activeEngine === 'three') {
      if (!state.isWalkerActive) {
        controls.update();
        updateDroneFlight();
        updateCompass();
      } else {
        updateWalkerAuto();
      }
      updateGpsPulse();
      renderer.render(scene, camera);
    }
  }

  // ============================================================================
  // TOAST NOTIFICATION SYSTEM
  // ============================================================================
  function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
      <span class="toast-msg">${message}</span>
      <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => { if (toast.parentElement) toast.remove(); }, 310);
    }, duration);
  }
  // Expose globally for test validation
  window.showToast = showToast;

  // ============================================================================
  // SPLASH SCREEN MANAGEMENT
  // ============================================================================
  function initSplashScreen() {
    const splash = document.getElementById('splash-screen');
    const progressBar = document.getElementById('splash-progress-bar');
    const statusText = document.getElementById('splash-status');
    if (!splash) return;

    const steps = [
      { pct: 20, text: 'Chargement du relief 3D Moyen Atlas...' },
      { pct: 40, text: 'Construction du maillage terrain...' },
      { pct: 60, text: 'Positionnement des balises et sommets...' },
      { pct: 80, text: 'Calcul des profils altimétriques...' },
      { pct: 100, text: 'Carte prête – Bonne randonnée ! 🏔️' }
    ];

    let stepIndex = 0;
    const interval = setInterval(() => {
      if (stepIndex < steps.length) {
        const step = steps[stepIndex];
        if (progressBar) progressBar.style.width = step.pct + '%';
        if (statusText) statusText.textContent = step.text;
        stepIndex++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          splash.classList.add('hidden');
        }, 400);
      }
    }, 350);
  }

  // ============================================================================
  // COMMAND PALETTE (Ctrl+K)
  // ============================================================================
  let cpItems = [];
  let cpFocusIndex = -1;

  function buildCommandPaletteItems() {
    const items = [];
    if (!state.data) return items;

    // POIs
    (state.data.pois || []).forEach(p => {
      items.push({
        icon: p.category_icon || '📍',
        name: p.name,
        desc: `${p.category} · ${p.elevation_m}m`,
        badge: 'POI',
        action: () => { openPOICard(p); flyToPOI(p); }
      });
    });

    // Stages
    (state.data.stages || []).forEach(s => {
      items.push({
        icon: '🏁',
        name: s.name,
        desc: `${s.distance_km} km · D+ ${s.d_plus_m}m · ${s.estimated_time}`,
        badge: `Étape ${s.id}`,
        action: () => setStage(s.id)
      });
    });

    // Zaghfouland Loops (10, 15, 20, 25, 30 km)
    (state.data.zaghfouland_loops || []).forEach(l => {
      items.push({
        icon: '🔄',
        name: l.short_name,
        desc: `${l.actual_km} km · D+ ${l.d_plus_m}m · ${l.theme}`,
        badge: 'Boucle Zaghfouland',
        action: () => setZaghfoulandLoop(l.id)
      });
    });

    // Feature toggles
    items.push({ icon: '📍', name: 'GPS Direct', desc: 'Activer la géolocalisation', badge: 'Outil', action: () => toggleGPS() });
    items.push({ icon: '🌤️', name: 'Météo', desc: 'Ouvrir la météo montagne', badge: 'Outil', action: () => { const m = document.getElementById('weather-modal'); if (m) { m.style.display='flex'; fetchOpenMeteo(); } } });
    items.push({ icon: '💧', name: 'Calcul Eau', desc: 'Calculateur hydratation', badge: 'Outil', action: () => openWaterModal() });
    items.push({ icon: '🚶', name: 'Mode Walker', desc: 'Vue immersive randonneur', badge: 'Outil', action: () => toggleWalkerMode() });
    items.push({ icon: '🚁', name: 'Survol Drone', desc: 'Tour cinématique 3D', badge: 'Outil', action: () => toggleDroneTour() });
    items.push({ icon: '📐', name: 'Mesurer', desc: 'Mesure distance et dénivelé', badge: 'Outil', action: () => { state.isMeasuring = !state.isMeasuring; const b = document.getElementById('btn-measure'); const h = document.getElementById('measure-hud'); if (b) b.classList.toggle('btn-active', state.isMeasuring); if (h) h.classList.toggle('active', state.isMeasuring); } });
    items.push({ icon: '📋', name: 'Topoguide', desc: 'Ouvrir le guide imprimable', badge: 'Outil', action: () => { const m = document.getElementById('topoguide-modal'); if (m) m.style.display='flex'; } });
    items.push({ icon: '🗺️', name: 'Mode Carte MapLibre', desc: 'Basculer vers la carte 2D', badge: 'Vue', action: () => switchEngine() });
    items.push({ icon: '🌫️', name: 'Brouillard', desc: 'Activer / désactiver le brouillard', badge: 'Couche', action: () => { const t = document.getElementById('toggle-fog'); if (t) { t.checked = !t.checked; t.dispatchEvent(new Event('change')); } } });
    items.push({ icon: '🗺️', name: 'ArcGIS Mode', desc: 'Vue ArcGIS satellite Esri', badge: 'Vue', action: () => switchToArcGIS() });

    return items;
  }

  function openCommandPalette() {
    cpItems = buildCommandPaletteItems();
    cpFocusIndex = -1;
    const overlay = document.getElementById('command-palette');
    const input = document.getElementById('command-palette-input');
    if (!overlay) return;
    overlay.style.display = 'flex';
    if (input) { input.value = ''; input.focus(); }
    renderCommandResults('');
  }

  function closeCommandPalette() {
    const overlay = document.getElementById('command-palette');
    if (overlay) overlay.style.display = 'none';
  }

  function renderCommandResults(query) {
    const container = document.getElementById('command-palette-results');
    if (!container) return;

    const q = query.toLowerCase().trim();
    const filtered = q === '' ? cpItems.slice(0, 12) : cpItems.filter(item => {
      return item.name.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q) || item.badge.toLowerCase().includes(q);
    }).slice(0, 12);

    container.innerHTML = '';
    cpFocusIndex = -1;

    if (filtered.length === 0) {
      container.innerHTML = '<div style="padding:16px;text-align:center;color:#475569;font-size:13px;">Aucun résultat pour "' + query + '"</div>';
      return;
    }

    filtered.forEach((item, i) => {
      const el = document.createElement('div');
      el.className = 'cp-result-item';
      el.innerHTML = `
        <span class="cp-result-icon">${item.icon}</span>
        <div class="cp-result-info">
          <div class="cp-result-name">${item.name}</div>
          <div class="cp-result-desc">${item.desc}</div>
        </div>
        <span class="cp-result-badge">${item.badge}</span>
      `;
      el.addEventListener('click', () => { item.action(); closeCommandPalette(); showToast(`Exécution : ${item.name}`, 'success', 1500); });
      container.appendChild(el);
    });

    container._filtered = filtered;
  }

  function setupCommandPalette() {
    const overlay = document.getElementById('command-palette');
    const input = document.getElementById('command-palette-input');
    const btnOpen = document.getElementById('btn-command-palette');

    if (btnOpen) btnOpen.addEventListener('click', openCommandPalette);
    if (overlay) overlay.addEventListener('click', e => { if (e.target === overlay) closeCommandPalette(); });
    if (input) {
      input.addEventListener('input', e => renderCommandResults(e.target.value));
      input.addEventListener('keydown', e => {
        const items = document.querySelectorAll('.cp-result-item');
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          cpFocusIndex = Math.min(cpFocusIndex + 1, items.length - 1);
          items.forEach((el, i) => el.classList.toggle('focused', i === cpFocusIndex));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          cpFocusIndex = Math.max(cpFocusIndex - 1, 0);
          items.forEach((el, i) => el.classList.toggle('focused', i === cpFocusIndex));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const focused = document.querySelector('.cp-result-item.focused');
          if (focused) focused.click();
          else if (items.length > 0) items[0].click();
        } else if (e.key === 'Escape') {
          closeCommandPalette();
        }
      });
    }

    // Global Ctrl+K handler
    window.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const overlay = document.getElementById('command-palette');
        if (overlay && overlay.style.display === 'none') openCommandPalette();
        else closeCommandPalette();
      }
    });
  }

  // ============================================================================
  // SIDEBAR TABS
  // ============================================================================
  function setupSidebarTabs() {
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const targetId = 'tab-' + tab.dataset.tab;
        document.querySelectorAll('.sidebar-tab-content').forEach(c => {
          c.style.display = c.id === targetId ? 'block' : 'none';
        });
      });
    });

    // POI search filter
    const poiSearch = document.getElementById('poi-search-input');
    if (poiSearch) {
      poiSearch.addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('.poi-item').forEach(item => {
          const name = item.querySelector('.poi-name')?.textContent.toLowerCase() || '';
          const cat = item.querySelector('.poi-cat-badge')?.textContent.toLowerCase() || '';
          item.style.display = (name.includes(q) || cat.includes(q)) ? '' : 'none';
        });
      });
    }

    // POI Quick Filter Chips (Water, Bivouacs, Summits, Cedars)
    document.querySelectorAll('.poi-filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.poi-filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const filter = chip.dataset.poiFilter;

        document.querySelectorAll('.poi-item').forEach(item => {
          const cat = item.querySelector('.poi-cat-badge')?.textContent.toLowerCase() || '';
          const name = item.querySelector('.poi-name')?.textContent.toLowerCase() || '';
          let match = false;
          if (filter === 'all') match = true;
          else if (filter === 'water') match = cat.includes('source') || cat.includes('eau') || name.includes('aïn');
          else if (filter === 'bivouac') match = cat.includes('bivouac');
          else if (filter === 'summit') match = cat.includes('sommet') || cat.includes('col') || cat.includes('crête');
          else if (filter === 'cedar') match = cat.includes('cédraie') || cat.includes('flore') || cat.includes('forêt');
          item.style.display = match ? '' : 'none';
        });

        // Filter 3D POI pins
        if (poiGroup) {
          state.data.pois.forEach((poi, idx) => {
            const marker = poiGroup.getObjectByName(`poi_${idx}`);
            if (marker) {
              let visible = true;
              if (filter === 'water') visible = poi.category === "Source d'eau" || poi.name.includes('Aïn');
              else if (filter === 'bivouac') visible = poi.category === 'Bivouac';
              else if (filter === 'summit') visible = poi.category === 'Sommet';
              else if (filter === 'cedar') visible = poi.category === 'Flore / Cédraie';
              marker.visible = visible;
            }
          });
        }

        if (window.__waterBeaconsGroup) {
          window.__waterBeaconsGroup.visible = (filter === 'all' || filter === 'water');
        }
      });
    });
  }

  // ============================================================================
  // ARCGIS JS API MODE (3rd engine)
  // ============================================================================
  let arcgisView = null;

  function switchToArcGIS() {
    if (state.activeEngine === 'arcgis') return;

    // Offline check: try to ping ArcGIS CDN
    if (!navigator.onLine) {
      showToast("ArcGIS nécessite une connexion internet", 'warning');
      return;
    }

    const arcgisContainer = document.getElementById('arcgis-container');
    const elevPanel = document.getElementById('arcgis-elevation-panel');

    // Hide other views
    const threeCanvas = document.getElementById('three-canvas');
    const maplibreContainer = document.getElementById('maplibre-container');
    if (threeCanvas) { threeCanvas.style.display = 'none'; }
    if (maplibreContainer) { maplibreContainer.style.display = 'none'; }
    if (arcgisContainer) {
      arcgisContainer.style.display = 'block';
      arcgisContainer.classList.add('engine-entering');
    }
    if (elevPanel) elevPanel.style.display = 'block';

    const prevEngine = state.activeEngine;
    state.activeEngine = 'arcgis';

    showToast("Chargement de la vue ArcGIS Satellite...", 'info');

    // Try to load via CDN require
    if (typeof require === 'function') {
      try {
        require([
          "esri/Map",
          "esri/views/MapView",
          "esri/layers/GraphicsLayer",
          "esri/Graphic",
          "esri/geometry/Point",
          "esri/geometry/Polyline",
          "esri/geometry/Polygon",
          "esri/layers/ElevationLayer",
          "esri/symbols/SimpleMarkerSymbol",
          "esri/symbols/SimpleLineSymbol",
          "esri/symbols/SimpleFillSymbol",
          "esri/PopupTemplate"
        ], (Map, MapView, GraphicsLayer, Graphic, Point, Polyline, Polygon, ElevationLayer, SimpleMarkerSymbol, SimpleLineSymbol, SimpleFillSymbol, PopupTemplate) => {

          const esriMap = new Map({ basemap: "satellite" });
          const center = state.data.bounds ? [
            (state.data.bounds.lon_range[0] + state.data.bounds.lon_range[1]) / 2,
            (state.data.bounds.lat_range[0] + state.data.bounds.lat_range[1]) / 2
          ] : [-5.07, 32.91];

          const view = new MapView({
            container: arcgisContainer,
            map: esriMap,
            center: center,
            zoom: 10
          });
          arcgisView = view;

          const graphicsLayer = new GraphicsLayer();
          esriMap.add(graphicsLayer);

          view.when(() => {
            // 1. Boundary polygon (KMZ zone)
            if (state.data.polygon) {
              const rings = [state.data.polygon.map(pt => [pt.lon, pt.lat])];
              const zoneGraphic = new Graphic({
                geometry: new Polygon({ rings }),
                symbol: new SimpleFillSymbol({
                  color: [0, 0, 0, 0],
                  outline: { color: [0, 240, 255, 255], width: 2 }
                })
              });
              graphicsLayer.add(zoneGraphic);
            }

            // 2. Stage polylines
            const stageColors = {1:[6,182,212], 2:[16,185,129], 3:[245,158,11], 4:[139,92,246]};
            (state.data.stages || []).forEach(stg => {
              const pts = state.data.profile.slice(stg.start_index, stg.end_index + 1)
                .map(p => [p.lon, p.lat]);
              const c = stageColors[stg.id] || [6,182,212];
              const lineGraphic = new Graphic({
                geometry: new Polyline({ paths: [pts] }),
                symbol: new SimpleLineSymbol({ color: c, width: 3 })
              });
              graphicsLayer.add(lineGraphic);
            });

            // 3. POIs as point graphics
            (state.data.pois || []).forEach(poi => {
              const catColors = {
                'Sommet': [245,158,11,255],
                'Bivouac': [16,185,129,255],
                "Source d'eau": [6,182,212,255],
                'Flore / Cédraie': [20,184,166,255],
                'Village / Ravitaillement': [139,92,246,255]
              };
              const color = catColors[poi.category] || [6,182,212,255];
              const pGraphic = new Graphic({
                geometry: new Point({ longitude: poi.lon, latitude: poi.lat }),
                symbol: new SimpleMarkerSymbol({ color, size: 10, outline: { color: [255,255,255,255], width: 1.5 } }),
                popupTemplate: new PopupTemplate({
                  title: `${poi.category_icon || '📍'} ${poi.name}`,
                  content: `<b>Altitude:</b> ${poi.elevation_m}m<br/><b>Eau:</b> ${poi.water_status}<br/><b>Étape:</b> ${poi.stage || '—'}<br/><p style="margin-top:6px;">${poi.desc}</p>`
                })
              });
              graphicsLayer.add(pGraphic);
            });

            // 4. Elevation on click
            const elevLayer = new ElevationLayer({ url: "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer" });
            view.on("click", e => {
              elevLayer.queryElevation(e.mapPoint).then(result => {
                const elev = Math.round(result.geometry.z);
                const lon = e.mapPoint.longitude.toFixed(5);
                const lat = e.mapPoint.latitude.toFixed(5);
                const panel = document.getElementById('arcgis-elevation-panel');
                const valEl = document.getElementById('arcgis-elevation-value');
                const coordEl = document.getElementById('arcgis-click-coords');
                if (valEl) valEl.textContent = `${elev} m`;
                if (coordEl) coordEl.textContent = `${lat}°N, ${Math.abs(lon)}°W`;
                showToast(`Élévation : ${elev}m au point cliqué`, 'info', 2000);
              }).catch(() => {});
            });

            showToast("Vue ArcGIS chargée avec succès !", 'success');
          }).catch(() => {
            showToast("Erreur lors de l'initialisation ArcGIS", 'error');
            revertToPreviousEngine(prevEngine);
          });
        });
      } catch(e) {
        showToast("ArcGIS nécessite une connexion internet", 'warning');
        revertToPreviousEngine(prevEngine);
      }
    } else {
      showToast("Chargement de l'API ArcGIS...", 'info', 2000);
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://js.arcgis.com/4.30/esri/themes/dark/main.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://js.arcgis.com/4.30/';
      script.onload = () => {
        if (typeof require === 'function') {
          switchToArcGIS();
        } else {
          showToast("ArcGIS nécessite une connexion internet", 'warning');
          revertToPreviousEngine(prevEngine);
        }
      };
      script.onerror = () => {
        showToast("Impossible de joindre le serveur ArcGIS (hors-ligne)", 'warning');
        revertToPreviousEngine(prevEngine);
      };
      document.head.appendChild(script);
    }
  }

  function revertToPreviousEngine(prevEngine) {
    state.activeEngine = prevEngine || 'three';
    const arcgisContainer = document.getElementById('arcgis-container');
    const elevPanel = document.getElementById('arcgis-elevation-panel');
    if (arcgisContainer) arcgisContainer.style.display = 'none';
    if (elevPanel) elevPanel.style.display = 'none';
    if (prevEngine === 'maplibre') {
      const maplibreContainer = document.getElementById('maplibre-container');
      if (maplibreContainer) maplibreContainer.style.display = 'block';
    } else {
      const threeCanvas = document.getElementById('three-canvas');
      if (threeCanvas) threeCanvas.style.display = 'block';
    }
  }

  function exitArcGIS() {
    if (state.activeEngine !== 'arcgis') return;
    const arcgisContainer = document.getElementById('arcgis-container');
    const elevPanel = document.getElementById('arcgis-elevation-panel');
    if (arcgisContainer) arcgisContainer.style.display = 'none';
    if (elevPanel) elevPanel.style.display = 'none';
    state.activeEngine = 'three';
    const threeCanvas = document.getElementById('three-canvas');
    if (threeCanvas) { threeCanvas.style.display = 'block'; threeCanvas.classList.add('engine-entering'); }
  }

  // ============================================================================
  // MINIMAP
  // ============================================================================
  function setupMinimap() {
    const btn = document.getElementById('btn-minimap-toggle');
    const panel = document.getElementById('minimap-panel');
    if (!btn || !panel) return;

    let collapsed = false;
    btn.addEventListener('click', () => {
      collapsed = !collapsed;
      panel.classList.toggle('collapsed', collapsed);
      btn.title = collapsed ? 'Afficher la carte de contexte' : 'Réduire la carte de contexte';
    });
  }

  // ============================================================================
  // KEYBOARD SHORTCUTS
  // ============================================================================
  function setupKeyboardShortcuts() {
    const btn = document.getElementById('btn-shortcuts');
    const modal = document.getElementById('shortcuts-modal');
    const closeBtn = document.getElementById('btn-close-shortcuts');

    if (btn && modal) {
      btn.addEventListener('click', () => { modal.style.display = 'flex'; });
    }
    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
    }
    if (modal) {
      modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
    }

    // Global shortcut keys
    window.addEventListener('keydown', e => {
      // Skip if command palette is open or inside an input
      const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
      const cpOpen = document.getElementById('command-palette')?.style.display !== 'none';
      if (cpOpen && e.key !== 'Escape') return;

      if (e.key === 'Escape') {
        if (modal) modal.style.display = 'none';
        const cpOverlay = document.getElementById('command-palette');
        if (cpOverlay && cpOverlay.style.display !== 'none') closeCommandPalette();
        if (document.body.classList.contains('zen-mode')) toggleFullscreenMode();
        if (typeof loopDrone !== 'undefined' && loopDrone.active) stopLoopDroneFly();
        return;
      }

      if (isInput) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          toggleDroneTour();
          break;
        case 'm': case 'M':
          if (!e.ctrlKey) {
            state.isMeasuring = !state.isMeasuring;
            const btnM = document.getElementById('btn-measure');
            const hudM = document.getElementById('measure-hud');
            if (btnM) btnM.classList.toggle('btn-active', state.isMeasuring);
            if (hudM) hudM.classList.toggle('active', state.isMeasuring);
            if (!state.isMeasuring) resetMeasurement();
          }
          break;
        case 'f': case 'F':
          toggleFullscreenMode();
          break;
        case 'b': case 'B':
          toggleBivouacCeleste();
          break;
        case 'g': case 'G':
          toggleGPS();
          break;
        case '1': setStage(1); break;
        case '2': setStage(2); break;
        case '3': setStage(3); break;
        case '4': setStage(4); break;
      }
    });
  }

  // ============================================================================
  // ArcGIS button event listener
  // ============================================================================
  function setupArcGISButton() {
    const btn = document.getElementById('btn-switch-arcgis');
    if (btn) {
      btn.addEventListener('click', () => {
        if (state.activeEngine === 'arcgis') {
          exitArcGIS();
          btn.querySelector('span').textContent = 'ArcGIS';
          showToast('Retour au mode 3D', 'info', 1500);
        } else {
          switchToArcGIS();
          btn.querySelector('span').textContent = 'Vue 3D';
        }
      });
    }
  }

  // ============================================================================
  // STAGE RIBBON PULSE ANIMATION (UX Polish)
  // ============================================================================
  function pulseStageRibbon(stageId) {
    if (!routeGroup) return;
    const ribbon = routeGroup.getObjectByName(`stageRibbon_${stageId}`);
    if (!ribbon) return;
    const origOpacity = ribbon.material.opacity;
    let t = 0;
    const pulse = setInterval(() => {
      t += 0.1;
      const s = 1.0 + Math.sin(t * Math.PI * 3) * 0.25;
      ribbon.material.opacity = Math.min(1, origOpacity * s);
      if (t >= 1.0) {
        clearInterval(pulse);
        ribbon.material.opacity = origOpacity;
      }
    }, 30);
  }

  // Override setStage to add pulse effect
  const _origSetStage = setStage;
  function setStageWithPulse(stageId) {
    _origSetStage(stageId);
    if (stageId !== 'all') pulseStageRibbon(stageId);
  }

  // ============================================================================
  // WALKER MODE: Moving Dot on Profile Chart
  // ============================================================================
  function setupWalkerChartDot() {
    const wrap = document.querySelector('.profile-chart-wrap');
    if (!wrap) return;
    if (wrap.style.position !== 'relative') wrap.style.position = 'relative';
    const dot = document.createElement('div');
    dot.id = 'walker-chart-dot';
    dot.style.display = 'none';
    wrap.appendChild(dot);
  }

  function updateWalkerChartDot() {
    const dot = document.getElementById('walker-chart-dot');
    if (!dot || !state.chart || !state.isWalkerActive) {
      if (dot) dot.style.display = 'none';
      return;
    }

    const profile = state.currentSubProfile || state.data.profile;
    if (!profile || profile.length === 0) return;

    // Find current profile index relative to subprofile
    const walkerPt = state.data.profile[state.walkerIndex];
    const subIdx = profile.findIndex(p => Math.abs(p.distance_km - walkerPt.distance_km) < 0.05);
    if (subIdx < 0) { dot.style.display = 'none'; return; }

    const meta = state.chart.getDatasetMeta(0);
    if (!meta || !meta.data || !meta.data[subIdx]) return;

    const pt = meta.data[subIdx];
    dot.style.display = 'block';
    dot.style.left = (pt.x || 0) + 'px';
    dot.style.top = (pt.y || 0) + 'px';
  }

  // ============================================================================
  // CIRCUITS & BOUCLES DEPUIS ZAGHFOULAND (10, 15, 20, 25, 30 km)
  // ============================================================================
  let loopsGroup = null;
  let activeLoopId = null;

  function setupZaghfoulandLoops() {
    const loops = state.data.zaghfouland_loops;
    if (!loops || loops.length === 0) return;

    loopsGroup = new THREE.Group();
    loopsGroup.name = "zaghfoulandLoopsGroup";
    scene.add(loopsGroup);
    window.__loopsGroup = loopsGroup;

    // 1. Build 3D paths for each loop
    loops.forEach(loop => {
      const pts = loop.path;
      if (!pts || pts.length === 0) return;

      const pathVecs = [];
      const ribbonPositions = [];
      const ribbonIndices = [];

      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        const x = (pt.u - 0.5) * TERRAIN_W;
        const z = (pt.v - 0.5) * TERRAIN_H;
        const y = (pt.elevation_m - ELEVATION_BASE) * ELEVATION_SCALE * state.exaggeration + 1.2;
        const v = new THREE.Vector3(x, y, z);
        pathVecs.push(v);

        ribbonPositions.push(x, y - 0.8, z);
        ribbonPositions.push(x, y + 0.8, z);

        if (i < pts.length - 1) {
          const base = i * 2;
          ribbonIndices.push(base, base + 1, base + 2);
          ribbonIndices.push(base + 1, base + 3, base + 2);
        }
      }

      // 3D Line
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pathVecs);
      const lineMat = new THREE.LineBasicMaterial({
        color: loop.color,
        linewidth: 3,
        transparent: true,
        opacity: 0.95
      });
      const lineMesh = new THREE.Line(lineGeo, lineMat);
      lineMesh.name = `loopLine_${loop.id}`;
      lineMesh.visible = false;
      loopsGroup.add(lineMesh);

      // 3D Ribbon
      const ribbonGeo = new THREE.BufferGeometry();
      ribbonGeo.setAttribute('position', new THREE.Float32BufferAttribute(ribbonPositions, 3));
      ribbonGeo.setIndex(ribbonIndices);
      ribbonGeo.computeVertexNormals();

      const ribbonMat = new THREE.MeshBasicMaterial({
        color: loop.color,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide
      });
      const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
      ribbonMesh.name = `loopRibbon_${loop.id}`;
      ribbonMesh.visible = false;
      loopsGroup.add(ribbonMesh);

      // 3D Highlight Markers (Repos, Belvédères, Bivouacs camping plein ciel)
      const markersGroup = new THREE.Group();
      markersGroup.name = `loopMarkers_${loop.id}`;
      markersGroup.visible = false;

      (loop.highlights || []).forEach(hl => {
        const targetD = hl.km;
        let bestPt = pts[0];
        let minDiff = 999;
        for (let p of pts) {
          const diff = Math.abs(p.distance_km - targetD);
          if (diff < minDiff) { minDiff = diff; bestPt = p; }
        }
        const x = (bestPt.u - 0.5) * TERRAIN_W;
        const z = (bestPt.v - 0.5) * TERRAIN_H;
        const y = (bestPt.elevation_m - ELEVATION_BASE) * ELEVATION_SCALE * state.exaggeration + 1.5;

        const pinColor = hl.icon === '🌌' ? 0xa855f7 : (hl.icon === '☕' ? 0xf59e0b : 0x06b6d4);
        const pin = new THREE.Mesh(
          new THREE.CylinderGeometry(0.8, 0.2, 5.0, 14),
          new THREE.MeshStandardMaterial({ color: pinColor, emissive: pinColor, emissiveIntensity: 0.5 })
        );
        pin.position.set(x, y + 2.5, z);
        markersGroup.add(pin);
      });

      loopsGroup.add(markersGroup);
    });

    // 2. Render Loop Cards in Sidebar
    const container = document.getElementById('sidebar-loops');
    if (container) {
      container.innerHTML = '';
      loops.forEach(loop => {
        const card = document.createElement('div');
        card.className = 'loop-card';
        card.dataset.loopId = loop.id;

        const highlightsHtml = (loop.highlights || []).map(h => `
          <div class="loop-highlight-row">
            <span>${h.icon}</span>
            <div><strong>${h.name}</strong> (km ${h.km}) : ${h.desc}</div>
          </div>
        `).join('');

        card.innerHTML = `
          <div class="loop-card-top">
            <div class="loop-card-title">${loop.short_name}</div>
            <span class="loop-badge-km" style="border-color:${loop.color};color:${loop.color};background:${loop.color}22;">
              ${loop.actual_km} km
            </span>
          </div>
          <div class="loop-card-theme">${loop.theme}</div>
          <div class="loop-metrics-row">
            <span class="loop-metric-chip">📈 D+ ${loop.d_plus_m} m</span>
            <span class="loop-metric-chip">📉 D- ${loop.d_minus_m} m</span>
            <span class="loop-metric-chip">⏱️ ${loop.estimated_time}</span>
            <span class="loop-metric-chip">🏔️ ${loop.min_ele_m}-${loop.max_ele_m}m</span>
            <span class="loop-metric-chip">⚡ ${loop.difficulty}</span>
          </div>
          <div class="loop-highlights-list">
            ${highlightsHtml}
          </div>
          <div class="loop-card-actions">
            <button class="loop-action-btn-fly" style="border-color:${loop.color};color:${loop.color};" title="Lancer le survol drone 3D cinématique le long de cette boucle">
              <span>🚁 Survol 3D</span>
            </button>
            <button class="loop-action-btn-gpx" title="Télécharger la trace GPS au format standard GPX 1.1">
              <span>📥 GPX 1.1</span>
            </button>
          </div>
        `;

        const btnFly = card.querySelector('.loop-action-btn-fly');
        if (btnFly) {
          btnFly.addEventListener('click', (e) => {
            e.stopPropagation();
            setZaghfoulandLoop(loop.id);
            startLoopDroneFly(loop.id);
          });
        }

        const btnGpx = card.querySelector('.loop-action-btn-gpx');
        if (btnGpx) {
          btnGpx.addEventListener('click', (e) => {
            e.stopPropagation();
            downloadLoopGPX(loop.id, e);
          });
        }

        card.addEventListener('click', () => setZaghfoulandLoop(loop.id));
        container.appendChild(card);
      });
    }

    // 3. Header button to trigger Boucles tab
    const btnBoucles = document.getElementById('btn-boucles-zaghfouland');
    if (btnBoucles) {
      btnBoucles.addEventListener('click', () => {
        const tabBtn = document.querySelector('.sidebar-tab[data-tab="boucles"]');
        if (tabBtn) tabBtn.click();
        const sidebar = document.getElementById('sidebar');
        if (sidebar && !sidebar.classList.contains('active')) {
          sidebar.classList.add('active');
        }
        showToast("Sélectionnez l'une des 5 boucles de randonnée depuis Zaghfouland", 'info', 2500);
      });
    }
  }

  function setZaghfoulandLoop(loopId) {
    const loops = state.data.zaghfouland_loops;
    if (!loops) return;
    const loop = loops.find(l => l.id === loopId);
    if (!loop) return;

    activeLoopId = loopId;

    // Update active card in sidebar
    document.querySelectorAll('.loop-card').forEach(c => {
      c.classList.toggle('active', c.dataset.loopId === loopId);
    });

    // Dim the main 105km stage ribbons
    if (routeGroup) {
      routeGroup.traverse(child => {
        if (child.name && (child.name.startsWith('stageLine_') || child.name.startsWith('stageRibbon_'))) {
          child.material.opacity = 0.10;
        }
      });
    }

    // Show selected loop in 3D
    if (loopsGroup) {
      loops.forEach(l => {
        const line = loopsGroup.getObjectByName(`loopLine_${l.id}`);
        const rib = loopsGroup.getObjectByName(`loopRibbon_${l.id}`);
        const markers = loopsGroup.getObjectByName(`loopMarkers_${l.id}`);
        const isCurrent = l.id === loopId;

        if (line) line.visible = isCurrent;
        if (rib) rib.visible = isCurrent;
        if (markers) markers.visible = isCurrent;
      });
    }

    // Smoothly frame loop in 3D
    const pts = loop.path;
    if (pts && pts.length > 0) {
      let cx = 0, cz = 0, cy = 0;
      pts.forEach(p => {
        cx += (p.u - 0.5) * TERRAIN_W;
        cz += (p.v - 0.5) * TERRAIN_H;
        cy += (p.elevation_m - ELEVATION_BASE) * ELEVATION_SCALE * state.exaggeration;
      });
      cx /= pts.length;
      cz /= pts.length;
      cy /= pts.length;

      const targetPos = new THREE.Vector3(cx, cy, cz);
      const span = loop.actual_km * 4.0 + 35;
      const camPos = new THREE.Vector3(cx + span * 0.45, cy + span * 0.7, cz + span * 0.55);
      smoothCameraTransition(camPos, targetPos, 1400);
    }

    // Update bottom dock chart with loop profile
    updateElevationChartWithLoop(loop);

    // Update bottom dock text
    const dockTitleText = document.getElementById('dock-title-text');
    const dockDist = document.getElementById('dock-dist');
    const dockDplus = document.getElementById('dock-dplus');
    const dockDminus = document.getElementById('dock-dminus');
    const dockRange = document.getElementById('dock-range');
    const dockTime = document.getElementById('dock-time');

    if (dockTitleText) dockTitleText.textContent = `🔄 ${loop.name}`;
    if (dockDist) dockDist.textContent = `${loop.actual_km} km`;
    if (dockDplus) dockDplus.textContent = `+${loop.d_plus_m} m`;
    if (dockDminus) dockDminus.textContent = `-${loop.d_minus_m} m`;
    if (dockRange) dockRange.textContent = `${loop.min_ele_m}m / ${loop.max_ele_m}m`;
    if (dockTime) dockTime.textContent = loop.estimated_time;

    showToast(`${loop.short_name} sélectionnée (${loop.actual_km} km · D+ ${loop.d_plus_m}m)`, 'success', 3000);
  }

  function updateElevationChartWithLoop(loop) {
    if (!state.chart || !loop.path) return;
    state.currentSubProfile = loop.path;

    const labels = loop.path.map(p => `${p.distance_km}km`);
    const elevations = loop.path.map(p => p.elevation_m);

    if (elevations.length > 0) {
      const minVal = Math.min(...elevations);
      const maxVal = Math.max(...elevations);
      const span = maxVal - minVal;
      const pad = Math.max(30, Math.round(span * 0.1));
      const minEle = Math.floor((minVal - pad) / 50) * 50;
      const maxEle = Math.ceil((maxVal + pad) / 50) * 50;
      state.chart.options.scales.y.min = minEle;
      state.chart.options.scales.y.max = maxEle;
      state.chart.options.scales.y.suggestedMin = minEle;
      state.chart.options.scales.y.suggestedMax = maxEle;
    }

    state.chart.data.labels = labels;
    state.chart.data.datasets[0].data = elevations;
    state.chart.data.datasets[0].borderColor = loop.color;

    const ctx = profileCanvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 140);
    grad.addColorStop(0, loop.color + '66');
    grad.addColorStop(1, loop.color + '05');
    state.chart.data.datasets[0].backgroundColor = grad;

    state.chart.resize();
    state.chart.update('none');
  }

  function updateLoopHeights() {
    if (!loopsGroup) return;
    const loops = state.data.zaghfouland_loops;
    if (!loops || loops.length === 0) return;

    loops.forEach(loop => {
      const pts = loop.path;
      if (!pts || pts.length === 0) return;

      const lineMesh = loopsGroup.getObjectByName(`loopLine_${loop.id}`);
      const ribbonMesh = loopsGroup.getObjectByName(`loopRibbon_${loop.id}`);
      const markersGroup = loopsGroup.getObjectByName(`loopMarkers_${loop.id}`);

      if (lineMesh) {
        const linePos = lineMesh.geometry.attributes.position;
        for (let i = 0; i < pts.length; i++) {
          const y = (pts[i].elevation_m - ELEVATION_BASE) * ELEVATION_SCALE * state.exaggeration + 1.2;
          linePos.setY(i, y);
        }
        linePos.needsUpdate = true;
      }

      if (ribbonMesh) {
        const ribPos = ribbonMesh.geometry.attributes.position;
        for (let i = 0; i < pts.length; i++) {
          const y = (pts[i].elevation_m - ELEVATION_BASE) * ELEVATION_SCALE * state.exaggeration + 1.2;
          ribPos.setY(i * 2, y - 0.8);
          ribPos.setY(i * 2 + 1, y + 0.8);
        }
        ribPos.needsUpdate = true;
      }

      if (markersGroup) {
        (loop.highlights || []).forEach((hl, hIdx) => {
          const pin = markersGroup.children[hIdx];
          if (!pin) return;
          const targetD = hl.km;
          let bestPt = pts[0];
          let minDiff = 999;
          for (let p of pts) {
            const diff = Math.abs(p.distance_km - targetD);
            if (diff < minDiff) { minDiff = diff; bestPt = p; }
          }
          const y = (bestPt.elevation_m - ELEVATION_BASE) * ELEVATION_SCALE * state.exaggeration + 1.5;
          pin.position.y = y + 2.5;
        });
      }
    });
  }

  window.__updateLoopHeights = updateLoopHeights;
  window.__setZaghfoulandLoop = setZaghfoulandLoop;

  // ============================================================================
  // PILLAR 1: GPX 1.1 EXPORT FOR ZAGHFOULAND LOOPS
  // ============================================================================
  function escapeXml(str) {
    if (!str) return '';
    return str.replace(/[<>&'"]/g, c => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
      }
    });
  }

  function downloadLoopGPX(loopId, event) {
    if (event) event.stopPropagation();
    const loops = state.data.zaghfouland_loops;
    if (!loops) return;
    const loop = loops.find(l => l.id === loopId);
    if (!loop || !loop.path) return;

    let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n';
    gpx += '<gpx version="1.1" creator="Rando Itzer 3D - Zaghfouland" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">\n';
    gpx += '  <metadata>\n';
    gpx += `    <name>${escapeXml(loop.name)}</name>\n`;
    gpx += `    <desc>${escapeXml(loop.theme)} - Circuit en boucle départ et retour Zaghfouland (Itzer, Moyen Atlas). Distance: ${loop.actual_km} km, D+ ${loop.d_plus_m}m, D- ${loop.d_minus_m}m.</desc>\n`;
    gpx += '    <author><name>Association Randonnée &amp; Écotourisme Zaghfouland Itzer</name></author>\n';
    gpx += `    <time>${new Date().toISOString()}</time>\n`;
    gpx += '  </metadata>\n';

    // Add Waypoints for highlights
    (loop.highlights || []).forEach(hl => {
      let pt = loop.path[0];
      let minDiff = 999;
      loop.path.forEach(p => {
        const d = Math.abs(p.distance_km - hl.km);
        if (d < minDiff) { minDiff = d; pt = p; }
      });
      const sym = hl.icon === '🌌' ? 'Campground' : (hl.icon === '🔭' ? 'Scenic Area' : 'Rest Area');
      gpx += `  <wpt lat="${pt.lat.toFixed(6)}" lon="${pt.lon.toFixed(6)}">\n`;
      gpx += `    <ele>${pt.elevation_m.toFixed(1)}</ele>\n`;
      gpx += `    <name>${escapeXml(hl.name)}</name>\n`;
      gpx += `    <desc>${escapeXml(hl.desc)}</desc>\n`;
      gpx += `    <sym>${sym}</sym>\n`;
      gpx += `  </wpt>\n`;
    });

    // Track & Segments
    gpx += '  <trk>\n';
    gpx += `    <name>${escapeXml(loop.name)}</name>\n`;
    gpx += `    <type>Hiking</type>\n`;
    gpx += '    <trkseg>\n';
    loop.path.forEach(p => {
      gpx += `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">\n`;
      gpx += `        <ele>${p.elevation_m.toFixed(1)}</ele>\n`;
      gpx += `      </trkpt>\n`;
    });
    gpx += '    </trkseg>\n';
    gpx += '  </trk>\n';
    gpx += '</gpx>\n';

    const blob = new Blob([gpx], { type: 'application/gpx+xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `boucle_${loop.target_km}km_zaghfouland_itzer.gpx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`Trace GPX 1.1 (${loop.actual_km} km) téléchargée avec succès ! Compatible Garmin, Strava & Komoot.`, 'success', 3500);
  }

  // ============================================================================
  // PILLAR 1 (suite): DÔME CÉLESTE NOCTURNE (VOIE LACTÉE & ÉTOILES)
  // ============================================================================
  let celestialDome = null;
  let celestialStarsMat = null;
  let celestialDustMesh = null;
  let starTwinkleTime = 0;

  function setupCelestialDome() {
    const group = new THREE.Group();
    group.name = "celestialDome";

    const starCount = 2200;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);

    const radius = 550;
    const cWhite = new THREE.Color(0xffffff);
    const cCyan = new THREE.Color(0x38bdf8);
    const cPurple = new THREE.Color(0xc084fc);
    const cGold = new THREE.Color(0xfef08a);

    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.88 + 0.12);

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.cos(phi);
      const z = radius * Math.sin(phi) * Math.sin(theta);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // Milky Way galactic belt clustering
      const distToBelt = Math.abs(y * 0.7 + x * 0.5 - z * 0.5);
      const isBelt = distToBelt < 85;

      let col = cWhite;
      if (isBelt) {
        col = Math.random() > 0.5 ? cPurple : cCyan;
        sizes[i] = Math.random() * 2.8 + 1.6;
      } else {
        const r = Math.random();
        if (r < 0.15) col = cCyan;
        else if (r < 0.28) col = cGold;
        else col = cWhite;
        sizes[i] = Math.random() * 2.0 + 0.8;
      }

      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    starGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    celestialStarsMat = new THREE.PointsMaterial({
      size: 2.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      sizeAttenuation: true
    });

    const starMesh = new THREE.Points(starGeo, celestialStarsMat);
    group.add(starMesh);

    // Milky Way dust belt
    const bandGeo = new THREE.TorusGeometry(530, 40, 8, 48, Math.PI);
    bandGeo.rotateX(Math.PI / 3);
    bandGeo.rotateZ(Math.PI / 4);
    const bandMat = new THREE.MeshBasicMaterial({
      color: 0x818cf8,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide
    });
    celestialDustMesh = new THREE.Mesh(bandGeo, bandMat);
    group.add(celestialDustMesh);

    group.visible = false;
    scene.add(group);
    celestialDome = group;
    window.__celestialDome = celestialDome;
  }

  function updateCelestialTwinkle() {
    if (!celestialDome || !celestialDome.visible || !celestialStarsMat) return;
    starTwinkleTime += 0.03;
    celestialStarsMat.opacity = 0.82 + Math.sin(starTwinkleTime) * 0.18;
    if (celestialDustMesh) {
      celestialDustMesh.rotation.y += 0.0001;
    }
  }

  function toggleBivouacCeleste() {
    const isNight = state.sunHour < 6.5 || state.sunHour > 19.5;
    const targetHour = isNight ? 14.0 : 23.0;
    state.sunHour = targetHour;

    const slider = document.getElementById('slider-sun');
    const val = document.getElementById('val-sun');
    if (slider) slider.value = targetHour;
    if (val) {
      const h = Math.floor(targetHour);
      const m = targetHour % 1 === 0 ? '00' : '30';
      val.textContent = `${h}h${m}`;
    }

    updateSunPosition(targetHour);

    if (!isNight) {
      showToast("🌌 Mode Bivouac sous les étoiles activé ! Voie Lactée au-dessus de Zaghfouland (ciel pur d'altitude)", 'success', 4000);
    } else {
      showToast("☀️ Retour au soleil de mi-journée (14h00)", 'info', 2500);
    }
  }

  // ============================================================================
  // PILLAR 3: SOURCES D'EAU POTABLE & RÉSURGENCES KARSTIQUES 3D
  // ============================================================================
  let waterBeaconsGroup = null;
  let waterBeaconTime = 0;

  function setupWaterSourceBeacons() {
    waterBeaconsGroup = new THREE.Group();
    waterBeaconsGroup.name = "waterBeaconsGroup";
    scene.add(waterBeaconsGroup);
    window.__waterBeaconsGroup = waterBeaconsGroup;

    const waterPois = (state.data.pois || []).filter(p => p.category === "Source d'eau" || p.name.includes('Aïn') || p.name.includes('Source'));
    waterPois.forEach(poi => {
      const world = gpsToWorld3D(poi.lat, poi.lon);

      const ringGeo = new THREE.RingGeometry(1.8, 3.2, 32);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(world.x, world.y + 0.5, world.z);
      ring.userData = { poi };
      waterBeaconsGroup.add(ring);
    });
  }

  function updateWaterBeacons() {
    if (!waterBeaconsGroup || !waterBeaconsGroup.visible) return;
    waterBeaconTime += 0.05;
    const s = 1.0 + (Math.sin(waterBeaconTime) + 1.0) * 0.45;
    waterBeaconsGroup.children.forEach(ring => {
      ring.scale.set(s, 1, s);
      ring.material.opacity = Math.max(0.15, 0.8 - (s - 1.0) * 0.6);
    });
  }

  function updateWaterBeaconsHeights() {
    if (!waterBeaconsGroup) return;
    waterBeaconsGroup.children.forEach(ring => {
      if (ring.userData && ring.userData.poi) {
        const poi = ring.userData.poi;
        const world = gpsToWorld3D(poi.lat, poi.lon);
        ring.position.y = world.y + 0.35;
      }
    });
  }
  window.__updateWaterBeaconsHeights = updateWaterBeaconsHeights;

  // ============================================================================
  // PILLAR 4: MODE PLEIN ÉCRAN IMMERSIF (ZEN MODE) & SURVOL DRONE DES BOUCLES
  // ============================================================================
  function toggleFullscreenMode() {
    const isZen = document.body.classList.toggle('zen-mode');
    const btn = document.getElementById('btn-fullscreen');
    if (btn) {
      btn.innerHTML = isZen ? '⛶ <span>Quitter</span>' : '⛶ <span>Plein Écran</span>';
    }

    if (isZen) {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      showToast("Mode Plein Écran Immersif activé (Touche Échap ou F pour sortir)", 'info', 3000);
    } else {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      showToast("Mode standard restauré", 'info', 2000);
    }
  }

  let loopDrone = {
    active: false,
    paused: false,
    loopId: null,
    curve: null,
    progress: 0,
    speed: 0.00035,
    speedMult: 1.0,
    loopData: null
  };

  function startLoopDroneFly(loopId) {
    const loops = state.data.zaghfouland_loops;
    if (!loops) return;
    const loop = loops.find(l => l.id === loopId);
    if (!loop || !loop.path || loop.path.length < 2) return;

    // Build 3D curve through loop path points
    const points = loop.path.map(p => {
      const world = gpsToWorld3D(p.lat, p.lon);
      return new THREE.Vector3(world.x, world.y + 32, world.z);
    });

    loopDrone.active = true;
    loopDrone.paused = false;
    loopDrone.loopId = loopId;
    loopDrone.curve = new THREE.CatmullRomCurve3(points, true);
    loopDrone.progress = 0;
    loopDrone.speedMult = 1.0;
    loopDrone.loopData = loop;

    // Update HUD
    const hud = document.getElementById('drone-loop-hud');
    const nameEl = document.getElementById('drone-loop-name');
    const btnSpeed = document.getElementById('btn-speed-drone-loop');
    const btnPause = document.getElementById('btn-pause-drone-loop');

    if (nameEl) nameEl.textContent = `Survol ${loop.short_name} (${loop.actual_km} km)`;
    if (btnSpeed) btnSpeed.textContent = '⚡ 1x';
    if (btnPause) btnPause.textContent = '⏸️ Pause';
    if (hud) hud.style.display = 'flex';

    showToast(`Survol Drone 3D lancé sur la ${loop.short_name} (${loop.actual_km} km)`, 'success', 3000);
  }

  function stopLoopDroneFly() {
    loopDrone.active = false;
    const hud = document.getElementById('drone-loop-hud');
    if (hud) hud.style.display = 'none';
    showToast("Survol Drone arrêté", 'info', 2000);
  }

  function updateLoopDroneFlight() {
    if (!loopDrone.active || loopDrone.paused || !loopDrone.curve) return;

    loopDrone.progress += loopDrone.speed * loopDrone.speedMult * state.droneSpeed;
    if (loopDrone.progress >= 1.0) {
      loopDrone.progress = 0;
    }

    const camPos = loopDrone.curve.getPointAt(loopDrone.progress);
    const lookAheadProgress = (loopDrone.progress + 0.02) % 1.0;
    const lookPos = loopDrone.curve.getPointAt(lookAheadProgress);

    camera.position.copy(camPos);
    camera.lookAt(lookPos);
    controls.target.copy(lookPos);

    const loop = loopDrone.loopData;
    if (loop) {
      const curKm = (loopDrone.progress * loop.actual_km).toFixed(1);
      const progressPct = Math.round(loopDrone.progress * 100);

      const progressFill = document.getElementById('drone-loop-progress');
      const kmVal = document.getElementById('drone-loop-km');
      const altVal = document.getElementById('drone-loop-alt');
      const slopeVal = document.getElementById('drone-loop-slope');

      if (progressFill) progressFill.style.width = `${progressPct}%`;
      if (kmVal) kmVal.textContent = `${curKm} / ${loop.actual_km} km`;

      const curPtIdx = Math.floor(loopDrone.progress * (loop.path.length - 1));
      const curPt = loop.path[curPtIdx] || loop.path[0];
      if (altVal) altVal.textContent = `${curPt.elevation_m} m`;
      if (slopeVal) slopeVal.textContent = `${curPt.slope_deg || 0}°`;
    }
  }

  // ============================================================================
  // ENHANCED INIT: Hook all new features
  // ============================================================================
  function initEnhancements() {
    initSplashScreen();
    setupCommandPalette();
    setupSidebarTabs();
    setupMinimap();
    setupKeyboardShortcuts();
    setupArcGISButton();
    setupWalkerChartDot();
    setupZaghfoulandLoops();
    setupCelestialDome();
    setupWaterSourceBeacons();

    // Top Navigation Bar Buttons
    const btnBivouac = document.getElementById('btn-bivouac-celeste');
    if (btnBivouac) btnBivouac.addEventListener('click', toggleBivouacCeleste);

    const btnFullscreen = document.getElementById('btn-fullscreen');
    if (btnFullscreen) btnFullscreen.addEventListener('click', toggleFullscreenMode);

    const zenExitBtn = document.getElementById('zen-exit-btn');
    if (zenExitBtn) zenExitBtn.addEventListener('click', toggleFullscreenMode);

    // Drone Loop Flight HUD buttons
    const btnStopDroneLoop = document.getElementById('btn-stop-drone-loop');
    if (btnStopDroneLoop) btnStopDroneLoop.addEventListener('click', stopLoopDroneFly);

    const btnPauseDroneLoop = document.getElementById('btn-pause-drone-loop');
    if (btnPauseDroneLoop) {
      btnPauseDroneLoop.addEventListener('click', () => {
        loopDrone.paused = !loopDrone.paused;
        btnPauseDroneLoop.textContent = loopDrone.paused ? '▶️ Reprendre' : '⏸️ Pause';
      });
    }

    const btnSpeedDroneLoop = document.getElementById('btn-speed-drone-loop');
    if (btnSpeedDroneLoop) {
      btnSpeedDroneLoop.addEventListener('click', () => {
        if (loopDrone.speedMult === 1.0) loopDrone.speedMult = 2.0;
        else if (loopDrone.speedMult === 2.0) loopDrone.speedMult = 4.0;
        else loopDrone.speedMult = 1.0;
        btnSpeedDroneLoop.textContent = `⚡ ${loopDrone.speedMult}x`;
      });
    }

    // Override stage buttons to use pulse version
    document.querySelectorAll('.stage-btn').forEach(btn => {
      btn.addEventListener('click', () => pulseStageRibbon(btn.dataset.stage));
    });
    document.querySelectorAll('.sidebar-stage-card').forEach(card => {
      card.addEventListener('click', () => pulseStageRibbon(card.dataset.stage));
    });
  }

  // Call initEnhancements after the main init
  const _origInit = init;
  function initWithEnhancements() {
    _origInit();
    initEnhancements();
  }

  // ============================================================================
  // Override the self-start with enhanced version
  // ============================================================================
  if (document.readyState === 'loading') {
    document.removeEventListener('DOMContentLoaded', init);
    document.addEventListener('DOMContentLoaded', initWithEnhancements);
  } else {
    // Already called init() at end of file; we add enhancements after
    initEnhancements();
  }

  // Hook walker chart dot update into animation loop
  const _origAnimate = animate;
  function animateWithEnhancements() {
    animationFrameId = requestAnimationFrame(animateWithEnhancements);
    if (state.activeEngine === 'three') {
      if (!state.isWalkerActive) {
        if (!loopDrone.active) {
          controls.update();
          updateDroneFlight();
          updateCompass();
        } else {
          updateLoopDroneFlight();
          updateCompass();
        }
      } else {
        updateWalkerAuto();
        updateWalkerChartDot();
      }
      updateGpsPulse();
      updateWaterBeacons();
      updateCelestialTwinkle();
      renderer.render(scene, camera);
    }
  }


  // ============================================================================
  // v3.0 — MOON 3D + NIGHT MODE (Q4)
  // ============================================================================
  function setupMoonAndRotatingStars() {
    const moonGeo = new THREE.SphereGeometry(3.5, 16, 16);
    const moonMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d4, emissive: 0x888899, emissiveIntensity: 0.3, roughness: 0.9 });
    const moon = new THREE.Mesh(moonGeo, moonMat);
    moon.name = 'moon3D'; moon.position.set(60, 55, -80); moon.visible = false; scene.add(moon);
    const moonLight = new THREE.DirectionalLight(0x8899bb, 0.0);
    moonLight.name = 'moonLight'; moonLight.position.set(60, 55, -80); scene.add(moonLight);
    state._moon = moon; state._moonLight = moonLight;
    if (!document.querySelector('.celestial-moon-badge')) {
      const b = document.createElement('div'); b.className = 'celestial-moon-badge'; b.textContent = '🌙 Mode Nuit'; document.body.appendChild(b);
    }
    if (!document.querySelector('.bivouac-fire-hud')) {
      const f = document.createElement('div'); f.className = 'bivouac-fire-hud'; f.textContent = '🔥'; document.body.appendChild(f);
    }
  }
  function showMoon(show) {
    if (state._moon) state._moon.visible = show;
    if (state._moonLight) state._moonLight.intensity = show ? 0.35 : 0.0;
    document.body.classList.toggle('night-mode', show);
  }
  function updateBivouacFireParticles() {}

  // ============================================================================
  // v3.0 — ABOUT MODAL (Q17)
  // ============================================================================
  function setupAboutModal() {
    const modal = document.getElementById('about-modal');
    const open  = () => { if (modal) modal.style.display = 'flex'; };
    const close = () => { if (modal) modal.style.display = 'none'; };
    const b1 = document.getElementById('btn-about');
    const b2 = document.getElementById('btn-close-about');
    const b3 = document.getElementById('btn-close-about-footer');
    if (b1) b1.addEventListener('click', open);
    if (b2) b2.addEventListener('click', close);
    if (b3) b3.addEventListener('click', close);
    if (modal) modal.addEventListener('click', e => { if (e.target === modal) close(); });
  }

  // ============================================================================
  // v3.0 — MOBILE FAB + BOTTOM NAV (Q6)
  // ============================================================================
  function setupMobileNav() {
    const fab     = document.getElementById('mobile-fab');
    const sidebar = document.getElementById('sidebar');
    const navBtns = document.querySelectorAll('.mobile-nav-btn');
    if (fab && sidebar) {
      fab.addEventListener('click', () => {
        const open = sidebar.classList.toggle('mobile-open');
        const ic = fab.querySelector('.fab-icon'); if (ic) ic.textContent = open ? '✕' : '⛰️';
      });
    }
    navBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tid = btn.dataset.tabMobile; if (!tid) return;
        document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.sidebar-tab-content').forEach(c => c.style.display = 'none');
        const st = document.querySelector('.sidebar-tab[data-tab="' + tid + '"]');
        const sc = document.getElementById('tab-' + tid);
        if (st) st.classList.add('active'); if (sc) sc.style.display = 'block';
        navBtns.forEach(b => b.classList.remove('active')); btn.classList.add('active');
        if (sidebar) sidebar.classList.add('mobile-open');
      });
    });
    document.addEventListener('click', e => {
      if (window.innerWidth > 768 || !sidebar) return;
      if (!sidebar.contains(e.target) && fab && !fab.contains(e.target) && !e.target.closest('.mobile-nav-btn')) {
        sidebar.classList.remove('mobile-open');
        const ic = fab && fab.querySelector('.fab-icon'); if (ic) ic.textContent = '⛰️';
      }
    });
  }

  // ============================================================================
  // v3.0 — SOCIAL SHARING (Q15)
  // ============================================================================
  function setupSocialSharing() {
    const url  = 'https://rando-itzer-3d.vercel.app';
    const txt  = '🏔️ Grand Tour de Zaghfouland & Itzer 3D – Moyen Atlas, Maroc ! 105 km, exploration 3D interactive.';
    const bw   = document.getElementById('btn-share-whatsapp');
    const bt   = document.getElementById('btn-share-twitter');
    const bi   = document.getElementById('btn-share-instagram');
    if (bw) bw.addEventListener('click', () => window.open('https://wa.me/?text=' + encodeURIComponent(txt + '\n' + url), '_blank'));
    if (bt) bt.addEventListener('click', () => window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(txt) + '&url=' + encodeURIComponent(url) + '&hashtags=Maroc,Rando,Atlas3D', '_blank'));
    if (bi) bi.addEventListener('click', () => { navigator.clipboard.writeText(url).then(() => showToast('📸 Lien copié pour Instagram !', 'success', 3000)).catch(() => showToast('📸 Partagez : ' + url, 'info', 4000)); });
  }

  // ============================================================================
  // v3.0 — LOADING BAR (Q3)
  // ============================================================================
  function setupLoadingBar() {
    const bar = document.createElement('div'); bar.id = 'global-loading-bar'; document.body.appendChild(bar);
    [{ t: 15, d: 100 }, { t: 35, d: 400 }, { t: 55, d: 800 }, { t: 75, d: 1200 }, { t: 88, d: 1800 }, { t: 96, d: 2400 }]
      .forEach(s => setTimeout(() => { bar.style.width = s.t + '%'; }, s.d));
    window.finishLoadingBar = () => {
      bar.style.width = '100%';
      setTimeout(() => { bar.style.transition = 'opacity 0.4s'; bar.style.opacity = '0'; setTimeout(() => { try { bar.remove(); } catch(e) {} }, 500); }, 400);
    };
  }

  // ============================================================================
  // v3.0 — CHART CURSOR SYNC (Q10)
  // ============================================================================
  function setupChartCursorSync() {
    const wrap = document.querySelector('.profile-chart-wrap');
    const cnv  = document.getElementById('profile-canvas');
    if (!wrap || !cnv) return;
    const line = document.createElement('div'); line.className = 'chart-cursor-line';
    const bdg  = document.createElement('div'); bdg.className  = 'chart-cursor-badge';
    line.appendChild(bdg); wrap.appendChild(line);
    let sphere = null;
    cnv.addEventListener('mousemove', e => {
      if (!state.data || !state.data.route) return;
      const r = cnv.getBoundingClientRect();
      const ratio = (e.clientX - r.left) / r.width;
      const route = state.data.route;
      const idx   = Math.max(0, Math.min(Math.floor(ratio * (route.length - 1)), route.length - 1));
      const pt    = route[idx]; if (!pt) return;
      line.style.display = 'block'; line.style.left = (e.clientX - r.left) + 'px';
      bdg.textContent = (pt.elevation_m || pt.ele || '—') + 'm · ' + ((pt.cumulative_km || (idx * 0.1)).toFixed(1)) + 'km';
      if (state.activeEngine === 'three' && pt.lat && pt.lon) {
        try {
          if (!sphere) { const g = new THREE.SphereGeometry(0.4, 8, 8); const m = new THREE.MeshBasicMaterial({ color: 0xef4444 }); sphere = new THREE.Mesh(g, m); sphere.name = 'chartHover'; scene.add(sphere); }
          const w = gpsToWorld3D(pt.lat, pt.lon);
          if (w) { sphere.position.set(w.x, w.y + 0.4, w.z); sphere.visible = true; }
        } catch(ex) {}
      }
    });
    cnv.addEventListener('mouseleave', () => { line.style.display = 'none'; if (sphere) sphere.visible = false; });
  }

  // ============================================================================
  // v3.0 — WALKER STATS (Q13)
  // ============================================================================
  function updateWalkerStats(ratio, totalKm) {
    const d = ratio * (totalKm || 105);
    const s = document.getElementById('walker-steps');  if (s) s.textContent  = Math.round(d * 1320).toLocaleString('fr-FR');
    const c = document.getElementById('walker-cal');    if (c) c.textContent  = Math.round(d * 72);
    const r = document.getElementById('walker-remaining'); if (r) r.textContent = Math.max(0, (totalKm || 105) - d).toFixed(1) + ' km';
  }

  // ============================================================================
  // v3.0 — COLLAPSIBLE SECTIONS (Q2)
  // ============================================================================
  function setupCollapsibleSections() {
    document.querySelectorAll('.sidebar-tab-content .section-title').forEach(t => {
      const next = t.nextElementSibling;
      if (!next || next.classList.contains('sidebar-tabs') || next.classList.contains('section-title')) return;
      t.classList.add('collapsible');
      if (!next.classList.contains('collapsible-body')) next.classList.add('collapsible-body');
      t.addEventListener('click', () => { const b = t.nextElementSibling; if (!b) return; t.classList.toggle('collapsed', b.classList.toggle('collapsed')); });
    });
  }

  // ============================================================================
  // v3.0 — LOOP KEYBOARD SHORTCUTS Q–U (Q11)
  // ============================================================================
  function setupLoopKeyboardShortcuts() {
    const map = { q: 0, w: 1, e: 2, r: 3, u: 4 };
    window.addEventListener('keydown', e => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.ctrlKey || e.altKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k === '?' || k === '/') { const m = document.getElementById('shortcuts-modal'); if (m) m.style.display = 'flex'; return; }
      if (!(k in map) || !state.data || !state.data.zaghfouland_loops) return;
      const loops = state.data.zaghfouland_loops;
      const loop  = loops[map[k]]; if (!loop) return;
      setZaghfoulandLoop(loop.id !== undefined ? loop.id : map[k]);
      document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.sidebar-tab-content').forEach(c => c.style.display = 'none');
      const bt = document.querySelector('.sidebar-tab[data-tab="boucles"]');
      const bc = document.getElementById('tab-boucles');
      if (bt) bt.classList.add('active'); if (bc) bc.style.display = 'block';
      showToast('🔄 Boucle ' + (loop.distance_km || loop.actual_km || '?') + ' km (touche ' + e.key.toUpperCase() + ')', 'success', 2000);
    });
  }

  // ============================================================================
  // v3.0 — ENGINE TRANSITION (Q18)
  // ============================================================================
  function applyEngineTransition(el) {
    if (!el) return;
    el.classList.remove('engine-entering'); void el.offsetWidth; el.classList.add('engine-entering');
    el.addEventListener('animationend', () => el.classList.remove('engine-entering'), { once: true });
  }

  // ============================================================================
  // v3.0 — POI TOOLTIP HOVER (Q7)
  // ============================================================================
  function setupPOI3DTooltip() {
    const cv = document.getElementById('three-canvas'); if (!cv) return;
    let tip = null, timer = null;
    const catMap = { summit: '⛰️ Sommet', water: '💧 Source', bivouac: '⛺ Bivouac', cedar: '🌲 Cédraie', shelter: '🏠 Refuge' };
    cv.addEventListener('mousemove', e => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (state.activeEngine !== 'three' || !poiGroup) return;
        const rc = cv.getBoundingClientRect();
        const mouse = new THREE.Vector2(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
        const ray = new THREE.Raycaster(); ray.setFromCamera(mouse, camera);
        const hits = ray.intersectObjects(poiGroup.children, true);
        if (!hits.length) { if (tip) tip.style.display = 'none'; return; }
        let obj = hits[0].object;
        while (obj.parent && obj.parent !== poiGroup) obj = obj.parent;
        const poi = obj.userData && obj.userData.poi;
        if (!poi) { if (tip) tip.style.display = 'none'; return; }
        if (!tip) { tip = document.createElement('div'); tip.className = 'poi-3d-tooltip'; document.body.appendChild(tip); }
        tip.innerHTML = '<div class="poi-tooltip-name">' + (poi.name || 'POI') + '</div><div class="poi-tooltip-cat">' + (catMap[poi.category] || '📍 POI') + '</div><div class="poi-tooltip-ele">Alt. ' + (poi.elevation_m || '—') + ' m</div>';
        tip.style.display = 'block'; tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px';
      }, 500);
    });
    cv.addEventListener('mouseleave', () => { clearTimeout(timer); if (tip) tip.style.display = 'none'; });
  }

  // ============================================================================
  // v3.0 — WEATHER MAP ICON (Q16)
  // ============================================================================
  function setupWeatherMapIcon() {
    if (document.getElementById('weather-map-icon')) return;
    const ic = document.createElement('button'); ic.id = 'weather-map-icon'; ic.className = 'weather-map-icon'; ic.title = 'Météo Jbel Itzer'; ic.textContent = '🌤️';
    ic.style.cssText = 'position:fixed;bottom:180px;right:16px;z-index:200;';
    ic.addEventListener('click', () => { const m = document.getElementById('weather-modal'); if (m) { m.style.display = 'flex'; const b = document.getElementById('btn-refresh-weather'); if (b) b.click(); } });
    document.body.appendChild(ic);
  }

  // ============================================================================
  // v3.0 — INIT ALL v3.0 FEATURES
  // ============================================================================
  function initV3Features() {
    setupAboutModal();
    setupMobileNav();
    setupSocialSharing();
    setupLoadingBar();
    setupChartCursorSync();
    setupCollapsibleSections();
    setupLoopKeyboardShortcuts();
    setupMoonAndRotatingStars();
    setupPOI3DTooltip();
    setupWeatherMapIcon();

    const wp = document.getElementById('walker-progress');
    if (wp) wp.addEventListener('input', () => updateWalkerStats(wp.value / 100, 105));

    const ss = document.getElementById('slider-sun');
    if (ss) ss.addEventListener('input', () => { const h = parseFloat(ss.value); showMoon(h < 6 || h > 20); });

    const bse = document.getElementById('btn-switch-engine');
    if (bse) bse.addEventListener('click', () => setTimeout(() => {
      const el = state.activeEngine === 'maplibre' ? document.getElementById('maplibre-container') : document.getElementById('three-canvas');
      applyEngineTransition(el);
    }, 50));

    setTimeout(() => { if (window.finishLoadingBar) window.finishLoadingBar(); }, 3200);
    setTimeout(() => showToast('🚀 Rando Itzer 3D v3.0 – 20 améliorations !', 'success', 3500), 3600);
  }


  document.addEventListener('DOMContentLoaded', () => { setTimeout(initV3Features, 200); });
})();
