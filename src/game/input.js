// Keyboard + gamepad state, mapped to named ACTIONS that the player can rebind (controls menu in main.js).
// Bindings are saved in localStorage 'jow:keys' (shared by every mission). Each action has up to two keys (primary, alternate).
// Enter / Escape are fixed menu keys and cannot be rebound. Raw codes still work through held()/hit() (menus, tests).

export const ACTIONS = [
  { id: 'left',      label: 'Turn left',               keys: ['KeyA', 'ArrowLeft'] },
  { id: 'right',     label: 'Turn right',              keys: ['KeyD', 'ArrowRight'] },
  { id: 'thrUp',     label: 'Throttle up',             keys: ['KeyW', 'ArrowUp'] },
  { id: 'thrDown',   label: 'Throttle down',           keys: ['KeyS', 'ArrowDown'] },
  { id: 'flare',     label: 'Flares + chaff (hold)',   keys: ['Space', 'KeyF'] },
  { id: 'bay',       label: 'Bomb bay doors',          keys: ['KeyB', null] },
  { id: 'release',   label: 'Release bomb (hold = auto)', keys: ['KeyG', null] },
  { id: 'nextTgt',   label: 'Next target',             keys: ['Tab', null] },
  { id: 'mfdIn',     label: 'MFD range down',          keys: ['KeyQ', null] },
  { id: 'mfdOut',    label: 'MFD range up',            keys: ['KeyE', null] },
  { id: 'nvg',       label: 'Night vision',            keys: ['KeyN', null] },
  { id: 'radio',     label: 'Radio chatter',           keys: ['KeyV', null] },
  { id: 'timeOfDay', label: 'Day / night (menus)',     keys: ['KeyT', null] },
  { id: 'pause',     label: 'Pause',                   keys: ['KeyP', null] },
  { id: 'restart',   label: 'Restart',                 keys: ['KeyR', null] },
  { id: 'mute',      label: 'Mute',                    keys: ['KeyM', null] },
  { id: 'volDown',   label: 'Volume down',             keys: ['Minus', 'NumpadSubtract'] },
  { id: 'volUp',     label: 'Volume up',               keys: ['Equal', 'NumpadAdd'] },
];
export const FIXED_KEYS = ['Enter', 'NumpadEnter', 'Escape'];
const STORE = 'jow:keys';
const DEFAULTS = () => Object.fromEntries(ACTIONS.map((a) => [a.id, [...a.keys]]));

// 'KeyA' -> 'A', 'ArrowLeft' -> '←', 'NumpadAdd' -> 'Num +' ...
const NAMES = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Minus: '−', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'", Backquote: '`', ShiftLeft: 'L Shift', ShiftRight: 'R Shift',
  ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl', AltLeft: 'L Alt', AltRight: 'R Alt', CapsLock: 'Caps', Backspace: 'Bksp',
  NumpadAdd: 'Num +', NumpadSubtract: 'Num −', NumpadMultiply: 'Num *', NumpadDivide: 'Num /', NumpadDecimal: 'Num .', NumpadEnter: 'Num Enter' };
export function keyName(code) {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.binds = DEFAULTS();
    try { const s = JSON.parse(localStorage.getItem(STORE) || 'null'); if (s) for (const a of ACTIONS) if (Array.isArray(s[a.id])) this.binds[a.id] = [s[a.id][0] ?? null, s[a.id][1] ?? null]; } catch (e) { /* storage blocked / bad JSON */ }
    this.capture = null;            // controls menu: fn(code) receives the next key instead of the game
    addEventListener('keydown', (e) => {
      if (this.capture) { e.preventDefault(); if (!e.repeat) this.capture(e.code); return; }
      if (this.boundCodes().has(e.code) || ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
  }

  // ---- bindings ----
  boundCodes() { return new Set(Object.values(this.binds).flat().filter(Boolean)); }
  keysOf(id) { return (this.binds[id] || []).filter(Boolean); }
  label(id) { const k = this.keysOf(id); return k.length ? k.map(keyName).join(' / ') : 'unbound'; }
  // put code in slot (0/1) of action id; the same key is removed from any other action. Returns the label of the action it was taken from, or null.
  bind(id, slot, code) {
    let stolen = null;
    if (code) for (const a of ACTIONS) { const k = this.binds[a.id]; for (let i = 0; i < 2; i++) if (k[i] === code && !(a.id === id && i === slot)) { k[i] = null; stolen = a.label; } }
    this.binds[id][slot] = code;
    this.save(); return stolen;
  }
  resetBinds() { this.binds = DEFAULTS(); this.save(); }
  // merged into what is stored, so actions that only another mission defines (e.g. the Growler's jammer keys) keep their bindings
  save() { try { const prev = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; localStorage.setItem(STORE, JSON.stringify({ ...prev, ...this.binds })); } catch (e) { /* ignore */ } }

  // gamepad (first connected pad): left stick / dpad = turn + throttle, A / RT / LT = flares, B = bay doors, RB = release, LB = next target, Start = pause, X = restart, Y = mute
  poll() {
    const pad = (navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null);
    this.padTurn = 0; this.padThr = 0; this.padOn = !!pad; if (!pad) return;
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85), b = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
    this.padTurn = dz(pad.axes[0] || 0) + (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
    this.padThr = -dz(pad.axes[1] || 0) + (b(12) ? 1 : 0) - (b(13) ? 1 : 0);
    // pad buttons feed virtual codes 'pad:<action>' (always active, not rebindable) plus Enter / Escape for menus
    const map = { 'pad:flare': b(0) || b(7) || b(6), Enter: b(0), Escape: b(9), 'pad:restart': b(2), 'pad:mute': b(3), 'pad:bay': b(1), 'pad:release': b(5), 'pad:nextTgt': b(4) };
    this._pad = this._pad || {};
    for (const [code, on] of Object.entries(map)) {
      if (on && !this._pad[code]) this.pressed.add(code);
      if (on) this.down.add(code); else if (this._pad[code]) this.down.delete(code);
      this._pad[code] = on;
    }
  }

  // raw key codes (menus, tests)
  held(...codes) { return codes.some((c) => this.down.has(c)); }
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }
  // named actions (rebindable)
  on(...ids) { return ids.some((id) => this.keysOf(id).some((c) => this.down.has(c)) || this.down.has('pad:' + id)); }
  tap(...ids) { return ids.some((id) => this.keysOf(id).some((c) => this.pressed.has(c)) || this.pressed.has('pad:' + id)); }
  endFrame() { this.pressed.clear(); }
  get turn() { return Math.max(-1, Math.min(1, (this.on('right') ? 1 : 0) - (this.on('left') ? 1 : 0) + (this.padTurn || 0))); }
  get throttle() { return Math.max(-1, Math.min(1, (this.on('thrUp') ? 1 : 0) - (this.on('thrDown') ? 1 : 0) + (this.padThr || 0))); }
}
