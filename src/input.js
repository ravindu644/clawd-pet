// Pointer, keyboard and device-motion input.
import { Vector2 } from 'three';
import { unlockAudio } from './audio.js';
import { boop, floorPointAt, noteActivity, partAt, pet, shake, tapFloor, wake } from './behavior.js';
import { state } from './state.js';
import { setMotionStatus } from './ui.js';
import { canvas, controls } from './world.js';

const TAP_TRAVEL = 8;
const ndc = new Vector2();

function toNdc(event, out) {
  const rect = canvas.getBoundingClientRect();
  return out.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
}

function onPointerDown(event) {
  unlockAudio();
  state.pointerType = event.pointerType;
  const hit = partAt(toNdc(event, ndc));
  if (!hit) {
    state.floorPress = { id: event.pointerId, x: event.clientX, y: event.clientY, t: performance.now(), moved: 0 };
    return;
  }
  controls.enabled = false;
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {}
  const woke = wake();
  state.grab = {
    id: event.pointerId,
    lastX: event.clientX,
    lastY: event.clientY,
    lastT: performance.now(),
    t: performance.now(),
    moved: 0,
    hit,
    woke,
    lastSign: 0,
    reversals: [],
  };
  canvas.style.cursor = 'grabbing';
  noteActivity();
}

function onPointerMove(event) {
  toNdc(event, state.pointer);
  state.lastPointerMove = state.time;
  state.pointerType = event.pointerType;
  const press = state.floorPress;
  if (press && event.pointerId === press.id) {
    press.moved = Math.max(press.moved, Math.hypot(event.clientX - press.x, event.clientY - press.y));
  }
  const grab = state.grab;
  if (!grab) {
    if (event.pointerType === 'mouse' && event.target === canvas) {
      canvas.style.cursor = partAt(toNdc(event, ndc)) ? 'grab' : '';
    }
    return;
  }
  if (event.pointerId !== grab.id) return;

  const dx = event.clientX - grab.lastX;
  const dy = event.clientY - grab.lastY;
  const distance = Math.hypot(dx, dy);
  const now = performance.now();
  const speed = (distance / Math.max(1, now - grab.lastT)) * 1000;
  grab.lastX = event.clientX;
  grab.lastY = event.clientY;
  grab.lastT = now;
  grab.moved += distance;

  // Wiggling fast from side to side counts as shaking him.
  if (Math.abs(dx) > 9) {
    const sign = Math.sign(dx);
    if (grab.lastSign && sign !== grab.lastSign) grab.reversals.push(now);
    grab.lastSign = sign;
    grab.reversals = grab.reversals.filter((t) => now - t < 750);
    if (grab.reversals.length >= 5) {
      grab.reversals = [];
      shake();
    }
  }
  if (grab.moved < TAP_TRAVEL) return;
  const hit = partAt(toNdc(event, ndc));
  if (hit) pet(hit, distance, speed);
}

function onPointerEnd(event) {
  const press = state.floorPress;
  if (press && event.pointerId === press.id) {
    state.floorPress = null;
    if (press.moved < TAP_TRAVEL && performance.now() - press.t < 350 && event.type === 'pointerup') {
      tapFloor(floorPointAt(toNdc(event, ndc)));
    }
  }
  const grab = state.grab;
  if (!grab || event.pointerId !== grab.id) return;
  if (grab.moved < TAP_TRAVEL && performance.now() - grab.t < 450 && !grab.woke) boop(grab.hit);
  state.grab = null;
  controls.enabled = true;
  canvas.style.cursor = '';
}

function onDeviceMotion(event) {
  const accel = event.accelerationIncludingGravity;
  if (!accel || accel.x == null) return;
  if (!state.motionSeen) {
    state.motionSeen = true;
    setMotionStatus();
  }
  if (state.lastAccel) {
    const change = Math.abs(accel.x - state.lastAccel.x) + Math.abs(accel.y - state.lastAccel.y) + Math.abs(accel.z - state.lastAccel.z);
    if (change > 15) state.shakeEnergy += change;
  }
  state.lastAccel = { x: accel.x, y: accel.y, z: accel.z };
  state.tiltX = accel.x;
}

export function initInput() {
  // Capture phase, so OrbitControls is switched off before it sees a press on Clawd.
  canvas.addEventListener('pointerdown', onPointerDown, { capture: true });
  addEventListener('pointermove', onPointerMove);
  addEventListener('pointerup', onPointerEnd);
  addEventListener('pointercancel', onPointerEnd);
  addEventListener('keydown', (event) => {
    if (event.key === 's' || event.key === 'S') {
      unlockAudio();
      shake();
    }
  });
  addEventListener('devicemotion', onDeviceMotion);
}
