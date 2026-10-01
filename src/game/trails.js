// Ribbon trails (contrails, missile smoke, flare trails, wingtip vortices): one triangle-strip mesh per trail, stored in a ring buffer.
// Points are recorded every `spacing` metres travelled (never per frame), so speed can't open gaps. The vertex shader widens the
// ribbon and drifts older points; the fragment shader fades it and scrolls a noise texture along it.
// A preset (CFG.TRAILS) may set `minAlt` (no trail below that altitude) and `detectable` (sites can see it, see TrailSystem.detect).
//   const t = trails.create('missile'); each frame t.update(x, y, z, alt); when the emitter is gone t.end() (the ribbon fades out and removes itself).
import * as THREE from 'three';
import { CFG } from './config.js';

const VERT = `
attribute vec3 dir; attribute vec3 aux;          // aux: side (-1|+1), birth time, distance along the trail
uniform float uTime, uLife, uW0, uW1, uDrift, uRise;
varying float vA, vAge, vSide, vDist;
void main(){
  float age = max(uTime - aux.y, 0.0), a = clamp(age / uLife, 0.0, 1.0), d = aux.z;
  vec3 p = position + vec3(sin(d * 0.11) + 0.5 * sin(d * 0.29 + 1.3), 0.0, cos(d * 0.13) + 0.5 * cos(d * 0.31 + 0.7)) * uDrift * a * a + vec3(0.0, uRise * age, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 t = (modelViewMatrix * vec4(dir, 0.0)).xyz, s = cross(t, normalize(mv.xyz));
  float sl = length(s); s = sl > 1e-4 ? s / sl : vec3(1.0, 0.0, 0.0);     // camera-facing width direction
  mv.xyz += s * aux.x * mix(uW0, uW1, sqrt(a)) * 0.5;
  vA = a; vAge = age; vSide = aux.x; vDist = d;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform sampler2D uTex; uniform vec3 uCol0, uCol1;
uniform float uTime, uAlpha, uScroll, uTexLen, uNoise, uFadePow, uHeadFade;
varying float vA, vAge, vSide, vDist;
void main(){
  float n = texture2D(uTex, vec2(vDist / uTexLen - uTime * uScroll, vSide * 0.37 + 0.5)).r;
  float edge = 1.0 - smoothstep(0.5, 1.0, abs(vSide));
  float a = uAlpha * pow(1.0 - vA, uFadePow) * smoothstep(0.0, uHeadFade, vAge) * edge * mix(1.0, n * 1.6, uNoise);
  gl_FragColor = vec4(mix(uCol0, uCol1, vA), a);
}`;

let noiseTex;
function noiseTexture() {                          // tileable value noise, two octaves
  if (noiseTex) return noiseTex;
  const S = 64, lat = (o) => { const g = new Float32Array(o * o); for (let i = 0; i < g.length; i++) g[i] = Math.random(); return g; };
  const octs = [[8, lat(8), 0.65], [16, lat(16), 0.35]], data = new Uint8Array(S * S * 4);
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0;
    for (const [o, g, w] of octs) {
      const fx = x / S * o, fy = y / S * o, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = sm(fx - x0), ty = sm(fy - y0), at = (i, j) => g[(j % o) * o + (i % o)];
      v += w * ((at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty);
    }
    data.fill(Math.round(v * 255), (y * S + x) * 4, (y * S + x) * 4 + 3); data[(y * S + x) * 4 + 3] = 255;
  }
  noiseTex = new THREE.DataTexture(data, S, S); noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping; noiseTex.magFilter = noiseTex.minFilter = THREE.LinearFilter; noiseTex.needsUpdate = true;
  return noiseTex;
}

export class Trail {
  constructor(sys, name) {
    const P = (this.P = CFG.TRAILS[name]); if (!P) throw new Error('Unknown trail preset: ' + name);
    this.sys = sys; this.name = name;
    const N = (this.N = P.maxPoints + 1);            // + 1: the live head slot that follows the emitter
    this.pos = new Float32Array(N * 6); this.dir = new Float32Array(N * 6); this.aux = new Float32Array(N * 6);
    this.births = new Float32Array(N); this.brk = new Uint8Array(N); this.pts = new Float32Array(N * 3);   // per slot: birth, strand start, centre
    this.start = 0; this.count = 0; this.headOn = false; this.ended = false; this.gapped = true;
    this.trav = 0; this.last = null; this.motion = [0, 0, 1]; this.head = null;
    const g = (this.geo = new THREE.BufferGeometry());
    const attr = (n, a, k) => { const b = new THREE.BufferAttribute(a, k); b.setUsage(THREE.DynamicDrawUsage); g.setAttribute(n, b); return b; };
    this.aPos = attr('position', this.pos, 3); this.aDir = attr('dir', this.dir, 3); this.aAux = attr('aux', this.aux, 3);
    this.idx = new BufferAttr(N);
    g.setIndex(this.idx.attr); g.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(g, sys.material(name)); this.mesh.frustumCulled = false; sys.scene.add(this.mesh);
  }

  write(slot, x, y, z, dx, dy, dz, birth, dist) {
    for (let s = 0; s < 2; s++) {
      const v = (slot * 2 + s) * 3;
      this.pos[v] = x; this.pos[v + 1] = y; this.pos[v + 2] = z; this.dir[v] = dx; this.dir[v + 1] = dy; this.dir[v + 2] = dz;
      this.aux[v] = s ? 1 : -1; this.aux[v + 1] = birth; this.aux[v + 2] = dist;
    }
    this.births[slot] = birth; this.pts[slot * 3] = x; this.pts[slot * 3 + 1] = y; this.pts[slot * 3 + 2] = z;
  }
  setDir(slot, dx, dy, dz) { for (let s = 0; s < 2; s++) { const v = (slot * 2 + s) * 3; this.dir[v] = dx; this.dir[v + 1] = dy; this.dir[v + 2] = dz; } }

  // add a committed point (interval reached)
  commit(x, y, z, dir) {
    const N = this.N, now = this.sys.time, slot = (this.start + this.count) % N;
    const prev = (slot + N - 1) % N;
    if (this.count > 0 && this.brk[prev]) this.setDir(prev, dir[0], dir[1], dir[2]);   // a strand's first point takes the first real direction
    this.brk[slot] = this.gapped || this.count === 0 ? 1 : 0; this.gapped = false;
    this.write(slot, x, y, z, dir[0], dir[1], dir[2], now, this.trav);
    this.count++;
    if (this.count > N - 1) { this.start = (this.start + 1) % N; this.count--; }
    this.headOn = true; this.dirty = true;
  }

  // emitter position this frame; alt below the preset's minAlt breaks the ribbon
  update(x, y, z, alt = Infinity) {
    if (this.ended) return;
    const P = this.P;
    if (P.minAlt != null && alt < P.minAlt) { this.cut(); return; }
    if (!this.last) { this.last = [x, y, z]; this.commit(x, y, z, this.motion); this.head = [x, y, z]; this.headDist = this.trav; return; }
    let dx = x - this.last[0], dy = y - this.last[1], dz = z - this.last[2], len = Math.hypot(dx, dy, dz);
    if (len > 1e-4) this.motion = [dx / len, dy / len, dz / len];
    for (let k = 0; len >= P.spacing && k < 12; k++) {                 // several points when a frame covers more than one interval
      const f = P.spacing / len;
      this.last = [this.last[0] + dx * f, this.last[1] + dy * f, this.last[2] + dz * f]; this.trav += P.spacing;
      this.commit(this.last[0], this.last[1], this.last[2], this.motion);
      dx = x - this.last[0]; dy = y - this.last[1]; dz = z - this.last[2]; len = Math.hypot(dx, dy, dz);
    }
    this.head = [x, y, z]; this.headDist = this.trav + len;
    this.writeHead();
  }
  writeHead() {
    if (!this.head || !this.headOn) return;
    const slot = (this.start + this.count) % this.N;
    this.write(slot, this.head[0], this.head[1], this.head[2], this.motion[0], this.motion[1], this.motion[2], this.sys.time, this.headDist);
    this.brk[slot] = 0;
  }
  cut() { if (this.last) { this.last = null; this.headOn = false; this.gapped = true; this.dirty = true; } }
  end() { this.ended = true; this.headOn = false; this.dirty = true; }

  // drop expired points from the tail; rebuild the strip indices when the shape changed. Returns false once an ended trail has faded out.
  tick() {
    const now = this.sys.time, life = this.P.life;
    while (this.count > 0 && now - this.births[this.start] > life) { this.start = (this.start + 1) % this.N; this.count--; this.dirty = true; }
    if (this.count === 0 && this.ended) return false;
    if (this.dirty) {
      this.dirty = false;
      let n = 0; const ix = this.idx.array, N = this.N, segs = this.count - 1 + (this.headOn && this.count > 0 ? 1 : 0);
      for (let k = 0; k < segs; k++) {
        const a = (this.start + k) % N, b = (this.start + k + 1) % N;
        if (this.brk[b] && k + 1 < this.count) continue;             // new strand: no ribbon across the gap
        ix[n++] = a * 2; ix[n++] = a * 2 + 1; ix[n++] = b * 2; ix[n++] = a * 2 + 1; ix[n++] = b * 2 + 1; ix[n++] = b * 2;
      }
      this.idx.attr.needsUpdate = true; this.geo.setDrawRange(0, n);
    }
    this.aPos.needsUpdate = this.aDir.needsUpdate = this.aAux.needsUpdate = true;
    return true;
  }

  dispose() { this.sys.scene.remove(this.mesh); this.geo.dispose(); }
}

class BufferAttr { constructor(N) { this.array = new Uint16Array((N - 1) * 6); this.attr = new THREE.BufferAttribute(this.array, 1); this.attr.setUsage(THREE.DynamicDrawUsage); } }

export class TrailSystem {
  constructor(scene) { this.scene = scene; this.time = 0; this.trails = new Set(); this.mats = {}; this.timeU = { value: 0 }; }

  // one material per preset (shared by every trail of that preset)
  material(name) {
    if (this.mats[name]) return this.mats[name];
    const P = CFG.TRAILS[name], U = (v) => ({ value: v });
    return (this.mats[name] = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: P.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        uTime: this.timeU, uTex: U(noiseTexture()), uLife: U(P.life), uW0: U(P.width[0]), uW1: U(P.width[1]), uDrift: U(P.drift), uRise: U(P.rise),
        uCol0: U(new THREE.Color(...P.color)), uCol1: U(new THREE.Color(...P.colorEnd)), uAlpha: U(P.alpha), uScroll: U(P.scroll), uTexLen: U(P.texLen),
        uNoise: U(P.noise), uFadePow: U(P.fadePow), uHeadFade: U(P.headFade),
      },
    }));
  }
  create(name) { const t = new Trail(this, name); this.trails.add(t); return t; }
  update(dt) {
    this.time += dt; this.timeU.value = this.time;
    for (const t of this.trails) { t.writeHead(); if (!t.tick()) { t.dispose(); this.trails.delete(t); } }
  }
  clear() { for (const t of this.trails) t.dispose(); this.trails.clear(); }

  // can anything see a `detectable` trail from (x, z)? true when a live point is inside the preset's detectRange
  detect(x, z) {
    for (const t of this.trails) {
      if (!t.P.detectable) continue;
      const r2 = t.P.detectRange * t.P.detectRange;
      for (let k = 0; k < t.count; k++) { const s = (t.start + k) % t.N; if ((t.pts[s * 3] - x) ** 2 + (t.pts[s * 3 + 2] - z) ** 2 < r2) return true; }
    }
    return false;
  }
}
