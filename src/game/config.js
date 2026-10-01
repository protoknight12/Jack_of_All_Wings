// All gameplay tunables in one place. Units: meters, seconds, radians.
export const CFG = {
  // --- player flight model ---
  ALT_START: 600,        // "altitude" budget; stalling burns it, hitting 0 = crash
  ALT_LOW_WARN: 180,
  V_STALL: 55,           // below this the jet stalls
  V_STALL_EXIT: 80,      // must regain this to recover
  V_CORNER: 100,
  V_START: 95,
  THRUST_MAX: 24,        // m/s^2 at full throttle
  DRAG_K: 0.0007,        // parasitic drag ~ k*v^2
  DRAG_IDLE: 2,
  INDUCED_K: 22,         // speed bled by turning
  TURN_MAX: 0.62,        // rad/s at/above corner speed (before g-limit falloff)
  THROTTLE_RATE: 0.55,   // per second when key held
  STALL_SINK: 65,        // m/s downward while stalled
  STALL_DIVE_ACCEL: 15,  // nose-down speed gain while stalled
  ALT_RECOVER: 22,       // m/s climb back when flying healthy
  PLAYER_LENGTH: 28,     // meters on screen (model is normalized to this)
  AGL_MIN: 25, AGL_RANGE: 55,   // visual height above the terrain: AGL_MIN + AGL_RANGE * (alt / ALT_START)
  ALT_TRUE_M: 1,         // true height above the ground (m) per unit of ALT: what bombs fall from (the jet is drawn much lower)

  // --- camera / light ---
  CLIMB_MAX: 0.5, DIVE_MAX: 0.38,   // max climb / dive angle (rad) while following terrain
  FOLLOW_RATE: 2.6,         // how eagerly the jet chases its terrain-following height (1/s)
  TERRAIN_CLEARANCE: 22, TERRAIN_FLOOR: 12,   // clearance over the highest ground ahead / absolute minimum over the ground (m)
  CLIMB_ENERGY: 0.5,        // fraction of g-sin(climb) applied to speed (0 = free climb)
  PITCH_GAIN: 0.9,         // visual nose pitch per radian of flight-path angle
  TURB_ROLL: 0.05,          // rad of roll shake at ground level
  CAM_HEIGHT: 250,
  CAM_BACK: 80,             // camera sits this far south of the jet, tilted slightly
  CAM_TERRAIN_FOLLOW: 0.95, // how much of the local ground height the camera rises with
  SUN_DIR: [-1, 1.25, 0.6],
  FOG_NEAR: 1500, FOG_FAR: 3000,

  // --- terrain (visual + ground height for everything that sits on the ground) ---
  TERRAIN_SEED: 7,
  TERRAIN_AMP: 62,          // max hill height above the valley floor (m)
  TERRAIN_WAVELEN: 1200,    // base hill wavelength (m); 5 octaves are stacked on it
  TERRAIN_OCTAVES: 5,
  TERRAIN_N_LO: 0.28, TERRAIN_N_HI: 0.80, TERRAIN_POW: 1.25,   // noise window -> 0..1 -> height curve
  MTN_AMP: 170,             // extra height of the mountain ranges (m)
  MTN_MASK_WAVELEN: 5200, MTN_MASK_LO: 0.6, MTN_MASK_HI: 0.8,   // where ranges exist (lower LO = more mountains)
  MTN_WAVELEN: 1700,        // ridge spacing (m)
  MTN_START_R0: 1100, MTN_START_R1: 2600,   // no mountains near the start
  SNOW_H: 200,
  TERRAIN_SIZE: 3200,       // recentered mesh size (m)
  TERRAIN_SEG: 160,         // mesh segments per side (even)
  TERRAIN_SNAP_CELLS: 8,    // mesh re-centers in steps of this many cells (world-locked vertices)
  TERRAIN_DETAIL_TILE: 90,  // meters per fine detail-texture tile
  TERRAIN_DETAIL_TEX: 256,  // detail texture resolution
  TERRAIN_SHADE: 5,         // slope exaggeration in the lighting normals so relief reads from the top-down camera
  TERRAIN_HILLSHADE: 3.2,   // strength of the baked hillshade in the vertex colours
  TERRAIN_BRIGHT: 1.3,      // material brightness (compensates the darker detail texture)
  FOREST_WAVELEN: 750,      // forest patch size (m)
  SAND_H: 5,                // below this height: sand
  ROCK_SLOPE: 0.45,         // slope (rise/run) above which rock shows
  ROCK_H: 2.4,              // fraction of TERRAIN_AMP above which rock shows
  FOREST_LEVEL: 0.56,       // forest noise threshold
  TERRAIN_COLORS: { sand: 0xc2ad78, grassLow: 0x5f8a3e, grassHigh: 0x86994a, forest: 0x2a4a25, rock: 0x8a8378, snow: 0xa9b1b5 },
  TREE_SPACING: 46, TREE_BOX: 720, TREE_MAX: 1500,
  TREE_SPARSE: 0.10,        // chance of a lone tree in non-forest cells
  TREES_PER_FOREST_CELL: 2,

  // --- mission objective: bomb ground targets ('targets') or fly waypoints ('waypoints', kept for the SR-71 mission) ---
  // Either way the level is built leg by leg; the cluster of targets sits where the leg's waypoint would be, inside its SAM ring.
  OBJECTIVE: 'targets',
  TARGET_MODE: 'random',    // 'random' = seeded per leg (same ?seed=N gives the same targets) | 'fixed' = TARGET_FIXED, cycled per leg
  TARGETS_LEG: [2, 4],      // targets per leg (early .. late game)
  TARGET_CLUSTER_R: 260, TARGET_MIN_SEP: 70,
  TARGET_VISUAL_SCALE: 1.8,
  // real models per target type (assets.js MODELS ids); each target picks one, fixed per position. Types not listed use procedural stand-ins.
  TARGET_MODELS: { tank: ['t-72m1mod-finland', 't-90'], radar: ['p-18-radar'], bunker: ['bunker-calarreona'] },
  REAL_VISUAL_SCALE: 1.4,   // real models use the jet's exaggeration (28 m / 20.1 m), so they're to scale against the F-117, not the generic 1.8
  TARGET_ACC_BONUS: 0.5,    // score x (1 + this * accuracy), accuracy 0..1 = how close the blast was to dead centre (set by weapons)
  // Add a type here (+ a model in targets.js, optional): score, spawn weight, MFD letter, cls. Weapons list valid types by these keys.
  // cls = protection class; each weapon's `effects` gives its kill / damage radius per class ('hard' = only a penetrator gets full effect).
  TARGET_TYPES: {
    bunker: { label: 'BUNKER', score: 150, weight: 3, sym: 'B', cls: 'hard' },
    radar: { label: 'RADAR', score: 200, weight: 2, sym: 'R', cls: 'soft' },
    tank: { label: 'TANK', score: 75, weight: 4, sym: 'T', cls: 'armor' },
  },

  // --- weapons (targets.js has the types they can hit; weapons.js flies them with the shared model in ballistics.js) ---
  // mass (kg), diameter (m), cdMach: drag coefficient vs Mach [[mach, cd], ...], linear between points (one point = constant).
  // guidance: null = ballistic | { type: 'laser', maxG: fin authority (g), gain: navigation gain on the predicted miss,
  //   gimbal: rad between the jet's nose and the line of sight (3D) beyond which the designator loses the target }.
  // effects: per target class, kill = destroyed if it lands within this (m), dmg = damaged within this; a damaged target dies to a second hit inside dmg.
  // penetrator: full effect on 'hard'; a non-penetrator's hard radii are x hardFactor. blastFx = explosion size (visual only).
  WEAPONS: {
    gbu27: { name: 'GBU-27', mass: 984, diameter: 0.37, cdMach: [[0, 0.30]], guidance: { type: 'laser', maxG: 0.1, gain: 3, gimbal: 2.09 },
      effects: { hard: { kill: 6, dmg: 15 }, armor: { kill: 12, dmg: 25 }, soft: { kill: 30, dmg: 45 } }, penetrator: true, hardFactor: 0.25,
      validTargets: ['bunker', 'radar', 'tank'], blastFx: 1.5, model: 'gbu-27', length: 4.3 },
  },
  WEAPON_START: 'gbu27',
  BAY_ROUNDS: 2, BAY_REFILL_PER_LEG: 1,   // real F-117 carries two
  BAY_DOOR_TIME: 1.0,       // s for the doors to fully open (or shut); a bomb can only leave with them fully open
  BAY_RCS_BOOST: 0.4,       // SAM detection range multiplier bonus while the doors are not fully shut
  RELEASE_INTERVAL: 0.5,    // s between two releases
  PICKLE_HOLD: 0.25,        // G tapped shorter than this = drop now (on key up); held longer = auto release when the cues meet
  BOMB_VISUAL_SCALE: 28 / 20.1,   // same exaggeration as the jet (PLAYER_LENGTH 28 m vs the real F-117's 20.1 m): the 4.2 m GBU-27 draws ~5.9 m, true to scale against the jet

  // --- bomb flight (ballistics.js). Earth curvature ignored (ranges are a few km). ---
  GRAVITY: 9.80665,
  BALLISTIC_DT: 1 / 60,     // fixed step for the bomb AND its predictions
  BALLISTIC_MAX_T: 90,      // prediction gives up after this many s of flight
  ISA_RHO0: 1.225, ISA_T0: 288.15, ISA_LAPSE: 0.0065,   // standard atmosphere: sea-level density, temperature (K), lapse rate (K/m)
  WIND: [0, 0, 0],          // air velocity (m/s: east, up, south); 0 until we decide on a wind model
  TARGET_FIXED: [           // per leg: type + offset (m, east / south) from the leg's end point
    [{ type: 'bunker', dx: 0, dz: 0 }, { type: 'tank', dx: -90, dz: 60 }, { type: 'tank', dx: 80, dz: 70 }],
    [{ type: 'radar', dx: 0, dz: 0 }, { type: 'bunker', dx: 110, dz: -40 }, { type: 'tank', dx: -100, dz: 50 }],
  ],

  // --- mission end + results (saved for the mission-select page, index.html) ---
  MISSION_ID: 'f117',       // results go to localStorage 'jow:stats:<id>'
  MISSION_LEGS: 5,          // strike mission: clearing (or skipping) this many target legs = MISSION COMPLETE. Waypoint mode stays endless.
  // rank from points = score + RANK_TIME_BONUS per second under RANK_PAR_TIME; first entry whose minimum is reached, else 'D'
  RANK_PAR_TIME: 300, RANK_TIME_BONUS: 2,
  RANKS: [['S', 3200], ['A', 2500], ['B', 1800], ['C', 1000]],

  // --- waypoints / scoring ---
  LEVEL_SEED: 0,            // 0 = random per run (also settable with ?seed=N)
  WP_RADIUS: 150,           // reach distance
  WP_SCORE: 100, WP_SCORE_STEP: 25,   // score = WP_SCORE + WP_SCORE_STEP * (waypoint number - 1)
  SCORE_UNDETECTED: 100,    // bonus when no radar tracked you during the leg
  WP_MAX_OFFSET: 0.6,       // legs stay within this many rad of north (course never loops back)
  WP_TURN_STEP: 0.55,       // max heading change between legs (rad)
  WP_BEACON_H: 380, WP_BEACON_R: 16,   // 3D marker column

  // --- SAM layout (generated together with the waypoints, see levelgen.js) ---
  // One battery per site (launcher + radar). Real air defence spaces batteries out and overlaps their coverage;
  // sites never bunch: at most a mutual-support pair inside NEIGHBOR_R, everything else is spread out.
  WATER_Y: 1.5,
  CLOUD_SHADOW: 0.24,
  SITE_DRAW_RADIUS: 1500, SITE_LOD_R: 650,    // batteries beyond this use a cheap stand-in model
  NVG_GAIN: 8, NVG_GAIN_DAY: 0.9,           // night-vision gain at night (daylight uses a fixed low gain)
  SITE_LOAD_RADIUS: 4200,   // sites farther than this are unloaded
  SAFE_START_RADIUS: 2200,
  SAM_RANGE: [950, 1350],   // detection radius (broadside), min..max, before ramp
  LEG_LEN: [4300, 5700],    // length of a leg (m)
  FIELD_HALF_WIDTH: 3600,   // sites are placed this far each side of the leg axis
  FIELD_END: 900,           // ...and this far before the start / past the waypoint
  NEIGHBOR_R: [1150, 850],  // two sites closer than this are "neighbours": at most a pair (leg 1 -> leg 13)
  NEIGHBOR_MAX: 1,          // max neighbours per site
  SITE_MIN_SEP: 480,        // hard minimum distance between any two sites
  SITES_LEG: [7, 12],       // batteries per leg (early .. late game): few, but placed on purpose
  STRAT_CELL: 150, STRAT_HALF_WIDTH: 2800, STRAT_COVER_K: 0.85, STRAT_LAYER: 0.45, STRAT_LANE_STEP: 260, STRAT_RANDOM: 260,
  FILL_ATTEMPTS: 2600,      // random placement attempts per leg after the guards (more = denser)
  FILL_CANDIDATES: 5,       // of this many random spots keep the highest ground (radars like hills)
  AXIS_STEP: 950,           // a site roughly on the straight line to the waypoint every this many m
  GUARD_STEP: 620,          // lane guards: a battery just outside the safe lane every this many m, alternating sides
  GUARD_JITTER: 130,        // extra distance beyond (range + margin) so guards don't sit on a perfect line
  WP_RING_R: [1500, 1900], WP_RING_N: [3, 5],      // batteries defending each waypoint
  LANE_STEP: 900,           // safe-lane control point spacing along the leg
  LANE_WEAVE: [1500, 2300], // how far the lane may wander off the leg axis
  LANE_DETOUR_MIN: 1100,    // mid-leg the lane sits at least this far off the axis
  LANE_SWING: 1500,         // max sideways change per control point
  LANE_MARGIN: [230, 110],  // guaranteed clearance beyond every site's full range, leg 1 -> leg 13
  RAMP_LEGS: 12,            // difficulty interpolation reaches its end values after this many legs
  RANGE_RAMP_PER_WP: 0.025, RANGE_RAMP_MAX: 0.35,
  AMMO_BASE: 12, AMMO_MAX: 12, AMMO_EVERY: 99,   // an M903 launcher carries 12 PAC-3 MSE; the salvo rate (FIRE_COOLDOWN) is what limits fire
  MAX_MISSILES_INFLIGHT: 7,

  // --- radar ---
  RCS_NOSE_FACTOR: 0.7,     // detection range multiplier when nose/tail-on (stealth shaping)
  LOCK_TIME: 1.5,           // seconds inside range to complete lock
  LOCK_DECAY: 0.7,          // lock lost per second outside range
  FIRE_COOLDOWN: 7,
  SITE_RELOAD: 90,

  // --- missiles (PAC-3 style): energy model ---
  MSL_LAUNCH_SPEED: 60,
  MSL_THRUST: 45,           // m/s^2 while the motor burns
  MSL_BURN_TIME: 6.5,        // s of motor; after that it only coasts and bleeds energy
  MSL_DRAG_K: 0.00022,      // parasitic drag ~ k*v^2
  MSL_INDUCED_K: 0.5,      // speed bled by turning: k * omega^2 * v
  MSL_TURN_REF: 1.0,        // rad/s available at MSL_SPEED_REF; turn rate is proportional to speed
  MSL_SPEED_REF: 240,
  MSL_NAV_GAIN: 4,          // proportional navigation gain
  MSL_MIN_SPEED: 80,        // below this it can no longer steer and self-destructs
  MSL_LIFE: 24,
  MSL_KILL_RADIUS: 16,
  MSL_KILL_RADIUS_DECOY: 8, // seduced missile only kills on a near-direct hit
  MSL_KILL_RADIUS_LOST: 10,
  MSL_DECOY_HIT: 22,        // detonates on a flare inside this distance
  MSL_UPLINK_MULT: 2.6,     // command guidance from the site works out to this many site ranges
  MSL_AGL_LAUNCH: 4, MSL_AGL_FOLLOW: 3,   // launch height above ground; how fast it climbs to jet height (1/s)
  MSL_KILL_DY: 60,          // vertical window of the kill check
  MSL_VISUAL_SCALE: 1.6,    // missile and launcher are both exaggerated by ~1.6x, keeping the real 5.2 m : ~10 m proportion
  SITE_VISUAL_SCALE: 1.6,   // whole battery (launcher, trucks, nets)
  TRUCK_SCALE: 1.5,         // extra size for the support/radar trucks so they read from altitude

  // --- seeker / notch (track quality q: 1 = solid track, 0 = broken) ---
  SEEKER_RANGE: 1100,       // seeker only sees (and can be notched/chaffed) inside this
  SEEKER_MIN: 70,           // terminal blind range: track is frozen, missile is committed
  NOTCH_GATE_VR: 30,        // doppler gate: your radial speed (m/s) below this = beaming
  NOTCH_TIME: 2.4,          // s of full-depth, sustained beaming to break track (shallower = slower)
  NOTCH_MIN_SPEED: 65,      // slower than this the notch is interrupted
  TRACK_RECOVER: 0.5,       // q per second when nothing is degrading it
  AIM_ERR_M: 90,            // aim-point wobble (m) at q = 0 (scales with 1-q)
  REACQ_RATE: 0.7,          // q per second while lost and you are not beaming (inside seeker range)
  REACQ_Q: 0.55,            // q needed to regain lock
  REACQ_TIME: 3.5,          // s after losing lock during which reacquire is possible
  LOST_TIMEOUT: 4.5,        // s of blind flight before it self-destructs

  // --- countermeasures (flares + chaff dispensed together) ---
  FLARES_START: 40,
  FLARES_MAX: 40,
  FLARE_INTERVAL: 0.28,     // s between bursts while the button is held (~3.6/s)
  FLARE_REFUND_PER_WP: 2,
  FLARE_LIFE: 4.5, CHAFF_LIFE: 6,
  FLARE_EJECT_BACK: 14, FLARE_EJECT_SIDE: 22,   // m/s ejection velocity relative to the jet
  FLARE_INHERIT: 0.3,       // share of the jet's velocity a fresh decoy keeps
  FLARE_DRAG: 0.9, FLARE_SINK: 6,   // decoy air drag (1/s) and fall speed (m/s)
  CHAFF_SPREAD: 0.5,        // chaff cloud keeps this share of the flare velocity
  FLARE_MIN_DIST: 110,      // seduction window in missile-to-jet distance: nothing outside it
  FLARE_PEAK_DIST: 260,     // ...strongest here
  FLARE_MAX_DIST: 520,
  FLARE_HAZARD: 0.30,      // per second at peak, saturated gate, flying straight
  FLARE_MANEUVER_MULT: 2.5, // extra hazard multiplier when fully beaming / hard turning
  FLARE_LOWQ_BOOST: 1.0,    // extra hazard when the track is already degraded (x (1 + boost * (1 - q)))
  MANEUVER_OMEGA_REF: 0.4,  // turn rate (rad/s) that counts as a full maneuver
  FLARE_GATE_SAT: 8,        // decoys in the gate for full effect (a burst = 2 flares + 1 chaff cloud)
  FLARE_GATE_ANGLE: 0.32,   // seeker gate: angle (rad) ...
  FLARE_GATE_RANGE: 240,    // ... and range (m) around the jet
  CHAFF_DRAIN: 0.12,       // q per second lost with a saturated gate (even without beaming)
  CHAFF_NOTCH_BOOST: 1.5,   // notch drain multiplier with a saturated gate ("chaff in the notch")

  // --- ribbon trails (trails.js). spacing = metres between recorded points, maxPoints = ring size (spacing * maxPoints = longest trail),
  // life = s until fully faded, width = [at the head, fully aged] m, drift = sideways wander of old points (m), rise = m/s upward, scroll = noise texture speed,
  // minAlt = no trail below this altitude (null = always), detectable + detectRange = sites within that many m of a live point can see it ---
  TRAILS: {
    jet: { spacing: 4, maxPoints: 140, life: 2.6, width: [1.2, 5.5], color: [0.95, 0.97, 1], colorEnd: [0.8, 0.83, 0.88], alpha: 0.34, noise: 0.5, scroll: 0.3, texLen: 40, drift: 3, rise: 0.5, fadePow: 1.3, headFade: 0.25, additive: false, minAlt: null, detectable: false },
    missile: { spacing: 5, maxPoints: 200, life: 7, width: [2, 16], color: [0.93, 0.93, 0.95], colorEnd: [0.55, 0.55, 0.58], alpha: 0.62, noise: 0.6, scroll: 0.15, texLen: 60, drift: 6, rise: 1, fadePow: 1.2, headFade: 0.15, additive: false, minAlt: null, detectable: false },
    flare: { spacing: 2.5, maxPoints: 60, life: 1.5, width: [1.5, 5], color: [1, 0.9, 0.6], colorEnd: [0.9, 0.35, 0.08], alpha: 0.9, noise: 0.3, scroll: 1.2, texLen: 15, drift: 1, rise: 0.5, fadePow: 1.6, headFade: 0.05, additive: true, minAlt: null, detectable: false },
    vortex: { spacing: 3, maxPoints: 60, life: 1.2, width: [0.5, 2.5], color: [1, 1, 1], colorEnd: [0.85, 0.9, 0.95], alpha: 0.35, noise: 0.4, scroll: 0.5, texLen: 20, drift: 1, rise: 0, fadePow: 1.5, headFade: 0.1, additive: false, minAlt: null, detectable: false },   // for wingtips at high G (not wired yet)
    // high-altitude jet contrail (SR-71): only exists above minAlt and gives the aircraft away to sites within detectRange
    contrailHigh: { spacing: 8, maxPoints: 260, life: 9, width: [3, 22], color: [1, 1, 1], colorEnd: [0.85, 0.9, 0.95], alpha: 0.55, noise: 0.55, scroll: 0.1, texLen: 90, drift: 8, rise: 0, fadePow: 1.1, headFade: 0.4, additive: false, minAlt: 300, detectable: true, detectRange: 4000 },
  },

  // --- visual effects ---
  FX_MAX_PARTICLES: 9000,
  FX_SMOKE_RATE: [10, 110], // per second, dark smoke at severity 0 -> 1 (stalled / low altitude)
  FX_FIRE_RATE: 40,         // per second at severity 1
  FX_CHAFF_RATE: 45,        // sparkles per second per chaff cloud
  FX_DEBRIS_PIECES: 9,      // burning chunks when the jet is destroyed
  FX_DEBRIS_GRAVITY: 75,

  // --- bombing reticle (hud.js). Every distance comes from the release prediction; these are only screen scales. ---
  GUIDE_ALONG_FACTOR: 1.8,  // in-range envelope: cross-track limit = 0.5 * maxG * g * fall time^2, along-track limit = this x that (measured)
  RETICLE_FPM_UP: 90,       // px the flight-path marker sits above screen centre (just ahead of the jet)
  RETICLE_CUE_PX: 170,      // px of release-cue travel ...
  RETICLE_CUE_TIME: 10,     // ... covering this many s to release
  RETICLE_PX_PER_M: 1.2,    // steering line offset per m of cross-track miss

  // --- UI look (hud.js, mfd.js via ui.js). f117.html :root mirrors the colours for the DOM parts. ---
  // One palette: green = normal, amber = caution / weapons, red = threat, cyan = own jet / notch, gold = waypoints.
  // Line tiers: hair = grids and dashed guides, thin = symbols and text boxes, bold = emphasis, heavy = progress arcs, cues, frames.
  UI: {
    font: 'ui-monospace, Consolas, monospace',     // every HUD / MFD text (score and warnings use Amarillo USAF, menus Rajdhani: see f117.html)
    size: { s: 10, m: 13, l: 16, xl: 22 },        // px: MFD labels / HUD text / readouts / big numbers
    green: '#58ff9a', amber: '#ffb020', red: '#ff3b30', cyan: '#39d0ff', gold: '#ffd23a', hot: '#fff0b0', grey: '#9a9a9a', ink: '#0a120c',
    dimA: 0.35, faintA: 0.22, softA: 0.75,         // alphas for dimmed / grid / label versions of a colour
    scope: 'rgba(4,14,10,0.88)',                   // MFD background (DOM panels use the same rgb at 0.6)
    line: { hair: 1, thin: 1.4, bold: 2, heavy: 3 },
    glow: 4,                                       // px phosphor glow on HUD / MFD lines and text (0 = off, cheaper)
  },

  // --- difficulty (menu). Each preset overrides the values above when selected; NORMAL = the values as written.
  // num = multiply the base value, [a, b] arrays are replaced. score = multiplier on every point earned.
  DIFFICULTY_DEFAULT: 'normal',
  DIFFICULTY: {
    easy: { label: 'EASY', desc: 'Fewer, shorter-ranged SAMs, slow locks, easier notches, more flares and bombs.', score: 0.75,
      mul: { SAM_RANGE: 0.85, LOCK_TIME: 1.6, FIRE_COOLDOWN: 1.4, NOTCH_TIME: 0.7, FLARE_HAZARD: 1.4, MSL_THRUST: 0.9 },
      set: { SITES_LEG: [5, 8], LANE_MARGIN: [340, 200], MAX_MISSILES_INFLIGHT: 4, FLARES_START: 60, FLARES_MAX: 60, BAY_ROUNDS: 3, BAY_REFILL_PER_LEG: 2 } },
    normal: { label: 'NORMAL', desc: 'The mission as designed.', score: 1, mul: {}, set: {} },
    hard: { label: 'HARD', desc: 'Denser, longer-ranged SAMs, fast locks and salvos, stubborn seekers, fewer flares.', score: 1.35,
      mul: { SAM_RANGE: 1.12, LOCK_TIME: 0.7, FIRE_COOLDOWN: 0.75, NOTCH_TIME: 1.3, FLARE_HAZARD: 0.8, MSL_THRUST: 1.08 },
      set: { SITES_LEG: [9, 14], LANE_MARGIN: [170, 80], MAX_MISSILES_INFLIGHT: 9, FLARES_START: 28, FLARES_MAX: 30, BAY_ROUNDS: 2, BAY_REFILL_PER_LEG: 1 } },
  },

  // --- MFD ---
  MFD_RANGES: [2000, 3500, 5500],
};

// Apply a difficulty preset to CFG (always starts from the base values, so switching back and forth is safe).
const BASE = {};
export function applyDifficulty(id) {
  const d = CFG.DIFFICULTY[id] || CFG.DIFFICULTY[CFG.DIFFICULTY_DEFAULT];
  for (const k of Object.keys(BASE)) CFG[k] = BASE[k];
  const keep = (k) => { if (!(k in BASE)) BASE[k] = Array.isArray(CFG[k]) ? [...CFG[k]] : CFG[k]; };
  for (const [k, m] of Object.entries(d.mul)) { keep(k); CFG[k] = Array.isArray(BASE[k]) ? BASE[k].map((v) => v * m) : BASE[k] * m; }
  for (const [k, v] of Object.entries(d.set)) { keep(k); CFG[k] = Array.isArray(v) ? [...v] : v; }
  CFG.SCORE_MULT = d.score;
  return d;
}
