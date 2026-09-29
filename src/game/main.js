import * as THREE from 'three';
import { CFG } from './config.js';
import { loadModel } from '../core/assets.js';
import { World } from './world.js';
import { Particles } from './particles.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { SiteManager } from './sam.js';
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
const input = new Input();
const audio = new Audio();
const nvg = new NVG(renderer);
const radio = new Radio(audio, (who, text, dur) => hud.caption(who, text, dur));
const hud = new HUD();
const mfd = new MFD($('mfd'));
const player = new Player(scene, renderer, (m) => hud.overlay(true, 'LOADING', m));
let sites, missileProto, level;
let missiles = [], flares = [];            // flares = every decoy (flare pods and chaff clouds)
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

const CONTROLS_HTML = `<table class="keys">
      <tr><td><b>A / D</b> or <b>← / →</b></td><td>turn</td></tr>
      <tr><td><b>W / S</b> or <b>↑ / ↓</b></td><td>throttle up / down</td></tr>
      <tr><td><b>Space</b> or <b>F</b></td><td>flares + chaff (hold to keep dropping)</td></tr>
      <tr><td><b>Q / E</b></td><td>MFD range</td></tr>
      <tr><td><b>N</b></td><td>night vision on / off</td></tr>
      <tr><td><b>V</b></td><td>radio chatter on / off</td></tr>
      <tr><td><b>P</b> pause · <b>R</b> restart · <b>M</b> mute · <b>+ / −</b> volume</td><td></td></tr>
      <tr><td>Gamepad</td><td>stick = turn/throttle · A/RT = flares · Start = pause</td></tr>
    </table>`;
const stats = { time: 0, undetected: 0, evaded: 0, flaresUsed: 0 };
let settings = { volume: 0.8, time: 'day', radio: true, nvg: true };
try { Object.assign(settings, JSON.parse(localStorage.getItem('f117-settings') || '{}')); } catch (e) { /* ignore */ }
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
function startGame(seed) {
  audio.init(); audio.setVolume(settings.volume); radio.enabled = settings.radio; radio.preload(); radio.stop();
  Object.assign(stats, { time: 0, undetected: 0, evaded: 0, flaresUsed: 0 });
  score = 0; wpDone = 0; wpN = 1; legTracked = false; time = 0; flareArm = false;
  for (const m of missiles) m.dispose(); missiles = []; flares = [];
  particles.clear(); player.reset(); player.syncMesh();
  if (!prepared || (typeof seed === 'number' && prepared.seed !== seed)) prepare(seed);
  level = prepared.level; prepared = null; level.ensure(wpN);
  sites.streamAround(0, 0, level);
  applyTime();
  world.setWaypoint(level.wps[wpN]);
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
  for (const st of sites.sites.values()) st.group.visible = st.hi.visible = st.lo.visible = true;
  if (s0) { W.position.set(s0.x, s0.gy + 90, s0.z + 60); W.lookAt(s0.x + 10, s0.gy, s0.z); }
  for (const night of [false, true]) {
    world.setTimeOfDay(night); renderer.compile(scene, W); renderer.render(scene, W);
    nvg.on = true; nvg.render(scene, W, 0);
  }
  m.dispose(); particles.clear(); nvg.on = false; W.position.copy(keep.p); W.quaternion.copy(keep.q);
  world.setTimeOfDay(false);
  if (prepared) sites.streamAround(0, 0, prepared.level);
}

function die(reason, ground = false) {
  if (!player.alive && state !== 'play') return;
  player.alive = false; player.root.visible = false; player.shadow.visible = false;
  particles.jetDeath(player.x, ground ? player.gy + 3 : player.y, player.z, player.fx * player.v, player.fz * player.v);
  audio.boom(0.5, 1.4); audio.silence(); world.shake = 1;
  state = 'dead'; deadTimer = 1.4; deathReason = reason;
  radio.call(ground ? 'crash' : 'dead', 3);
}
let deathReason = '';

function showDeath() {
  if (score > best) { best = score; try { localStorage.setItem('f117-best', best); } catch (e) { /* ignore */ } }
  hud.overlay(true, deathReason, `<p>Score <b>${score}</b> &nbsp;·&nbsp; Waypoints <b>${wpDone}</b> &nbsp;·&nbsp; Best <b>${best}</b>${score >= best && score > 0 ? ' &nbsp;<b style="color:#ffd23a">NEW BEST</b>' : ''}</p><p class="hint">Flight time ${Math.floor(stats.time / 60)}:${String(Math.floor(stats.time % 60)).padStart(2, '0')} &nbsp;·&nbsp; Clean legs ${stats.undetected} &nbsp;·&nbsp; Missiles beaten ${stats.evaded} &nbsp;·&nbsp; Flares dropped ${stats.flaresUsed}</p><p class="hint">Time of day: <b>${settings.time.toUpperCase()}</b> (press <b>T</b> to switch) &nbsp;·&nbsp; Press <b>R</b> or <b>Enter</b> to fly again</p>`);
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
    flares.push(f); cvx += f.vx; cvz += f.vz;
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
  }
  flares = flares.filter((f) => f.life > 0);
  let nf = null; for (const f of flares) if (f.kind === 'flare' && (!nf || f.life > nf.life)) nf = f;
  const fl = world.flareLight;                             // night: the freshest flare lights up the ground under it
  if (nf && world.night) { fl.position.set(nf.x, nf.y, nf.z); fl.intensity = 3500 * Math.min(1, nf.life / nf.maxLife * 1.6); } else fl.intensity = 0;
}

function reachWaypoint() {
  const n = wpN, ghost = !legTracked, pts = CFG.WP_SCORE + CFG.WP_SCORE_STEP * (n - 1) + (ghost ? CFG.SCORE_UNDETECTED : 0);
  score += pts; wpDone++; if (ghost) stats.undetected++; wpN++; legTracked = false;
  player.flares = Math.min(CFG.FLARES_MAX, player.flares + CFG.FLARE_REFUND_PER_WP);
  level.ensure(wpN);
  world.setWaypoint(level.wps[wpN]);
  hud.toast(`WAYPOINT ${n}  +${pts}${ghost ? '  (UNDETECTED)' : ''}`, 'good');
  audio.chime(ghost ? [660, 880, 1320] : [660, 990]);
  radio.call(ghost ? 'wpClean' : 'wp', 2);
  hud.score(score, wpDone);
}

function missileCtx() {
  return {
    player, particles, flares, time,
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
function step(dt) {
  time += dt; stats.time += dt;
  if (input.hit('KeyQ')) mfd.cycle(-1);
  if (input.hit('KeyE')) mfd.cycle(1);
  // flares: hold to keep releasing; the key must have been released once since the run started
  const flareKey = input.held('Space', 'KeyF');
  if (!flareKey) flareArm = true;
  if (flareKey && flareArm) deployFlare();

  player.update(dt, input, {
    onStall: () => hud.toast('STALL — RECOVER SPEED', 'bad'),
    onCrash: () => die('CRASHED', true),
  });
  if (player.stalled) world.shake = Math.max(world.shake, 0.25);

  if (player.alive) {
    sites.streamAround(player.x, player.z, level);
    const sev = Math.max(player.stalled ? 1 : 0, player.alt < CFG.ALT_LOW_WARN ? 1 - player.alt / CFG.ALT_LOW_WARN : 0);
    player.tailPos(tmp);
    particles.jetTrail([tmp.x, tmp.y, tmp.z], player.fx, player.fz, player.throttle, sev, dt);

    const wp = level.wps[wpN];
    if (Math.hypot(wp.x - player.x, wp.z - player.z) < CFG.WP_RADIUS) reachWaypoint();
  }

  let maxLock = 0;
  for (const s of sites.sites.values()) {
    if (!player.alive) break;
    if (s.update(dt, player) === 'fire') {
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
  hud.drawHUD(player, time, { track: maxLock > 0.05 && maxLock < 1 && !live.length, lock: maxLock >= 1 && !live.length, msl: live.length > 0, nvg: nvg.on });
  const wp = level.wps[wpN];
  hud.wpt(Math.atan2(wp.x - player.x, -(wp.z - player.z)) - player.heading, Math.hypot(wp.x - player.x, wp.z - player.z), wpN, !legTracked);

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
  if (input.hit('KeyM')) { const m = audio.toggleMute(); if (state === 'play') hud.toast(m ? 'SOUND OFF' : 'SOUND ON'); }
  if (input.hit('Minus', 'NumpadSubtract', 'BracketLeft', 'Comma')) { settings.volume = Math.max(0, +(settings.volume - 0.1).toFixed(2)); audio.setVolume(settings.volume); saveSettings(); hud.toast('VOLUME ' + Math.round(settings.volume * 100) + '%'); }
  if (input.hit('Equal', 'NumpadAdd', 'BracketRight', 'Period')) { settings.volume = Math.min(1, +(settings.volume + 0.1).toFixed(2)); audio.setVolume(settings.volume); saveSettings(); hud.toast('VOLUME ' + Math.round(settings.volume * 100) + '%'); }
  if (state === 'paused' || state === 'menu') audio.silence();
  if (input.hit('KeyN') && (state === 'play' || state === 'paused')) { settings.nvg = !settings.nvg; nvg.on = settings.nvg; saveSettings(); hud.toast(settings.nvg ? 'NVG ON' : 'NVG OFF'); }
  if (input.hit('KeyV')) { settings.radio = !settings.radio; radio.enabled = settings.radio; if (!settings.radio) { radio.stop(); hud.caption(null); } saveSettings(); if (state === 'play') hud.toast(settings.radio ? 'RADIO ON' : 'RADIO OFF'); }
  if ((state === 'menu' || state === 'dead') && input.hit('KeyT')) { settings.time = settings.time === 'night' ? 'day' : 'night'; if (settings.nvg === false && settings.time === 'night') settings.nvg = true; saveSettings(); applyTime(); if (state === 'menu') showMenu(); else showDeath(); }
  if (state === 'menu' && input.hit('Enter', 'Space')) { startGame(); }
  else if (state === 'dead' && input.hit('KeyR', 'Enter')) { startGame(); }
  else if (state === 'play' && input.hit('KeyR')) { startGame(); }
  else if (state === 'play' && input.hit('KeyP', 'Escape')) { state = 'paused'; audio.silence(); hud.overlay(true, 'PAUSED', `<p>Score <b>${score}</b> &nbsp;·&nbsp; Waypoint <b>${wpN}</b></p>${CONTROLS_HTML}<p class="hint">Press <b>P</b> to resume · <b>R</b> to restart</p>`); }
  else if (state === 'paused' && input.hit('KeyP', 'Escape')) { state = 'play'; hud.overlay(false); }
  else if (state === 'play') { if (!window.__freeze) step(dt); }
  else if (state === 'dead') {
    // world keeps moving so the crash plays out
    time += dt; updateDecoys(dt);
    const ctx = missileCtx();
    for (const m of missiles) if (!m.dead) m.update(dt, ctx);
    missiles = missiles.filter((m) => { if (m.dead) { m.dispose(); return false; } return true; });
    deadTimer -= dt; if (deadTimer <= 0 && $('overlay').style.display !== 'flex') showDeath();
  }

  if (state !== 'paused') particles.update(dt);
  if (state !== 'loading') {
    world.update(state === 'paused' ? 0 : dt, player.x, player.z, player.fx * player.v, player.fz * player.v, false, player.alive || state === 'dead' ? player.y : null);
    mfd.draw({ player, sites: sites ? [...sites.sites.values()] : [], missiles, flares, time, wp: level ? level.wps[wpN] : null, wpNext: level ? level.wps[wpN + 1] : null, wpN });
  }
  if (nvg.on) nvg.render(scene, world.camera, dt); else renderer.render(scene, world.camera);
  if (state === 'play') adaptRes(dt * 1000, dt);
  input.endFrame();
}

// expose for debugging / automated tests
window.__game = {
  step, input, CFG, world, mfd, particles, terrainH, startGame, renderer,
  get player() { return player; }, get sites() { return sites; }, get missiles() { return missiles; }, get flares() { return flares; },
  get level() { return level; }, get wpN() { return wpN; }, get wp() { return level.wps[wpN]; }, get state() { return state; }, get score() { return score; }, get wpDone() { return wpDone; },
  get legTracked() { return legTracked; },
  // test helper: launch a missile from an arbitrary point as if a site fired it
  spawnMissile(x, z, range = 1200) {
    const m = new Missile({ x, z, range, scene }, player, missileProto, scene); missiles.push(m); return m;
  },
};

function showMenu() {
  const night = settings.time === 'night';
  hud.overlay(true, 'F-117 STEALTH RUN', `
    <p>Fly the waypoint course. Threaded between single Patriot batteries there is always a narrow lane to the next waypoint. Find it, stay nose-on, and don't get seen.</p>
    <div class="opts"><span class="lbl">TIME OF DAY</span>
      <button class="opt ${night ? '' : 'sel'}" data-time="day">DAY</button><button class="opt ${night ? 'sel' : ''}" data-time="night">NIGHT · NVG</button></div>
    ${CONTROLS_HTML}
    <p class="hint">A missile is only beaten by making it work: beam it (fly perpendicular) for a sustained time, drop flares late while turning, and let it bleed its energy. Early flares do nothing.</p>
    <p class="hint">Best: <b>${best}</b> &nbsp;·&nbsp; <b>T</b> switches day / night &nbsp;·&nbsp; Press <b>Enter</b> or <b>Space</b> to start</p>`);
  for (const b of document.querySelectorAll('.opt')) b.onclick = () => { settings.time = b.dataset.time; if (settings.time === 'night') settings.nvg = true; saveSettings(); applyTime(); showMenu(); };
}

(async () => {
  hud.overlay(true, 'LOADING', 'Loading models…');
  await player.load();
  const launcher = await loadModel('mim-104-patriot', { renderer, onProgress: (m) => hud.overlay(true, 'LOADING', m) });
  missileProto = await loadModel('pac-3-mse', { renderer });
  sites = new SiteManager(scene, launcher);
  level = new Level(1); level.ensure(1);          // placeholder so the menu has a world behind it
  player.syncMesh();
  radio.load();
  prepare(); applyTime(); world.update(0, player.x, player.z, 0, 0, true); warmup(); applyTime();
  state = 'menu'; showMenu();
  requestAnimationFrame(frame);
})().catch((e) => { console.error(e); hud.overlay(true, 'FAILED TO LOAD', String(e.message || e)); });
