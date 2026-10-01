// Ground targets: a model per type and a wreck once destroyed. Real models come from CFG.TARGET_MODELS (loaded in main.js);
// a type without one falls back to the procedural stand-in below.
// Type data (score, weight, label) lives in CFG.TARGET_TYPES; a type with no entry in MODELS just gets a plain crate.
import * as THREE from 'three';
import { CFG } from './config.js';
import { terrainH } from './terrain.js';

const M = {}, G = {};
function shared() {
  if (M.olive) return;
  M.olive = new THREE.MeshStandardMaterial({ color: 0x556040, roughness: 0.85 });
  M.tan = new THREE.MeshStandardMaterial({ color: 0x8f8460, roughness: 0.9 });
  M.dark = new THREE.MeshStandardMaterial({ color: 0x24292c, roughness: 0.6, metalness: 0.4 });
  M.earth = new THREE.MeshStandardMaterial({ color: 0x6b5d42, roughness: 1 });
  M.concrete = new THREE.MeshStandardMaterial({ color: 0x8b8d8a, roughness: 0.95 });
  M.char = new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 1 });
  G.box = new THREE.BoxGeometry(1, 1, 1); G.dome = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); G.disc = new THREE.CylinderGeometry(1, 1, 1, 18);
}
const part = (geo, m, sx, sy, sz, x, y, z, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); o.rotation.set(0, ry, rz); return o; };
const box = (m, w, h, d, x, y, z, ry, rz) => part(G.box, m, w, h, d, x, y, z, ry, rz);

// w, d = footprint (m) used for the wreck; make() returns the intact model, +x = front
const MODELS = {
  tank: { w: 8, d: 4, make: () => [box(M.dark, 7.6, 0.9, 1, 0, 0.7, 1.9), box(M.dark, 7.6, 0.9, 1, 0, 0.7, -1.9), box(M.olive, 6.8, 1.3, 3.4, 0, 1.5, 0), box(M.olive, 3.2, 1.2, 2.8, -0.4, 2.7, 0), box(M.dark, 4.4, 0.35, 0.35, 3, 2.8, 0)] },
  bunker: { w: 22, d: 16, make: () => [part(G.dome, M.earth, 11, 5, 8, 0, 0, 0), box(M.concrete, 0.6, 3.6, 6, 10.2, 1.8, 0), box(M.dark, 0.3, 2.8, 4.4, 10.5, 1.4, 0), box(M.concrete, 9, 0.5, 7, -1, 4.6, 0)] },
  radar: { w: 12, d: 8, make: () => [box(M.tan, 6, 3, 3.2, 0, 1.5, 0), box(M.dark, 0.8, 5.5, 0.8, 0, 5.7, 0), part(G.disc, M.concrete, 4.2, 0.35, 2.6, 0.6, 8.6, 0, 0, 0.7), box(M.olive, 3, 2, 2.4, -6, 1, 3)] },
};

const hash = (x, z, k = 1) => { const v = Math.sin(x * 12.9898 * k + z * 78.233) * 43758.5453; return v - Math.floor(v); };

export class TargetManager {
  // models: { type: [loaded model, ...] } -- real models per type; types without one use the procedural stand-in
  constructor(scene, models = {}) { this.scene = scene; this.map = new Map(); this.models = models; }

  // a real model at CFG.REAL_VISUAL_SCALE (cancelling the group's TARGET_VISUAL_SCALE), its ground line (userData.ground) on the terrain, +x = front.
  // The wreck is the same model in charred black, sunk a little and slightly skewed.
  real(proto) {
    if (!M.charModel) M.charModel = new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 1 });
    const k = CFG.REAL_VISUAL_SCALE / CFG.TARGET_VISUAL_SCALE, sz = proto.userData.size, lift = (sz.y / 2 - (proto.userData.ground || 0)) * k;
    const body = proto.clone(true); body.scale.setScalar(k); body.position.y = lift;
    const wreck = proto.clone(true); wreck.traverse((o) => { if (o.isMesh) o.material = M.charModel; });
    wreck.scale.setScalar(k); wreck.position.y = lift - 0.35; wreck.rotation.set(0.04, 0.12, -0.05);
    return { body, wreck };
  }
  reset() { for (const t of this.map.values()) this.scene.remove(t.group); this.map.clear(); }

  build(desc) {
    shared();
    const spec = MODELS[desc.type] || { w: 6, d: 6, make: () => [box(M.tan, 5, 3, 5, 0, 1.5, 0)] };
    const g = new THREE.Group(), body = new THREE.Group(), wreck = new THREE.Group();
    const pool = this.models[desc.type];
    if (pool && pool.length) {
      const r = this.real(pool[Math.floor(hash(desc.x, desc.z, 3.7) * pool.length) % pool.length]);
      body.add(r.body); wreck.add(r.wreck);
    } else {
      body.add(...spec.make());
      wreck.add(box(M.char, spec.w, 0.5, spec.d, 0, 0.25, 0), box(M.char, spec.w * 0.45, 1.2, spec.d * 0.5, 0, 0.8, 0, 0.5, 0.15));
    }
    wreck.visible = false;
    g.add(body, wreck);
    g.scale.setScalar(CFG.TARGET_VISUAL_SCALE);
    g.position.set(desc.x, terrainH(desc.x, desc.z), desc.z);
    g.rotation.y = hash(desc.x, desc.z) * Math.PI * 2;   // fixed pseudo-random facing
    this.scene.add(g);
    const t = { desc, group: g, body, wreck };
    this.map.set(desc.key, t);
    if (!desc.alive) this.wreck(t);
  }
  wreck(t) { t.body.visible = false; t.wreck.visible = true; }

  // create models for the level's targets near the player, drop the ones the level no longer holds
  sync(level, px, pz, drawR = CFG.SITE_DRAW_RADIUS) {
    const live = new Set(level.targets.map((d) => d.key));
    for (const [k, t] of this.map) if (!live.has(k)) { this.scene.remove(t.group); this.map.delete(k); }
    for (const d of level.targets) {
      if (!this.map.has(d.key)) this.build(d);
      const t = this.map.get(d.key); t.group.visible = Math.hypot(d.x - px, d.z - pz) < drawR;
    }
  }

  // destroy a target: explosion, wreck model, a smouldering column
  kill(desc, particles) {
    desc.alive = false;
    const t = this.map.get(desc.key), y = terrainH(desc.x, desc.z);
    if (t) this.wreck(t);
    particles.explosion(desc.x, y + 2, desc.z, 0.9);
    particles.burn(desc.x, y + 1, desc.z, 25, 6, 'smoke', 0.8);
  }
}
