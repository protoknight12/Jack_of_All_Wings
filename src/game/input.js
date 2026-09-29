// Keyboard state. Held keys via `held`, one-shot presses via `pressed` (cleared each frame).
export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
  }
  // gamepad (first connected pad): left stick / dpad = turn + throttle, A / RT / LT = flares, Start = pause, X = restart
  poll() {
    const pad = (navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null);
    this.padTurn = 0; this.padThr = 0; this.padOn = !!pad; if (!pad) return;
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85), b = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
    this.padTurn = dz(pad.axes[0] || 0) + (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
    this.padThr = -dz(pad.axes[1] || 0) + (b(12) ? 1 : 0) - (b(13) ? 1 : 0);
    const map = { Space: b(0) || b(7) || b(6), Enter: b(0), Escape: b(9), KeyR: b(2), KeyM: b(3) };
    this._pad = this._pad || {};
    for (const [code, on] of Object.entries(map)) {
      if (on && !this._pad[code]) this.pressed.add(code);
      if (on) this.down.add(code); else if (this._pad[code]) this.down.delete(code);
      this._pad[code] = on;
    }
  }
  held(...codes) { return codes.some((c) => this.down.has(c)); }
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }
  endFrame() { this.pressed.clear(); }
  get turn() { return Math.max(-1, Math.min(1, (this.held('KeyD', 'ArrowRight') ? 1 : 0) - (this.held('KeyA', 'ArrowLeft') ? 1 : 0) + (this.padTurn || 0))); }
  get throttle() { return Math.max(-1, Math.min(1, (this.held('KeyW', 'ArrowUp') ? 1 : 0) - (this.held('KeyS', 'ArrowDown') ? 1 : 0) + (this.padThr || 0))); }
}
