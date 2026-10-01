// Shared model loading. Used by both the viewer and the game.
// To add a model: drop files in assets/<category>/<name>/ and add an entry to MODELS.
import * as THREE from 'three';
import { OBJLoader } from '../../vendor/three/OBJLoader.js';
import { MTLLoader } from '../../vendor/three/MTLLoader.js';
import { GLTFLoader } from '../../vendor/three/GLTFLoader.js';

const ASSETS = new URL('../../assets/', import.meta.url).href;

export const MODELS = {
  'f-117-nighthawk': {
    label: 'F-117 Nighthawk',
    dir: 'aircraft/f-117-nighthawk/',
    type: 'obj',
    file: 'model/nighthawk.obj',
    mtl: 'model/nighthawk.mtl',   // only used for material names; textures are assigned below
    scale: 0.01,                  // source is in centimeters
    // material name -> PBR texture set (UDIM tile ids; UVs of tile 1002 are in u 1..2)
    pbr: {
      prefix: 'textures/DefaultMaterial_',
      lowPrefix: 'textures/1k/DefaultMaterial_', // 1024px copies, used when lowRes is requested (game)
      materials: { UDIM1SG: '1001', UDIM2SG: '1002' },
    },
  },
  'mim-104-patriot': {
    label: 'MIM-104 Patriot launcher',
    dir: 'ground/mim-104-patriot/',
    type: 'obj',
    file: 'model/mim-104.obj',     // source has no .mtl; materials are created from names
    scale: 0.45,                   // source units are arbitrary; tuned by eye (about 10 m long)
    // material name -> diffuse texture
    diffuse: {
      '01___Default': 'textures/MIM-104_D.png',
      '02___Default': 'textures/MIM-104_TRACTOR_D.png',
    },
  },
  't-72m1mod-finland': {
    label: 'T-72M1 (Finnish)',
    dir: 'ground/t-72m1mod-finland/',
    type: 'glb',
    file: 'model/t-72m1mod.glb',   // converted from source/t-72m1mod_finn.zip (FBX, mm) to meters; 9.9 m long with gun, nose toward +X
    scale: 1,
  },
  't-90': {
    label: 'T-90',
    dir: 'ground/t-90/',
    type: 'glb',
    file: 'model/t-90.glb',        // converted from source/t90.fbx, scaled to 9.63 m with gun, decimated 912k -> 29k verts; nose toward +X
    scale: 1,
  },
  'p-18-radar': {
    label: 'P-18 "Spoon Rest D" radar',
    dir: 'ground/p-18-radar/',
    type: 'glb',
    file: 'model/p-18.glb',        // converted from source/ (FBX + PBR maps, maps downscaled to 1024), decimated 71k -> 8k verts; cab toward +X
    scale: 1,
  },
  'bunker-calarreona': {
    label: 'Machine-gun bunker (Calarreona, photogrammetry)',
    dir: 'ground/bunker-calarreona/',
    type: 'glb',
    file: 'model/bunker-calarreona.glb',   // 3D scan: texture baked to vertex colours, decimated 455k -> 18k verts, Z-up -> Y-up
    scale: 1,
    ground: 1.45,                  // m above the bottom of the model where the surrounding ground is (the scan includes the interior below it)
  },
  'pac-3-mse': {
    label: 'PAC-3 MSE missile',
    dir: 'weapons/pac-3-mse/',
    type: 'glb',
    file: 'model/pac-3-mse.glb',   // already in meters (5.2 m long), nose toward +X
    scale: 1,
  },
  'gbu-27': {
    label: 'GBU-27 Paveway III',
    dir: 'weapons/gbu-27/',
    type: 'obj',
    file: 'model/us_2000lb_gbu_27.obj',
    mtl: 'model/us_2000lb_gbu_27.mtl',   // only used for material names
    scale: 1,                            // already in meters (4.2 m long)
    diffuse: { '6adac757-ed70-43d4-bc2e-91bd69af70dc': 'model/textures/us_2000lb_gbu_27_c.jpg' },
  },
  'ea-18g-growler': {
    label: 'EA-18G Growler',
    dir: 'aircraft/ea-18g-growler/',
    type: 'glb',
    file: 'model/ea-18g-growler.glb',   // built from source/ (.blend): airframe with pods + glass + cockpit; 18.3 m, nose toward +X
    scale: 1,
  },
  'fa-18e-super-hornet': {
    label: 'F/A-18E Super Hornet',
    dir: 'aircraft/fa-18e-super-hornet/',
    type: 'glb',
    file: 'model/fa-18e-super-hornet.glb',   // same source as the Growler, strike (bomb) configuration; nose toward +X
    scale: 1,
  },
  'agm-88-harm': {
    label: 'AGM-88 HARM / AARGM',
    dir: 'weapons/agm-88-harm/',
    type: 'glb',
    file: 'model/agm-88.glb',      // 1:10 3MF print model scaled to 4.17 m, nose toward +X
    scale: 1,
  },
};

const PBR_MAPS = {
  map:          ['Base_Color',    true ],
  normalMap:    ['Normal_OpenGL', false],
  roughnessMap: ['Roughness',     false],
  metalnessMap: ['Metallic',      false],
  aoMap:        ['Mixed_AO',      false],
};

export async function loadModel(id, { onProgress, renderer, lowRes = false } = {}) {
  const cfg = MODELS[id];
  if (!cfg) throw new Error(`Unknown model: ${id}`);
  const base = ASSETS + cfg.dir;
  const say = (m) => onProgress && onProgress(m);
  const aniso = renderer ? renderer.capabilities.getMaxAnisotropy() : 8;
  const texLoader = new THREE.TextureLoader();
  const texCache = {};
  const loadTex = (url, srgb) => (texCache[url] ??= texLoader.loadAsync(url).then((t) => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    return t;
  }));

  say('Loading model…');
  let root;
  if (cfg.type === 'glb') {
    root = (await new GLTFLoader().loadAsync(base + cfg.file)).scene;
  } else {
    const loader = new OBJLoader();
    if (cfg.mtl) {
      const mtl = await new MTLLoader().loadAsync(base + cfg.mtl);
      mtl.preload();
      loader.setMaterials(mtl);
    }
    root = await loader.loadAsync(base + cfg.file);

    // Collect materials by name (OBJ meshes can hold a material array).
    const names = new Set();
    const each = (o, fn) => (Array.isArray(o.material) ? o.material.forEach(fn) : fn(o.material));
    root.traverse((o) => { if (o.isMesh) each(o, (m) => names.add(m.name)); });

    const built = {};
    let done = 0;
    for (const name of names) {
      const mat = new THREE.MeshStandardMaterial({ name, side: THREE.DoubleSide });
      const tile = cfg.pbr?.materials[name];
      if (tile) {
        const kinds = Object.entries(PBR_MAPS);
        await Promise.all(kinds.map(async ([slot, [kind, srgb]]) => {
          mat[slot] = await loadTex(`${base}${(lowRes && cfg.pbr.lowPrefix) || cfg.pbr.prefix}${kind}_${tile}.png`, srgb);
          say(`Loading textures… ${++done}/${names.size * kinds.length}`);
        }));
        mat.metalness = 1; mat.roughness = 1; // maps drive the values
      } else if (cfg.diffuse?.[name]) {
        mat.map = await loadTex(base + cfg.diffuse[name], true);
        mat.metalness = 0.2; mat.roughness = 0.7;
      }
      built[name] = mat;
    }
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.material = Array.isArray(o.material) ? o.material.map((m) => built[m.name]) : built[o.material.name];
    });
  }

  root.scale.setScalar(cfg.scale);
  // Center on the bounding box so orbiting pivots around the model.
  const box = new THREE.Box3().setFromObject(root);
  root.position.sub(box.getCenter(new THREE.Vector3()));
  const holder = new THREE.Group();
  holder.add(root);
  const mats = new Set();
  root.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m)); });
  holder.userData.size = box.getSize(new THREE.Vector3());
  holder.userData.ground = (cfg.ground || 0) * cfg.scale;   // ground contact height above the model's bottom (default: the bottom)
  holder.userData.materials = [...mats];
  return holder;
}
