// Night-vision goggles: the scene is rendered to an off-screen target, then a fullscreen pass turns it into green phosphor with gain,
// grain, bloom on bright sources (flares, explosions), goggle vignette and faint scan lines. Costs nothing when switched off.
import * as THREE from 'three';

export class NVG {
  constructor(renderer) {
    this.r = renderer; this.on = false; this.gain = 6.5; this.t = 0;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: renderer.capabilities.isWebGL2 ? 4 : 0 });
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tD: { value: this.rt.texture }, uTime: { value: 0 }, uGain: { value: 6.5 }, uRes: { value: new THREE.Vector2(1, 1) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        varying vec2 vUv; uniform sampler2D tD; uniform float uTime, uGain; uniform vec2 uRes;
        float lum(vec3 c){ return dot(c, vec3(0.30, 0.59, 0.11)); }
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
        void main(){
          vec3 c = texture2D(tD, vUv).rgb; float l = lum(c) * uGain;
          vec2 px = 3.0 / uRes; float g = 0.0;                                    // cheap bloom: 8 wide taps
          g += lum(texture2D(tD, vUv + vec2(px.x, 0.0)).rgb) + lum(texture2D(tD, vUv - vec2(px.x, 0.0)).rgb);
          g += lum(texture2D(tD, vUv + vec2(0.0, px.y)).rgb) + lum(texture2D(tD, vUv - vec2(0.0, px.y)).rgb);
          g += lum(texture2D(tD, vUv + px * 2.0).rgb) + lum(texture2D(tD, vUv - px * 2.0).rgb);
          g += lum(texture2D(tD, vUv + vec2(px.x, -px.y) * 2.0).rgb) + lum(texture2D(tD, vUv + vec2(-px.x, px.y) * 2.0).rgb);
          l += max(g * 0.125 * uGain - 1.0, 0.0) * 0.6;
          l = 1.0 - exp(-l * 1.5);                                                // auto-gain style roll-off
          float n = h(vUv * uRes); l *= 0.86 + 0.28 * n; l += (h(vUv * uRes * 1.7 + 3.1) > 0.9975 ? 0.35 : 0.0);
          vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0); l *= smoothstep(1.05, 0.55, length(q));
          l *= 0.95 + 0.05 * sin(vUv.y * uRes.y * 1.3);
          vec3 col = vec3(0.16, 1.0, 0.34) * l; col = mix(col, vec3(0.75, 1.0, 0.8), smoothstep(0.85, 1.0, l) * 0.5);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat); this.quad.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.quad);
  }
  setSize(w, h) { const d = this.r.getPixelRatio(); this.rt.setSize(Math.max(2, Math.floor(w * d)), Math.max(2, Math.floor(h * d))); this.mat.uniforms.uRes.value.set(w * d, h * d); }
  render(scene, camera, dt) {
    this.t += dt; this.mat.uniforms.uTime.value = this.t % 100; this.mat.uniforms.uGain.value = this.gain;
    this.r.setRenderTarget(this.rt); this.r.clear(); this.r.render(scene, camera);
    this.r.setRenderTarget(null); this.r.render(this.scene, this.cam);
  }
}
