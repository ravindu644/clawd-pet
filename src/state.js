// Shared mutable game state, the save file, and small maths helpers.
// This module imports no game code, so anything can depend on it.
import { MathUtils, Vector2, Vector3 } from 'three';

const SAVE_KEY = 'clawd-pet-v1';

export const { clamp, damp, randFloat: rand, smoothstep } = MathUtils;
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const wrapAngle = (angle) => {
  angle = (angle + Math.PI) % (Math.PI * 2);
  if (angle < 0) angle += Math.PI * 2;
  return angle - Math.PI;
};
export const dampAngle = (from, to, rate, dt) => from + wrapAngle(to - from) * (1 - Math.exp(-rate * dt));

export const state = {
  time: 0,
  mode: 'idle',
  modeTime: 0,

  // Feelings
  happiness: 55,
  purr: 0,
  tickle: 0,
  wince: 0,
  joy: 0,
  blush: 0,
  sulking: false,
  clingy: false,
  peek: 0,

  // Body physics
  squash: 0,
  squashVel: 0,
  hopHeight: 0,
  hopVel: 0,
  sway: 0,
  hatJolt: { x: 0, z: 0, vx: 0, vz: 0 },

  // Idle life
  lastActivity: 0,
  nextFidget: 3,
  nextQuest: rand(18, 28),
  footTap: 0,
  idleYaw: 0,
  idleGaze: new Vector2(),
  nextBlink: 2.5,
  blinkLeft: 0,
  zzzTimer: 0,
  snoreTimer: 0,
  danceBeat: -1,
  petTravel: 0,
  loveTimer: 0,
  boopTimes: [],
  gazeX: 0,
  gazeY: 0,

  // Things in the world
  cookie: null,
  butterfly: null,

  // Time of day
  isNight: false,
  night: 0,
  day: 1,
  autoTime: true,
  manualHour: 12,

  // Pointer
  pointer: new Vector2(),
  pointerType: 'mouse',
  lastPointerMove: -9,
  grab: null,
  floorPress: null,

  // Walking
  walkTarget: null,
  walkSpeed: 1.4,
  walkStop: 0.05,
  walking: false,
  stride: 0,
  walkYaw: 0,
  walkBob: 0,
  targetYaw: 0,
  lastStep: 0,
  followCooldown: 0,

  // Quests
  tripFell: false,
  tripFellAt: 0,
  sneezeStep: 0,
  recoil: new Vector3(),

  // Shaking
  dizzyStars: [],
  shakeCooldown: 0,
  shakeEnergy: 0,
  shakeTimes: [],
  tiltX: 0,
  motionSeen: false,
  lastAccel: null,

  // Speech bubble
  saidAt: -9,
  bubbleLeft: 0,
  bubbleAge: 0,

  // Photo mode
  photoMode: false,
  pose: 'none',
  frame: 'polaroid',
  jumpPhotoArmed: false,
  photoUrl: '',
};

export const save = {
  boops: 0,
  pets: 0,
  treats: 0,
  photos: 0,
  sound: true,
  bond: 0,
  hat: 'none',
  face: 'none',
  happy: 55,
  lastSeen: 0,
};

try {
  Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'));
} catch {}

// What the save said when the page opened, before anything overwrites it.
export const loaded = { lastSeen: save.lastSeen, happy: save.happy };

export const friendshipLevel = () => 1 + Math.floor(Math.sqrt(save.bond / 8));

export function writeSave() {
  save.lastSeen = Date.now();
  save.happy = Math.round(state.happiness);
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {}
}

export function currentHour() {
  if (!state.autoTime) return state.manualHour;
  const now = new Date();
  return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
}
