# Jack of All Wings

A pilot who can fly anything: stealth strike, fighters, bombers, interceptors, AWACS and racing. The first mission is **F-117 Stealth Run** (below); more aircraft and mission types will follow.

```
plane combat game/
├── index.html              the game (Jack of All Wings; mission: F-117 Stealth Run)
├── start-game.bat         double-click: starts local server + opens the game
├── viewer/                 standalone 3D model viewer
│   └── index.html
├── vendor/three/          Three.js (local copy, no CDN/build step)
├── start-viewer.bat       double-click: starts local server + opens viewer
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
- Run locally by double-clicking `start-viewer.bat` (needs Python), or `python -m http.server 8000` from this folder and open http://localhost:8000/viewer/ (browsers block file:// asset loading).
- To add a model: drop it in `assets/<category>/<name>/` and add an entry to `MODELS` in `src/core/assets.js`; it then shows up in the viewer dropdown (`viewer/?model=<name>` opens one directly).

## Mission 1: F-117 Stealth Run
Controls: A/D or arrows = turn, W/S or up/down = throttle, **Space/F = flares + chaff (hold to keep dropping, ~3.6 bursts/s; 40 to start)**, Q/E = MFD range, P = pause, R = restart, M = mute.

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
