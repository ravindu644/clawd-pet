// Boot and the frame loop.
import { updatePurr } from './audio.js';
import { greet, setMode, shake, startQuest, updateBehavior, walkTo } from './behavior.js';
import { body, root, updatePose, yawGroup } from './clawd.js';
import { initInput } from './input.js';
import { drawGlyph, GLYPH_FONT, updateParticles, zzzTexture } from './particles.js';
import { initPhoto } from './photo.js';
import { currentHour, damp, save, state } from './state.js';
import { initUI, persist, syncTimeControls, updateHud, updateViewShift } from './ui.js';
import { camera, centerSkyOnCamera, clock, controls, renderer, scene, sunLight, updateDayCycle, updateFireflies } from './world.js';

initUI();
initPhoto();
initInput();

function setHour(hour) {
  state.autoTime = false;
  state.manualHour = hour;
  syncTimeControls();
}

// Test hooks. esbuild removes this block from the shipped build.
if (DEV) window.__clawd = { setHour, body, camera, controls, drawGlyph, GLYPH_FONT, renderer, root, save, scene, setMode, shake, startQuest, state, sunLight, walkTo, yawGroup, zzzTexture };

document.addEventListener('visibilitychange', () => {
  if (document.hidden) persist();
});

// The camera trails Clawd, keeping its offset from the orbit target.
function followClawd(dt) {
  const x = damp(controls.target.x, root.position.x * 0.8, 2, dt);
  const z = damp(controls.target.z, root.position.z * 0.8, 2, dt);
  camera.position.x += x - controls.target.x;
  camera.position.z += z - controls.target.z;
  controls.target.x = x;
  controls.target.z = z;
}

function tick(dt) {
  state.time += dt;
  state.modeTime += dt;
  state.bubbleAge += dt;
  const hour = updateDayCycle(currentHour());
  const pose = updateBehavior(dt);
  updatePose(dt, pose);
  updateFireflies();
  updateParticles(dt);
  updatePurr();

  // Everything drawn relative to the camera comes after this, so nothing lags it by a frame.
  followClawd(dt);
  controls.update();
  camera.updateMatrixWorld();
  body.updateWorldMatrix(true, false);
  updateViewShift(dt);
  centerSkyOnCamera();
  updateHud(dt, hour);
}

document.getElementById('loading').remove();
renderer.setAnimationLoop(() => {
  tick(Math.min(clock.getDelta(), 0.05));
  renderer.render(scene, camera);
});

setTimeout(greet, 600);
