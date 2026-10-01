# Jack of All Wings

A pilot who can fly anything: stealth strike, fighters, bombers, interceptors, AWACS and racing. The first mission is **F-117 Stealth Run** (below); more aircraft and mission types will follow.

```
plane combat game/
├── index.html              mission select (Jack of All Wings): list, holo map, saved rank / scores / times per mission
├── f117.html               the F-117 Stealth Run game (briefing screen, then the mission; Esc on menu/end screens = back to mission select)
├── start-game.bat         double-click: starts the local server + opens the mission select
├── start-viewer.bat       double-click: same server, opens the viewer (just opens the page if the server is already running)
├── server.py              local no-cache static server (`python server.py [port] [page]`)
├── viewer/                 standalone 3D model viewer
│   └── index.html
├── vendor/three/          Three.js (local copy, no CDN/build step)
├── src/
│   ├── core/               shared engine code: renderer, camera, input, asset loading
│   ├── viewer/             viewer-only code
│   └── game/               gameplay (config.js holds every tunable number; terrain.js height field, levelgen.js waypoints + SAM layout; audio.js sound engine)
├── tests/                  scenario harness for headless testing (see Game section)
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
- Run locally by double-clicking `start-game.bat` / `start-viewer.bat` (needs Python), or `python server.py` from this folder and open http://localhost:8000/ (game) or http://localhost:8000/viewer/ (viewer). Browsers block file:// module/asset loading.
- To add a model: drop it in `assets/<category>/<name>/` and add an entry to `MODELS` in `src/core/assets.js`; it then shows up in the viewer dropdown, grouped by category (`viewer/?model=<name>` opens one directly).

## Mission 1: F-117 Stealth Run
Controls: A/D or arrows = turn, W/S or up/down = throttle, **Space/F = flares + chaff (hold to keep dropping, ~3.6 bursts/s; 40 to start)**, **B = bomb bay doors, G = release, Tab = next target**, Q/E = MFD range, P = pause, R = restart, M = mute.

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

**Tests.** `tests/harness.js` drives `window.__game` (`step(dt)`, `input`, `spawnMissile`, ...) with a seeded RNG. With the game open: `const T = (await import('/tests/harness.js')).install();` then `T.trials(name, policy, n)` / `T.run(...)`.


**Polish pass.** Procedural audio (engine follows throttle, wind, panned/doppler missile rumble, flare hiss, launch and explosion sounds; `M` mute, `+`/`-` volume, saved). Lakes in low basins, drifting cloud shadows, detailed SAM sites (camo nets, sandbags, trucks, sweeping radar that lights up when tracking). Gamepad: stick = turn/throttle, A/RT = flares, Start = pause, X = restart. Death screen shows flight time, clean legs, missiles beaten, flares used.

**Night, radio, loading.** The menu lets you pick DAY or NIGHT (`T` also switches). Night is moonlit and dark; night-vision goggles (`N` toggles) render a green phosphor view with grain and bloom, and flares light the ground. Background radio chatter (`V` toggles) plays pre-rendered voice clips from `assets/audio/radio/` (AWACS, tanker and other flights using NATO phonetics and brevity words) with on-screen captions; reactive calls cover waypoints, radar lock, missile launch, defeated missiles, stalls and low flares. The level, batteries and shaders are built and warmed while the menu / death screen is up, so starting a run does not hitch. Batteries far from the camera use a cheap stand-in model.
