import * as THREE from 'three';
import { CFG, applyDifficulty } from './config.js';
import { loadModel } from '../core/assets.js';
import { World } from './world.js';
import { Particles } from './particles.js';
import { Input, ACTIONS, keyName } from './input.js';
import { Player } from './player.js';
import { SiteManager } from './sam.js';
import { TargetManager } from './targets.js';
import { Weapons } from './weapons.js';
import { TrailSystem } from './trails.js';
import { Missile } from './missile.js';
import { MFD } from './mfd.js';
import { HUD } from './hud.js';
import { Audio } from './audio.js';
import { NVG } from './nvg.js';
import { Radio, CALLS } from './radio.js';
import { Level } from './levelgen.js';
import { terrainH } from './terrain.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: (devicePixelRatio || 1) < 1.5, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const world = new World(renderer);
const scene = world.scene;
const particles = new Particles(scene, terrainH);
const trails = new TrailSystem(scene);
let jetTrails = [];                          // one ribbon per engine
const input = new Input();
const audio = new Audio();
const nvg = new NVG(renderer);
const radio = new Radio(audio, (who, text, dur) => hud.caption(who, text, dur));
const hud = new HUD();
const mfd = new MFD($('mfd'));
const player = new Player(scene, renderer, (m) => hud.overlay(true, 'LOADING', m));
let sites, targets, weapons, missileProto, level;
let missiles = [], flares = [];            // flares = every decoy (flare pods and chaff clouds)
let sel = null;                            // designated ground target (Tab cycles; the laser guides bombs to it)
let sol = null, gT = -1, gAuto = false;    // bombing solution for sel; G: held time (-1 = not held / used) and auto-release consent
let state = 'loading', score = 0, wpDone = 0, wpN = 1, legTracked = false, time = 0, best = 0, deadTimer = 0, decoyId = 0, flareArm = false;
const acc = { lock: 0, msl: 0, stall: 0 };
try { best = +localStorage.getItem('f117-best') || 0; } catch (e) { /* storage may be blocked */ }

// adaptive resolution: if the frame time stays high, render fewer pixels (and creep back up when there is headroom)
let pr = Math.min(devicePixelRatio || 1, 1.5); const PR_MIN = 0.6, PR_MAX = Math.min(devicePixelRatio || 1, 1.5);
const perf = { avg: 16, t: 0 };
function adaptRes(dtMs, dt) {
  perf.avg += (dtMs - perf.avg) * 0.05; perf.t += dt;
  if (perf.t < 1.5) return; perf.t = 0;
  let np = pr; if (perf.avg > 22) np = Math.max(PR_MIN, pr - 0.15); else if (perf.avg < 13.5 && pr < PR_MAX) np = Math.min(PR_MAX, pr + 0.1);
  if (Math.abs(np - pr) > 0.01) { pr = np; renderer.setPixelRatio(pr); resize(); }
}
function resize() { renderer.setSize(innerWidth, innerHeight); world.resize(innerWidth, innerHeight); nvg.setSize(innerWidth, innerHeight); }
addEventListener('resize', resize); resize();

// ---------- game flow ----------
function newSeed() {
  const q = +new URLSearchParams(location.search).get('seed');
  return CFG.LEVEL_SEED || q || ((Math.random() * 2 ** 31) | 0) || 1;
}

// compact key list for the pause screen, built from the current bindings
const K = (id) => `<b>${input.label(id)}</b>`;
const controlsHTML = () => `<table class="keys">
      <tr><td>${K('left')} · ${K('right')}</td><td>turn</td></tr>
      <tr><td>${K('thrUp')} · ${K('thrDown')}</td><td>throttle up / down</td></tr>
      <tr><td>${K('flare')}</td><td>flares + chaff (hold to keep dropping)</td></tr>
      <tr><td>${K('bay')} · ${K('release')}</td><td>bay doors · release (tap = now, hold = auto at the cue)</td></tr>
      <tr><td>${K('nextTgt')}</td><td>next target</td></tr>
      <tr><td>${K('mfdIn')} · ${K('mfdOut')}</td><td>MFD range</td></tr>
      <tr><td>${K('nvg')} · ${K('radio')}</td><td>night vision · radio</td></tr>
      <tr><td>${K('pause')} · ${K('restart')} · ${K('mute')}</td><td>pause · restart · mute</td></tr>
    </table>`;
const stats = { time: 0, undetected: 0, evaded: 0, flaresUsed: 0 };
let settings = { volume: 0.8, time: 'day', radio: true, nvg: true, difficulty: CFG.DIFFICULTY_DEFAULT };
try { Object.assign(settings, JSON.parse(localStorage.getItem('f117-settings') || '{}')); } catch (e) { /* ignore */ }
let diff = applyDifficulty(settings.difficulty);
const pts = (n) => Math.round(n * CFG.SCORE_MULT);       // every point earned goes through the difficulty multiplier
function setDifficulty(id) { if (!CFG.DIFFICULTY[id] || id === settings.difficulty) return; settings.difficulty = id; diff = applyDifficulty(id); saveSettings(); prepared = null; prepare(); }
function saveSettings() { try { localStorage.setItem('f117-settings', JSON.stringify(settings)); } catch (e) { /* ignore */ } }

// Everything heavy (level generation, site models, shader compile, texture upload) happens in prepare()/warmup() while a menu or
// the death screen is showing, so pressing Start only flips state.
let prepared = null;
function prepare(seed) {
  seed = typeof seed === 'number' ? seed : newSeed();
  if (prepared && prepared.seed === seed) return;
  const lv = new Level(seed); lv.ensure(1);
  sites.reset(); sites.streamAround(0, 0, lv);          // batteries around the start are built now
  prepared = { seed, level: lv };
}
function applyTime() {
  const night = settings.time === 'night';
  world.setTimeOfDay(night); nvg.gain = night ? CFG.NVG_GAIN : CFG.NVG_GAIN_DAY; nvg.on = night && settings.nvg;
}
const TARGETS = () => CFG.OBJECTIVE === 'targets';
const legTargets = () => level.targets.filter((t) => t.leg === wpN);
function setObjective() {
  world.setWaypoint(TARGETS() ? null : level.wps[wpN]);            // the gold beacon is the waypoint mission's marker
  $('passed-lbl').textContent = TARGETS() ? 'TARGETS' : 'WAYPOINTS';
  $('wpt').classList.toggle('tgt', TARGETS());
}
function startGame(seed) {
  audio.init(); audio.setVolume(settings.volume); radio.enabled = settings.radio; radio.preload(); radio.stop();
  Object.assign(stats, { time: 0, undetected: 0, evaded: 0, flaresUsed: 0 });
  score = 0; wpDone = 0; wpN = 1; legTracked = false; time = 0; flareArm = false; sel = null; sol = null; gT = -1; gAuto = false;
  for (const m of missiles) m.dispose(); missiles = []; flares = [];
  particles.clear(); trails.clear(); player.reset(); player.syncMesh(); weapons.reset();
  jetTrails = [trails.create('jet'), trails.create('jet')];
  if (!prepared || (typeof seed === 'number' && prepared.seed !== seed)) prepare(seed);
  level = prepared.level; prepared = null; level.ensure(wpN);
  sites.streamAround(0, 0, level);
  targets.reset(); targets.sync(level, 0, 0);
  applyTime();
  setObjective();
  world.update(0, player.x, player.z, 0, 0, true);
  hud.score(0, 0); hud.overlay(false); hud.warnings([]); hud.caption(null);
  state = 'play';
  radio.nextAmbient = 26 + Math.random() * 10;
  setTimeout(() => radio.say([radio.pick(CALLS.start, 'p_start'), ...(settings.time === 'night' ? CALLS.night : [])], 2), 1400);
}

// compile shaders and upload textures for everything that will appear (sites, missile, particles, NVG pass) before the first flight
function warmup() {
  const s0 = [...sites.sites.values()][0], W = world.camera, keep = { p: W.position.clone(), q: W.quaternion.clone() };
  const m = new Missile({ x: s0 ? s0.x + 20 : 300, z: s0 ? s0.z : -300, range: 1200, scene }, player, missileProto, scene);
  particles.explosion(m.x, m.y, m.z, 1); particles.flareBurst(m.x, m.y + 5, m.z); particles.siteLaunch(m.x, m.y, m.z);
  for (const name of Object.keys(CFG.TRAILS)) { const t = trails.create(name); t.update(m.x, m.y, m.z); t.update(m.x + 30, m.y, m.z + 5); }   // compile every trail material
  trails.update(0);
  for (const st of sites.sites.values()) st.group.visible = st.hi.visible = st.lo.visible = true;
  if (prepared) targets.sync(prepared.level, 0, 0, Infinity);
  if (s0) { W.position.set(s0.x, s0.gy + 90, s0.z + 60); W.lookAt(s0.x + 10, s0.gy, s0.z); }
  for (const night of [false, true]) {
    world.setTimeOfDay(night); renderer.compile(scene, W); renderer.render(scene, W);
    nvg.on = true; nvg.render(scene, W, 0);
  }
  m.dispose(); particles.clear(); trails.clear(); targets.reset(); nvg.on = false; W.position.copy(keep.p); W.quaternion.copy(keep.q);
  world.setTimeOfDay(false);
  if (prepared) sites.streamAround(0, 0, prepared.level);
}

function die(reason, ground = false) {
  if (!player.alive && state !== 'play') return;
  player.alive = false; player.root.visible = false; player.shadow.visible = false; jetTrails.forEach((t) => t.end());
  particles.jetDeath(player.x, ground ? player.gy + 3 : player.y, player.z, player.fx * player.v, player.fz * player.v);
  audio.boom(0.5, 1.4); audio.silence(); world.shake = 1;
  state = 'dead'; deadTimer = 1.4; deathReason = reason;
  radio.call(ground ? 'crash' : 'dead', 3);
  if (TARGETS() && score > 0) recordResult({ score });       // shot down: the score counts, no completion time or rank
}

// ---------- mission results (read by the mission-select page, index.html) ----------
// localStorage 'jow:stats:<MISSION_ID>' = { rank, scores: top 3 high -> low, times: top 3 fast -> slow (s) }, same rules as JOW.recordResult() there
const RANK_ORDER = ['S', 'A', 'B', 'C', 'D'];
function rankOf(pts, t) { pts += Math.max(0, CFG.RANK_PAR_TIME - t) * CFG.RANK_TIME_BONUS; return (CFG.RANKS.find(([, min]) => pts >= min) || ['D'])[0]; }
function recordResult({ score: sc, timeSec, rank }) {
  if (window.JOW && window.JOW.recordResult) { window.JOW.recordResult(CFG.MISSION_ID, { score: sc, timeSec, rank }); return; }   // index page in the same context
  try {
    const key = 'jow:stats:' + CFG.MISSION_ID, s = Object.assign({ rank: null, scores: [], times: [] }, JSON.parse(localStorage.getItem(key)) || {});
    if (Number.isFinite(sc)) s.scores = [...s.scores, sc].sort((a, b) => b - a).slice(0, 3);
    if (Number.isFinite(timeSec)) s.times = [...s.times, timeSec].sort((a, b) => a - b).slice(0, 3);
    if (rank && (s.rank === null || RANK_ORDER.indexOf(rank) < RANK_ORDER.indexOf(s.rank))) s.rank = rank;
    localStorage.setItem(key, JSON.stringify(s));
  } catch (e) { /* storage may be blocked */ }
}
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// MISSION-COMPLETE HOOK: called from nextLeg() once the last target leg (CFG.MISSION_LEGS) is cleared or skipped
function missionComplete() {
  state = 'done'; audio.silence();
  const timeSec = Math.round(stats.time), rank = rankOf(score, timeSec);
  recordResult({ score, timeSec, rank });
  const newBest = score > best; if (newBest) { best = score; try { localStorage.setItem('f117-best', best); } catch (e) { /* ignore */ } }
  audio.chime([660, 880, 1320, 1760]);
  hud.overlay(true, 'MISSION COMPLETE', `<p class="rank">RANK <b>${rank}</b></p><p class="hint">Difficulty <b>${diff.label}</b></p><p>Score <b>${score}</b>${newBest ? ' &nbsp;<b style="color:var(--gold)">NEW BEST</b>' : ''} &nbsp;·&nbsp; Time <b>${mmss(timeSec)}</b> &nbsp;·&nbsp; Targets <b>${wpDone}</b></p><p class="hint">Clean legs ${stats.undetected} &nbsp;·&nbsp; Missiles beaten ${stats.evaded} &nbsp;·&nbsp; Flares dropped ${stats.flaresUsed}</p><p class="hint">${K('restart')} or <b>Enter</b> fly again &nbsp;·&nbsp; <b>Esc</b> mission select</p>`);
  setTimeout(() => prepare(), 60);
}
let deathReason = '';

function showDeath() {
  if (score > best) { best = score; try { localStorage.setItem('f117-best', best); } catch (e) { /* ignore */ } }
  hud.overlay(true, deathReason, `<p>Score <b>${score}</b> &nbsp;·&nbsp; ${TARGETS() ? 'Targets' : 'Waypoints'} <b>${wpDone}</b> &nbsp;·&nbsp; Best <b>${best}</b>${score >= best && score > 0 ? ' &nbsp;<b style="color:#ffd23a">NEW BEST</b>' : ''}</p><p class="hint">Flight time ${Math.floor(stats.time / 60)}:${String(Math.floor(stats.time % 60)).padStart(2, '0')} &nbsp;·&nbsp; Clean legs ${stats.undetected} &nbsp;·&nbsp; Missiles beaten ${stats.evaded} &nbsp;·&nbsp; Flares dropped ${stats.flaresUsed}</p><p class="hint">${diff.label} &nbsp;·&nbsp; ${settings.time.toUpperCase()} (${K('timeOfDay')} switches) &nbsp;·&nbsp; ${K('restart')} or <b>Enter</b> fly again &nbsp;·&nbsp; <b>Esc</b> mission select</p>`);
  setTimeout(() => prepare(), 60);                       // build the next course while the death screen is up
}

// one burst = 2 flare pods (seduction targets) + 1 chaff cloud. Holding the key repeats it every FLARE_INTERVAL.
function deployFlare() {
  if (!player.alive || player.flares <= 0 || player.flareCd > 0) return;
  player.flares--; player.flareCd = CFG.FLARE_INTERVAL;
  audio.flare(); stats.flaresUsed++;
  const rx = -player.fz, rz = player.fx, jvx = player.fx * player.v * CFG.FLARE_INHERIT, jvz = player.fz * player.v * CFG.FLARE_INHERIT;
  const px = player.x - player.fx * 14, pz = player.z - player.fz * 14, y = player.y - 3;
  let cvx = 0, cvz = 0;
  for (const side of [-1, 1]) {
    const f = { id: 'f' + decoyId++, kind: 'flare', x: px + rx * side * 6, z: pz + rz * side * 6, y, vx: jvx - player.fx * CFG.FLARE_EJECT_BACK + rx * side * CFG.FLARE_EJECT_SIDE, vz: jvz - player.fz * CFG.FLARE_EJECT_BACK + rz * side * CFG.FLARE_EJECT_SIDE, life: CFG.FLARE_LIFE, maxLife: CFG.FLARE_LIFE };
    f.trail = trails.create('flare'); flares.push(f); cvx += f.vx; cvz += f.vz;
    particles.flareBurst(f.x, f.y, f.z);
  }
  flares.push({ id: 'c' + decoyId++, kind: 'chaff', x: px, z: pz, y, vx: cvx / 2 * CFG.CHAFF_SPREAD, vz: cvz / 2 * CFG.CHAFF_SPREAD, life: CFG.CHAFF_LIFE, maxLife: CFG.CHAFF_LIFE });
}

function updateDecoys(dt) {
  for (const f of flares) {
    f.life -= dt; f.x += f.vx * dt; f.z += f.vz * dt;
    const k = 1 - Math.min(1, CFG.FLARE_DRAG * dt); f.vx *= k; f.vz *= k;
    f.y = Math.max(terrainH(f.x, f.z) + 2, f.y - CFG.FLARE_SINK * dt);
    if (f.life > 0) f.kind === 'flare' ? particles.flareHead(f, dt) : particles.chaffCloud(f, dt);
    if (f.trail) { if (f.life > 0) f.trail.update(f.x, f.y, f.z, f.y); else { f.trail.end(); f.trail = null; } }
  }
  flares = flares.filter((f) => f.life > 0);
  let nf = null; for (const f of flares) if (f.kind === 'flare' && (!nf || f.life > nf.life)) nf = f;
  const fl = world.flareLight;                             // night: the freshest flare lights up the ground under it
  if (nf && world.night) { fl.position.set(nf.x, nf.y, nf.z); fl.intensity = 3500 * Math.min(1, nf.life / nf.maxLife * 1.6); } else fl.intensity = 0;
}

// leg finished (waypoint reached or target cluster destroyed): bonus, flare refund, next leg
function nextLeg(label, base, skipped = false) {
  const ghost = !legTracked && !skipped, gain = pts(base + (ghost ? CFG.SCORE_UNDETECTED : 0));
  score += gain; if (ghost) stats.undetected++; wpN++; legTracked = false;
  player.flares = Math.min(CFG.FLARES_MAX, player.flares + CFG.FLARE_REFUND_PER_WP); weapons.rearm();
  level.ensure(wpN);
  setObjective();
  hud.toast(`${label}  +${gain}${ghost ? '  (UNDETECTED)' : ''}`, 'good');
  audio.chime(ghost ? [660, 880, 1320] : [660, 990]);
  radio.call(ghost ? 'wpClean' : 'wp', 2);
  hud.score(score, wpDone);
  if (TARGETS() && wpN > CFG.MISSION_LEGS) missionComplete();
}
function reachWaypoint() { wpDone++; nextLeg(`WAYPOINT ${wpN}`, CFG.WP_SCORE + CFG.WP_SCORE_STEP * (wpN - 1)); }

// a weapon (or the debug hook) destroys a target; accuracy 0..1 = how close the blast was to dead centre
function hitTarget(t, accuracy = 0) {
  if (!t.alive) return;
  const T = CFG.TARGET_TYPES[t.type], gain = pts(T.score * (1 + CFG.TARGET_ACC_BONUS * accuracy));
  targets.kill(t, particles); score += gain; wpDone++;
  hud.toast(`${T.label} DESTROYED  +${gain}`, 'good'); hud.score(score, wpDone);
  if (legTargets().every((o) => !o.alive)) nextLeg(`LEG ${wpN} CLEARED`, 0);
}

function weaponCtx() {
  return { targets: level.targets.filter((t) => t.alive), sel: TARGETS() ? sel : null, particles, audio, hit: hitTarget, shake: (v) => { world.shake = Math.max(world.shake, v); },
    damaged: (t) => { hud.toast(`${CFG.TARGET_TYPES[t.type].label} DAMAGED — HIT IT AGAIN`, 'warn'); },
    lase: (on) => { if (player.alive) hud.toast(on ? 'LASER SPOT REACQUIRED' : 'LASER LOST — BOMB BALLISTIC', on ? 'good' : 'bad'); } };
}
function pickle() {
  const r = weapons.pickle(player, sel);
  if (r === 'ok') { hud.toast(sel ? `BOMB AWAY — ${CFG.TARGET_TYPES[sel.type].label}` : 'BOMB AWAY'); audio.beep(520, 0.12, 0.05, 'triangle'); }
  else if (r === 'shut') hud.toast(weapons.doorWant ? 'BAY DOORS STILL OPENING' : `BAY CLOSED — PRESS ${input.label('bay')}`, 'warn');
  else if (r === 'empty') hud.toast('BAY EMPTY', 'bad');
}
// screen position of a ground target for the HUD marker (on = inside the view)
function markerOf(t) {
  if (!t) return null;
  tmp.set(t.x, terrainH(t.x, t.z) + 2, t.z).project(world.camera);
  let x = (tmp.x + 1) / 2 * innerWidth, y = (1 - tmp.y) / 2 * innerHeight; const behind = tmp.z > 1;
  if (behind) { x = innerWidth - x; y = innerHeight - y; }
  return { x, y, on: !behind && x > 0 && x < innerWidth && y > 0 && y < innerHeight, dist: Math.hypot(t.x - player.x, t.z - player.z), label: CFG.TARGET_TYPES[t.type].label };
}
// keep a live designated target: the leg's nearest unless one was picked with Tab. Returns the leg's live targets.
function keepTarget() {
  const left = legTargets().filter((t) => t.alive);
  if (!sel || !left.includes(sel)) sel = nearestTarget(left);
  return left;
}

function missileCtx() {
  return {
    player, particles, trails, flares, time,
    onKill: () => die('SHOT DOWN'),
    onNotch: () => { hud.toast('SEEKER LOST', 'good'); audio.beep(500, 0.2, 0.05, 'sine'); stats.evaded++; radio.call('evaded', 2); },
    onSeduced: () => { hud.toast('MISSILE SEDUCED BY DECOY', 'good'); audio.beep(700, 0.15, 0.05, 'triangle'); stats.evaded++; radio.call('decoy', 2); },
    onReacquire: () => { hud.toast('MISSILE REACQUIRED — BREAK AGAIN', 'bad'); audio.beep(300, 0.2, 0.06, 'sawtooth'); },
    onDecoyHit: () => { hud.toast('MISSILE DETONATED ON DECOY', 'good'); audio.boom(0.12, 0.6); stats.evaded++; },
    onSpent: () => { hud.toast('MISSILE OUT OF ENERGY', 'good'); },
  };
}

// ---------- per-frame ----------
const tmp = new THREE.Vector3();
const nearestTarget = (list) => list.reduce((b, t) => (!b || Math.hypot(t.x - player.x, t.z - player.z) < Math.hypot(b.x - player.x, b.z - player.z) ? t : b), null);
function step(dt) {
  time += dt; stats.time += dt;
  if (input.tap('mfdIn')) mfd.cycle(-1);
  if (input.tap('mfdOut')) mfd.cycle(1);
  // flares: hold to keep releasing; the key must have been released once since the run started
  const flareKey = input.on('flare');
  if (!flareKey) flareArm = true;
  if (flareKey && flareArm) deployFlare();

  player.update(dt, input, {
    onStall: () => hud.toast('STALL — RECOVER SPEED', 'bad'),
    onCrash: () => die('CRASHED', true),
  });
  if (player.stalled) world.shake = Math.max(world.shake, 0.25);
  if (TARGETS()) {
    const left = keepTarget();
    if (input.tap('nextTgt') && left.length > 1) { sel = left[(left.indexOf(sel) + 1) % left.length]; hud.toast(`TGT ${CFG.TARGET_TYPES[sel.type].label}`); audio.beep(1100, 0.05, 0.04); }
  } else sel = null;
  if (input.tap('bay') && player.alive) {
    const open = weapons.toggleBay();
    hud.toast(open ? 'BAY DOORS OPENING' : 'BAY DOORS CLOSING', open ? 'warn' : ''); audio.beep(open ? 320 : 260, 0.25, 0.05, 'triangle');
  }
  weapons.update(dt, player, weaponCtx());
  if (state !== 'play') return;                         // the last target just completed the mission
  sol = TARGETS() ? weapons.solution(player, sel) : null;
  // G: a tap (< PICKLE_HOLD) drops on key up; holding it gives consent and the bomb leaves by itself when the release cue meets the marker
  if (input.tap('release')) { gT = 0; gAuto = false; }
  if (gT >= 0 && player.alive) {
    if (input.on('release')) {
      gT += dt;
      if (!gAuto && gT >= CFG.PICKLE_HOLD) { gAuto = true; if (sol && sol.tRel > 0) hud.toast(`AUTO RELEASE — KEEP HOLDING ${input.label('release')}`, 'warn'); }
      if (gAuto && (!sol || sol.tRel <= 0) && (weapons.bayReady || !weapons.doorWant)) { pickle(); gT = -1; }   // still opening: wait for the doors
    } else { if (!gAuto) pickle(); gT = -1; gAuto = false; }
  }
  if (TARGETS() && player.alive && weapons.empty && legTargets().some((t) => t.alive)) { hud.toast('OUT OF BOMBS — LEG SKIPPED', 'bad'); nextLeg(`LEG ${wpN} SKIPPED`, 0, true); }

  if (player.alive) {
    sites.streamAround(player.x, player.z, level);
    const sev = Math.max(player.stalled ? 1 : 0, player.alt < CFG.ALT_LOW_WARN ? 1 - player.alt / CFG.ALT_LOW_WARN : 0);
    player.tailPos(tmp);
    particles.jetTrail([tmp.x, tmp.y, tmp.z], player.fx, player.fz, player.throttle, sev, dt);
    jetTrails.forEach((t, i) => t.update(tmp.x - player.fz * (i ? 2.5 : -2.5), tmp.y, tmp.z + player.fx * (i ? 2.5 : -2.5), player.y));

    if (TARGETS()) targets.sync(level, player.x, player.z);
    else { const wp = level.wps[wpN]; if (Math.hypot(wp.x - player.x, wp.z - player.z) < CFG.WP_RADIUS) reachWaypoint(); }
  }

  let maxLock = 0;
  for (const s of sites.sites.values()) {
    if (!player.alive) break;
    if (s.update(dt, player, trails.detect(s.x, s.z)) === 'fire') {
      if (missiles.length >= CFG.MAX_MISSILES_INFLIGHT) { s.desc.ammo++; s.cooldown = 1; }
      else {
        missiles.push(new Missile(s, player, missileProto, scene));
        hud.toast('MISSILE LAUNCH', 'bad');
        particles.siteLaunch(s.x, s.gy, s.z);
        audio.launch(Math.hypot(s.x - player.x, s.z - player.z)); radio.call('launch', 3, { cooldown: 6 });
      }
    }
    if (s.lock > 0) legTracked = true;
    maxLock = Math.max(maxLock, s.lock);
  }

  updateDecoys(dt);
  const ctx = missileCtx();
  for (const m of missiles) if (!m.dead) m.update(dt, ctx);
  missiles = missiles.filter((m) => { if (m.dead) { m.dispose(); return false; } return true; });

  // HUD / warnings / audio
  const warn = [];
  const live = missiles.filter((m) => m.mode !== 'lost');
  const closest = live.reduce((d, m) => Math.min(d, m.dPlayer ?? 1e9), 1e9);
  if (live.length) warn.push({ text: `MISSILE INBOUND  ${Math.round(closest)} m`, cls: 'red blink' });
  else if (maxLock >= 1) warn.push({ text: 'RADAR LOCK', cls: 'amber blink' });
  else if (maxLock > 0.05) warn.push({ text: `RADAR TRACK ${Math.round(maxLock * 100)}%`, cls: 'amber' });
  if (player.stalled) warn.push({ text: 'STALL', cls: 'red blink' });
  else if (player.v < CFG.V_STALL + 14) warn.push({ text: 'LOW SPEED — ADD THROTTLE', cls: 'amber blink' });
  if (player.alt < CFG.ALT_LOW_WARN && player.alt > 0) warn.push({ text: 'PULL UP', cls: 'red blink' });
  hud.warnings(warn);
  const threat = missiles.filter((m) => m.mode !== 'lost' || (m.lostAge < CFG.REACQ_TIME && m.dPlayer < CFG.SEEKER_RANGE)).sort((a, b) => a.dPlayer - b.dPlayer)[0];
  hud.seeker(threat);
  hud.gauges(player);
  hud.drawHUD(player, time, { track: maxLock > 0.05 && maxLock < 1 && !live.length, lock: maxLock >= 1 && !live.length, msl: live.length > 0, nvg: nvg.on, bay: weapons.doorsOpen, wpn: weapons.spec.name, bombs: weapons.rounds,
    sight: sol && { ...sol, armed: weapons.doorsOpen, auto: gAuto && gT >= 0 }, mark: TARGETS() && player.alive ? markerOf(sel) : null });
  if (TARGETS()) {
    const all = legTargets(), left = all.filter((t) => t.alive), tg = sel && sel.alive ? sel : nearestTarget(left);
    if (tg) hud.wpt(Math.atan2(tg.x - player.x, -(tg.z - player.z)) - player.heading, Math.hypot(tg.x - player.x, tg.z - player.z), `LEG ${wpN}/${CFG.MISSION_LEGS}  ·  ${CFG.TARGET_TYPES[tg.type].label}  ${left.length}/${all.length}`, !legTracked);
  } else {
    const wp = level.wps[wpN];
    hud.wpt(Math.atan2(wp.x - player.x, -(wp.z - player.z)) - player.heading, Math.hypot(wp.x - player.x, wp.z - player.z), `WPT ${wpN}`, !legTracked);
  }

  { // continuous audio: engine, wind, nearest inbound missile (pan/doppler), flare hiss
    let mm = null;
    for (const m of live) if (!mm || m.dPlayer < mm.dPlayer) mm = m;
    let info = null;
    if (mm) { const rx = -player.fz, rz = player.fx, dx = mm.x - player.x, dz = mm.z - player.z; info = { dist: mm.dPlayer, pan: (dx * rx + dz * rz) / (Math.hypot(dx, dz) || 1), closing: -(mm.vr ?? 0) }; }
    audio.update(player, info, player.flareCd > CFG.FLARE_INTERVAL * 0.5, true);
  }
  if (!live.length) { if (maxLock >= 1) radio.call('lock', 2, { cooldown: 25 }); else if (maxLock > 0.3) radio.call('track', 2, { cooldown: 30 }); }
  if (player.stalled) radio.call('stall', 2, { cooldown: 45 });
  if (player.flares <= 8 && player.flares > 0) radio.call('flaresLow', 2, { cooldown: 90 });
  radio.update(dt, true, live.length > 0 || maxLock > 0.3);
  acc.lock += dt; acc.msl += dt; acc.stall += dt;
  if (live.length) { if (acc.msl > 0.18) { acc.msl = 0; audio.beep(Math.floor(time * 5.5) % 2 ? 1250 : 950, 0.09, 0.05); } }
  else if (maxLock > 0.05 && acc.lock > 0.75 - maxLock * 0.6) { acc.lock = 0; audio.beep(880, 0.06, 0.04); }
  if (player.stalled && acc.stall > 0.35) { acc.stall = 0; audio.beep(190, 0.2, 0.06, 'sawtooth'); }
}

function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (frame.last ? (t - frame.last) / 1000 : 0.016)); frame.last = t;

  input.poll(); hud.show(state === 'play' || state === 'dead');
  document.body.classList.toggle('inmenu', state === 'menu' || state === 'controls' || state === 'loading');   // no score / MFD behind the menus
  const menu = state === 'menu' || state === 'dead' || state === 'done';
  if (state === 'controls') { if (input.hit('Escape')) showMenu(); }
  else {
  if (input.tap('mute')) { const m = audio.toggleMute(); if (state === 'play') hud.toast(m ? 'SOUND OFF' : 'SOUND ON'); }
  if (input.tap('volDown')) { settings.volume = Math.max(0, +(settings.volume - 0.1).toFixed(2)); audio.setVolume(settings.volume); saveSettings(); hud.toast('VOLUME ' + Math.round(settings.volume * 100) + '%'); }
  if (input.tap('volUp')) { settings.volume = Math.min(1, +(settings.volume + 0.1).toFixed(2)); audio.setVolume(settings.volume); saveSettings(); hud.toast('VOLUME ' + Math.round(settings.volume * 100) + '%'); }
  if (input.tap('nvg') && (state === 'play' || state === 'paused')) { settings.nvg = !settings.nvg; nvg.on = settings.nvg; saveSettings(); hud.toast(settings.nvg ? 'NVG ON' : 'NVG OFF'); }
  if (input.tap('radio')) { settings.radio = !settings.radio; radio.enabled = settings.radio; if (!settings.radio) { radio.stop(); hud.caption(null); } saveSettings(); if (state === 'play') hud.toast(settings.radio ? 'RADIO ON' : 'RADIO OFF'); }
  if ((state === 'menu' || state === 'dead') && input.tap('timeOfDay')) { settings.time = settings.time === 'night' ? 'day' : 'night'; if (settings.nvg === false && settings.time === 'night') settings.nvg = true; saveSettings(); applyTime(); if (state === 'menu') showMenu(); else showDeath(); }
  }
  if (state === 'paused' || state === 'menu' || state === 'done' || state === 'controls') audio.silence();
  if (menu && input.hit('Escape')) { location.href = 'index.html'; return; }   // back to the mission select
  if (state === 'menu' && input.hit('Enter', 'NumpadEnter')) { startGame(); }
  else if ((state === 'dead' || state === 'done') && (input.tap('restart') || input.hit('Enter', 'NumpadEnter'))) { startGame(); }
  else if (state === 'play' && input.tap('restart')) { startGame(); }
  else if (state === 'play' && (input.tap('pause') || input.hit('Escape'))) { state = 'paused'; audio.silence(); hud.overlay(true, 'PAUSED', `<p>Score <b>${score}</b> &nbsp;·&nbsp; Leg <b>${wpN}</b> &nbsp;·&nbsp; ${diff.label}</p>${controlsHTML()}<p class="hint">${K('pause')} resume · ${K('restart')} restart</p>`); }
  else if (state === 'paused' && (input.tap('pause') || input.hit('Escape'))) { state = 'play'; hud.overlay(false); }
  else if (state === 'play') { if (!window.__freeze) step(dt); }
  else if (state === 'dead') {
    // world keeps moving so the crash plays out
    time += dt; updateDecoys(dt); weapons.update(dt, player, weaponCtx());
    const ctx = missileCtx();
    for (const m of missiles) if (!m.dead) m.update(dt, ctx);
    missiles = missiles.filter((m) => { if (m.dead) { m.dispose(); return false; } return true; });
    deadTimer -= dt; if (deadTimer <= 0 && $('overlay').style.display !== 'flex') showDeath();
  }

  if (state !== 'paused') { particles.update(dt); trails.update(dt); }
  if (state !== 'loading') {
    world.update(state === 'paused' ? 0 : dt, player.x, player.z, player.fx * player.v, player.fz * player.v, false, player.alive || state === 'dead' ? player.y : null);
    if (frame.n = (frame.n || 0) + 1, frame.n & 1) mfd.draw({ player, sites: sites ? [...sites.sites.values()] : [], missiles, flares, time, wp: level && !TARGETS() ? level.wps[wpN] : null, wpNext: level && !TARGETS() ? level.wps[wpN + 1] : null, wpN,   // half rate, like the HUD canvas: glow-shadowed 2D draws are costly
      targets: level && TARGETS() ? legTargets().filter((t) => t.alive) : null, sel, aim: weapons.ring.visible ? { x: weapons.aim.x, z: weapons.aim.z, r: weapons.aimR } : null });
  }
  if (nvg.on) nvg.render(scene, world.camera, dt); else renderer.render(scene, world.camera);
  if (state === 'play') adaptRes(dt * 1000, dt);
  input.endFrame();
}

// expose for debugging / automated tests
window.__game = {
  step, input, CFG, world, mfd, particles, trails, terrainH, startGame, renderer,
  get player() { return player; }, get sites() { return sites; }, get missiles() { return missiles; }, get flares() { return flares; },
  get weapons() { return weapons; }, get level() { return level; }, get targets() { return level.targets; }, destroyTarget: (t, acc) => hitTarget(t, acc), get wpN() { return wpN; }, get wp() { return level.wps[wpN]; }, get state() { return state; }, get score() { return score; }, get wpDone() { return wpDone; },
  get legTracked() { return legTracked; }, get sel() { return sel; }, set sel(t) { sel = t; },
  // test helper: launch a missile from an arbitrary point as if a site fired it
  spawnMissile(x, z, range = 1200) {
    const m = new Missile({ x, z, range, scene }, player, missileProto, scene); missiles.push(m); return m;
  },
};

// ---------- start menu + controls menu ----------
const optRow = (label, key, items, cur) => `<div class="opts"><span class="lbl">${label}</span>${items.map(([v, t]) => `<button class="opt ${v === cur ? 'sel' : ''}" data-${key}="${v}">${t}</button>`).join('')}</div>`;
function showMenu() {
  state = 'menu'; input.capture = null;
  hud.overlay(true, 'F-117 STEALTH RUN', `
    <p class="brief">${TARGETS() ? `Destroy the targets at the end of ${CFG.MISSION_LEGS} legs.` : 'Fly the waypoint course.'} A narrow lane always threads between the Patriot batteries. Stay nose-on and unseen.</p>
    ${optRow('TIME', 'time', [['day', 'DAY'], ['night', 'NIGHT · NVG']], settings.time)}
    ${optRow('DIFFICULTY', 'diff', Object.entries(CFG.DIFFICULTY).map(([k, d]) => [k, d.label]), settings.difficulty)}
    <p class="hint dsc">${diff.desc}</p>
    <div class="menu-btns"><button class="mbtn go" id="m-start">START</button><button class="mbtn" id="m-ctrl">CONTROLS</button></div>
    <p class="hint foot">Best <b>${best}</b> &nbsp;·&nbsp; <b>Enter</b> start &nbsp;·&nbsp; <b>Esc</b> mission select</p>`);
  for (const b of document.querySelectorAll('[data-time]')) b.onclick = () => { settings.time = b.dataset.time; if (settings.time === 'night') settings.nvg = true; saveSettings(); applyTime(); showMenu(); };
  for (const b of document.querySelectorAll('[data-diff]')) b.onclick = () => { setDifficulty(b.dataset.diff); showMenu(); };
  $('m-start').onclick = () => startGame();
  $('m-ctrl').onclick = () => showControls();
}

// key rebinding: click a slot, press a key (Esc cancels, Backspace / Delete clears). A key taken from another action is unbound there.
function showControls(note = '') {
  state = 'controls';
  const slot = (a, i) => `<button class="kslot ${input.binds[a.id][i] ? '' : 'empty'}" data-act="${a.id}" data-slot="${i}">${keyName(input.binds[a.id][i])}</button>`;
  hud.overlay(true, 'CONTROLS', `
    <div class="kwrap">${[ACTIONS.slice(0, 9), ACTIONS.slice(9)].map((col) => `<table class="rebind"><tr><th></th><th>KEY</th><th>ALT</th></tr>
      ${col.map((a) => `<tr><td>${a.label}</td><td>${slot(a, 0)}</td><td>${slot(a, 1)}</td></tr>`).join('')}</table>`).join('')}</div>
    <p class="hint knote">${note || 'Click a slot, then press a key. <b>Backspace</b> clears it, <b>Esc</b> cancels.'}</p>
    <p class="hint">Gamepad: stick = turn / throttle · A / RT = flares · B = bay · RB = release · LB = next target · Start = pause</p>
    <div class="menu-btns"><button class="mbtn" id="k-reset">RESET DEFAULTS</button><button class="mbtn go" id="k-back">BACK</button></div>`);
  for (const b of document.querySelectorAll('.kslot')) b.onclick = () => {
    for (const o of document.querySelectorAll('.kslot.wait')) o.classList.remove('wait');
    b.classList.add('wait'); b.textContent = 'PRESS A KEY';
    const act = ACTIONS.find((a) => a.id === b.dataset.act), i = +b.dataset.slot;
    input.capture = (code) => {
      input.capture = null;
      if (code === 'Escape') return showControls();
      if (code === 'Enter' || code === 'NumpadEnter') return showControls('<b>Enter</b> is reserved for menus.');
      if (code === 'Backspace' || code === 'Delete') { input.bind(act.id, i, null); return showControls(`${act.label}: slot cleared.`); }
      const from = input.bind(act.id, i, code);
      showControls(`${act.label} = <b>${keyName(code)}</b>${from ? ` (removed from ${from})` : ''}`);
    };
  };
  $('k-reset').onclick = () => { input.capture = null; input.resetBinds(); showControls('Controls reset to defaults.'); };
  $('k-back').onclick = () => showMenu();
}

(async () => {
  hud.overlay(true, 'LOADING', 'Loading models…');
  await player.load();
  const launcher = await loadModel('mim-104-patriot', { renderer, onProgress: (m) => hud.overlay(true, 'LOADING', m) });
  missileProto = await loadModel('pac-3-mse', { renderer });
  const tgtModels = {}; for (const [type, ids] of Object.entries(CFG.TARGET_MODELS)) tgtModels[type] = await Promise.all(ids.map((id) => loadModel(id, { renderer })));
  sites = new SiteManager(scene, launcher); targets = new TargetManager(scene, tgtModels);
  const wm = {}; for (const [id, w] of Object.entries(CFG.WEAPONS)) if (w.model) wm[id] = await loadModel(w.model, { renderer });
  weapons = new Weapons(scene, wm);
  level = new Level(1); level.ensure(1);          // placeholder so the menu has a world behind it
  player.syncMesh();
  radio.load();
  prepare(); applyTime(); world.update(0, player.x, player.z, 0, 0, true); warmup(); applyTime();
  state = 'menu'; showMenu();
  requestAnimationFrame(frame);
})().catch((e) => { console.error(e); hud.overlay(true, 'FAILED TO LOAD', String(e.message || e)); });
