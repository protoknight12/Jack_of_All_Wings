import * as THREE from 'three';
import { OrbitControls } from '../../vendor/three/OrbitControls.js';
import { RoomEnvironment } from '../../vendor/three/RoomEnvironment.js';
import { MODELS, loadModel } from '../core/assets.js';

const $ = (id) => document.getElementById(id);
const status = $('status');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14181f);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(3, 5, 2);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const grid = new THREE.GridHelper(20, 40, 0x3a4453, 0x232a35);
scene.add(grid);
const axes = new THREE.AxesHelper(1);
axes.visible = false;
scene.add(axes);

let aircraft = null;
let radius = 3;

function frame() {
  camera.position.set(radius * 1.2, radius * 0.6, radius * 1.2);
  controls.target.set(0, 0, 0);
  controls.update();
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

async function show(id) {
  if (aircraft) scene.remove(aircraft);
  status.hidden = false;
  try {
    aircraft = await loadModel(id, { renderer, onProgress: (m) => (status.textContent = m) });
  } catch (e) {
    status.textContent = 'Failed to load: ' + e.message;
    console.error(e);
    return;
  }
  scene.add(aircraft);
  const s = aircraft.userData.size;
  radius = Math.max(s.x, s.y, s.z) * 1.1;
  controls.minDistance = radius * 0.2;
  controls.maxDistance = radius * 6;
  camera.near = radius / 100; camera.far = radius * 100;
  camera.updateProjectionMatrix();
  // Sit the grid just under the aircraft.
  grid.position.y = -s.y / 2 - 0.02;
  grid.scale.setScalar(Math.max(1, radius / 4));
  axes.scale.setScalar(radius / 2);
  frame();
  status.hidden = true;
  applyToggles();
}

function applyToggles() {
  if (!aircraft) return;
  for (const m of aircraft.userData.materials) {
    m.wireframe = $('wire').checked;
    if ($('plain').checked) {
      m.userData.saved ??= { color: m.color.clone(), metalness: m.metalness, roughness: m.roughness, map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap, metalnessMap: m.metalnessMap, aoMap: m.aoMap };
      m.map = m.normalMap = m.roughnessMap = m.metalnessMap = m.aoMap = null;
      m.color.set(0x8a929c); m.metalness = 0.6; m.roughness = 0.45;
    } else if (m.userData.saved) {
      const { color, ...rest } = m.userData.saved;
      Object.assign(m, rest);
      m.color.copy(color);
      delete m.userData.saved;
    }
    m.needsUpdate = true;
  }
  grid.visible = $('grid').checked;
  axes.visible = $('axes').checked;
  controls.autoRotate = $('spin').checked;
}
for (const id of ['wire', 'plain', 'grid', 'axes', 'spin']) $(id).addEventListener('change', applyToggles);
$('reset').addEventListener('click', frame);

// every entry in MODELS shows up here automatically, grouped by its assets/<category>/ folder
const sel = $('aircraft');
const GROUPS = { aircraft: 'Aircraft', ground: 'Ground vehicles & sites', weapons: 'Weapons' };
const groups = {};
for (const [id, c] of Object.entries(MODELS)) {
  const cat = c.dir.split('/')[0];
  if (!groups[cat]) { groups[cat] = document.createElement('optgroup'); groups[cat].label = GROUPS[cat] || cat[0].toUpperCase() + cat.slice(1); sel.appendChild(groups[cat]); }
  groups[cat].appendChild(new Option(c.label, id));
}
const wanted = new URLSearchParams(location.search).get('model');
if (wanted && MODELS[wanted]) sel.value = wanted;
sel.addEventListener('change', () => show(sel.value));

renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
show(sel.value);
