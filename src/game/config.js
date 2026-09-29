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

  // --- visual effects ---
  FX_MAX_PARTICLES: 9000,
  FX_CONTRAIL_RATE: 26,     // per second, light contrail when healthy
  FX_SMOKE_RATE: [10, 110], // per second, dark smoke at severity 0 -> 1 (stalled / low altitude)
  FX_FIRE_RATE: 40,         // per second at severity 1
  FX_FLARE_TRAIL_RATE: 34,  // smoke puffs per second per flare
  FX_CHAFF_RATE: 45,        // sparkles per second per chaff cloud
  FX_DEBRIS_PIECES: 9,      // burning chunks when the jet is destroyed
  FX_DEBRIS_GRAVITY: 75,

  // --- MFD ---
  MFD_RANGES: [2000, 3500, 5500],
};
