// SAM sites: procedural placement, radar detection with aspect-dependent range, lock, launch.
import * as THREE from 'three';
import { CFG } from './config.js';
import { terrainH } from './terrain.js';

// shared geometry/materials for site dressing (built once)
const M = {};
function mats() {
  if (M.olive) return M;
  M.olive = new THREE.MeshStandardMaterial({ color: 0x4d5a3c, roughness: 0.85 });
  M.tan = new THREE.MeshStandardMaterial({ color: 0x8a7a55, roughness: 0.9 });
  M.dark = new THREE.MeshStandardMaterial({ color: 0x23282b, roughness: 0.6, metalness: 0.4 });
  M.dirt = new THREE.MeshLambertMaterial({ color: 0x5b4c36 });
  M.sand = new THREE.MeshLambertMaterial({ color: 0x9a8a63 });
  M.net = new THREE.MeshLambertMaterial({ color: 0x3f5232, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  M.gPad = new THREE.CylinderGeometry(52, 56, 0.5, 28); M.gBag = new THREE.TorusGeometry(15, 1.3, 5, 20); M.gBox = new THREE.BoxGeometry(1, 1, 1);
  return M;
}
const box = (m, w, h, d, x, y, z, ry = 0) => { const o = new THREE.Mesh(M.gBox, m); o.scale.set(w, h, d); o.position.set(x, y, z); o.rotation.y = ry; return o; };

// Radar (phased-array) truck, generator, command trailer, camo net, mast with obstruction light, dirt pad.
function makeRadar() {
  mats();
  const g = new THREE.Group();
  const body = box(M.olive, 10, 3.4, 4, 0, 2.6, 0), cab = box(M.olive, 3, 2.6, 3.6, -6.4, 2.2, 0), wheels = box(M.dark, 9, 1, 4.4, -0.5, 0.8, 0);
  const arm = new THREE.Group(); arm.position.set(1.5, 5.6, 0);
  const panel = new THREE.Mesh(M.gBox, new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.5, metalness: 0.5, emissive: 0xff2010, emissiveIntensity: 0 }));
  panel.scale.set(0.6, 6.5, 8); panel.rotation.z = -0.35; panel.position.set(0, 3.2, 0);
  const mast = box(M.olive, 1, 3.6, 1, 0, 1.8, 0); arm.add(mast, panel);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a1a })); light.position.set(-4, 5.5, 0);
  const genr = box(M.tan, 3, 2, 2, 8, 1.2, -5, 0.3), trailer = box(M.tan, 7, 3, 3, -9, 1.9, 8, -0.2), truck2 = box(M.olive, 6, 2.6, 2.8, 14, 1.8, 6, 0.5);
  g.add(body, cab, wheels, arm, light, genr, trailer, truck2);
  g.userData = { panel, arm, light };
  return g;
}
function makeDressing() {
  mats();
  const g = new THREE.Group();
  const pad = new THREE.Mesh(M.gPad, M.dirt); pad.position.set(8, 0.2, 5); g.add(pad);
  const bag = new THREE.Mesh(M.gBag, M.sand); bag.rotation.x = Math.PI / 2; bag.scale.set(1.15, 1.0, 1); bag.position.set(0, 1.2, 0); g.add(bag);
  for (const [x, z, r] of [[-22, -14, 0.4], [30, -16, -0.3]]) { const n = box(M.net, 14, 0.15, 10, x, 3.4, z, r); n.rotation.z = 0.06; g.add(n); for (const [px, pz] of [[-6, -4], [6, 4]]) g.add(box(M.dark, 0.3, 3.4, 0.3, x + px, 1.7, z + pz)); }
  return g;
}

// cheap stand-in for batteries that are far from the camera: a handful of boxes, no textures
function makeLow() {
  mats();
  const g = new THREE.Group();
  g.add(box(M.olive, 12, 3.5, 3.6, 0, 3, 0), box(M.dark, 9, 1, 3.4, 0, 1, 0), box(M.olive, 9, 3, 4, 38, 2.4, 19, 0.3), new THREE.Mesh(M.gPad, M.dirt));
  g.children[3].position.set(8, 0.2, 5);
  return g;
}

export class Site {
  // desc: a levelgen site descriptor; ammo lives on it so unloading/reloading a site doesn't refill it
  constructor(desc, proto, scene) {
    this.desc = desc; this.key = desc.key; this.x = desc.x; this.z = desc.z; this.range = desc.range;
    this.effRange = desc.range; this.lock = 0; this.cooldown = 3; this.reload = 0; this.flash = 0;
    this.gy = terrainH(this.x, this.z);
    this.group = new THREE.Group(); this.hi = new THREE.Group(); this.group.add(this.hi);
    this.lo = makeLow(); this.group.add(this.lo);
    const l = proto.clone(true);
    l.position.y = proto.userData.size.y / 2 * 1.0;
    this.hi.add(l);
    this.hi.add(makeDressing());
    const radar = makeRadar(); radar.position.set(24, 0, 12); radar.rotation.y = 0.3;
    this.hi.add(radar); this.radar = radar.userData; this.blink = Math.random() * 3;
    radar.scale.setScalar(CFG.TRUCK_SCALE); radar.position.set(24 * CFG.TRUCK_SCALE * 0.8, 0, 12 * CFG.TRUCK_SCALE * 0.8);
    this.group.scale.setScalar(CFG.SITE_VISUAL_SCALE);
    this.group.position.set(this.x, this.gy, this.z);
    this.group.rotation.y = desc.yaw;
    scene.add(this.group);
    this.scene = scene;
  }
  dispose() { this.scene.remove(this.group); }
  setLOD(d) { const near = d < CFG.SITE_LOD_R; this.hi.visible = near; this.lo.visible = !near; }

  // returns 'fire' when the site launches at the player this frame
  update(dt, player) {
    const d0 = this.desc;
    this.flash = Math.max(0, this.flash - dt);
    this.blink += dt; if (this.radar) {
      this.radar.light.visible = (this.blink % 1.6) < 0.25;
      this.radar.arm.rotation.y += dt * (this.lock > 0.02 ? 0.25 : 1.1);            // sweeps slowly while searching, locks on when tracking
      this.radar.panel.material.emissiveIntensity = this.lock > 0.02 ? 0.35 + 0.65 * this.lock : 0;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (d0.ammo <= 0) { this.reload -= dt; if (this.reload <= 0) d0.ammo = d0.maxAmmo; }
    const dx = player.x - this.x, dz = player.z - this.z, d = Math.hypot(dx, dz);
    this.dist = d;

    // aspect-dependent detection range: nose/tail-on is stealthiest, broadside is not
    const lx = -dx / (d || 1), lz = -dz / (d || 1);                 // from player toward the radar
    const sinA = Math.abs(player.fx * lz - player.fz * lx);         // 0 = nose/tail-on, 1 = broadside
    const target = this.range * (CFG.RCS_NOSE_FACTOR + (1 - CFG.RCS_NOSE_FACTOR) * sinA);
    this.effRange += (target - this.effRange) * Math.min(1, dt * 4);

    let fire = null;
    if (player.alive && d < this.effRange) this.lock = Math.min(1, this.lock + dt / CFG.LOCK_TIME);
    else this.lock = Math.max(0, this.lock - CFG.LOCK_DECAY * dt);
    if (this.lock >= 1 && this.cooldown <= 0 && d0.ammo > 0 && player.alive) {
      this.cooldown = CFG.FIRE_COOLDOWN; d0.ammo--; this.flash = 0.5;
      if (d0.ammo <= 0) this.reload = CFG.SITE_RELOAD;
      fire = 'fire';
    }
    return fire;
  }
}

// keeps a Site object (model + state) alive for every level descriptor near the player
export class SiteManager {
  constructor(scene, proto) { this.scene = scene; this.proto = proto; this.sites = new Map(); }
  reset() { for (const s of this.sites.values()) s.dispose(); this.sites.clear(); }

  streamAround(px, pz, level) {
    const R = CFG.SITE_LOAD_RADIUS;
    for (const d of level.sites) {
      if (!this.sites.has(d.key) && Math.hypot(d.x - px, d.z - pz) < R) this.sites.set(d.key, new Site(d, this.proto, this.scene));
    }
    for (const st of this.sites.values()) { const d = Math.hypot(st.x - px, st.z - pz); st.group.visible = d < CFG.SITE_DRAW_RADIUS; st.setLOD(d); }   // off-screen batteries cost nothing to draw
    const live = new Set(level.sites.map((d) => d.key));
    for (const [key, s] of this.sites) {
      if (!live.has(key) || Math.hypot(s.x - px, s.z - pz) > R + 400) { s.dispose(); this.sites.delete(key); }
    }
  }
}
