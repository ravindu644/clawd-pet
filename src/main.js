// Boot and the frame loop.
import { updatePurr } from './audio.js';
import { greet, shake, startQuest, updateBehavior } from './behavior.js';
import { root, updatePose } from './clawd.js';
import { initInput } from './input.js';
import { updateParticles } from './particles.js';
import { initPhoto } from './photo.js';
import { currentHour, damp, state } from './state.js';
import { initUI, persist, syncTimeControls, updateHud } from './ui.js';
import { camera, clock, controls, renderer, scene, updateDayCycle, updateFireflies } from './world.js';

document.getElementById('loading').remove();
initUI();
initPhoto();
initInput();

window.clawdDebug = {
  quest: startQuest,
  shake,
  setHour: (hour) => {
    state.autoTime = false;
    state.manualHour = hour;
    syncTimeControls();
  },
};

// Test hooks. esbuild removes this block from the shipped build.
if (DEV) window.__clawd = { camera, controls, greet, renderer, root, save, scene, shake, startQuest, state, yawGroup };

setInterval(persist, 4000);
addEventListener('pagehide', persist);
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
  const hour = updateDayCycle(currentHour(), root.position);
  const pose = updateBehavior(dt);
  updatePose(dt, pose);
  updateFireflies();
  updateParticles(dt);
  updatePurr();
  followClawd(dt);
  updateHud(dt, hour);
}

renderer.setAnimationLoop(() => {
  tick(Math.min(clock.getDelta(), 0.05));
  controls.update();
  renderer.render(scene, camera);
});

setTimeout(greet, 600);
