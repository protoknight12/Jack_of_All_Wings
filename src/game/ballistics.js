// Shared bomb flight model. ONE step function drives both the live bomb (weapons.js) and every impact prediction
// (release cue / reticle, guidance), so they can never disagree. Fixed time step (CFG.BALLISTIC_DT).
// State is in "true" space: x/z as the world, y = true height above the sea datum (m), v in m/s. No three.js.
import { CFG } from './config.js';
import { terrainH } from './terrain.js';

// ISA troposphere at height h (m): air density (kg/m^3) and speed of sound (m/s)
export function atmosphere(h) {
  const T = CFG.ISA_T0 - CFG.ISA_LAPSE * Math.max(0, h);
  return { rho: CFG.ISA_RHO0 * (T / CFG.ISA_T0) ** 4.2559, a: Math.sqrt(1.4 * 287.05 * T) };
}

// drag coefficient at Mach m, linear between the points of spec.cdMach [[mach, cd], ...] (clamped at the ends)
export function dragCoef(spec, m) {
  const t = spec.cdMach;
  if (m <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) if (m <= t[i][0]) { const [m0, c0] = t[i - 1], [m1, c1] = t[i]; return c0 + (c1 - c0) * (m - m0) / (m1 - m0); }
  return t[t.length - 1][1];
}

// one step: gravity + drag (air-relative, CFG.WIND) + an optional extra acceleration `fin` {x, y, z} (m/s^2) from the guidance fins
export function ballisticStep(b, spec, fin = null, dt = CFG.BALLISTIC_DT) {
  const w = CFG.WIND, rx = b.vx - w[0], ry = b.vy - w[1], rz = b.vz - w[2], vr = Math.hypot(rx, ry, rz);
  const { rho, a } = atmosphere(b.y), area = Math.PI * spec.diameter * spec.diameter / 4;
  const k = 0.5 * rho * dragCoef(spec, vr / a) * area * vr / spec.mass;      // drag accel = -k * v_rel
  b.vx += (-k * rx + (fin ? fin.x : 0)) * dt;
  b.vy += (-k * ry - CFG.GRAVITY + (fin ? fin.y : 0)) * dt;
  b.vz += (-k * rz + (fin ? fin.z : 0)) * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
}

export const hitGround = (b) => b.y <= terrainH(b.x, b.z);

// where a bomb in state s lands if nothing steers it from now on. Returns {x, y, z, vx, vy, vz, t} (t = time of flight, s)
export function predictImpact(s, spec) {
  const b = { x: s.x, y: s.y, z: s.z, vx: s.vx, vy: s.vy, vz: s.vz };
  let t = 0;
  while (!hitGround(b) && t < CFG.BALLISTIC_MAX_T) { ballisticStep(b, spec); t += CFG.BALLISTIC_DT; }
  b.t = t; return b;
}
