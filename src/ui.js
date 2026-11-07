// The HUD, speech bubble, bottom sheets and photo-mode controls.
import { ACESFilmicToneMapping, Vector3, WebGLRenderer } from 'three';
import { sfx, unlockAudio } from './audio.js';
import { dismissButterfly, enterPhotoMode, giveTreat, hop, noteActivity, startDance, wake } from './behavior.js';
import { BODY_HEIGHT, body, LEG_LENGTH, wearFace, wearHat, worldPoint } from './clawd.js';
import { buildFace, buildHat, drawOutfitThumbnail, FACE_LINES, FACES, HAT_LINES, HATS } from './outfits.js';
import { spawnHearts, spawnSprite, starTexture } from './particles.js';
import { closePhoto, photoIsOpen } from './photo.js';
import { clamp, currentHour, damp, friendshipLevel, pick, rand, save, state, writeSave } from './state.js';
import { camera, skyAccent } from './world.js';

const $ = (id) => document.getElementById(id);
const bubble = $('bubble');
const moodText = $('mood');
const moodFill = $('fill');
const scrim = $('scrim');
const autoTimeButton = $('autoTime');
const timeSlider = $('timeSlider');
const timeLabel = $('timeLabel');
const soundButton = $('soundBtn');
const bubbleAnchor = new Vector3();
const viewCenter = new Vector3();
const hud = document.querySelector('.hud');

let hintDismissed = false;
let clockText = '';
let bubbleWidth = 0;
let bubbleHeight = 0;

export function say(text, seconds = 1.4) {
  bubble.textContent = text;
  bubble.classList.add('show');
  bubbleWidth = bubble.offsetWidth;
  bubbleHeight = bubble.offsetHeight;
  state.bubbleLeft = seconds;
  state.bubbleAge = 0;
  state.saidAt = state.time;
}

function refreshStats() {
  $('statTxt').textContent = `♥ ${save.pets} · boops ${save.boops} · 🍪 ${save.treats}`;
  $('lvl').textContent = 'Lvl ' + friendshipLevel();
}

export function persist() {
  writeSave();
  refreshStats();
}

export function dismissHint() {
  if (hintDismissed) return;
  hintDismissed = true;
  setTimeout(() => $('hint').classList.add('gone'), 3000);
}

export const formatHour = (hour) => {
  hour = ((hour % 24) + 24) % 24;
  const hours = Math.floor(hour);
  const minutes = Math.floor((hour - hours) * 60);
  return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
};

let focusBeforeSheet = null;
let openedSheet = null;

function openSheet(id) {
  closeSheets();
  focusBeforeSheet = document.activeElement;
  const sheet = (openedSheet = $(id));
  sheet.classList.add('open');
  sheet.inert = false;
  scrim.classList.add('show');
  sheet.querySelector('[data-close]').focus({ preventScroll: true });
}

function closeSheets() {
  const wasOpen = scrim.classList.contains('show');
  openedSheet = null;
  document.querySelectorAll('.sheet').forEach((sheet) => {
    sheet.classList.remove('open');
    sheet.inert = true;
  });
  scrim.classList.remove('show');
  if (wasOpen && focusBeforeSheet) focusBeforeSheet.focus({ preventScroll: true });
  return wasOpen;
}

function selectChip(container, id) {
  container.querySelectorAll('.chip').forEach((chip) => chip.classList.toggle('sel', chip.dataset.id === id));
}

function makeChips(container, items, selected, onPick) {
  container.innerHTML = '';
  items.forEach(([id, label, icon]) => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (id === selected ? ' sel' : '');
    chip.dataset.id = id;
    chip.innerHTML = `<b>${icon}</b>${label}`;
    chip.addEventListener('click', () => {
      selectChip(container, id);
      onPick(id);
    });
    container.appendChild(chip);
  });
}

let thumbnailsDrawn = false;

// Swaps the wardrobe's emoji for renders of the real items, the first time it opens.
// A short-lived second renderer leaves the game's canvas untouched. If it fails, the emoji stay.
function drawWardrobeThumbnails() {
  if (thumbnailsDrawn) return;
  thumbnailsDrawn = true;
  let thumbRenderer;
  try {
    thumbRenderer = new WebGLRenderer({ alpha: true, antialias: true });
  } catch {
    return;
  }
  thumbRenderer.setSize(132, 132, false);
  thumbRenderer.toneMapping = ACESFilmicToneMapping;
  const draw = (containerId, build) => {
    $(containerId).querySelectorAll('.chip').forEach((chip) => {
      if (chip.dataset.id === 'none') return;
      const target = document.createElement('canvas');
      target.width = target.height = 132;
      drawOutfitThumbnail(thumbRenderer, build(chip.dataset.id), target);
      chip.querySelector('b').replaceChildren(target);
    });
  };
  draw('hatChips', buildHat);
  draw('faceChips', buildFace);
  thumbRenderer.dispose();
  thumbRenderer.forceContextLoss();
}

function reactToOutfit(line) {
  noteActivity();
  wake();
  hop(4.5);
  sfx.wear();
  say(line, 1.8);
  spawnSprite(starTexture, worldPoint(rand(-0.6, 0.6), BODY_HEIGHT + 0.5, 0.3), { size: 0.3, life: 0.8 });
  spawnSprite(starTexture, worldPoint(rand(-0.6, 0.6), BODY_HEIGHT + 0.4, 0.3), { size: 0.24, life: 0.8 });
}

function chooseHat(id, quiet) {
  if (state.butterfly && state.butterfly.mode === 'landed') dismissButterfly();
  save.hat = id;
  wearHat(id);
  persist();
  if (!quiet) reactToOutfit(HAT_LINES[id]);
}

function chooseFace(id, quiet) {
  save.face = id;
  wearFace(id);
  persist();
  if (!quiet) reactToOutfit(FACE_LINES[id]);
}

function syncSoundButton() {
  soundButton.textContent = save.sound ? '🔊 On' : '🔇 Off';
  soundButton.classList.toggle('on', save.sound);
}

export function syncTimeControls() {
  autoTimeButton.classList.toggle('on', state.autoTime);
  autoTimeButton.textContent = state.autoTime ? '⏱ Auto' : '⏱ Manual';
  timeSlider.value = currentHour();
  timeLabel.textContent = formatHour(currentHour());
}

export function setMotionStatus(text) {
  $('motionStatus').textContent = text || (state.motionSeen ? 'Listening. Shake your phone!' : '');
}

async function requestMotion() {
  setMotionStatus('Listening…');
  try {
    // iOS asks for permission first. Other browsers just start sending motion events.
    const ask = window.DeviceMotionEvent && DeviceMotionEvent.requestPermission;
    if (ask && (await DeviceMotionEvent.requestPermission()) !== 'granted') {
      setMotionStatus('Permission denied');
      return;
    }
  } catch {
    setMotionStatus('Motion sensors are blocked here');
    return;
  }
  setTimeout(() => setMotionStatus(state.motionSeen ? null : 'No motion sensor found on this device'), 1500);
}

const POSES = [
  ['none', 'Natural', '🙂'],
  ['smile', 'Smile', '😊'],
  ['wave', 'Wave', '👋'],
  ['love', 'Love', '😍'],
  ['sleepy', 'Sleepy', '😴'],
  ['dizzy', 'Dizzy', '😵‍💫'],
  ['jump', 'Jump!', '🦘'],
];

const FRAMES = [
  ['polaroid', 'Polaroid', '🖼️'],
  ['retro', 'Retro', '💾'],
  ['clean', 'Clean', '⬜'],
];

function setPhotoLayer(on) {
  document.body.classList.toggle('photo', on);
  $('photoUI').inert = !on;
  document.querySelector('.controls').inert = on;
}

function exitPhotoMode() {
  setPhotoLayer(false);
  state.photoMode = false;
  state.jumpPhotoArmed = false;
  state.pose = 'none';
  selectChip($('poseChips'), 'none');
}

function onEscape() {
  if (photoIsOpen()) closePhoto();
  else if (closeSheets()) return;
  else if (state.photoMode) exitPhotoMode();
}

export function initUI() {
  refreshStats();
  scrim.addEventListener('click', closeSheets);
  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', closeSheets));
  $('treatBtn').addEventListener('click', giveTreat);
  $('danceBtn').addEventListener('click', startDance);
  $('wearBtn').addEventListener('click', () => {
    unlockAudio();
    drawWardrobeThumbnails();
    openSheet('wearSheet');
  });
  $('moreBtn').addEventListener('click', () => {
    unlockAudio();
    openSheet('moreSheet');
  });

  makeChips($('hatChips'), HATS, save.hat, (id) => chooseHat(id));
  makeChips($('faceChips'), FACES, save.face, (id) => chooseFace(id));
  $('randomFit').addEventListener('click', () => {
    const hat = pick(HATS.slice(1))[0];
    const face = pick(FACES)[0];
    chooseHat(hat, true);
    chooseFace(face, true);
    selectChip($('hatChips'), hat);
    selectChip($('faceChips'), face);
    reactToOutfit(pick(['is this me?', 'i picked none of this', 'how do i look?', 'very rug-appropriate ✨']));
  });

  syncSoundButton();
  soundButton.addEventListener('click', () => {
    save.sound = !save.sound;
    syncSoundButton();
    persist();
    if (save.sound) {
      unlockAudio();
      sfx.hi();
    }
  });

  autoTimeButton.addEventListener('click', () => {
    state.autoTime = !state.autoTime;
    if (!state.autoTime) state.manualHour = parseFloat(timeSlider.value);
    syncTimeControls();
  });
  timeSlider.addEventListener('input', () => {
    state.autoTime = false;
    state.manualHour = parseFloat(timeSlider.value);
    syncTimeControls();
  });
  syncTimeControls();

  setMotionStatus();
  $('motionBtn').addEventListener('click', requestMotion);

  makeChips($('poseChips'), POSES, 'none', (id) => {
    noteActivity();
    if (id === 'jump') {
      selectChip($('poseChips'), state.pose);
      if (hop(8.5)) {
        state.jumpPhotoArmed = true;
        sfx.hop();
      }
      return;
    }
    state.pose = id;
    if (id === 'love') spawnHearts(3, worldPoint(0, BODY_HEIGHT + 0.2, 0.2));
    if (id === 'wave') sfx.hi();
  });
  makeChips($('frameChips'), FRAMES, state.frame, (id) => {
    state.frame = id;
    $('guide').classList.toggle('show', id === 'polaroid');
  });
  $('guide').classList.toggle('show', state.frame === 'polaroid');
  $('photoBtn').addEventListener('click', () => {
    closeSheets();
    setPhotoLayer(true);
    enterPhotoMode();
  });
  $('exitPhoto').addEventListener('click', exitPhotoMode);
  addEventListener('keydown', (event) => {
    if (event.key === 'Escape') onEscape();
  });
}

function currentMood() {
  const { butterfly, clingy, happiness, isNight, mode } = state;
  if (mode === 'sleep') return isNight ? 'sound asleep 🌙' : 'snoozing 💤';
  if (state.sulking) return 'sulking 😤 (pet him?)';
  if (mode === 'dance') return 'vibing 🎶';
  if (mode === 'eat' || state.cookie) return 'cookie time 🍪';
  if (mode === 'spin') return 'grumpy 😤';
  if (mode === 'dizzy') return 'dizzy 😵‍💫';
  if (mode === 'chase') return butterfly && butterfly.mode === 'landed' ? 'made a friend 🦋' : 'chasing a butterfly 🦋';
  if (mode === 'trip') return state.tripFell ? 'embarrassed 🫣' : 'on a little walk 🐾';
  if (mode === 'sneeze') return 'sniffly 🤧';
  if (mode === 'stargaze') return 'stargazing ✨';
  if (mode === 'yawn') return 'sleepy 🥱';
  if (state.tickle > 0.3) return 'giggly 🤭';
  if (state.purr > 0.3) return 'loving the pets ✨';
  if (state.walking) return 'on a stroll 🐾';
  if (clingy) return state.pointerType === 'mouse' ? 'clingy 🧡 follows you' : 'clingy 🧡';
  if (happiness > 55) return isNight ? 'cozy 🌙' : 'content ☺';
  if (happiness > 25) return isNight ? 'a bit sleepy' : 'just chillin';
  return 'kinda lonely… pet me?';
}

const hatHeight = () => (save.hat === 'wizard' ? 1.1 : save.hat === 'party' ? 0.6 : save.hat === 'none' ? 0 : 0.4);

// While a sheet is open, slide the view up so Clawd sits in the strip between the status card and
// the sheet. Otherwise, on a phone, the wardrobe covers the very outfit being tried on.
const screenY = (y) => (-body.localToWorld(viewCenter.set(0, y, 0)).project(camera).y * 0.5 + 0.5) * innerHeight;

export function updateViewShift(dt) {
  let shift = 0;
  let zoom = 1;
  if (openedSheet) {
    const top = hud.getBoundingClientRect().bottom;
    const bottom = innerHeight - openedSheet.offsetHeight;
    const feet = screenY(-LEG_LENGTH);
    const head = screenY(BODY_HEIGHT + 0.25 + hatHeight());
    // If he is taller than the gap, zoom out until he fits. His screen height scales with zoom.
    zoom = clamp((camera.zoom * (bottom - top) * 0.9) / Math.max(1, feet - head), 0.5, 1);
    shift = Math.max(0, (feet + head) / 2 + state.viewShift - (top + bottom) / 2);
  }
  state.viewShift = state.calm ? shift : damp(state.viewShift, shift, 8, dt);
  camera.zoom = state.calm ? zoom : damp(camera.zoom, zoom, 8, dt);
  if (state.viewShift > 0.5) camera.setViewOffset(innerWidth, innerHeight, 0, state.viewShift, innerWidth, innerHeight);
  else if (camera.view) camera.clearViewOffset();
  camera.updateProjectionMatrix();
}

export function updateHud(dt, hour) {
  state.bubbleLeft -= dt;
  if (state.bubbleLeft <= 0) bubble.classList.remove('show');
  bubbleAnchor.set(0, BODY_HEIGHT + 0.55 + hatHeight(), 0);
  body.localToWorld(bubbleAnchor);
  bubbleAnchor.project(camera);
  const pop = 1 + Math.max(0, 0.15 - state.bubbleAge) * 2;
  const margin = 8;
  const x = clamp((bubbleAnchor.x * 0.5 + 0.5) * innerWidth, bubbleWidth / 2 + margin, innerWidth - bubbleWidth / 2 - margin);
  let y = Math.max((-bubbleAnchor.y * 0.5 + 0.5) * innerHeight, bubbleHeight + margin);
  // Keep clear of the status card when the bubble would sit across it.
  const card = hud.getBoundingClientRect();
  if (!state.photoMode && x - bubbleWidth / 2 < card.right + margin) y = Math.max(y, card.bottom + margin + bubbleHeight);
  bubble.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%) scale(${pop})`;

  const mood = currentMood();
  if (moodText.textContent !== mood) moodText.textContent = mood;
  moodFill.style.width = state.happiness.toFixed(1) + '%';

  const icon = state.day > 0.75 ? '☀️ ' : state.night > 0.75 ? '🌙 ' : hour < 12 ? '🌅 ' : '🌇 ';
  const clock = icon + formatHour(hour);
  if (clock !== clockText) {
    clockText = clock;
    $('clock').textContent = clock;
    if (state.autoTime) {
      timeLabel.textContent = formatHour(hour);
      timeSlider.value = hour;
    }
    document.documentElement.style.setProperty('--sky', skyAccent());
  }
  document.body.classList.toggle('night', state.isNight);
}
