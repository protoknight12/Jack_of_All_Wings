// Pure terrain field (no three.js): deterministic height / forest / colour per world position.
import { CFG } from './config.js';

const hash = (ix, iz, s) => {
  let n = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(s, 2246822519);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

function vnoise(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = fade(x - xi), fz = fade(z - zi);
  const a = hash(xi, zi, s), b = hash(xi + 1, zi, s), c = hash(xi, zi + 1, s), d = hash(xi + 1, zi + 1, s);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

// each octave is rotated so the value-noise lattice doesn't show as axis-aligned ridges
const RC = Math.cos(0.63), RS = Math.sin(0.63);
function fbm(x, z, oct, s) {
  let sum = 0, amp = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x, z, s + i * 17); norm += amp; amp *= 0.5;
    const nx = (x * RC - z * RS) * 2.03 + 11.3, nz = (x * RS + z * RC) * 2.03 - 7.1; x = nx; z = nz;
  }
  return sum / norm;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ss = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

export function terrainH(x, z) {
  const n = fbm(x / CFG.TERRAIN_WAVELEN, z / CFG.TERRAIN_WAVELEN, CFG.TERRAIN_OCTAVES, CFG.TERRAIN_SEED);
  const t = clamp01((n - CFG.TERRAIN_N_LO) / (CFG.TERRAIN_N_HI - CFG.TERRAIN_N_LO));
  let h = CFG.TERRAIN_AMP * Math.pow(t, CFG.TERRAIN_POW);
  // mountain ranges: ridged noise masked by a very low-frequency "range" field, tapered to nothing around the start area
  const rm = ss(CFG.MTN_MASK_LO, CFG.MTN_MASK_HI, fbm(x / CFG.MTN_MASK_WAVELEN, z / CFG.MTN_MASK_WAVELEN, 2, CFG.TERRAIN_SEED + 55));
  if (rm > 0) {
    const r = 1 - Math.abs(2 * fbm(x / CFG.MTN_WAVELEN, z / CFG.MTN_WAVELEN, 4, CFG.TERRAIN_SEED + 77) - 1);
    const d = Math.hypot(x, z), start = ss(CFG.MTN_START_R0, CFG.MTN_START_R1, d);
    h += CFG.MTN_AMP * rm * start * (0.12 + 0.88 * r * r);
  }
  return h;
}
export const forestN = (x, z) => fbm(x / CFG.FOREST_WAVELEN, z / CFG.FOREST_WAVELEN, 3, CFG.TERRAIN_SEED + 101);
export function terrainSlope(x, z, e = 6) {
  const dx = (terrainH(x + e, z) - terrainH(x - e, z)) / (2 * e), dz = (terrainH(x, z + e) - terrainH(x, z - e)) / (2 * e);
  return Math.hypot(dx, dz);
}
// unit surface normal into out[0..2]
export function terrainNormal(x, z, out, e = 6) {
  const dx = (terrainH(x + e, z) - terrainH(x - e, z)) / (2 * e), dz = (terrainH(x, z + e) - terrainH(x, z - e)) / (2 * e);
  const l = Math.hypot(dx, 1, dz); out[0] = -dx / l; out[1] = 1 / l; out[2] = -dz / l; return out;
}

// palette in linear space
const lin = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255].map((c) => Math.pow(c, 2.2));
const PAL = Object.fromEntries(Object.entries(CFG.TERRAIN_COLORS).map(([k, v]) => [k, lin(v)]));
const mix = (o, a, b, t) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; };

// colour by height / slope / forest patch. Writes linear rgb into out.
export function terrainColor(h, slope, forest, x, z, out) {
  const A = CFG.TERRAIN_AMP;
  const patch = vnoise(x / 260, z / 260, 5);                       // dapple so grass isn't flat
  mix(out, PAL.grassLow, PAL.grassHigh, clamp01(h / (A * 0.75) * 0.7 + (patch - 0.5) * 0.7));
  mix(out, out, PAL.forest, ss(CFG.FOREST_LEVEL - 0.03, CFG.FOREST_LEVEL + 0.05, forest) * (1 - ss(CFG.ROCK_SLOPE * 0.6, CFG.ROCK_SLOPE, slope)));
  mix(out, out, PAL.sand, 1 - ss(CFG.SAND_H - 2, CFG.SAND_H + 1.5, h));
  const rock = Math.max(ss(CFG.ROCK_SLOPE * 0.75, CFG.ROCK_SLOPE * 1.25, slope), ss(A * CFG.ROCK_H - 4, A * CFG.ROCK_H + 4, h));
  mix(out, out, PAL.rock, rock);
  mix(out, out, PAL.snow, ss(CFG.SNOW_H - 25, CFG.SNOW_H + 15, h) * 0.85 * (1 - 0.5 * ss(0.3, 0.7, slope)));
  return out;
}

// where trees may stand: returns density 0..1 for a world position
export function treeDensity(x, z, h, slope) {
  if (h < CFG.SAND_H + 2 || slope > CFG.ROCK_SLOPE || h > CFG.TERRAIN_AMP * CFG.ROCK_H) return 0;
  return forestN(x, z) > CFG.FOREST_LEVEL ? 1 : CFG.TREE_SPARSE;
}
export const cellHash = hash;
