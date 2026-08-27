// The moonlit night rig for Naga Loka: cool directional moonlight, a very dark
// ambient, the warm flickering torch lights that line the path, ground mist and
// the shadow setup.
//
// The engine's boot() installs its own warm "sunset" rig (a #ffb673 key at 2.2
// plus hemisphere/ambient/fill). That fights the reference art completely, so
// setupLighting() strips it out and installs this one in its place.
import * as THREE from 'three';

// Passed to boot(); its rig is replaced immediately afterwards by setupLighting.
export const LIGHTING = {
  palette: ['#c8d8ff', '#0a0a2e', '#ff6600', '#1a0a2e', '#0a0a1a'],
  mood: 'night'
};

// Night sky: near-black indigo overhead, warmer purple down at the horizon.
export const SKY_TOP_COLOR = 0x0a0a1a;
export const SKY_HORIZON_COLOR = 0x1a0a2e;
export const BACKGROUND_COLOR = '#0a0a1a';

// Soft ground mist. Dense enough to swallow the path a few segments out, which
// is why the distant peak and the sky dome opt out of fog.
export const FOG_COLOR = 0x0a0a2e;
export const FOG_DENSITY = 0.018;

const MOON_COLOR = 0xc8d8ff;
const MOON_INTENSITY = 1.55;
const AMBIENT_COLOR = 0x0a0a2e;
const AMBIENT_INTENSITY = 0.55;

const TORCH_COLOR = 0xff6600;
const TORCH_INTENSITY = 2;
const TORCH_DISTANCE = 8;

const torches = [];
let elapsed = 0;
let moonLight = null;

// Installs the night rig, replacing whatever the engine set up.
export function setupLighting(scene, renderer) {
  // Strip the engine's sunset lights
  const engineLights = [];
  scene.traverse(o => { if (o.isLight) engineLights.push(o); });
  engineLights.forEach(l => { if (l.parent) l.parent.remove(l); });

  // The engine's environment map is a bright IBL; dim it right down so metals
  // still catch a highlight without lifting the whole scene out of the dark.
  if ('environmentIntensity' in scene) scene.environmentIntensity = 0.2;

  scene.background = new THREE.Color(SKY_TOP_COLOR);
  scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);

  // Directional moonlight from the top-left, casting the scene's shadows
  moonLight = new THREE.DirectionalLight(MOON_COLOR, MOON_INTENSITY);
  moonLight.position.set(-24, 30, 12);
  moonLight.target.position.set(0, 0, -14);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(1024, 1024);
  moonLight.shadow.bias = -0.0012;
  moonLight.shadow.normalBias = 0.02;

  // Tight to the causeway and the few metres of it the camera can see: a
  // wider volume wastes shadow resolution and drags every tree into the
  // shadow pass for no visible gain.
  const shadowCam = moonLight.shadow.camera;
  shadowCam.left = -16;
  shadowCam.right = 16;
  shadowCam.top = 20;
  shadowCam.bottom = -16;
  shadowCam.near = 1;
  shadowCam.far = 78;
  shadowCam.updateProjectionMatrix();

  scene.add(moonLight);
  scene.add(moonLight.target);

  // Ambient: barely there, just enough that unlit faces are not pure black
  const ambient = new THREE.AmbientLight(AMBIENT_COLOR, AMBIENT_INTENSITY);
  scene.add(ambient);

  // Cool sky over warm ground bounce. Without this the moonlit stone loses all
  // its colour on the shadow side and the path reads brown instead of sand.
  const sky = new THREE.HemisphereLight(0x8fa8d8, 0x3a2c1f, 0.75);
  sky.position.set(0, 20, 0);
  scene.add(sky);

  if (renderer && renderer.shadowMap) renderer.shadowMap.enabled = true;

  return { moonLight, ambient };
}

// A soft radial falloff texture, for glows that must not read as a flat disc.
// Returns null where there is no 2D canvas (headless); callers then skip the
// glow rather than drawing a hard circle.
export function makeRadialGlowTexture(inner, mid, outer) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0.0, inner);
    g.addColorStop(0.35, mid);
    g.addColorStop(1.0, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(canvas);
  } catch (e) {
    return null;
  }
}

// Lights for the sacred fire pits.
//
// These deliberately live on the scene rather than on the pits themselves.
// three.js bakes the number of point lights into every shader's cache key, so a
// light that appears and disappears with a pooled obstacle forces a full
// recompile of every material each time one spawns - which is a hard multi
// hundred millisecond freeze mid-run. Keeping the count fixed and moving the
// lights onto whichever pits are live keeps exactly one set of programs alive
// for the whole session.
const fireLights = [];

export function createFireLights(scene, count) {
  for (let i = 0; i < count; i++) {
    const light = new THREE.PointLight(0xff5500, 0, 9);
    light.userData.flickerPhase = Math.random() * Math.PI * 2;
    fireLights.push(light);
    scene.add(light);
  }
  return fireLights;
}

// Parks each fire light on a live pit, and dims the spares to zero. Intensity 0
// still counts as a light to the shader, so the program set never changes.
const firePitWorld = new THREE.Vector3();
export function syncFireLights(obstacles) {
  let used = 0;
  for (let i = 0; i < obstacles.length && used < fireLights.length; i++) {
    const obs = obstacles[i];
    if (!obs.visible || obs.userData.obstacleType !== 'firePit') continue;
    obs.getWorldPosition(firePitWorld);
    const light = fireLights[used++];
    light.position.set(firePitWorld.x, firePitWorld.y + 0.95, firePitWorld.z);
    const phase = light.userData.flickerPhase || 0;
    light.intensity = (Math.sin(elapsed * 8 + phase) * 0.4 + 1.6) * 1.5;
  }
  for (let i = used; i < fireLights.length; i++) fireLights[i].intensity = 0;
}

// A warm point light for one path-side torch. Registered here so updateLighting
// can flicker every torch in the scene.
export function createTorchLight() {
  const light = new THREE.PointLight(TORCH_COLOR, TORCH_INTENSITY, TORCH_DISTANCE);
  // Each torch gets its own phase so the line of them does not pulse in unison
  light.userData.flickerPhase = Math.random() * Math.PI * 2;
  torches.push(light);
  return light;
}

// Flickers every torch: Math.sin(time * 8) * 0.4 + 1.6, offset per torch.
export function updateLighting(dt) {
  elapsed += dt;
  for (let i = 0; i < torches.length; i++) {
    const light = torches[i];
    const phase = light.userData.flickerPhase || 0;
    light.intensity = Math.sin(elapsed * 8 + phase) * 0.4 + 1.6;

    // The flame mesh, if one was parented to the light, breathes with it
    const flame = light.userData.flame;
    if (flame) {
      const s = 1 + Math.sin(elapsed * 8 + phase) * 0.09;
      flame.scale.set(s, 1 + Math.sin(elapsed * 11 + phase) * 0.14, s);
    }
  }
}

// Marks a subtree as casting and/or receiving shadows.
export function enableShadows(root, { cast = false, receive = false } = {}) {
  if (!root) return;
  root.traverse(o => {
    if (!o.isMesh) return;
    if (cast) o.castShadow = true;
    if (receive) o.receiveShadow = true;
  });
}

export function getMoonLight() {
  return moonLight;
}
