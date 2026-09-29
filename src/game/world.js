// Terrain mesh, sky, lighting, trees, waypoint beacon and the follow camera.
import * as THREE from 'three';
import { RoomEnvironment } from '../../vendor/three/RoomEnvironment.js';
import { CFG } from './config.js';
import { terrainH, forestN, terrainColor, treeDensity, cellHash } from './terrain.js';

// fine grey detail texture (multiplies the vertex colours) so the ground isn't smooth at close range
function detailTexture() {
  const N = CFG.TERRAIN_DETAIL_TEX, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(N, N);
  const h = (x, y, s) => { let n = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  const vn = (x, y, p, s) => {                         // periodic value noise, tiles seamlessly
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), w = (v) => ((v % p) + p) % p;
    const a = h(w(xi), w(yi), s), b = h(w(xi + 1), w(yi), s), c = h(w(xi), w(yi + 1), s), d = h(w(xi + 1), w(yi + 1), s);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    const n = vn(u * 8, v * 8, 8, 1) * 0.3 + vn(u * 32, v * 32, 32, 2) * 0.4 + vn(u * 96, v * 96, 96, 3) * 0.3;
    const g = 205 + (n - 0.5) * 90;
    const i = (y * N + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = g; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}


// soft tileable cloud mask (R channel) used for drifting cloud shadows
function cloudTexture() {
  const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(N, N);
  const h = (x, y, s) => { let n = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  const vn = (x, y, p, s) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), w = (v) => ((v % p) + p) % p;
    const a = h(w(xi), w(yi), s), b = h(w(xi + 1), w(yi), s), c = h(w(xi), w(yi + 1), s), d = h(w(xi + 1), w(yi + 1), s); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, n = vn(u * 4, v * 4, 4, 7) * 0.6 + vn(u * 8, v * 8, 8, 8) * 0.3 + vn(u * 16, v * 16, 16, 9) * 0.1;
    const g = Math.max(0, Math.min(1, (n - 0.5) * 3.2 + 0.5)) * 255, i = (y * N + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = g; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
// darkens the fragment where the drifting cloud mask is high (world-space, so shadows slide over the ground)
function addCloudShadows(mat, tex, uTime) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCloud = { value: tex }; sh.uniforms.uTime = uTime; sh.uniforms.uCloudAmt = { value: CFG.CLOUD_SHADOW };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vCW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCW = (modelMatrix * vec4(position, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vCW; uniform sampler2D uCloud; uniform float uTime; uniform float uCloudAmt;')
      .replace('#include <opaque_fragment>', 'float cl = texture2D(uCloud, vCW / 5200.0 + vec2(uTime * 0.0035, uTime * 0.0012)).r; gl_FragColor.rgb *= 1.0 - uCloudAmt * cl;\n#include <opaque_fragment>');
  };
}

function beaconTexture() {
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 128;
  const c = cv.getContext('2d'), g = c.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,1)');
  c.fillStyle = g; c.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(cv);
}

export class World {
  constructor(renderer) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9db7c9);
    this.scene.fog = new THREE.Fog(0x9db7c9, CFG.FOG_NEAR, CFG.FOG_FAR);
    const pm = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.5;
    const sun = (this.sun = new THREE.DirectionalLight(0xfff2dd, 2.6));
    sun.position.set(...CFG.SUN_DIR);
    this.hemi = new THREE.HemisphereLight(0xbcd4ff, 0x4a5a3a, 0.3);
    this.flareLight = new THREE.PointLight(0xffb060, 0, 900, 1.6);     // lights the ground around the newest flare (night only)
    this.scene.add(sun, this.hemi, this.flareLight);
    this.night = false;

    // ---- terrain: one mesh recentered in world-locked steps ----
    const N = CFG.TERRAIN_SEG, V = (N + 1) * (N + 1);
    this.N = N; this.cell = CFG.TERRAIN_SIZE / N; this.snap = this.cell * CFG.TERRAIN_SNAP_CELLS;
    const geo = (this.geo = new THREE.BufferGeometry());
    this.posA = new THREE.BufferAttribute(new Float32Array(V * 3), 3); this.colA = new THREE.BufferAttribute(new Float32Array(V * 3), 3);
    this.nrmA = new THREE.BufferAttribute(new Float32Array(V * 3), 3); this.uvA = new THREE.BufferAttribute(new Float32Array(V * 2), 2);
    geo.setAttribute('position', this.posA); geo.setAttribute('color', this.colA); geo.setAttribute('normal', this.nrmA); geo.setAttribute('uv', this.uvA);
    const idx = new Uint16Array(N * N * 6); let k = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.detail = detailTexture();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: this.detail });
    mat.color.setScalar(CFG.TERRAIN_BRIGHT);
    this.ground = new THREE.Mesh(geo, mat);
    this.ground.frustumCulled = false;
    this.uTime = { value: 0 }; this.cloudTex = cloudTexture();
    addCloudShadows(mat, this.cloudTex, this.uTime);
    this.scene.add(this.ground);

    // ---- water: one big plane at the lake level; the terrain pokes through wherever it is higher ----
    const wt = detailTexture(); wt.repeat.set(1, 1);
    this.waterMat = new THREE.MeshPhongMaterial({ color: 0x2b6d8a, specular: 0xbfe0ff, shininess: 90, transparent: true, opacity: 0.86, map: wt });
    addCloudShadows(this.waterMat, this.cloudTex, this.uTime);
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(CFG.TERRAIN_SIZE, CFG.TERRAIN_SIZE, 1, 1), this.waterMat);
    this.water.rotation.x = -Math.PI / 2; this.water.position.y = CFG.WATER_Y; this.water.frustumCulled = false;
    this.scene.add(this.water);
    this.hbuf = new Float32Array((N + 3) * (N + 3));
    this._col = [0, 0, 0];
    this.cx = NaN; this.cz = NaN;

    // ---- trees (deterministic, follow terrain height) ----
    const tg = new THREE.SphereGeometry(4.5, 6, 4); tg.scale(1, 1.4, 1); tg.translate(0, 6, 0);
    this.trees = new THREE.InstancedMesh(tg, new THREE.MeshLambertMaterial({ color: 0x2c4a26 }), CFG.TREE_MAX);
    this.trees.frustumCulled = false; this.trees.count = 0;
    this.scene.add(this.trees);

    // ---- waypoint beacon ----
    const bt = beaconTexture();
    const bm = new THREE.MeshBasicMaterial({ map: bt, color: 0xffd23a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.beacon = new THREE.Group();
    const col = new THREE.Mesh(new THREE.CylinderGeometry(CFG.WP_BEACON_R, CFG.WP_BEACON_R, CFG.WP_BEACON_H, 24, 1, true), bm);
    col.position.y = CFG.WP_BEACON_H / 2;   // texture gradient: bright at the bottom, fading up
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(CFG.WP_RADIUS - 6, CFG.WP_RADIUS, 64), ringMat);
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 3;
    this.beacon.add(col, this.ring);
    this.beacon.visible = false;
    this.scene.add(this.beacon);

    this.camera = new THREE.PerspectiveCamera(45, 1, 5, 6000);
    this.camLook = new THREE.Vector3(0, 0, 0); this.camGY = 0;
    this.shake = 0; this.t = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
  }
  // day / night: sky, fog, key light and ambient. Night is moonlit and dim enough that you want the goggles.
  setTimeOfDay(night) {
    this.night = !!night;
    const bg = night ? 0x060a13 : 0x9db7c9;
    this.scene.background.set(bg); this.scene.fog.color.set(bg);
    this.sun.color.set(night ? 0x9ab4ff : 0xfff2dd); this.sun.intensity = night ? 0.5 : 2.6;
    this.hemi.color.set(night ? 0x2a3a66 : 0xbcd4ff); this.hemi.groundColor.set(night ? 0x0a100c : 0x4a5a3a); this.hemi.intensity = night ? 0.16 : 0.3;
    this.scene.environmentIntensity = night ? 0.05 : 0.5;
    this.waterMat.color.set(night ? 0x14384a : 0x2b6d8a); this.waterMat.specular.set(night ? 0x8fa8d0 : 0xbfe0ff);
    this.flareLight.intensity = 0;
  }
  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  setWaypoint(wp) {
    this.beacon.visible = !!wp;
    if (wp) this.beacon.position.set(wp.x, terrainH(wp.x, wp.z), wp.z);
  }

  // recompute the mesh around (cx, cz). Every vertex sits on the world lattice, so when the centre moves by whole cells
  // the surviving vertices are simply copied and only the newly exposed edge strips are computed (this used to hitch every ~1 s).
  build(cx, cz) {
    const N = this.N, cell = this.cell, NV = N + 1, P = this.posA.array, C = this.colA.array, Nn = this.nrmA.array, UV = this.uvA.array;
    const L = this._L || (this._L = new THREE.Vector3(...CFG.SUN_DIR).normalize().toArray()), sh = CFG.TERRAIN_SHADE, tile = CFG.TERRAIN_DETAIL_TILE, col = this._col, e = cell;
    const compute = (i, j, v) => {
      const wx = cx + (i - N / 2) * cell, wz = cz + (j - N / 2) * cell;
      const h = terrainH(wx, wz), dx = (terrainH(wx + e, wz) - terrainH(wx - e, wz)) / (2 * cell), dz = (terrainH(wx, wz + e) - terrainH(wx, wz - e)) / (2 * cell);
      P[v * 3] = (i - N / 2) * cell; P[v * 3 + 1] = h; P[v * 3 + 2] = (j - N / 2) * cell;
      const slope = Math.hypot(dx, dz), k = sh / (1 + slope * sh * 0.6), nx = -dx * k, nz = -dz * k, nl = Math.hypot(nx, 1, nz);   // compressed exaggeration so mountain faces don't go black
      Nn[v * 3] = nx / nl; Nn[v * 3 + 1] = 1 / nl; Nn[v * 3 + 2] = nz / nl;
      terrainColor(h, slope, forestN(wx, wz), wx, wz, col);
      const lit = 1 + (Nn[v * 3] * L[0] + Nn[v * 3 + 1] * L[1] + Nn[v * 3 + 2] * L[2] - L[1]) * CFG.TERRAIN_HILLSHADE;   // baked hillshade
      const f = Math.min(1.45, Math.max(0.4, lit)) * (0.85 + 0.3 * Math.min(1.1, h / CFG.TERRAIN_AMP));
      C[v * 3] = col[0] * f; C[v * 3 + 1] = col[1] * f; C[v * 3 + 2] = col[2] * f;
      UV[v * 2] = wx / tile; UV[v * 2 + 1] = wz / tile;
    };
    const di = Math.round((cx - this.cx) / cell), dj = Math.round((cz - this.cz) / cell);
    const reuse = Number.isFinite(di) && Math.abs(di) < N && Math.abs(dj) < N && !(di === 0 && dj === 0);
    if (!reuse) { for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) compute(i, j, j * NV + i); }
    else {
      const j0 = dj > 0 ? 0 : N, j1 = dj > 0 ? N + 1 : -1, js = dj > 0 ? 1 : -1, i0 = di > 0 ? 0 : N, i1 = di > 0 ? N + 1 : -1, is = di > 0 ? 1 : -1;
      for (let j = j0; j !== j1; j += js) for (let i = i0; i !== i1; i += is) {
        const v = j * NV + i, si = i + di, sj = j + dj;
        if (si >= 0 && si <= N && sj >= 0 && sj <= N) {                     // same world vertex as before: copy
          const o = sj * NV + si;
          P[v * 3 + 1] = P[o * 3 + 1]; P[v * 3] = (i - N / 2) * cell; P[v * 3 + 2] = (j - N / 2) * cell;
          Nn[v * 3] = Nn[o * 3]; Nn[v * 3 + 1] = Nn[o * 3 + 1]; Nn[v * 3 + 2] = Nn[o * 3 + 2];
          C[v * 3] = C[o * 3]; C[v * 3 + 1] = C[o * 3 + 1]; C[v * 3 + 2] = C[o * 3 + 2];
          UV[v * 2] = UV[o * 2]; UV[v * 2 + 1] = UV[o * 2 + 1];
        } else compute(i, j, v);
      }
    }
    let lo = 1e9; for (let v = 0; v < NV * NV; v++) if (P[v * 3 + 1] < lo) lo = P[v * 3 + 1];
    this.hasWater = lo < CFG.WATER_Y + 0.5; this.water.visible = this.hasWater;      // skip the big transparent plane when no lake is in range
    this.posA.needsUpdate = this.colA.needsUpdate = this.nrmA.needsUpdate = this.uvA.needsUpdate = true;
    this.ground.position.set(cx, 0, cz);
    this.cx = cx; this.cz = cz;
    this.buildTrees(cx, cz);
  }

  buildTrees(cx, cz) {
    const sp = CFG.TREE_SPACING, box = CFG.TREE_BOX, i0 = Math.floor((cx - box) / sp), i1 = Math.ceil((cx + box) / sp), j0 = Math.floor((cz - box) / sp), j1 = Math.ceil((cz + box) / sp);
    let n = 0;
    outer: for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      for (let t = 0; t < CFG.TREES_PER_FOREST_CELL; t++) {
        const x = (i + cellHash(i, j, 31 + t * 3)) * sp, z = (j + cellHash(i, j, 32 + t * 3)) * sp;
        const h = terrainH(x, z);
        if (h < CFG.SAND_H + 2 || h > CFG.TERRAIN_AMP * CFG.ROCK_H) continue;                 // cheap early-outs before the slope samples
        const dh = terrainH(x + 8, z) - h, dh2 = terrainH(x, z + 8) - h;
        const dens = treeDensity(x, z, h, Math.hypot(dh, dh2) / 8);
        if (cellHash(i, j, 33 + t * 3) >= dens * (t === 0 ? 1 : 0.85)) continue;
        const s = 0.6 + cellHash(i, j, 34 + t * 3) * 0.9;
        this._p.set(x, h - 0.5, z); this._s.set(s, s, s);
        this.trees.setMatrixAt(n++, this._m.compose(this._p, this._q, this._s));
        if (n >= CFG.TREE_MAX) break outer;
      }
    }
    this.trees.count = n; this.trees.instanceMatrix.needsUpdate = true;
  }

  // follow: jet position + velocity so the view leads where you are going
  update(dt, px, pz, vx, vz, snap = false, jetY = null) {
    this.t += dt; this.uTime.value = this.t;
    const lx = px + vx * 0.55, lz = pz + vz * 0.55;
    const k = snap ? 1 : 1 - Math.exp(-3 * dt);
    this.camLook.x += (lx - this.camLook.x) * k; this.camLook.z += (lz - this.camLook.z) * k;
    this.camGY += (((jetY === null ? terrainH(this.camLook.x, this.camLook.z) : jetY - 45) * CFG.CAM_TERRAIN_FOLLOW) - this.camGY) * (snap ? 1 : 1 - Math.exp(-2 * dt));
    this.shake = Math.max(0, this.shake - dt * 1.5);
    const sx = (Math.random() - 0.5) * this.shake * 6, sz = (Math.random() - 0.5) * this.shake * 6;
    this.camera.position.set(this.camLook.x + sx, CFG.CAM_HEIGHT + this.camGY, this.camLook.z + CFG.CAM_BACK + sz);
    this.camera.lookAt(this.camLook.x + sx, this.camGY, this.camLook.z - 10 + sz);

    const cx = Math.round(this.camLook.x / this.snap) * this.snap, cz = Math.round(this.camLook.z / this.snap) * this.snap;
    if (cx !== this.cx || cz !== this.cz) this.build(cx, cz);

    // water follows the view; texture scrolls with world-locked offsets so it looks like drifting ripples
    this.water.position.x = cx; this.water.position.z = cz;
    const wm = this.waterMat.map, T = 900; wm.repeat.set(CFG.TERRAIN_SIZE / T, CFG.TERRAIN_SIZE / T);
    wm.offset.set((cx - CFG.TERRAIN_SIZE / 2) / T + this.t * 0.006, (cz - CFG.TERRAIN_SIZE / 2) / T + this.t * 0.004);
    if (this.beacon.visible) { const p = 1 + 0.06 * Math.sin(this.t * 4); this.ring.scale.set(p, p, 1); this.ring.material.opacity = 0.55 + 0.3 * Math.sin(this.t * 4); }
  }
}
