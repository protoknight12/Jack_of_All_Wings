// Scripted scenarios for the headless-browser tests. Load from the game page:
//   const { install } = await import('/tests/harness.js'); const T = install();
// Everything drives window.__game (step(dt), input, spawnMissile, ...). Math.random is replaced by a seeded PRNG.
export function install() {
  const g = window.__game; window.__freeze = true;
  let seed = 1; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  Math.random = rnd;
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const steer = (p, want) => { const e = wrap(want - p.heading), d = g.input.down; d.delete('KeyA'); d.delete('KeyD'); if (e > 0.04) d.add('KeyD'); else if (e < -0.04) d.add('KeyA'); };
  const beamHeading = (p, m) => { const b = Math.atan2(m.x - p.x, -(m.z - p.z)), a = b + Math.PI / 2, c = b - Math.PI / 2; return Math.abs(wrap(a - p.heading)) < Math.abs(wrap(c - p.heading)) ? a : c; };
  const flareHold = (on) => { const d = g.input.down; on ? d.add('Space') : d.delete('Space'); };

  // isolated duel: no sites, far waypoint, one missile launched R0 metres away at azimuth az
  function setup(s, R0, az, v0 = 100) {
    seed = s * 7919 + 13; g.startGame(1000 + s); window.__freeze = true;
    g.level.sites.length = 0; g.sites.reset(); g.level.wps[g.wpN] = { x: 1e7, z: 1e7 };
    const p = g.player; p.x = 0; p.z = 0; p.heading = 0; p.v = v0; p.throttle = 0.55; p.alt = 600;
    g.input.down.clear(); g.step(1 / 60);
    return g.spawnMissile(Math.sin(az) * R0, -Math.cos(az) * R0, R0);
  }
  function run(policy, s, R0, az, tmax = 40) {
    const m = setup(s, R0, az), p = g.player; let t = 0, maxSpeed = 0, everDecoy = false, everLost = false, minQ = 1, reacq = false, last = 'track', minMiss = 1e9;
    const ctx = { t: 0 };
    while (t < tmax && !m.dead && p.alive) {
      ctx.t = t; policy(p, m, ctx);
      g.step(1 / 60); t += 1 / 60;
      maxSpeed = Math.max(maxSpeed, m.speed); everDecoy ||= m.mode === 'decoy'; if (m.mode === 'lost') everLost = true;
      if (last === 'lost' && m.mode === 'track') reacq = true; last = m.mode; minQ = Math.min(minQ, m.q); minMiss = Math.min(minMiss, m.miss ?? 1e9);
      if (p.v < 70) p.throttle = 1; else if (p.v > 120) p.throttle = 0.4;
    }
    g.input.down.clear();
    return { killed: !p.alive, t: +t.toFixed(1), endMode: m.mode, everDecoy, everLost, reacq, minQ: +minQ.toFixed(2), miss: Math.round(minMiss), endSpeed: Math.round(m.speed), maxSpeed: Math.round(maxSpeed), flares: p.flares };
  }
  function trials(name, policy, n, R0 = 1100, azFn) {
    const res = []; for (let i = 0; i < n; i++) res.push(run(policy, i + 1, R0, azFn ? azFn(i, n) : (i / n) * Math.PI * 2));
    const k = res.filter((r) => r.killed).length;
    return { name, n, killed: k, survived: n - k, viaDecoy: res.filter((r) => r.everDecoy).length, viaNotch: res.filter((r) => r.everLost && !r.everDecoy).length, reacquired: res.filter((r) => r.reacq).length, avgEndSpeed: Math.round(res.reduce((a, r) => a + r.endSpeed, 0) / n), res };
  }
  const brief = (t) => { const { res, ...rest } = t; return rest; };
  return (window.T = { g, setup, run, trials, brief, steer, beamHeading, flareHold, wrap });
}
