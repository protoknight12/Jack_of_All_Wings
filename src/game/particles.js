// One shared point-sprite particle system (a single draw call): smoke, fire, sparks, flares, chaff, debris.
// Blend trick: premultiplied colour with alpha = (1 - additive), so additive and normal particles mix in one pass.
import * as THREE from 'three';
import { CFG } from './config.js';

const MAX = CFG.FX_MAX_PARTICLES;
const VERT = `
attribute vec4 a1;   // size, grow, life, maxLife
attribute vec4 a2;   // additive, opacity, twinkle, phase
attribute vec3 col; attribute vec3 col2;
uniform float uTime;
varying vec3 vCol; varying float vA; varying float vAdd;
void main(){
  float t = clamp(a1.z / a1.w, 0.0, 1.0);      // 1 -> 0 over the life
  float age = 1.0 - t;
  vCol = mix(col, col2, age);
  float env = smoothstep(0.0, 0.10, age) * (t * t * (3.0 - 2.0 * t));
  float tw = 1.0 - a2.z + a2.z * (0.5 + 0.5 * sin(uTime * 38.0 + a2.w * 40.0));
  vA = env * a2.y * tw; vAdd = a2.x;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(1.0, a1.x * (1.0 + a1.y * age) * (420.0 / -mv.z));
  gl_Position = projectionMatrix * mv;
  if (a1.z <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const FRAG = `
varying vec3 vCol; varying float vA; varying float vAdd;
void main(){
  vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0;
  if (r > 1.0) discard;
  float soft = pow(1.0 - r, 1.5) + vAdd * exp(-r * r * 7.0);
  float a = soft * vA;
  gl_FragColor = vec4(vCol * (1.0 + vAdd * 0.8) * a, a * (1.0 - vAdd));
}`;

const R = Math.random;
const rr = (a, b) => a + (b - a) * R();

export class Particles {
  constructor(scene, groundFn) {
    this.ground = groundFn || (() => 0);
    this.head = 0; this.timeAcc = 0; this.rates = {};
    const g = (this.geo = new THREE.BufferGeometry());
    const mk = (name, n) => { const a = new THREE.BufferAttribute(new Float32Array(MAX * n), n); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); return a; };
    this.pos = mk('position', 3); this.a1 = mk('a1', 4); this.a2 = mk('a2', 4); this.col = mk('col', 3); this.col2 = mk('col2', 3);
    this.vel = new Float32Array(MAX * 3); this.drag = new Float32Array(MAX); this.rise = new Float32Array(MAX);
    for (let i = 0; i < MAX; i++) this.a1.array[i * 4 + 3] = 1;
    this.uniforms = { uTime: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.fires = [];     // lingering smoke/fire sources {x,y,z,t,rate,kind}
    this.debris = [];    // falling burning chunks
  }

  // opts: pos[x,y,z], vel[x,y,z], life, size, grow, color, end, glow (additive 0..1), opa, twinkle, drag, rise (+up / -gravity)
  emit(o) {
    const i = this.head; this.head = (this.head + 1) % MAX;
    const p = o.pos, v = o.vel || [0, 0, 0], c = o.color || [1, 1, 1], e = o.end || c;
    this.pos.array.set(p, i * 3); this.vel[i * 3] = v[0]; this.vel[i * 3 + 1] = v[1]; this.vel[i * 3 + 2] = v[2];
    this.a1.array.set([o.size, o.grow || 0, o.life, o.life], i * 4);
    this.a2.array.set([o.glow ? 1 : 0, o.opa ?? 1, o.twinkle || 0, R()], i * 4);
    this.col.array.set(c, i * 3); this.col2.array.set(e, i * 3);
    this.drag[i] = o.drag ?? 0.5; this.rise[i] = o.rise ?? 0;
  }
  // how many particles to emit this frame for a steady per-second rate (keeps fractional remainder per key)
  count(key, perSec, dt) { const v = (this.rates[key] || 0) + perSec * dt; const n = Math.floor(v); this.rates[key] = v - n; return n; }

  update(dt) {
    this.uniforms.uTime.value += dt;
    const P = this.pos.array, L = this.a1.array, V = this.vel;
    for (let i = 0; i < MAX; i++) {
      const li = i * 4 + 2;
      if (L[li] <= 0) continue;
      L[li] -= dt;
      const k = 1 - Math.min(1, this.drag[i] * dt), j = i * 3;
      V[j] *= k; V[j + 1] = V[j + 1] * k + this.rise[i] * dt; V[j + 2] *= k;
      P[j] += V[j] * dt; P[j + 1] += V[j + 1] * dt; P[j + 2] += V[j + 2] * dt;
    }
    this.pos.needsUpdate = this.a1.needsUpdate = this.a2.needsUpdate = this.col.needsUpdate = this.col2.needsUpdate = true;

    for (const f of this.fires) {                                   // lingering wreck / launch smoke
      f.t -= dt;
      const n = this.count('fire' + f.id, f.rate, dt);
      for (let i = 0; i < n; i++) {
        this.emit({ pos: [f.x + rr(-4, 4), f.y + rr(0, 3), f.z + rr(-4, 4)], vel: [rr(-3, 3), rr(10, 22), rr(-3, 3)], life: rr(2.5, 4.5), size: rr(10, 16) * f.s, grow: 2.2, color: [0.13, 0.12, 0.12], end: [0.42, 0.42, 0.42], opa: 0.75, drag: 0.5, rise: 3 });
        if (f.kind === 'fire' && R() < 0.5) this.emit({ pos: [f.x + rr(-3, 3), f.y + 1, f.z + rr(-3, 3)], vel: [rr(-2, 2), rr(6, 14), rr(-2, 2)], life: rr(0.3, 0.6), size: rr(6, 10) * f.s, grow: -0.3, color: [1, 0.7, 0.25], end: [0.9, 0.2, 0.05], glow: 1, opa: 0.9, drag: 1 });
      }
    }
    this.fires = this.fires.filter((f) => f.t > 0);

    for (const d of this.debris) {                                  // burning chunks with a trail
      d.vy -= CFG.FX_DEBRIS_GRAVITY * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      const n = this.count('deb' + d.id, 38, dt);
      for (let i = 0; i < n; i++) {
        this.emit({ pos: [d.x, d.y, d.z], vel: [rr(-3, 3), rr(-2, 5), rr(-3, 3)], life: rr(1.4, 2.4), size: d.s * rr(0.9, 1.4), grow: 1.8, color: [0.1, 0.1, 0.1], end: [0.4, 0.4, 0.4], opa: 0.8, drag: 0.8, rise: 4 });
        this.emit({ pos: [d.x, d.y, d.z], life: rr(0.25, 0.45), size: d.s * 0.9, grow: -0.4, color: [1, 0.75, 0.3], end: [1, 0.25, 0.05], glow: 1, drag: 0 });
      }
      if (d.y <= this.ground(d.x, d.z) + 1) { d.dead = true; this.explosion(d.x, this.ground(d.x, d.z) + 1, d.z, 0.4, { ring: false }); this.burn(d.x, this.ground(d.x, d.z) + 1, d.z, rr(3, 6), 22, 'fire', 0.7); }
    }
    this.debris = this.debris.filter((d) => !d.dead);
  }
  clear() { this.a1.array.fill(0); this.fires = []; this.debris = []; this.pos.needsUpdate = this.a1.needsUpdate = true; }

  burn(x, y, z, t, rate, kind = 'smoke', s = 1) { this.fires.push({ id: this.fires.length + '_' + (R() * 1e6 | 0), x, y, z, t, rate, kind, s }); }

  // ---- effects ----
  explosion(x, y, z, s = 1, o = {}) {
    const g = this.ground(x, z);
    this.emit({ pos: [x, y + 2, z], life: 0.22, size: 150 * s, color: [1, 0.95, 0.75], end: [1, 0.6, 0.2], glow: 1 });
    for (let i = 0; i < 22 * s; i++) {                              // fireball
      const a = R() * 6.283, e = rr(-0.3, 1), sp = rr(12, 48) * s;
      this.emit({ pos: [x + rr(-3, 3) * s, y + rr(0, 4) * s, z + rr(-3, 3) * s], vel: [Math.cos(a) * sp, e * sp * 0.7 + 8, Math.sin(a) * sp], life: rr(0.5, 1.15), size: rr(24, 40) * s, grow: 1.1, color: [1, 0.88, 0.45], end: [0.75, 0.13, 0.02], glow: 1, opa: 0.9, drag: 2.2 });
    }
    for (let i = 0; i < 30 * s; i++) {                              // dark smoke ball, rises and lingers
      const a = R() * 6.283, sp = rr(4, 26) * s;
      this.emit({ pos: [x, y, z], vel: [Math.cos(a) * sp, rr(6, 26), Math.sin(a) * sp], life: rr(2.5, 5), size: rr(22, 36) * s, grow: 1.6, color: [0.12, 0.11, 0.1], end: [0.34, 0.34, 0.34], opa: 0.85, drag: 1.1, rise: 5 });
    }
    if (o.ring !== false) {                                         // shockwave ring on the ground
      const n = Math.round(30 + 14 * s);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.283, sp = 190 * s;
        this.emit({ pos: [x + Math.cos(a) * 3, g + 2, z + Math.sin(a) * 3], vel: [Math.cos(a) * sp, 0, Math.sin(a) * sp], life: 0.55, size: 13 * s, grow: 0.5, color: [1, 0.96, 0.85], end: [0.7, 0.75, 0.8], glow: 1, opa: 0.55, drag: 3 });
      }
    }
    for (let i = 0; i < 26 * s; i++) {                              // hot sparks / debris
      const a = R() * 6.283, sp = rr(40, 150) * s;
      this.emit({ pos: [x, y, z], vel: [Math.cos(a) * sp, rr(20, 90) * s, Math.sin(a) * sp], life: rr(0.7, 1.6), size: rr(2.5, 5), color: [1, 0.85, 0.4], end: [1, 0.3, 0.05], glow: 1, drag: 0.35, rise: -70 });
    }
    for (let i = 0; i < 10 * s; i++) {                              // dust on the ground
      const a = R() * 6.283, sp = rr(20, 60) * s;
      this.emit({ pos: [x, g + 2, z], vel: [Math.cos(a) * sp, rr(2, 8), Math.sin(a) * sp], life: rr(1.5, 2.8), size: rr(16, 26) * s, grow: 1.8, color: [0.5, 0.42, 0.32], end: [0.55, 0.5, 0.42], opa: 0.5, drag: 1.5 });
    }
    if (s >= 0.6) this.burn(x, g + 1, z, 5 * s, 10 * s, 'smoke', s);
  }

  // jet destroyed: fireball plus burning chunks tumbling down with fire and smoke
  jetDeath(x, y, z, vx, vz) {
    this.explosion(x, y, z, 1.6);
    for (let i = 0; i < CFG.FX_DEBRIS_PIECES; i++) {
      const a = R() * 6.283, sp = rr(15, 60);
      this.debris.push({ id: 'd' + i + '_' + (R() * 1e6 | 0), x: x + rr(-4, 4), y: y + rr(-2, 3), z: z + rr(-4, 4), vx: vx * 0.55 + Math.cos(a) * sp, vy: rr(5, 50), vz: vz * 0.55 + Math.sin(a) * sp, s: rr(5, 9) });
    }
  }

  // SAM launch: white-hot flash + rising plume + dust
  siteLaunch(x, y, z) {
    this.emit({ pos: [x, y + 6, z], life: 0.28, size: 130, color: [1, 0.95, 0.8], end: [1, 0.55, 0.15], glow: 1 });
    for (let i = 0; i < 26; i++) {
      const a = R() * 6.283, sp = rr(4, 16);
      this.emit({ pos: [x + rr(-3, 3), y + 3, z + rr(-3, 3)], vel: [Math.cos(a) * sp, rr(14, 36), Math.sin(a) * sp], life: rr(3, 5.5), size: rr(26, 46), grow: 2.2, color: [0.92, 0.92, 0.9], end: [0.62, 0.62, 0.62], opa: 0.7, drag: 0.7, rise: 3 });
    }
    for (let i = 0; i < 14; i++) {
      const a = R() * 6.283, sp = rr(25, 55);
      this.emit({ pos: [x, y + 2, z], vel: [Math.cos(a) * sp, rr(1, 6), Math.sin(a) * sp], life: rr(1.6, 3), size: rr(18, 30), grow: 1.8, color: [0.55, 0.47, 0.36], end: [0.6, 0.55, 0.47], opa: 0.5, drag: 1.6 });
    }
    this.burn(x, y + 3, z, 1.5, 22, 'smoke', 1.2);
  }

  // missile motor: bright flame + halo (the smoke is a ribbon trail, see trails.js); nothing at all when coasting (caller skips)
  missileBurn(x, y, z, fx, fz) {
    this.emit({ pos: [x - fx * 5, y, z - fz * 5], vel: [-fx * 20, 0, -fz * 20], life: 0.11, size: 13, color: [1, 0.97, 0.8], end: [1, 0.45, 0.1], glow: 1, drag: 0 });
    this.emit({ pos: [x - fx * 8, y, z - fz * 8], life: 0.07, size: 30, color: [1, 0.6, 0.2], end: [1, 0.3, 0.05], glow: 1, opa: 0.55, drag: 0 });
  }

  // flare: bright head (the smoke is a ribbon trail); chaff: glittering cloud
  flareHead(f) {
    this.emit({ pos: [f.x, f.y, f.z], life: 0.06, size: rr(20, 26), color: [1, 0.97, 0.85], end: [1, 0.6, 0.2], glow: 1, drag: 0 });
    this.emit({ pos: [f.x, f.y, f.z], life: 0.09, size: rr(38, 50), color: [1, 0.55, 0.2], end: [1, 0.3, 0.05], glow: 1, opa: 0.45, drag: 0 });
  }
  chaffCloud(c, dt) {
    const k = c.life / CFG.CHAFF_LIFE, rad = 8 + 30 * (1 - k);
    const n = this.count('ch' + c.id, CFG.FX_CHAFF_RATE * (0.4 + 0.6 * k), dt);
    for (let i = 0; i < n; i++) {
      const a = R() * 6.283, d = Math.sqrt(R()) * rad;
      this.emit({ pos: [c.x + Math.cos(a) * d, c.y + rr(-7, 7), c.z + Math.sin(a) * d], vel: [rr(-4, 4), rr(-5, 1), rr(-4, 4)], life: rr(0.3, 0.8), size: rr(2.5, 4.5), color: [1, 1, 1], end: [0.75, 0.85, 1], glow: 1, twinkle: 1, drag: 1 });
    }
  }
  flareBurst(x, y, z) {
    for (let i = 0; i < 10; i++) this.emit({ pos: [x, y, z], vel: [rr(-40, 40), rr(-12, 12), rr(-40, 40)], life: rr(0.2, 0.55), size: rr(4, 8), color: [1, 0.9, 0.55], end: [1, 0.4, 0.1], glow: 1, drag: 2.5 });
  }

  // player exhaust / trouble (the contrail itself is a ribbon trail): heavy dark smoke + fire when stalled or low (sev 0..1)
  jetTrail(pos, fx, fz, throttle, sev, dt) {
    const [x, y, z] = pos;
    let n;
    if (throttle > 0.3) {                                            // faint hot-exhaust haze, no flame (the F-117's F404s have no afterburner)
      n = this.count('shimmer', 25 * throttle, dt);
      for (let i = 0; i < n; i++) this.emit({ pos: [x, y, z], vel: [-fx * 22, 0, -fz * 22], life: 0.3, size: 4 + 3 * throttle, grow: 3, color: [0.78, 0.82, 0.88], end: [0.7, 0.74, 0.8], opa: 0.03 + 0.07 * throttle, drag: 0.5 });
    }
    if (sev <= 0) return;
    n = this.count('dark', CFG.FX_SMOKE_RATE[0] + (CFG.FX_SMOKE_RATE[1] - CFG.FX_SMOKE_RATE[0]) * sev, dt);
    for (let i = 0; i < n; i++) this.emit({ pos: [x + rr(-2, 2), y + rr(-1, 2), z + rr(-2, 2)], vel: [-fx * 14 + rr(-4, 4), rr(0, 5), -fz * 14 + rr(-4, 4)], life: rr(2, 3.4), size: rr(7, 12) * (0.6 + 0.6 * sev), grow: 2.2, color: [0.07, 0.07, 0.08], end: [0.34, 0.34, 0.35], opa: 0.5 + 0.4 * sev, drag: 0.6, rise: 3 });
    n = this.count('jetfire', CFG.FX_FIRE_RATE * sev, dt);
    for (let i = 0; i < n; i++) this.emit({ pos: [x + rr(-1.5, 1.5), y, z + rr(-1.5, 1.5)], vel: [-fx * 25 + rr(-6, 6), rr(-2, 5), -fz * 25 + rr(-6, 6)], life: rr(0.2, 0.42), size: rr(8, 13), grow: -0.3, color: [1, 0.82, 0.35], end: [0.9, 0.2, 0.04], glow: 1, opa: 0.9, drag: 1 });
  }
}
