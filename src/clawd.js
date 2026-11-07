// Clawd's body: the rig, what he wears, and how each part moves every frame.
import { CircleGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Vector2, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildFace, buildHat } from './outfits.js';
import { heartTexture } from './particles.js';
import { clamp, damp, rand, save, state } from './state.js';
import { canvasTexture, scene, standard } from './world.js';

export const BODY_WIDTH = 2.4;
export const BODY_HEIGHT = 1.5;
export const BODY_DEPTH = 1.3;
export const LEG_LENGTH = 0.42;

const skin = standard(0xd97757, { roughness: 0.55 });
export const inkMaterial = standard(0x1c130f, { roughness: 0.35 });

// root (position) > yawGroup (facing) > tripPivot (falls on his face) > body (squash and lean)
export const root = new Group();
scene.add(root);
export const yawGroup = new Group();
root.add(yawGroup);
export const tripPivot = new Group();
tripPivot.position.z = 0.66;
yawGroup.add(tripPivot);
const tripOffset = new Group();
tripOffset.position.z = -0.66;
tripPivot.add(tripOffset);
export const body = new Group();
body.position.y = LEG_LENGTH;
tripOffset.add(body);

// Meshes that respond to pointing and touching.
export const hitMeshes = [];

export const bodyMesh = new Mesh(new RoundedBoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH, 4, 0.13), skin);
bodyMesh.position.y = BODY_HEIGHT / 2;
bodyMesh.castShadow = true;
bodyMesh.receiveShadow = true;
bodyMesh.userData.part = 'body';
body.add(bodyMesh);
hitMeshes.push(bodyMesh);

const spiralTexture = canvasTexture((g) => {
  g.strokeStyle = '#1c130f';
  g.lineWidth = 10;
  g.lineCap = 'round';
  g.beginPath();
  for (let a = 0; a < Math.PI * 6; a += 0.08) {
    const radius = 3 + a * 3;
    g.lineTo(64 + Math.cos(a) * radius, 64 + Math.sin(a) * radius);
  }
  g.stroke();
});
const eyeDecal = new PlaneGeometry(0.4, 0.4);

function makeEye(side) {
  const group = new Group();
  group.userData.base = new Vector2(side * 0.55, 1.02);
  group.position.set(side * 0.55, 1.02, BODY_DEPTH / 2 + 0.004);

  const open = new Mesh(new RoundedBoxGeometry(0.21, 0.38, 0.06, 2, 0.03), inkMaterial);
  open.userData.part = 'eye';
  open.userData.side = side;
  hitMeshes.push(open);

  const happy = new Group();
  const left = new Mesh(new RoundedBoxGeometry(0.07, 0.24, 0.05, 2, 0.02), inkMaterial);
  left.position.x = -0.065;
  left.rotation.z = -0.72;
  const right = left.clone();
  right.position.x = 0.065;
  right.rotation.z = 0.72;
  happy.add(left, right);

  const sleep = new Mesh(new RoundedBoxGeometry(0.26, 0.05, 0.05, 2, 0.02), inkMaterial);
  sleep.position.y = -0.06;

  const spiral = new Mesh(eyeDecal, new MeshBasicMaterial({ map: spiralTexture, transparent: true, alphaTest: 0.3 }));
  spiral.position.z = 0.035;

  const love = new Mesh(eyeDecal, new MeshBasicMaterial({ map: heartTexture, transparent: true, alphaTest: 0.3 }));
  love.position.z = 0.035;
  love.scale.setScalar(0.95);

  group.add(open, happy, sleep, spiral, love);
  body.add(group);
  return { group, open, happy, sleep, spiral, love, side };
}
const eyes = [makeEye(-1), makeEye(1)];

const blushMaterial = new MeshBasicMaterial({ color: 0xf08f8f, transparent: true, opacity: 0, depthWrite: false });
[-1, 1].forEach((side) => {
  const cheek = new Mesh(new CircleGeometry(0.15, 24), blushMaterial);
  cheek.scale.y = 0.6;
  cheek.position.set(side * 0.86, 0.72, BODY_DEPTH / 2 + 0.012);
  body.add(cheek);
});

export const arms = [-1, 1].map((side) => {
  const pivot = new Group();
  pivot.position.set((side * BODY_WIDTH) / 2, 0.58, 0);
  const mesh = new Mesh(new RoundedBoxGeometry(0.4, 0.32, 0.5, 3, 0.08), skin);
  mesh.position.x = side * 0.17;
  mesh.castShadow = true;
  mesh.userData.part = 'arm';
  mesh.userData.side = side;
  pivot.add(mesh);
  body.add(pivot);
  hitMeshes.push(mesh);
  return { pivot, side, waveT: 0 };
});

const legs = [-0.86, -0.5, 0.5, 0.86].map((x, index) => {
  const pivot = new Group();
  pivot.position.set(x, LEG_LENGTH + 0.02, 0);
  const mesh = new Mesh(new RoundedBoxGeometry(0.21, LEG_LENGTH + 0.06, 0.44, 2, 0.06), skin);
  mesh.position.y = -(LEG_LENGTH + 0.06) / 2;
  mesh.castShadow = true;
  mesh.userData.part = 'leg';
  pivot.add(mesh);
  tripOffset.add(pivot);
  hitMeshes.push(mesh);
  return { pivot, index };
});

const hatSocket = new Group();
hatSocket.position.y = BODY_HEIGHT;
body.add(hatSocket);
const faceSocket = new Group();
body.add(faceSocket);
let halo = null;

export function wearHat(id) {
  hatSocket.clear();
  const hat = buildHat(id);
  halo = hat.userData.halo || null;
  hatSocket.add(hat);
}

export function wearFace(id) {
  faceSocket.clear();
  buildFace(id, faceSocket);
}

wearHat(save.hat);
wearFace(save.face);

export const worldPoint = (x, y, z) => body.localToWorld(new Vector3(x, y, z));

function pickExpression() {
  const { butterfly, mode, modeTime, photoMode, pose } = state;
  if (photoMode && pose !== 'none') {
    return { smile: 'happy', wave: 'happy', love: 'love', sleepy: 'sleep', dizzy: 'dizzy' }[pose] || 'open';
  }
  if (mode === 'sleep') return 'sleep';
  if (mode === 'dizzy') return 'dizzy';
  if (mode === 'yawn' && modeTime > 0.3 && modeTime < 1.6) return 'sleep';
  if (mode === 'trip' && state.tripFell && modeTime - state.tripFellAt < 2) {
    return modeTime - state.tripFellAt < 0.2 ? 'open' : 'wince';
  }
  if (state.wince > 0 || mode === 'spin') return 'wince';
  if (butterfly && butterfly.mode === 'landed') return 'love';
  if (state.purr > 0.3 || state.tickle > 0.25 || mode === 'dance' || (mode === 'eat' && modeTime > 0.5) || state.joy > 0) return 'happy';
  return 'open';
}

function updateArms(dt, expression, sleepy) {
  const { butterfly, mode, modeTime, time, tickle, stride } = state;
  for (const arm of arms) {
    arm.waveT = Math.max(0, arm.waveT - dt);
    const s = arm.side;
    let angle = s * (-0.05 + Math.sin(time * 2 + s) * 0.05);
    if (state.walking) angle = s * (0.15 + Math.sin(stride + (s > 0 ? Math.PI : 0)) * 0.2);
    if (tickle > 0.05) angle = s * (0.3 + Math.sin(time * 32 + s) * 0.6 * tickle);
    if (arm.waveT > 0) angle = s * (1.1 + Math.sin(time * 14) * 0.45);
    if (mode === 'dance') angle = s * (0.6 + Math.sin(time * Math.PI * 4 + (s > 0 ? Math.PI : 0)) * 0.6);
    if (mode === 'chase' && butterfly && butterfly.mode === 'fly') angle = s * (0.9 + Math.sin(time * 10 + s) * 0.3);
    if (mode === 'yawn' && modeTime < 1.7) angle = s * 1.3;
    if (mode === 'trip' && state.tripFell && modeTime - state.tripFellAt < 1.5) angle = s * (1.4 + Math.sin(time * 20) * 0.2);
    if (sleepy) angle = s * -0.18;
    if (expression === 'wince') angle = s * 0.9;
    if (mode === 'dizzy') angle = s * (0.4 + Math.sin(time * 6 + s * 2) * 0.5);
    if (mode === 'eat' && modeTime < 1.4) angle = s * (0.55 + Math.sin(time * 18) * 0.15);
    arm.pivot.rotation.z = damp(arm.pivot.rotation.z, angle, 16, dt);
  }
}

function updateLegs(dt) {
  const { mode, modeTime, time, tickle, stride } = state;
  for (const leg of legs) {
    let angle = 0;
    if (mode === 'dance') angle = Math.sin(time * Math.PI * 4 + leg.index * Math.PI) * 0.35;
    else if (state.walking) angle = Math.sin(stride + (leg.index % 2 ? Math.PI : 0)) * 0.5;
    else if (mode === 'trip' && state.tripFell && modeTime - state.tripFellAt < 1.5) angle = Math.sin(time * 22 + leg.index * 1.4) * 0.5;
    else if (state.hopHeight > 0.05) angle = leg.index % 2 ? 0.3 : -0.3;
    else if (state.footTap > 0 && leg.index === 3) angle = -Math.max(0, Math.sin(time * 16)) * 0.5;
    if (tickle > 0.05) angle += Math.sin(time * 30 + leg.index * 1.7) * 0.35 * tickle;
    leg.pivot.rotation.x = damp(leg.pivot.rotation.x, angle, 18, dt);
  }
}

// `pose` holds this frame's targets from behavior.js: sideways sway, trip pitch and forward lean.
export function updatePose(dt, pose) {
  const { time } = state;
  let { sway, trip, lean } = pose;

  state.squashVel += (-170 * state.squash - 9 * state.squashVel) * dt;
  state.squash += state.squashVel * dt;
  state.squash = clamp(state.squash, -0.45, 0.5);

  const sleepy = state.mode === 'sleep' || (state.photoMode && state.pose === 'sleepy');
  const breath = sleepy ? Math.sin(time * 1.3) * 0.035 : Math.sin(time * 2.4) * 0.014;
  const giggle = state.tickle * Math.sin(time * 45) * 0.03;
  const purr = state.purr > 0.15 ? Math.sin(time * 38) * 0.012 * state.purr : 0;
  body.scale.set(
    1 - state.squash * 0.5 - breath * 0.4 + purr,
    1 + state.squash + breath + giggle,
    1 - state.squash * 0.5 - breath * 0.4,
  );

  if (state.happiness < 18 && state.mode === 'idle') lean = Math.max(lean, 0.1);
  body.rotation.x = damp(body.rotation.x, lean, 3, dt);

  sway += state.tickle * Math.sin(time * 22) * 0.05;
  if (state.walking) sway += Math.sin(state.stride) * 0.05;
  if (state.motionSeen) sway += clamp(-state.tiltX * 0.015, -0.12, 0.12);
  state.sway = damp(state.sway, sway, 20, dt);
  yawGroup.rotation.z = state.sway;

  tripPivot.rotation.x = damp(tripPivot.rotation.x, trip, trip > 0 ? 14 : 4, dt);
  root.position.y = state.hopHeight + (state.walking ? Math.abs(Math.sin(state.stride)) * 0.06 : 0);

  state.nextBlink -= dt;
  state.blinkLeft = Math.max(0, state.blinkLeft - dt);
  if (state.nextBlink <= 0) {
    state.blinkLeft = 0.13;
    state.nextBlink = Math.random() < 0.2 ? 0.25 : rand(2, 5);
  }

  const expression = pickExpression();
  for (const eye of eyes) {
    eye.open.visible = expression === 'open';
    eye.happy.visible = expression === 'happy' || expression === 'wince';
    eye.sleep.visible = expression === 'sleep';
    eye.spiral.visible = expression === 'dizzy';
    eye.love.visible = expression === 'love';
    eye.happy.rotation.z = expression === 'wince' ? (eye.side < 0 ? -Math.PI / 2 : Math.PI / 2) : 0;
    eye.spiral.rotation.z += dt * 9 * eye.side;
    eye.love.scale.setScalar(0.9 + Math.sin(time * 8) * 0.08);
    eye.open.scale.y = damp(eye.open.scale.y, state.blinkLeft > 0 ? 0.1 : 1, 30, dt);
    eye.group.position.x = eye.group.userData.base.x + state.gazeX;
    eye.group.position.y = eye.group.userData.base.y + state.gazeY;
  }

  const poseBlush = (state.photoMode && { smile: 0.45, love: 0.85, wave: 0.3 }[state.pose]) || 0;
  blushMaterial.opacity = damp(
    blushMaterial.opacity,
    clamp(
      state.purr * 1.1 +
        state.tickle * 0.9 +
        (state.happiness > 85 ? 0.35 : 0) +
        (state.mode === 'eat' ? 0.4 : 0) +
        state.joy * 0.3 +
        (state.blush > 0 ? 0.8 : 0) +
        (state.butterfly && state.butterfly.mode === 'landed' ? 0.7 : 0) +
        poseBlush,
      0,
      0.85,
    ),
    5,
    dt,
  );

  updateArms(dt, expression, sleepy);
  updateLegs(dt);

  const jolt = state.hatJolt;
  jolt.vx += (-110 * jolt.x - 6 * jolt.vx) * dt;
  jolt.vz += (-110 * jolt.z - 6 * jolt.vz) * dt;
  jolt.x += jolt.vx * dt;
  jolt.z += jolt.vz * dt;
  jolt.x = clamp(jolt.x, -0.5, 0.5);
  jolt.z = clamp(jolt.z, -0.5, 0.5);
  hatSocket.rotation.set(jolt.x, 0, jolt.z - state.sway * 0.6);
  if (halo) halo.position.y = 0.5 + Math.sin(time * 2.2) * 0.06;
}
