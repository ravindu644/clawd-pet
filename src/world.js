// Renderer, camera, sky, the rug and its props, and the day cycle.
import {
  AdditiveBlending, BackSide, BufferGeometry, CanvasTexture, CircleGeometry, Clock, Color,
  CylinderGeometry, DirectionalLight, DoubleSide, Float32BufferAttribute, Fog, Group, HemisphereLight, MathUtils,
  Mesh, MeshStandardMaterial, PCFSoftShadowMap, ACESFilmicToneMapping, PerspectiveCamera, PointLight, Points,
  PointsMaterial, Raycaster, RingGeometry, SRGBColorSpace, Scene, ShaderMaterial, SphereGeometry, Sprite,
  SpriteMaterial, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rand, smoothstep, state } from './state.js';

export const FLOOR_Y = 0.06;
export const RUG_RADIUS = 4.2;

export function canvasTexture(draw, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export const standard = (color, options = {}) => new MeshStandardMaterial({ color, roughness: 0.6, ...options });

export function roundedBox(width, height, depth, material, x = 0, y = 0, z = 0) {
  const mesh = new Mesh(new RoundedBoxGeometry(width, height, depth, 2, Math.min(width, height, depth) * 0.18), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Frees an object's GPU buffers. Materials shared with other objects go in `keep`.
export function disposeObject(object, keep = []) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material && !keep.includes(child.material)) child.material.dispose();
  });
}

function createRenderer() {
  try {
    return new WebGLRenderer({ antialias: true });
  } catch (error) {
    document.body.classList.add('no-webgl');
    document.getElementById('loading').textContent = "Clawd needs WebGL to draw his rug, and this browser can't run it.";
    throw error;
  }
}

export const renderer = createRenderer();
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.domElement.setAttribute('aria-label', 'Clawd, a small orange creature, on his rug');
renderer.domElement.setAttribute('role', 'img');
document.getElementById('stage').appendChild(renderer.domElement);

export const canvas = renderer.domElement;
export const scene = new Scene();
scene.fog = new Fog(0xf4efe6, 18, 40);

export const camera = new PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 140);
export const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.15, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minPolarAngle = 0.25;
controls.maxPolarAngle = Math.PI / 2 - 0.06;
controls.rotateSpeed = 0.7;

export const raycaster = new Raycaster();
export const clock = new Clock();

let framingDistance = 0;

// Picks the distance that fits him for this screen shape, keeping the viewer's angle and relative zoom.
function fitCamera() {
  const aspect = innerWidth / innerHeight;
  camera.aspect = aspect;
  camera.fov = aspect < 0.8 ? 50 : 38;
  camera.updateProjectionMatrix();
  const halfV = MathUtils.degToRad(camera.fov / 2);
  const halfH = Math.atan(Math.tan(halfV) * aspect);
  const distance = Math.max(2.5 / Math.tan(halfH), 2.9 / Math.tan(halfV));
  if (framingDistance) {
    camera.position.sub(controls.target).multiplyScalar(distance / framingDistance).add(controls.target);
  } else {
    camera.position.copy(controls.target).addScaledVector(new Vector3(0.18, 0.2, 1).normalize(), distance);
  }
  framingDistance = distance;
  controls.minDistance = distance * 0.45;
  controls.maxDistance = Math.max(distance * 1.7, 13);
  const guide = Math.min(innerWidth, innerHeight) * 0.9;
  Object.assign(document.getElementById('guide').style, { width: guide + 'px', height: guide + 'px' });
}
fitCamera();
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  fitCamera();
});

// Sky

const skyUniforms = { top: { value: new Color() }, bottom: { value: new Color() } };
const sky = new Mesh(
  new SphereGeometry(70, 32, 16),
  new ShaderMaterial({
    uniforms: skyUniforms,
    side: BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    vertexShader: `varying vec3 vW;
    void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz-cameraPosition; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vW;
    void main(){ float h=normalize(vW).y; gl_FragColor=vec4(mix(bottom,top,smoothstep(0.0,0.14,h)),1.0);
    #include <colorspace_fragment>
    }`,
  }),
);
sky.renderOrder = -10;
sky.frustumCulled = false;
scene.add(sky);

const starPositions = [];
for (let i = 0; i < 450; i++) {
  const y = rand(0.15, 1) ** 2; // Squared to crowd them low, where the default view can see them.
  const angle = rand(0, Math.PI * 2);
  const radius = 60;
  const ring = Math.sqrt(1 - y * y);
  starPositions.push(Math.cos(angle) * ring * radius, y * radius, Math.sin(angle) * ring * radius);
}
const starGeometry = new BufferGeometry();
starGeometry.setAttribute('position', new Float32BufferAttribute(starPositions, 3));
const starMaterial = new PointsMaterial({
  color: 0xffffff,
  size: 2 * Math.min(devicePixelRatio, 2),
  sizeAttenuation: false,
  transparent: true,
  opacity: 0,
  fog: false,
  depthWrite: false,
  toneMapped: false,
});
const stars = new Points(starGeometry, starMaterial);
stars.renderOrder = -9;
stars.frustumCulled = false;
scene.add(stars);

const glowTexture = canvasTexture((g) => {
  const gradient = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.22, 'rgba(255,255,255,.9)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,.22)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 128, 128);
});
const moonTexture = canvasTexture((g) => {
  const gradient = g.createRadialGradient(64, 64, 20, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(220,230,255,.5)');
  gradient.addColorStop(1, 'rgba(220,230,255,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#F3F0E4';
  g.beginPath();
  g.arc(64, 64, 24, 0, 7);
  g.fill();
  g.fillStyle = '#DAD4C2';
  [[56, 56, 5], [72, 68, 4], [60, 74, 3]].forEach(([x, y, r]) => {
    g.beginPath();
    g.arc(x, y, r, 0, 7);
    g.fill();
  });
});

const sun = new Sprite(new SpriteMaterial({ map: glowTexture, color: 0xffe4b5, fog: false, depthWrite: false, transparent: true, toneMapped: false }));
sun.scale.setScalar(12);
sun.renderOrder = -8;
scene.add(sun);
const moon = new Sprite(new SpriteMaterial({ map: moonTexture, fog: false, depthWrite: false, transparent: true, toneMapped: false }));
moon.scale.setScalar(9);
moon.renderOrder = -8;
scene.add(moon);

// Lights

const skyLight = new HemisphereLight(0xfff6ea, 0xd6c4ae, 1.15);
scene.add(skyLight);
export const sunLight = new DirectionalLight(0xffffff, 2.3);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
Object.assign(sunLight.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 30 });
sunLight.shadow.camera.updateProjectionMatrix();
sunLight.shadow.bias = -4e-4;
sunLight.shadow.normalBias = 0.02;
scene.add(sunLight);
scene.add(sunLight.target);
const backLight = new DirectionalLight(0xffcfb3, 0.9);
backLight.position.set(-5, 4, -6);
scene.add(backLight);
// With the night light behind him, this keeps his face readable. No shadows, so it adds no second one.
const nightFill = new DirectionalLight(0xffd2ad, 0);
nightFill.position.set(1, 2, 6);
scene.add(nightFill);

// Ground and rug

const ground = new Mesh(new CircleGeometry(50, 64), standard(0xc4d3a6, { roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const rug = new Mesh(new CylinderGeometry(RUG_RADIUS, RUG_RADIUS, 0.06, 80), standard(0xe5d6c0, { roughness: 0.95 }));
rug.position.y = 0.03;
rug.receiveShadow = true;
scene.add(rug);
const rugBand = new Mesh(new RingGeometry(3.72, 3.88, 80), standard(0xd9c6aa, { roughness: 1 }));
rugBand.rotation.x = -Math.PI / 2;
rugBand.position.y = 0.062;
rugBand.receiveShadow = true;
scene.add(rugBand);

// Plants and pebbles around the rim

export const leafMaterial = standard(0x93b872, { roughness: 0.8 });
export const stemMaterial = standard(0x6f9b56, { roughness: 0.8 });
const pebbleMaterial = standard(0xc9b79c, { roughness: 0.9 });

function plant(x, z, scale, yaw) {
  const group = new Group();
  group.add(
    roundedBox(0.07, 0.55, 0.07, stemMaterial, 0, 0.27, 0),
    roundedBox(0.3, 0.12, 0.14, leafMaterial, 0.15, 0.42, 0),
    roundedBox(0.26, 0.12, 0.14, leafMaterial, -0.14, 0.3, 0),
    roundedBox(0.16, 0.16, 0.16, leafMaterial, 0, 0.6, 0),
  );
  group.position.set(x, FLOOR_Y, z);
  group.scale.setScalar(scale);
  group.rotation.y = yaw;
  scene.add(group);
}
plant(-3.6, -1.2, 1.1, 0.4);
plant(3.4, -1.7, 0.9, -0.6);
plant(-2, -3.2, 0.85, 1.2);
plant(3, 2.3, 0.65, 2);
plant(-3.3, 2, 0.75, -1);

[[2, -3.2], [-3.8, 0.4], [3.85, 0.3], [0.6, -3.7]].forEach(([x, z], i) =>
  scene.add(roundedBox(0.18 + i * 0.03, 0.14, 0.2, pebbleMaterial, x, FLOOR_Y + 0.07, z)),
);

// Floor lamp

const lamp = new Group();
lamp.position.set(2.5, FLOOR_Y, -2.9);
lamp.rotation.y = -0.5;
const lampMetal = standard(0x3a2e25, { roughness: 0.5, metalness: 0.3 });
lamp.add(roundedBox(0.55, 0.08, 0.55, lampMetal, 0, 0.04, 0), roundedBox(0.07, 2.1, 0.07, lampMetal, 0, 1.1, 0));
const shadeMaterial = standard(0xf6e3c2, { roughness: 0.8, emissive: 0xffb061, emissiveIntensity: 0, side: DoubleSide });
const shade = new Mesh(new CylinderGeometry(0.28, 0.46, 0.45, 6, 1, true), shadeMaterial);
shade.position.y = 2.2;
lamp.add(shade);
const lampLight = new PointLight(0xffb566, 0, 14, 1.2);
lampLight.position.y = 1.95;
lamp.add(lampLight);
const lampGlow = new Sprite(new SpriteMaterial({ map: glowTexture, color: 0xffc27a, blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, fog: false }));
lampGlow.position.y = 2;
lampGlow.scale.setScalar(1.8);
lamp.add(lampGlow);
scene.add(lamp);

// Fireflies

const fireflyGroup = new Group();
scene.add(fireflyGroup);
const fireflies = [];
for (let i = 0; i < 14; i++) {
  // Normal blending, not additive: over a lit floor additive light clips straight to white.
  const sprite = new Sprite(new SpriteMaterial({ map: glowTexture, color: 0xe3f06a, transparent: true, depthWrite: false, opacity: 0, fog: false, toneMapped: false }));
  sprite.scale.setScalar(0.2);
  fireflyGroup.add(sprite);
  fireflies.push({ sprite, angle: rand(0, 6.28), radius: rand(2.8, 5), height: rand(0.3, 1.8), speed: rand(0.08, 0.25), phase: rand(0, 6) });
}

export function updateFireflies() {
  fireflyGroup.visible = state.night > 0.02;
  if (!fireflyGroup.visible) return;
  for (const fly of fireflies) {
    const angle = fly.angle + state.time * fly.speed;
    fly.sprite.position.set(
      Math.cos(angle) * fly.radius,
      fly.height + Math.sin(state.time * 1.3 + fly.phase) * 0.3,
      Math.sin(angle) * fly.radius * 0.9,
    );
    fly.sprite.material.opacity = state.night * (0.45 + 0.55 * Math.max(0, Math.sin(state.time * 2.5 + fly.phase)));
  }
}

// Day cycle: [hour, sky top, sky bottom]
const SKY_KEYS = [
  [0, '#0F1530', '#242B4A'],
  [4.6, '#131A38', '#2B3152'],
  [5.6, '#3B4677', '#E9A383'],
  [6.6, '#8FB1DD', '#F6D2B0'],
  [8, '#AFCBEA', '#F4E6D4'],
  [12, '#BBD6F0', '#F4EFE6'],
  [16, '#A9C6E6', '#F5E4CC'],
  [17.8, '#7D86B8', '#F4B486'],
  [18.7, '#46497E', '#E7896A'],
  [19.6, '#1F2650', '#4A3F68'],
  [21, '#111833', '#262C4B'],
  [24, '#0F1530', '#242B4A'],
];
const scratchColor = new Color();
const WHITE = new Color('#ffffff');
const SUNSET = new Color('#FFB27A');
const MOONLIGHT = new Color('#9DB2FF');
const SKY_DAY = new Color('#FFF6EA');
const SKY_NIGHT = new Color('#93A2DC');
const FLOOR_DAY = new Color('#D6C4AE');
const FLOOR_NIGHT = new Color('#545978');
// At night the main light comes from behind the lamp, so shadows fall away from its glow.
const NIGHT_LIGHT_DIR = new Vector3(2.5, 3, -2.9).normalize();
const sunDir = new Vector3();
const moonDir = new Vector3();
const lightDir = new Vector3();

export function updateDayCycle(hour) {
  hour = ((hour % 24) + 24) % 24;
  let key = 0;
  while (key < SKY_KEYS.length - 2 && SKY_KEYS[key + 1][0] <= hour) key++;
  const mix = (hour - SKY_KEYS[key][0]) / (SKY_KEYS[key + 1][0] - SKY_KEYS[key][0]);
  skyUniforms.top.value.set(SKY_KEYS[key][1]).lerp(scratchColor.set(SKY_KEYS[key + 1][1]), mix);
  skyUniforms.bottom.value.set(SKY_KEYS[key][2]).lerp(scratchColor.set(SKY_KEYS[key + 1][2]), mix);
  scene.fog.color.copy(skyUniforms.bottom.value);

  const sunHeight = Math.sin(((hour - 6) / 12) * Math.PI);
  state.day = smoothstep(sunHeight, -0.26, 0.14);
  state.night = 1 - state.day;

  const sunAngle = ((hour - 6) / 12) * Math.PI;
  const moonAngle = (((hour < 6 ? hour + 24 : hour) - 18) / 12) * Math.PI;
  sunDir.set(-Math.cos(sunAngle), Math.sin(sunAngle), 0.45).normalize();
  moonDir.set(-Math.cos(moonAngle), Math.sin(moonAngle), 0.55).normalize();
  const sunLightDir = sunDir.clone();
  sunLightDir.y = Math.max(sunLightDir.y, 0.3);
  lightDir.copy(NIGHT_LIGHT_DIR).lerp(sunLightDir, state.day).normalize();
  // The light stays put as he walks. A moving shadow camera makes every static shadow shimmer.
  sunLight.position.copy(lightDir).multiplyScalar(12);

  const lowSun = 1 - smoothstep(sunHeight, 0.05, 0.45);
  sunLight.color.copy(WHITE).lerp(SUNSET, lowSun * 0.85).lerp(MOONLIGHT, state.night);
  sunLight.intensity = 2.3 * state.day + 1 * state.night;
  skyLight.color.copy(SKY_DAY).lerp(SKY_NIGHT, state.night);
  skyLight.groundColor.copy(FLOOR_DAY).lerp(FLOOR_NIGHT, state.night);
  skyLight.intensity = 1.15 * state.day + 1.5 * state.night;
  backLight.intensity = 0.9 * state.day + 0.25 * state.night;
  nightFill.intensity = 1.1 * state.night;

  sun.material.opacity = smoothstep(sunDir.y, -0.08, 0.05);
  sun.material.color.copy(scratchColor.set('#FFF1D6').lerp(SUNSET, lowSun));
  moon.material.opacity = smoothstep(moonDir.y, -0.05, 0.1) * smoothstep(state.night, 0.2, 0.8);
  starMaterial.opacity = smoothstep(state.night, 0.4, 1) * 0.9;
  lampLight.intensity = state.night * 18;
  shadeMaterial.emissiveIntensity = state.night * 1.4;
  lampGlow.material.opacity = state.night * 0.5;
  return hour;
}

// Runs after the camera has moved for this frame, so the sky can't trail behind it.
export function centerSkyOnCamera() {
  sun.position.copy(camera.position).addScaledVector(sunDir, 55);
  moon.position.copy(camera.position).addScaledVector(moonDir, 55);
  stars.position.copy(camera.position);
}

