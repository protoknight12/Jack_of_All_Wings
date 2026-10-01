# Jack of All Wings

A pilot who can fly anything: stealth strike, fighters, bombers, interceptors, AWACS and racing. The first mission is **F-117 Stealth Run** (below); more aircraft and mission types will follow.

```
plane combat game/
├── index.html              mission select (Jack of All Wings): list, holo map, saved rank / scores / times per mission
├── f117.html               the F-117 Stealth Run game (briefing screen, then the mission; Esc on menu/end screens = back to mission select)
├── growler.html            the EA-18G Growler game (same shell as f117.html, loads src/growler/main.js)
├── start.bat              double-click: starts the local server + opens the mission select (`start.bat /viewer/` opens the viewer)
├── server.py              local no-cache static server (`python server.py [port] [page]`)
├── viewer/                 standalone 3D model viewer
│   └── index.html
├── vendor/three/          Three.js (local copy, no CDN/build step)
├── src/
│   ├── core/               shared engine code: renderer, camera, input, asset loading
│   ├── viewer/             viewer-only code
│   ├── game/               gameplay (config.js holds every tunable number; terrain.js height field, levelgen.js waypoints + SAM layout; audio.js sound engine)
│   └── growler/            Growler mission: config.js overrides game/config.js; IADS, ESM, jammer, AARGM, strike package, MFD
├── assets/
│   ├── aircraft/
│   │   └── <aircraft-name>/    one folder per aircraft, same layout each time:
│   │       ├── model/          .obj/.mtl or .glb
│   │       ├── textures/       texture maps
│   │       ├── source/         original downloads, untouched
│   │       └── README.md       units, materials, quirks
│   ├── ground/             radars, SAM launchers, vehicles (same per-model layout)
│   ├── weapons/            missiles (same per-model layout)
│   ├── terrain/            ground / heightmaps / skyboxes
│   ├── audio/
│   └── ui/                 icons, HUD graphics
└── docs/                   design notes, level/radar specs
```

Rules
- Aircraft folder names: lowercase-with-dashes (`f-117-nighthawk`, `sr-71-blackbird`).
- Original downloads go in `source/` and are never edited; work from `model/`.
- Code never lives in `assets/`; assets never live in `src/`.
- Run locally by double-clicking `start.bat` (needs Python), or `python server.py` from this folder and open http://localhost:8000/ (game) or http://localhost:8000/viewer/ (viewer). Browsers block file:// module/asset loading.
- To add a model: drop it in `assets/<category>/<name>/` and add an entry to `MODELS` in `src/core/assets.js`; it then shows up in the viewer dropdown, grouped by category (`viewer/?model=<name>` opens one directly).

## Mission 1: F-117 Stealth Run
Controls (defaults; every key is rebindable in **CONTROLS** on the start menu, saved to `localStorage['jow:keys']`, defined in `ACTIONS` in `src/game/input.js`): A/D or arrows = turn, W/S or up/down = throttle, Space/F = flares + chaff (hold), B = bay doors, G = release, Tab = next target, Q/E = MFD range, P = pause, R = restart, M = mute. Enter/Esc are fixed menu keys.

**Difficulty** (start menu: EASY / NORMAL / HARD, saved in settings): presets in `CFG.DIFFICULTY` override SAM range, lock time, salvo rate, SAMs per leg, lane margin, notch time, flare effectiveness, missile thrust, flares and bombs; points are multiplied by the preset's `score` (0.75 / 1 / 1.35). `applyDifficulty()` in config.js always restarts from the base values.

All ground targets use real models (`CFG.TARGET_MODELS`: tanks = T-72M1 Finnish / T-90, radar = P-18 "Spoon Rest D", bunker = Calarreona machine-gun bunker scan; each target picks one, fixed per position), drawn at `REAL_VISUAL_SCALE` 1.4 like the jet; a destroyed target leaves a charred copy of itself.

GBU-27 is drawn at the jet's own exaggeration (`BOMB_VISUAL_SCALE` = 28/20.1), so it's true to scale against the F-117.

**Bombing (GBU-27).** Two in the internal bay (+1 per cleared leg). B opens/closes the doors (~1 s; SAM detection range +40% while not fully shut), G drops a bomb once they are fully open (tap = now, hold = automatic release when the cues meet), Tab picks the designated target (default: nearest). The bomb falls from the jet's ALT (ALT 600 = 600 m, `ALT_TRUE_M`) with its speed and vertical rate, under gravity and drag (mass, diameter, Cd-vs-Mach table, standard atmosphere, `WIND` hook = 0); on screen that fall is squeezed into the jet's low visual height. The laser steers it toward the designated target with limited fin authority (fixes roughly 100 m long/short or 55 m sideways) as long as the target stays within 120 deg of the jet's nose (3D) and the jet is alive; otherwise it falls ballistic. `src/game/ballistics.js` is the one flight model used by both the bomb and every impact prediction. Effects per target class (`WEAPONS.*.effects`): bunker (hard) killed within 6 m / damaged within 15 m, tank (armor) 12 / 25 m, radar (soft) 30 / 45 m; a damaged target dies to a second hit inside its damage radius.

**Bombing reticle (HUD).** With a target designated: a box on the target (or an edge caret + distance when it is off-screen), and above the jet a flight-path marker, a steering line and a release cue. Steer so the line runs through the marker; the cue slides down it as the release point approaches and meets the marker at release. Doors shut = dimmed steering line only. Readout: target, distance, seconds to release, IN RNG (a release now would be steered onto the target: envelope from the weapon's fin authority and fall time) / OUT OF RNG / PASSED. Everything comes from `weapons.solution()` = the shared `predictImpact()`; no fixed distances. The MFD shows the predicted impact point with a dashed line from the jet, and a box around the designated target.

**Mission end + results.** Clear `MISSION_LEGS` (5) target legs = MISSION COMPLETE: rank (S-D from score + time bonus under par, `RANKS` in config), score and time are saved to `localStorage['jow:stats:f117']` (`{rank, scores[3], times[3]}`), which the mission select shows. Getting shot down saves the score only. The hook is `missionComplete()` in `src/game/main.js`, called from `nextLeg()`.

**Objective.** Fly the waypoint course. The active waypoint is a gold beacon in the 3D view, a gold crosshair ring on the MFD (edge arrow when off-scope) and an arrow + distance readout under the score. Reaching it scores `100 + 25 x (n-1)`, plus **+100 if no radar tracked you during the leg**, and refunds 2 flares. Then the next waypoint appears further along.

**Level.** Waypoints and SAM sites are generated together from a seed (`?seed=N` in the URL, or `LEVEL_SEED`; random by default). Batteries are spread out (never more than a mutual-support pair). Each leg has one narrow winding safe lane that no site ever covers; batteries hug both edges of it, screen the straight line to the waypoint, ring the waypoint, and fill high ground (never lakes). Density, range and missile count ramp with waypoint number. Sites stream in and out around you.

**Radar.** Detection range depends on aspect: nose/tail-on is stealthy, broadside is not (MFD: solid ring = current range, dashed = worst case). Stay inside a ring long enough and the site fires.

**Missiles (energy model).** The motor burns ~6.5 s (bright flame + smoke), then it coasts dark and quiet. Drag and turning both bleed speed, turn rate is proportional to speed, and below 80 m/s it gives up. A fast missile will hit a jet that simply turns away. You beat it by making it work:
- *Notch:* inside its 1100 m seeker range, fly so your speed along the line to the missile is under 30 m/s (beam it) and hold it. Track quality drains over ~2.4 s of perfect beaming (slower if only roughly perpendicular), recovers when you stop, and the notch needs speed above ~65 m/s. A lost missile can reacquire within 3.5 s if you stop beaming. The centre HUD panel and the ring around the missile on the MFD show track quality, missile speed/motor state, your beam value and decoys in the gate.
- *Flares/chaff:* only work inside ~110-520 m of the missile (best near 260 m). The chance scales with decoys in the seeker gate (a burst = 2 flares + a chaff cloud; hold the key to stack them) and is 2.5x better if you are also beaming or turning hard. Chaff in the gate also drains track quality (faster while notching). One burst while flying straight usually fails; early flares do nothing.
- *Tire it:* sustained hard turns and full throttle make it burn energy; a distant launch that has to chase you can run out of speed and self-destruct.
- Terrain is visual + ground height only (no radar masking).

Below stall speed you sink and lose control; hitting 0 altitude is a crash. Hard turns bleed speed. A stall or low altitude makes the jet trail heavy dark smoke and fire.

Tune anything in `src/game/config.js` (every number lives there). Score font: `assets/ui/fonts/amarurgt.ttf` (Amarillo USAF).



**Polish pass.** Procedural audio (engine follows throttle, wind, panned/doppler missile rumble, flare hiss, launch and explosion sounds; `M` mute, `+`/`-` volume, saved). Lakes in low basins, drifting cloud shadows, detailed SAM sites (camo nets, sandbags, trucks, sweeping radar that lights up when tracking). Gamepad: stick = turn/throttle, A/RT = flares, Start = pause, X = restart. Death screen shows flight time, clean legs, missiles beaten, flares used.

**Night, radio, loading.** The menu lets you pick DAY or NIGHT (`T` also switches). Night is moonlit and dark; night-vision goggles (`N` toggles) render a green phosphor view with grain and bloom, and flares light the ground. Background radio chatter (`V` toggles) plays pre-rendered voice clips from `assets/audio/radio/` (AWACS, tanker and other flights using NATO phonetics and brevity words) with on-screen captions; reactive calls cover waypoints, radar lock, missile launch, defeated missiles, stalls and low flares. The level, batteries and shaders are built and warmed while the menu / death screen is up, so starting a run does not hitch. Batteries far from the camera use a cheap stand-in model.

## Mission 2: EA-18G Growler
`growler.html` (mission select: EA-18G Growler). Design notes: `docs/ea-18g-growler.md`. Every Growler number lives in `src/growler/config.js`, which is imported first and overrides `src/game/config.js` for this page only (the F-117 is untouched).
Reused from the F-117: world/terrain, flight model (`CFG.PLAYER_MODEL` picks the model), PAC-3 missile with the notch / decoy model, flares + chaff, HUD canvas, audio, radio, NVG, difficulty, results. Models: `ea-18g-growler`, `fa-18e-super-hornet` (escorts, same source .blend), `agm-88-harm` (AARGM), plus the Patriot, P-18 and the strike targets.

Controls (rebindable, shared `jow:keys`): J = jammer on/off, Z / C = steer the jam cone, X = slave the cone to the designated emitter, G = fire AARGM, Tab = next emitter, K = push the package early. Everything else as in the F-117 (no bomb bay).

**Phase 1 - hunt** (`PHASE1_TIME`, 3:30 on NORMAL). Sites are invisible until they transmit. A transmitting site inside your receiver range (`EW_ESM` / `PAT_ESM` / `MOB_ESM`) draws a strobe (bearing line) on the MFD. Flying across the line of sight narrows its ellipse (`FIX_SPREAD` of bearing change seen from the site = full fix; straight at it takes `FIX_TIME`). Tab designates, G fires.
- EW radar (P-18): always on, long range, cues every SAM within `EW_CUE_R`: a cued SAM goes active and locks faster. Kill it first and the SAMs only see you in their own short search bursts.
- Patriot: long range, mostly static. When your AARGM comes within `ARM_DETECT` it may shut down, or stay up and fire PAC-3s at the AARGM (`PAT_INTERCEPT_*`).
- Mobile SAM (smaller Patriot battery): short range, usually goes dark and drives off (`MOB_RELOCATE_P`), leaving your fix stale.
- AARGM: homes on emissions; if the site goes dark it flies to the last aim point and the terminal seeker finds the site only if it is still within `ARM_MMW_RADIUS`. Fired at a fix = kills a site that shut down. Fired at a poor estimate = only works while it keeps transmitting.

**Phase 2 - escort.** Four F/A-18Es fly the dashed route to the target cluster; every SAM still alive engages them (and you). A shot that reaches a Hornet kills it with `PKG_PK`. They bomb the targets (+ the targets' score), egress, and the mission completes: +`PKG_SCORE` per Hornet still flying. All four lost before the target = PACKAGE LOST.

**Jammer.** One cone (`JAM_HALF_ANGLE`, `JAM_RANGE`) slaved to the designated emitter or steered by hand. A radar inside it only sees out to `JAM_FACTOR` x its range (burn-through): this protects you and the package. The pods heat up (`JAM_HEAT_TIME`, overheat = off until `JAM_RESTART`). A jammed Patriot can fire home-on-jam at you (`HOJ_*`): it can't be notched or decoyed while you jam; switch the jammer off and it loses guidance unless the site itself has you locked.

Results go to `jow:stats:ea18g` like the F-117's. Test hooks: `window.__game` (state, sites, arms, pkg, jam, startEscort, fireArm, siteKilled), `window.__freeze` (stops the frame loop's step), `window.__god` (no death).

