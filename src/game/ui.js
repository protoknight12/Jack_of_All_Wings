// Shared HUD / MFD drawing helpers. The look itself (colours, font, line weights, glow) lives in CFG.UI.
import { CFG } from './config.js';

export const U = CFG.UI;
export const font = (size) => `${U.size[size]}px ${U.font}`;

// '#rrggbb' + alpha -> 'rgba(r,g,b,a)' (translucent versions of the palette colours)
export function tint(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

// phosphor glow: every stroke, fill and text on this 2D context glows in its own colour (shadowColor follows the last
// stroke/fill colour set). U.glow = blur in px, 0 = off. Call once per context.
export function phosphor(c) {
  const P = CanvasRenderingContext2D.prototype;
  for (const k of ['strokeStyle', 'fillStyle']) {
    const d = Object.getOwnPropertyDescriptor(P, k);
    Object.defineProperty(c, k, { get() { return d.get.call(c); }, set(v) { d.set.call(c, v); c.shadowColor = typeof v === 'string' ? v : 'transparent'; }, configurable: true });
  }
}
