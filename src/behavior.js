// What Clawd decides to do: moods, walking, quests, the cookie and the butterfly.
import { BoxGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, PlaneGeometry, Plane, Vector3 } from 'three';
import { sfx, unlockAudio } from './audio.js';
import {
  arms, BODY_DEPTH, BODY_HEIGHT, body, bodyMesh, hitMeshes, inkMaterial, LEG_LENGTH, root, tripPivot, worldPoint, yawGroup,
} from './clawd.js';
import { perchFor } from './outfits.js';
import {
  bangTexture, dustCrumb, fadeSprite, heartTexture, noteTexture, pollenTexture, spawnCrumb, spawnHearts, spawnRipple,
  spawnSprite, starTexture, zzzTexture,
} from './particles.js';
import { takePhoto } from './photo.js';
import {
  clamp, damp, dampAngle, easeOutCubic, friendshipLevel, loaded, pick, rand, save, state, wrapAngle,
} from './state.js';
import { dismissHint, persist, say } from './ui.js';
import { camera, canvasTexture, disposeObject, FLOOR_Y, raycaster, RUG_RADIUS, scene, standard } from './world.js';

const WALK_LIMIT = 2.2;
const QUESTS = ['trip', 'sneeze', 'stargaze', 'yawn'];

export function setMode(mode) {
  if (state.mode === 'dizzy' && mode !== 'dizzy') clearDizzyStars();
  root.rotation.y = 0;
  state.mode = mode;
  state.modeTime = 0;
}

function joltHat(force) {
  state.hatJolt.vx += rand(-force, force);
  state.hatJolt.vz += rand(-force, force);
}

export function hop(velocity) {
  if (state.hopHeight <= 0.001 && state.hopVel <= 0) {
    state.hopVel = velocity;
    state.squashVel += 2.2;
    joltHat(velocity * 0.5);
    return true;
  }
  return false;
}

export function noteActivity() {
  state.lastActivity = state.time;
  dismissHint();
}

export function addBond(amount) {
  const before = friendshipLevel();
  save.bond += amount;
  if (friendshipLevel() > before) {
    setTimeout(() => {
      say(`friendship lvl ${friendshipLevel()}! 🧡`, 2.6);
      spawnHearts(8, worldPoint(0, BODY_HEIGHT + 0.3, 0));
      hop(6);
      sfx.yay();
      persist();
    }, 500);
  }
}

export function wake() {
  if (state.mode !== 'sleep') return false;
  setMode('idle');
  state.hopVel = 0;
  hop(6.5);
  state.wince = 0.5;
  say('!!');
  sfx.squeak();
  spawnSprite(bangTexture, worldPoint(0.5, BODY_HEIGHT + 0.5, 0.3), { vel: new Vector3(0, 1.2, 0), life: 0.7, size: 0.45, sway: 0 });
  return true;
}

function fallAsleep() {
  setMode('sleep');
  state.walkTarget = null;
  say(state.isNight ? "g'night… 🌙" : 'zzz…', 2);
}

// He stays inside this circle, which is what keeps him out of the plants on the rim.
function clampToWalkArea(position) {
  const distance = Math.hypot(position.x, position.z);
  if (distance > WALK_LIMIT) {
    position.x *= WALK_LIMIT / distance;
    position.z *= WALK_LIMIT / distance;
  }
  return position;
}

export function walkTo(x, z, speed = 1.4, stop = 0.05) {
  (state.walkTarget || (state.walkTarget = new Vector3())).copy(clampToWalkArea({ x, y: 0, z }));
  state.walkSpeed = speed;
  state.walkStop = stop;
}

function cancelQuest() {
  if (QUESTS.includes(state.mode)) {
    tripPivot.rotation.x = Math.min(tripPivot.rotation.x, 0.6);
    setMode('idle');
    state.walkTarget = null;
  }
}

// Butterfly

function butterflyTexture(color) {
  return canvasTexture((g) => {
    g.fillStyle = color;
    g.strokeStyle = '#2B2118';
    g.lineWidth = 5;
    g.beginPath();
    g.ellipse(70, 44, 46, 34, -0.35, 0, 7);
    g.fill();
    g.stroke();
    g.beginPath();
    g.ellipse(60, 92, 32, 24, 0.4, 0, 7);
    g.fill();
    g.stroke();
    g.fillStyle = '#fff';
    [[86, 36, 7], [64, 54, 5], [64, 94, 5]].forEach(([x, y, r]) => {
      g.beginPath();
      g.arc(x, y, r, 0, 7);
      g.fill();
    });
  });
}

function spawnButterfly() {
  const group = new Group();
  const texture = butterflyTexture(pick(['#F2A65A', '#7FB8E6', '#E88FB2', '#F2C14E', '#A98BE0']));
  group.add(new Mesh(new BoxGeometry(0.05, 0.05, 0.24), inkMaterial));
  const wings = [-1, 1].map((side) => {
    const hinge = new Group();
    const wing = new Mesh(
      new PlaneGeometry(0.36, 0.36),
      new MeshStandardMaterial({ map: texture, transparent: true, alphaTest: 0.4, side: DoubleSide, roughness: 0.7 }),
    );
    wing.rotation.x = -Math.PI / 2;
    wing.position.x = side * 0.18;
    wing.scale.x = side;
    hinge.add(wing);
    group.add(hinge);
    return { hinge, side };
  });
  const home = root.position;
  group.position.set(home.x + pick([-1, 1]) * rand(4, 6), 3.2, home.z - rand(4, 6));
  scene.add(group);
  state.butterfly = {
    group, texture, wings, mode: 'fly', t: 0, target: new Vector3(), retarget: 0, vel: new Vector3(),
    landAt: rand(7, 10), noticed: false, chaseRetarget: 0, landedT: 0,
  };
}

export function dismissButterfly() {
  const fly = state.butterfly;
  if (!fly || fly.mode === 'leave') return;
  scene.attach(fly.group);
  fly.mode = 'leave';
  fly.t = 0;
  fly.away = fly.group.position.clone().add(new Vector3(rand(-6, 6), 6, rand(-9, -5)));
  if (state.mode === 'chase') {
    setMode('idle');
    say('bye bye! 👋');
    arms[1].waveT = 1.6;
  }
}

const toTarget = new Vector3();

function updateButterfly(dt) {
  const fly = state.butterfly;
  if (!fly) return;
  fly.t += dt;
  const flap = fly.mode === 'landed' ? 0.3 + Math.sin(state.time * 3.5) * 0.3 : 0.3 + Math.sin(state.time * 24) * 0.9;
  fly.wings.forEach((wing) => (wing.hinge.rotation.z = wing.side * flap));

  if (fly.mode === 'fly') {
    fly.retarget -= dt;
    if (fly.retarget <= 0) {
      fly.retarget = rand(0.8, 1.5);
      const home = root.position;
      fly.target.set(home.x + rand(-1.8, 1.8), rand(1.3, 2.6), home.z + rand(-0.8, 1.8));
    }
    if (fly.t > fly.landAt) fly.mode = 'landing';
  }
  if (fly.mode === 'landing') fly.target.copy(body.localToWorld(perchFor(save.hat)));
  if (fly.mode === 'leave') {
    fly.target.copy(fly.away);
    if (fly.t > 4.5) {
      scene.remove(fly.group);
      disposeObject(fly.group, [inkMaterial]);
      fly.texture.dispose();
      state.butterfly = null;
      return;
    }
  }
  if (fly.mode === 'landed') {
    fly.group.position.copy(perchFor(save.hat));
    fly.landedT += dt;
    if (fly.landedT > 4.5) dismissButterfly();
    return;
  }

  const position = fly.group.position;
  const offset = toTarget.subVectors(fly.target, position);
  const distance = offset.length();
  if (fly.mode === 'landing' && distance < 0.07) {
    fly.mode = 'landed';
    body.attach(fly.group);
    fly.group.rotation.set(0, rand(-0.6, 0.6), 0);
    fly.landedT = 0;
    say('🥹', 2.4);
    sfx.chime();
    addBond(2);
    state.happiness = Math.min(100, state.happiness + 10);
    return;
  }
  const speed = fly.mode === 'landing' ? Math.min(1.6, distance * 3 + 0.15) : fly.mode === 'leave' ? 2.4 : 1.7;
  fly.vel.lerp(offset.normalize().multiplyScalar(speed), 1 - Math.exp(-(fly.mode === 'landing' ? 7 : 4) * dt));
  position.addScaledVector(fly.vel, dt);
  if (fly.mode === 'fly') position.y += Math.sin(state.time * 6) * 0.008;
  fly.group.rotation.set(0, Math.atan2(fly.vel.x, fly.vel.z), 0);
}

// Shaking

function clearDizzyStars() {
  state.dizzyStars.forEach(fadeSprite);
  state.dizzyStars = [];
}

export function shake() {
  if (state.shakeCooldown > 0 || state.mode === 'eat') return;
  state.shakeCooldown = 1.6;
  noteActivity();
  const wasAsleep = state.mode === 'sleep';
  if (state.butterfly) dismissButterfly();
  cancelQuest();
  state.walkTarget = null;
  setMode('dizzy');
  state.squashVel += 4;
  state.hopVel = 0;
  hop(5);
  joltHat(14);
  clearDizzyStars();
  for (let i = 0; i < 3; i++) {
    state.dizzyStars.push(spawnSprite(starTexture, worldPoint(0, BODY_HEIGHT + 0.4, 0), { vel: new Vector3(), life: 99, size: 0.26, grow: 0, sway: 0 }));
  }
  state.shakeTimes = state.shakeTimes.filter((t) => state.time - t < 12);
  state.shakeTimes.push(state.time);
  if (state.shakeTimes.length >= 3) {
    state.happiness = Math.max(0, state.happiness - 6);
    say('stop shaking me 😤', 1.8);
  } else {
    say(wasAsleep ? 'WHA— 😵‍💫' : pick(['woahhh 😵‍💫', 'the room is spinning', 'whee— oh no']), 1.8);
  }
  sfx.dizzy();
}

// Quests

export function startQuest(quest) {
  const home = root.position;
  if (quest === 'butterfly') {
    spawnButterfly();
    setMode('chase');
  } else if (quest === 'trip') {
    let x = -home.x;
    let z = -home.z;
    let distance = Math.hypot(x, z);
    if (distance < 0.8) {
      const angle = rand(0, 6.28);
      x = Math.cos(angle);
      z = Math.sin(angle);
      distance = 1;
    }
    walkTo((x / distance) * 2, (z / distance) * 2, 1.9);
    setMode('trip');
    state.tripFell = false;
    say('la la la ♪');
    sfx.hum();
  } else if (quest === 'sneeze') {
    setMode('sneeze');
    state.sneezeStep = 0;
    for (let i = 0; i < 7; i++) {
      spawnSprite(pollenTexture, worldPoint(rand(-1.2, 1.2), rand(0.6, 1.6), BODY_DEPTH / 2 + rand(0.3, 1)), {
        vel: new Vector3(rand(-0.1, 0.1), rand(-0.15, 0.1), rand(-0.25, -0.1)),
        life: rand(1.4, 2),
        size: 0.09,
        grow: 0,
        sway: 0.3,
      });
    }
  } else if (quest === 'stargaze') {
    setMode('stargaze');
    say('✨ so many stars…', 2.4);
  } else if (quest === 'yawn') {
    setMode('yawn');
    state.squashVel += 3;
    say('*yaaawn*', 1.6);
  }
}

// Touch

const FLOOR_PLANE = new Plane(new Vector3(0, 1, 0), -FLOOR_Y);

export function floorPointAt(ndc) {
  raycaster.setFromCamera(ndc, camera);
  const point = new Vector3();
  return raycaster.ray.intersectPlane(FLOOR_PLANE, point) ? point : null;
}

export function partAt(ndc) {
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(hitMeshes, false)[0];
  if (!hit) return null;
  let part = hit.object.userData.part;
  if (part === 'body' && bodyMesh.worldToLocal(hit.point.clone()).y > BODY_HEIGHT * 0.12) part = 'head';
  return { part, point: hit.point, object: hit.object };
}

export function pet(hit, distance, speed) {
  noteActivity();
  if (state.mode === 'spin') return;
  const amount = Math.min(distance, 45) / 420;
  const ticklish = hit.part === 'arm' || hit.part === 'leg' || hit.part === 'eye' || speed > 2600;
  if (state.sulking) {
    state.purr = Math.min(1, state.purr + amount * 0.6);
    if (state.time - state.saidAt > 2.2) say(pick(['…', 'hmph', '…keep going', "i'm still mad"]));
  } else if (ticklish) {
    state.tickle = Math.min(1, state.tickle + amount * 2.6);
    if (state.tickle > 0.45 && state.time - state.saidAt > 1.4) {
      say(pick(['hehehe', 'that tickles!', 'ahaha', 'stoppp hehe']));
      sfx.giggle();
    }
  } else {
    state.purr = Math.min(1, state.purr + amount * 1.7);
    if (state.purr > 0.55 && state.time - state.saidAt > 2.2) say(pick(['mrrrp~', '♥', 'more pls', 'so nice…', '✨', 'purrr']));
  }
  state.happiness = Math.min(100, state.happiness + amount * 11);
  state.petTravel += distance;
  if (state.petTravel > (ticklish ? 140 : 85)) {
    state.petTravel = 0;
    save.pets++;
    addBond(1);
    persist();
    spawnSprite(ticklish && !state.sulking ? starTexture : heartTexture, hit.point.clone().add(new Vector3(0, 0.15, 0.15)), { size: ticklish ? 0.28 : 0.34 });
    sfx.heart();
  }
}

export function boop(hit) {
  noteActivity();
  if (state.mode === 'spin' || state.mode === 'dizzy') return;
  if (state.butterfly && state.butterfly.mode === 'landed') dismissButterfly();
  cancelQuest();
  state.boopTimes = state.boopTimes.filter((t) => state.time - t < 2.5);
  state.boopTimes.push(state.time);
  save.boops++;
  persist();
  if (state.sulking) {
    state.squashVel -= 3;
    sfx.grump();
    say(pick(['hmph!', "don't.", '…', 'not talking to you']));
    state.peek = 0;
    return;
  }
  if (state.boopTimes.length >= 6) {
    state.boopTimes = [];
    state.walkTarget = null;
    setMode('spin');
    hop(7);
    say('hey!!');
    sfx.grump();
    state.happiness = Math.max(0, state.happiness - 8);
    return;
  }
  const point = hit.point.clone();
  switch (hit.part) {
    case 'head':
      state.squashVel -= 2.6;
      state.purr = Math.min(1, state.purr + 0.25);
      state.happiness = Math.min(100, state.happiness + 3);
      state.joy = 0.6;
      addBond(0.5);
      spawnSprite(heartTexture, point.add(new Vector3(0, 0.2, 0)), { size: 0.34 });
      sfx.pat();
      say(pick(['pat pat', 'hehe', '♥', 'oh hi']));
      break;
    case 'body':
      state.squashVel -= 5;
      spawnSprite(starTexture, point, { vel: new Vector3(rand(-0.3, 0.3), 1, 0.6), life: 0.6, size: 0.32, grow: 0.8, sway: 0 });
      sfx.boop();
      say(pick(['boop!', 'bwop', 'beep!', '!?', 'boop']));
      break;
    case 'eye':
      state.wince = 0.8;
      state.squashVel -= 3;
      sfx.squeak();
      say(pick(['>_<', 'my eye!', 'ow ow']));
      break;
    case 'arm':
      arms.find((arm) => arm.side === hit.object.userData.side).waveT = 1.4;
      sfx.hi();
      say(pick(['hi!', 'hello!', '👋', 'yo']));
      break;
    case 'leg':
      hop(6.5);
      sfx.hop();
      say(pick(['wheee', 'hop!', 'boing']));
      break;
  }
}

export function tapFloor(point) {
  if (!point || Math.hypot(point.x, point.z) > RUG_RADIUS) return;
  noteActivity();
  clampToWalkArea(point);
  spawnRipple(point);
  if (state.mode === 'sleep') {
    say('zzz… 5 more minutes');
    return;
  }
  if (state.sulking) {
    say(pick(['no.', 'hmph.', '…']));
    state.peek = 0;
    return;
  }
  if (state.mode === 'idle' || state.mode === 'chase' || QUESTS.includes(state.mode)) {
    cancelQuest();
    walkTo(point.x, point.z, 1.7);
    if (Math.random() < 0.6) {
      say(pick(state.photoMode ? ['here?', 'for the photo!', '📸 coming!'] : ['coming!', 'on my way!', '👀', 'wait for me!']));
    }
  }
}

// Buttons

export function giveTreat() {
  unlockAudio();
  noteActivity();
  if (state.cookie || state.mode === 'spin') return;
  wake();
  cancelQuest();
  state.walkTarget = null;
  if (state.sulking) state.sulking = false;
  const group = new Group();
  const dough = new Mesh(new CylinderGeometry(0.3, 0.3, 0.1, 22), standard(0xcb8c4c, { roughness: 0.85 }));
  dough.castShadow = true;
  group.add(dough);
  const chocolate = standard(0x4a2c1a);
  for (let i = 0; i < 7; i++) {
    const angle = rand(0, Math.PI * 2);
    const radius = rand(0, 0.22);
    const chip = new Mesh(new BoxGeometry(0.07, 0.05, 0.07), chocolate);
    chip.position.set(Math.cos(angle) * radius, 0.055, Math.sin(angle) * radius);
    chip.rotation.y = rand(0, 3);
    group.add(chip);
  }
  const forward = new Vector3(Math.sin(yawGroup.rotation.y), 0, Math.cos(yawGroup.rotation.y));
  group.position.copy(root.position).addScaledVector(forward, 1.75).setY(4.5);
  scene.add(group);
  state.cookie = { group, vy: 0, landed: false, spin: rand(4, 7) };
  if (state.mode === 'dance' || state.mode === 'chase' || state.mode === 'dizzy') {
    clearDizzyStars();
    setMode('idle');
  }
  say(pick(['ooh?', 'a cookie!!', '!!!']));
  sfx.drop();
}

export function startDance() {
  unlockAudio();
  noteActivity();
  wake();
  if (['spin', 'eat', 'dizzy'].includes(state.mode)) return;
  cancelQuest();
  if (state.butterfly) dismissButterfly();
  state.walkTarget = null;
  state.sulking = false;
  setMode('dance');
  state.danceBeat = -1;
  say('♪ ♪ ♪');
}

export function enterPhotoMode() {
  unlockAudio();
  wake();
  cancelQuest();
  state.walkTarget = null;
  state.photoMode = true;
  say('📸 ready!');
}

export function greet() {
  const away = loaded.lastSeen ? (Date.now() - loaded.lastSeen) / 1000 : -1;
  if (away < 0) {
    state.happiness = 60;
    say("hi! i'm Clawd 👋", 2.4);
  } else if (away < 600) {
    state.happiness = clamp(loaded.happy, 20, 100);
    say(pick(['oh hi again!', 'hi! 👋']), 1.8);
  } else if (away < 12 * 3600) {
    state.happiness = Math.max(60, loaded.happy * 0.8);
    say('you came back! 🥹', 2.4);
    hop(6);
    spawnHearts(3, worldPoint(0, BODY_HEIGHT + 0.2, 0.2));
  } else if (friendshipLevel() >= 3) {
    state.happiness = 75;
    say('I MISSED YOU!! 🧡', 2.6);
    hop(7.5);
    spawnHearts(7, worldPoint(0, BODY_HEIGHT + 0.2, 0.2));
    sfx.yay();
  } else {
    state.happiness = 12;
    state.sulking = true;
    say('…you left me 😤', 2.6);
  }
}

// Per-frame decisions

function updateFeelings(dt) {
  state.isNight = state.night > 0.6;
  if (state.photoMode) state.lastActivity = state.time;
  state.purr = Math.max(0, state.purr - dt * 0.65);
  state.tickle = Math.max(0, state.tickle - dt * 1.1);
  state.wince = Math.max(0, state.wince - dt);
  state.joy = Math.max(0, state.joy - dt);
  state.blush = Math.max(0, state.blush - dt);
  state.shakeCooldown = Math.max(0, state.shakeCooldown - dt);
  state.peek = Math.max(0, state.peek - dt);
  if (!state.grab && !state.photoMode) {
    state.happiness = Math.max(0, state.happiness - dt * (state.mode === 'sleep' ? 0.05 : 0.25));
  }
  if (!state.sulking && state.happiness < 18 && state.mode === 'idle' && !state.photoMode) {
    state.sulking = true;
    say(pick(['hmph.', '…', '😤 fine. ignore me.']), 1.8);
  }
  if (state.sulking && (state.happiness > 32 || state.photoMode)) {
    state.sulking = false;
    if (!state.photoMode) {
      say('…ok fine 🥺', 1.8);
      state.joy = 1.2;
      hop(4);
    }
  }
}

function updateHop(dt) {
  state.hopVel -= 24 * dt;
  state.hopHeight += state.hopVel * dt;
  if (state.hopHeight <= 0) {
    if (state.hopVel < -3) {
      state.squashVel += state.hopVel * 0.32;
      joltHat(-state.hopVel * 0.4);
    }
    state.hopHeight = 0;
    state.hopVel = 0;
  }
  if (state.jumpPhotoArmed && state.hopVel <= 0 && state.hopHeight > 0.4) {
    state.jumpPhotoArmed = false;
    takePhoto();
  }
  state.shakeEnergy = Math.max(0, state.shakeEnergy - dt * 160);
  if (state.shakeEnergy > 130) {
    state.shakeEnergy = 0;
    shake();
  }
}

function updateFidgets(dt) {
  state.nextFidget -= dt;
  state.footTap = Math.max(0, state.footTap - dt);
  if (state.mode !== 'idle' || state.nextFidget > 0 || state.grab || state.cookie || state.photoMode || state.walkTarget) return;
  state.nextFidget = rand(4, 8);
  if (state.sulking) {
    state.peek = 1.4;
    if (Math.random() < 0.5) say(pick(['…', '*peeks*', 'hmph']));
    return;
  }
  switch (pick(['look', 'look', 'hop', 'wave', 'tap', 'wiggle', 'stroll'])) {
    case 'look': {
      const towardCamera = Math.atan2(camera.position.x - root.position.x, camera.position.z - root.position.z);
      state.idleYaw = towardCamera + rand(-0.9, 0.9);
      state.idleGaze.set(rand(-0.07, 0.07), rand(-0.04, 0.06));
      break;
    }
    case 'hop':
      hop(4.5);
      sfx.hop();
      break;
    case 'wave':
      pick(arms).waveT = 1.2;
      if (Math.random() < 0.5) say(pick(['👋', 'hi!', '…pet me?']));
      break;
    case 'tap':
      state.footTap = 1.4;
      break;
    case 'wiggle':
      state.tickle = Math.max(state.tickle, 0.45);
      break;
    case 'stroll': {
      const angle = rand(0, 6.28);
      const distance = rand(0.5, 1.8);
      walkTo(Math.cos(angle) * distance, Math.sin(angle) * distance, 1);
      break;
    }
  }
}

function updateQuests(dt) {
  if (state.mode !== 'idle' || state.sulking || state.photoMode || state.cookie || state.grab || state.walkTarget || state.butterfly) return;
  state.nextQuest -= dt;
  if (state.nextQuest <= 0) {
    state.nextQuest = rand(25, 45);
    startQuest(pick(state.isNight ? ['stargaze', 'yawn', 'yawn', 'trip'] : ['butterfly', 'butterfly', 'trip', 'sneeze']));
  }
}

function updateFollow(dt, clingy) {
  state.followCooldown -= dt;
  const pointerActive = state.pointerType === 'mouse' && state.time - state.lastPointerMove < 1.2;
  if (!clingy || state.mode !== 'idle' || !pointerActive || state.grab || state.floorPress || state.photoMode || state.followCooldown > 0) return;
  state.followCooldown = 0.5;
  const point = floorPointAt(state.pointer);
  if (point && Math.hypot(point.x, point.z) < RUG_RADIUS && Math.hypot(point.x - root.position.x, point.z - root.position.z) > 1.7) {
    walkTo(point.x, point.z, 1.2, 1.4);
  }
}

function updateWalk(dt) {
  const position = root.position;
  const canWalk = (state.mode === 'idle' || state.mode === 'chase' || (state.mode === 'trip' && !state.tripFell)) && !state.grab;
  state.walking = false;
  if (state.walkTarget && state.mode === 'sleep') state.walkTarget = null;
  if (state.walkTarget && canWalk) {
    const dx = state.walkTarget.x - position.x;
    const dz = state.walkTarget.z - position.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= state.walkStop) {
      state.walkTarget = null;
    } else {
      state.walkYaw = Math.atan2(dx, dz);
      const turn = Math.abs(wrapAngle(state.walkYaw - yawGroup.rotation.y));
      if (turn < 1) {
        const step = Math.min(distance - state.walkStop + 0.001, state.walkSpeed * dt * (1 - turn * 0.5));
        position.x += (dx / distance) * step;
        position.z += (dz / distance) * step;
        state.walking = true;
        state.stride += dt * state.walkSpeed * 7.5;
      }
    }
  }
  if (state.walking && Math.floor(state.stride / Math.PI) !== state.lastStep) {
    state.lastStep = Math.floor(state.stride / Math.PI);
    sfx.step();
  }
  return canWalk;
}

const lookPoint = new Vector3();
const viewDir = new Vector3();
const viewRight = new Vector3();
const headPoint = new Vector3();
const viewPlane = new Plane();
const scratch = new Vector3();

function updateFacing(dt, canWalk) {
  const position = root.position;
  const { butterfly, cookie } = state;
  headPoint.set(position.x, LEG_LENGTH + 1, position.z);
  camera.getWorldDirection(viewDir);
  viewRight.crossVectors(viewDir, camera.up).normalize();
  const towardCamera = Math.atan2(camera.position.x - position.x, camera.position.z - position.z);
  let yaw = state.idleYaw;
  let looking = false;

  if (butterfly && butterfly.mode !== 'landed' && butterfly.mode !== 'leave') {
    lookPoint.copy(butterfly.group.position);
    looking = true;
    // Directly overhead the direction is meaningless, and tiny movements would flip him round.
    const overhead = Math.hypot(lookPoint.x - position.x, lookPoint.z - position.z) < 0.6;
    yaw = butterfly.mode === 'landing' || overhead ? yawGroup.rotation.y : Math.atan2(lookPoint.x - position.x, lookPoint.z - position.z);
  } else if (cookie) {
    lookPoint.copy(cookie.group.position);
    looking = true;
    yaw = Math.atan2(lookPoint.x - position.x, lookPoint.z - position.z);
  } else if (state.time - state.lastPointerMove < 3 && state.mode !== 'sleep' && !state.sulking) {
    raycaster.setFromCamera(state.pointer, camera);
    viewPlane.setFromNormalAndCoplanarPoint(viewDir.clone().negate(), headPoint);
    if (raycaster.ray.intersectPlane(viewPlane, lookPoint)) {
      looking = true;
      yaw = towardCamera + clamp(scratch.subVectors(lookPoint, headPoint).dot(viewRight) * 0.3, -0.7, 0.7);
    }
  }
  if (state.photoMode) yaw = towardCamera;
  if (state.sulking) yaw = towardCamera + Math.PI * 0.88 + (state.peek > 0 ? -Math.PI * 0.55 : 0);
  if (state.walkTarget && canWalk) yaw = state.walkYaw;
  if (state.grab) yaw = yawGroup.rotation.y;
  if (state.mode === 'dance') yaw = towardCamera + Math.sin(state.modeTime * Math.PI) * 0.6;
  state.targetYaw = yaw;
  yawGroup.rotation.y = dampAngle(yawGroup.rotation.y, yaw, state.mode === 'dance' || state.walkTarget ? 6 : 2.6, dt);

  let gazeX = state.idleGaze.x;
  let gazeY = state.idleGaze.y;
  if (looking) {
    const local = body.worldToLocal(lookPoint.clone());
    gazeX = clamp(local.x * 0.045, -0.075, 0.075);
    gazeY = clamp((local.y - 1.02) * 0.05, -0.07, 0.075);
  }
  if (state.sulking) gazeY = -0.06;
  if (state.mode === 'stargaze') gazeY = 0.075;
  state.gazeX = damp(state.gazeX, gazeX, 10, dt);
  state.gazeY = damp(state.gazeY, gazeY, 10, dt);
}

function spawnZzz() {
  spawnSprite(zzzTexture, worldPoint(0.6, BODY_HEIGHT + 0.25, 0.3), { vel: new Vector3(0.3, 0.55, 0), life: 1.8, size: 0.3, grow: 0.9, sway: 0.6 });
}

const SNEEZE_STEPS = [
  [0.7, () => { say('a…', 0.6); state.squashVel += 1.6; }],
  [1.3, () => { say('a-a…', 0.6); state.squashVel += 2.2; }],
  [1.9, () => {
    say('ACHOO!', 1);
    state.squashVel -= 7;
    hop(4);
    joltHat(16);
    state.recoil.set(Math.sin(yawGroup.rotation.y), 0, Math.cos(yawGroup.rotation.y)).multiplyScalar(-0.45);
    sfx.achoo();
    for (let i = 0; i < 8; i++) {
      spawnSprite(pollenTexture, worldPoint(rand(-0.4, 0.4), 0.6, BODY_DEPTH / 2 + 0.2), {
        vel: new Vector3(rand(-1, 1), rand(-0.2, 0.6), rand(1, 2)),
        life: 0.8,
        size: 0.08,
        grow: 0,
        sway: 0,
      });
    }
  }],
  [2.9, () => say('…bless me 🤧', 1.6)],
];

function updateModeAnimation(dt, pose) {
  const { mode, modeTime, butterfly } = state;
  if (mode === 'dance') {
    const beat = Math.floor(modeTime / 0.5);
    if (beat !== state.danceBeat) {
      state.danceBeat = beat;
      hop(beat % 2 ? 3.4 : 5);
      sfx.kick();
      if (beat % 2 === 0) spawnSprite(noteTexture, worldPoint(rand(-1, 1), BODY_HEIGHT + 0.3, 0.3), { size: 0.4, life: 1.3 });
    }
    if (Math.floor(modeTime / 0.25) % 2 === 1 && Math.floor((modeTime - dt) / 0.25) % 2 === 0) sfx.hat();
    pose.sway += Math.sin(modeTime * Math.PI * 2) * 0.13;
    state.happiness = Math.min(100, state.happiness + dt * 2);
    if (modeTime > 6.5) {
      setMode('idle');
      say('that was fun!');
      sfx.yay();
      state.joy = 1.2;
      addBond(3);
      persist();
    }
  } else if (mode === 'spin') {
    const progress = Math.min(1, modeTime / 0.75);
    if (!state.calm) root.rotation.y = easeOutCubic(progress) * Math.PI * 2;
    if (modeTime > 1.1) {
      setMode('idle');
      say('hmph.');
    }
  } else if (mode === 'sleep') {
    pose.lean = 0.07;
    state.zzzTimer -= dt;
    if (state.zzzTimer <= 0) {
      state.zzzTimer = 1.3;
      spawnZzz();
    }
    state.snoreTimer -= dt;
    if (state.snoreTimer <= 0) {
      state.snoreTimer = 2.7;
      sfx.snore();
    }
  } else if (mode === 'dizzy') {
    const fade = 1 - modeTime / 2.6;
    pose.sway += Math.sin(modeTime * 9) * 0.2 * Math.max(0, fade);
    const center = worldPoint(0, BODY_HEIGHT + 0.45, 0);
    state.dizzyStars.forEach((star, i) => {
      const angle = state.time * 5 + i * 2.094;
      star.position.set(center.x + Math.cos(angle) * 0.75, center.y + Math.sin(state.time * 7 + i) * 0.05, center.z + Math.sin(angle) * 0.5);
    });
    if (modeTime > 2.6) {
      clearDizzyStars();
      setMode('idle');
      say(pick(['…where am i?', "ok i'm ok", '🥴']));
    }
  } else if (mode === 'chase') {
    if (!butterfly) {
      setMode('idle');
    } else if (butterfly.mode === 'fly' || butterfly.mode === 'landing') {
      if (!butterfly.noticed && modeTime > 0.6) {
        butterfly.noticed = true;
        say('!! a butterfly');
        spawnSprite(bangTexture, worldPoint(0.5, BODY_HEIGHT + 0.5, 0.3), { vel: new Vector3(0, 1.2, 0), life: 0.7, size: 0.45, sway: 0 });
      }
      if (butterfly.mode === 'fly' && butterfly.noticed) {
        butterfly.chaseRetarget -= dt;
        if (butterfly.chaseRetarget <= 0) {
          butterfly.chaseRetarget = 0.5;
          walkTo(butterfly.group.position.x, butterfly.group.position.z, 1.9, 1);
        }
        if (Math.random() < dt * 0.6) hop(5);
      }
      if (butterfly.mode === 'landing') state.walkTarget = null;
    } else {
      state.walkTarget = null;
    }
    if (modeTime > 25) dismissButterfly();
  } else if (mode === 'trip') {
    if (!state.tripFell && (modeTime > 1.1 || !state.walkTarget)) {
      state.tripFell = true;
      state.tripFellAt = modeTime;
      state.walkTarget = null;
    }
    if (state.tripFell) {
      const since = modeTime - state.tripFellAt;
      pose.trip = since < 1.5 ? 1.22 : 0;
      if (since >= 0.2 && since - dt < 0.2) {
        state.squashVel -= 4;
        sfx.thud();
        say('oof', 1);
        for (let i = 0; i < 6; i++) spawnCrumb(worldPoint(rand(-1, 1), 0.1, BODY_DEPTH / 2 + 0.4), dustCrumb, 0.6);
        spawnSprite(starTexture, worldPoint(0, 0.3, BODY_DEPTH / 2 + 0.5), { size: 0.3, life: 0.7 });
      }
      if (since >= 2 && since - dt < 2) {
        say('…nobody saw that 😳', 2);
        state.blush = 2.2;
      }
      if (since > 2.6) setMode('idle');
    }
  } else if (mode === 'sneeze') {
    if (state.sneezeStep < SNEEZE_STEPS.length && modeTime >= SNEEZE_STEPS[state.sneezeStep][0]) {
      SNEEZE_STEPS[state.sneezeStep][1]();
      state.sneezeStep++;
    }
    if (modeTime < 1.9) pose.lean = -0.06 * (modeTime / 1.9);
    if (modeTime > 3.4) setMode('idle');
  } else if (mode === 'stargaze') {
    pose.lean = -0.18;
    if (Math.random() < dt * 1.5) {
      spawnSprite(starTexture, worldPoint(rand(-2, 2), BODY_HEIGHT + rand(1.5, 2.5), rand(-1, 1)), { vel: new Vector3(0, 0.1, 0), life: 1, size: 0.18, grow: 0.2, sway: 0 });
    }
    if (modeTime > 4.6) {
      setMode('idle');
      if (Math.random() < 0.5) say('pretty…');
    }
  } else if (mode === 'yawn' && modeTime > 2.2) {
    setMode('idle');
  }
}

function updateRecoil(dt) {
  const step = scratch.copy(state.recoil).multiplyScalar(1 - Math.exp(-12 * dt));
  state.recoil.sub(step);
  clampToWalkArea(root.position.add(step));
}

function updateCookie(dt) {
  const cookie = state.cookie;
  if (!cookie) return;
  const group = cookie.group;
  if (!cookie.landed) {
    cookie.vy -= 18 * dt;
    group.position.y += cookie.vy * dt;
    group.rotation.x += cookie.spin * dt;
    if (group.position.y <= FLOOR_Y + 0.05) {
      group.position.y = FLOOR_Y + 0.05;
      if (cookie.vy < -3) {
        cookie.vy *= -0.35;
        sfx.tick();
        group.rotation.x *= 0.3;
      } else {
        cookie.landed = true;
        group.rotation.set(0, group.rotation.y, 0);
        cookie.start = group.position.clone();
        setMode('eat');
        hop(4);
      }
    }
  } else if (state.mode === 'eat') {
    const { modeTime } = state;
    const mouth = worldPoint(0, 0.55, BODY_DEPTH / 2 + 0.2);
    if (modeTime < 0.45) {
      const progress = easeOutCubic(modeTime / 0.45);
      group.position.lerpVectors(cookie.start, mouth, progress);
      group.rotation.x = -progress * 1.2;
      group.scale.setScalar(1 - progress * 0.15);
    } else {
      group.position.copy(mouth);
    }
    for (const bite of [0.6, 0.9, 1.2]) {
      if (modeTime >= bite && modeTime - dt < bite) {
        state.squashVel -= 3.2;
        sfx.munch();
        group.scale.multiplyScalar(0.62);
        for (let i = 0; i < 4; i++) spawnCrumb(mouth);
        if (bite === 0.6) say('nom nom', 1.2);
      }
    }
    if (modeTime > 1.5) {
      scene.remove(group);
      disposeObject(group);
      state.cookie = null;
      setMode('idle');
      state.happiness = Math.min(100, state.happiness + 25);
      state.joy = 1.6;
      spawnHearts(5, worldPoint(0, BODY_HEIGHT + 0.2, 0.2));
      sfx.yay();
      save.treats++;
      addBond(5);
      persist();
      if (Math.random() < 0.5) setTimeout(() => say(pick(['delicious!', 'more??', '10/10'])), 700);
    }
  } else {
    cookie.start = group.position.clone();
    setMode('eat');
  }
}

function updatePhotoPose(dt, pose) {
  if (!state.photoMode) return;
  if (state.pose === 'wave') arms[1].waveT = Math.max(arms[1].waveT, 0.2);
  if (state.pose === 'love') {
    state.loveTimer -= dt;
    if (state.loveTimer <= 0) {
      state.loveTimer = 0.8;
      spawnSprite(heartTexture, worldPoint(rand(-1, 1), BODY_HEIGHT + 0.2, 0.3), { size: 0.3 });
    }
  }
  if (state.pose === 'sleepy') {
    pose.lean = 0.08;
    state.zzzTimer -= dt;
    if (state.zzzTimer <= 0) {
      state.zzzTimer = 1.3;
      spawnZzz();
    }
  }
  if (state.pose === 'dizzy') pose.sway += Math.sin(state.time * 6) * 0.08;
}

// Runs one frame of decisions and returns the pose targets for clawd.js.
export function updateBehavior(dt) {
  updateFeelings(dt);
  const clingy = (state.clingy = state.happiness > 80 && !state.sulking);
  if (state.mode === 'idle' && !state.photoMode && !state.cookie && !state.walkTarget && !state.grab && state.time - state.lastActivity > (state.isNight ? 14 : 30)) {
    fallAsleep();
  }
  updateHop(dt);
  updateFidgets(dt);
  updateQuests(dt);
  updateFollow(dt, clingy);
  updateRecoil(dt);
  const canWalk = updateWalk(dt);
  updateFacing(dt, canWalk);
  const pose = { sway: 0, trip: 0, lean: 0 };
  updateModeAnimation(dt, pose);
  updateCookie(dt);
  updateButterfly(dt);
  updatePhotoPose(dt, pose);
  return pose;
}
