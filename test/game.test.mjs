// Runs the game in headless Chromium with time and randomness frozen, so every run is identical.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright-core';

const DEV_BUILD = 'file://' + resolve('.test/clawd.html');
const SHIPPED_BUILD = 'file://' + resolve('dist/clawd.html');

let browser;

before(async () => {
  execSync('node build.mjs && node build.mjs --dev', { stdio: 'ignore' });
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
});
after(() => browser?.close());

function freezeTime() {
  let seed = 12345;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let now = 0;
  const start = Date.UTC(2026, 5, 15, 12, 0, 0);
  const RealDate = Date;
  window.Date = class extends RealDate {
    constructor(...args) {
      if (args.length) super(...args);
      else super(start + now);
    }
    static now() {
      return start + now;
    }
  };
  performance.now = () => now;
  let frames = [];
  window.requestAnimationFrame = (callback) => frames.push(callback);
  let timers = [];
  window.setTimeout = (callback, delay = 0) => timers.push({ callback, at: now + delay });
  window.setInterval = () => 0;
  window.__skip = (ms) => (now += ms);
  window.__step = (count = 1) => {
    for (let i = 0; i < count; i++) {
      now += 1000 / 60;
      const due = timers.filter((timer) => timer.at <= now);
      timers = timers.filter((timer) => timer.at > now);
      due.forEach((timer) => timer.callback());
      const current = frames;
      frames = [];
      current.forEach((callback) => callback(now));
    }
  };
}

async function openGame({ viewport = { width: 480, height: 360 }, save = {}, reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(freezeTime);
  await page.addInitScript(() => {
    window.__audioContexts = [];
    window.__oscillators = 0;
    const RealContext = window.AudioContext;
    window.AudioContext = class extends RealContext {
      constructor() {
        super();
        window.__audioContexts.push(this);
      }
      createOscillator() {
        window.__oscillators++;
        return super.createOscillator();
      }
    };
  });
  await page.addInitScript((data) => {
    localStorage.setItem('clawd-pet-v1', JSON.stringify({ lastSeen: Date.now() - 1000, happy: 60, ...data }));
  }, save);
  await page.goto(DEV_BUILD);
  assert.deepEqual(errors, [], 'the page threw while loading');
  await page.evaluate(() => __step(60));
  page.errors = errors;
  return page;
}

test('the shipped file loads offline, requests nothing else and throws nothing', async () => {
  const context = await browser.newContext({ viewport: { width: 480, height: 360 } });
  await context.setOffline(true);
  const page = await context.newPage();
  const requests = [];
  const errors = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(SHIPPED_BUILD);
  await page.waitForFunction(() => document.getElementById('bubble').classList.contains('show'));
  assert.deepEqual(errors, []);
  assert.deepEqual(requests.filter((url) => !url.startsWith('data:')), [SHIPPED_BUILD]);
  assert.equal(await page.evaluate(() => '__clawd' in window || 'clawdDebug' in window), false);
  await context.close();
});

const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const DEGREES = 180 / Math.PI;

async function dragAround(page, frames, onFrame = () => {}) {
  await page.mouse.move(6, 6);
  await page.mouse.down();
  for (let i = 1; i <= frames; i++) {
    await page.mouse.move(6 + i * 6, 6);
    await page.evaluate(() => __step(1));
    await onFrame();
  }
  await page.mouse.up();
}

test('orbiting all the way round never makes his facing target jump', async () => {
  const page = await openGame();
  await page.evaluate(() => (__clawd.state.nextFidget = 99));
  const targets = [];
  await dragAround(page, 70, async () => targets.push(await page.evaluate(() => __clawd.state.targetYaw)));
  const worst = Math.max(...targets.slice(1).map((yaw, i) => Math.abs(wrap(yaw - targets[i])) * DEGREES));
  assert.ok(worst < 15, `facing target jumped ${worst.toFixed(1)} degrees in one frame`);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('his height does not snap when he stops walking', async () => {
  const page = await openGame();
  const result = await page.evaluate(() => {
    const { root, state, walkTo } = __clawd;
    state.nextFidget = 99;
    walkTo(1.5, 0, 1.7, 0.05);
    let walked = false;
    let stopStep = 0;
    for (let i = 0; i < 240; i++) {
      const before = root.position.y;
      const wasWalking = state.walking;
      __step(1);
      walked ||= state.walking;
      if (wasWalking && !state.walking) stopStep = Math.abs(root.position.y - before);
    }
    return { walked, stopStep };
  });
  assert.ok(result.walked, 'he never walked');
  assert.ok(result.stopStep < 0.02, `height changed ${result.stopStep.toFixed(3)} in the frame he stopped`);
  await page.context().close();
});

test('the speech bubble uses the camera from the frame being drawn', async () => {
  const page = await openGame();
  await page.evaluate(() => {
    const { body, camera, renderer, root, state } = __clawd;
    state.nextFidget = 99;
    root.position.set(2.2, 0, 0);
    __step(150);
    const Vector = camera.position.constructor;
    const render = renderer.render.bind(renderer);
    window.__bubbleError = 0;
    renderer.render = (scene, view) => {
      render(scene, view);
      const anchor = body.localToWorld(new Vector(0, 2.05, 0)).project(view);
      const shown = /translate\(([\d.-]+)px,\s*([\d.-]+)px\)/.exec(document.getElementById('bubble').style.transform);
      const error = Math.hypot((anchor.x * 0.5 + 0.5) * innerWidth - shown[1], (-anchor.y * 0.5 + 0.5) * innerHeight - shown[2]);
      window.__bubbleError = Math.max(window.__bubbleError, error);
    };
  });
  await dragAround(page, 30);
  const error = await page.evaluate(() => window.__bubbleError);
  assert.ok(error < 0.01, `bubble was ${error.toFixed(2)}px off`);
  await page.context().close();
});

test('shaking him mid-spin does not leave him rotated', async () => {
  const page = await openGame();
  const yaw = await page.evaluate(() => {
    const { root, setMode, shake } = __clawd;
    setMode('spin');
    __step(20);
    shake();
    __step(240);
    return root.rotation.y;
  });
  assert.equal(yaw, 0);
  await page.context().close();
});

test('a sneeze pushes him back smoothly and keeps him in the walk area', async () => {
  const page = await openGame();
  const result = await page.evaluate(() => {
    const { root, startQuest, state, yawGroup } = __clawd;
    state.nextFidget = 99;
    root.position.set(0, 0, -2.1);
    yawGroup.rotation.y = 0;
    state.idleYaw = 0;
    startQuest('sneeze');
    let worstStep = 0;
    let farthest = 0;
    for (let i = 0; i < 180; i++) {
      const { x, z } = root.position;
      __step(1);
      worstStep = Math.max(worstStep, Math.hypot(root.position.x - x, root.position.z - z));
      farthest = Math.max(farthest, Math.hypot(root.position.x, root.position.z));
    }
    return { worstStep, farthest };
  });
  assert.ok(result.worstStep < 0.1, `moved ${result.worstStep.toFixed(2)} in one frame`);
  assert.ok(result.farthest <= 2.2001, `reached radius ${result.farthest.toFixed(2)}`);
  await page.context().close();
});

test('a tap near the rim shows the ripple where he will actually stop', async () => {
  const page = await openGame({ viewport: { width: 1440, height: 900 } });
  const tap = await page.evaluate(() => {
    const { camera, root, state } = __clawd;
    state.nextFidget = 99;
    const point = root.position.clone().set(3.4, 0.06, 0.6).project(camera);
    return { x: (point.x * 0.5 + 0.5) * innerWidth, y: (-point.y * 0.5 + 0.5) * innerHeight };
  });
  await page.mouse.move(tap.x, tap.y);
  await page.mouse.down();
  await page.mouse.up();
  const result = await page.evaluate(() => {
    const { root, scene } = __clawd;
    const ripple = scene.children.find((child) => child.geometry?.type === 'RingGeometry' && child.material.isMeshBasicMaterial);
    const spot = { x: ripple.position.x, z: ripple.position.z };
    __step(240);
    return { ripple: Math.hypot(spot.x, spot.z), gap: Math.hypot(root.position.x - spot.x, root.position.z - spot.z) };
  });
  assert.ok(result.ripple <= 2.2001, `ripple at radius ${result.ripple.toFixed(2)}`);
  assert.ok(result.gap < 0.1, `he stopped ${result.gap.toFixed(2)} from the ripple`);
  await page.context().close();
});

test('outfits, cookies and butterflies free their GPU memory', async () => {
  const page = await openGame();
  const memory = () => page.evaluate(() => ({ ...__clawd.renderer.info.memory }));
  const before = await memory();
  await page.evaluate(() => {
    for (let i = 0; i < 20; i++) {
      document.getElementById('randomFit').click();
      __step(2);
    }
    __step(120);
  });
  const afterOutfits = await memory();
  assert.ok(afterOutfits.geometries - before.geometries < 40, `outfits: ${before.geometries} to ${afterOutfits.geometries} geometries`);

  // The first visit loads things that stay on purpose, like the crumb shape. After that nothing should grow.
  const visit = () =>
    page.evaluate(() => {
      const { shake, startQuest, state } = __clawd;
      document.getElementById('treatBtn').click();
      __step(240);
      startQuest('butterfly');
      __step(30);
      state.shakeCooldown = 0;
      shake();
      __step(300);
    });
  await visit();
  const afterFirstVisit = await memory();
  await visit();
  await visit();
  const afterVisits = await memory();
  assert.deepEqual(afterVisits, afterFirstVisit);
  await page.context().close();
});

test('glyph textures use the loaded font', async () => {
  const page = await openGame();
  const different = await page.evaluate(async () => {
    const { drawGlyph, GLYPH_FONT, zzzTexture } = __clawd;
    await document.fonts.load(GLYPH_FONT, 'z');
    await new Promise(queueMicrotask);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const g = canvas.getContext('2d');
    drawGlyph(g, 'z', '#7A6A5A');
    const expected = g.getImageData(0, 0, 128, 128).data;
    const actual = zzzTexture.image.getContext('2d').getImageData(0, 0, 128, 128).data;
    let count = 0;
    for (let i = 3; i < actual.length; i += 4) if (Math.abs(actual[i] - expected[i]) > 40) count++;
    return count;
  });
  assert.equal(different, 0);
  await page.context().close();
});

test('dragging the camera counts as activity', async () => {
  const page = await openGame();
  await page.evaluate(() => (__clawd.state.nextQuest = 99));
  await dragAround(page, 40);
  const idleFor = await page.evaluate(() => __clawd.state.time - __clawd.state.lastActivity);
  assert.ok(idleFor < 0.1, `idle timer read ${idleFor.toFixed(2)}s straight after dragging`);
  await page.context().close();
});

test('rotating a phone to portrait keeps him in frame', async () => {
  const page = await openGame({ viewport: { width: 844, height: 390 } });
  await page.setViewportSize({ width: 390, height: 844 });
  const edges = await page.evaluate(() => {
    const { camera, root, state } = __clawd;
    state.nextFidget = 99;
    state.nextQuest = 99;
    root.position.set(2.2, 0, 0);
    __step(240);
    return [-1.6, 1.6].map((offset) => {
      const point = root.position.clone().set(root.position.x + offset, 1, 0).project(camera);
      return (point.x * 0.5 + 0.5) * innerWidth;
    });
  });
  assert.ok(edges[0] >= 0 && edges[1] <= 390, `his sides are at ${edges.map(Math.round)} on a 390px screen`);
  await page.context().close();
});

test('every wardrobe chip can be reached with a mouse', async () => {
  const page = await openGame({ viewport: { width: 1000, height: 700 } });
  await page.evaluate(() => {
    document.getElementById('wearBtn').click();
    document.body.getBoundingClientRect();
    return Promise.all(document.getAnimations().map((animation) => animation.finished));
  });
  const unreachable = await page.evaluate(() =>
    [...document.querySelectorAll('#wearSheet .chip')]
      .filter((chip) => {
        const box = chip.getBoundingClientRect();
        return !chip.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
      })
      .map((chip) => chip.textContent),
  );
  assert.deepEqual(unreachable, []);
  await page.context().close();
});

test('no sound is scheduled before the first user gesture', async () => {
  const page = await openGame();
  const before = await page.evaluate(() => {
    __clawd.startQuest('trip');
    __clawd.state.nextFidget = 0;
    __step(120);
    return window.__audioContexts.length;
  });
  assert.equal(before, 0);
  await page.evaluate(() => document.getElementById('treatBtn').click());
  const oscillators = await page.evaluate(() => window.__oscillators);
  assert.ok(oscillators > 0, 'the first gesture should make sound');
  await page.context().close();
});

test('hiding the tab suspends audio and showing it resumes', async () => {
  const page = await openGame();
  await page.evaluate(async () => {
    document.getElementById('treatBtn').click();
    await window.__audioContexts[0].resume();
  });
  const setHidden = (hidden) =>
    page.evaluate((value) => {
      Object.defineProperty(document, 'hidden', { value, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  const audioState = async (expected) => {
    for (let i = 0; i < 50; i++) {
      const current = await page.evaluate(() => window.__audioContexts[0].state);
      if (current === expected) return current;
      await page.waitForTimeout(40);
    }
    return page.evaluate(() => window.__audioContexts[0].state);
  };
  await setHidden(true);
  assert.equal(await audioState('suspended'), 'suspended');
  await setHidden(false);
  assert.equal(await audioState('running'), 'running');
  await page.context().close();
});

test('the S shortcut ignores browser shortcuts like Ctrl+S', async () => {
  const page = await openGame();
  const modes = await page.evaluate(() => {
    dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }));
    const withCtrl = __clawd.state.mode;
    dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
    return [withCtrl, __clawd.state.mode];
  });
  assert.deepEqual(modes, ['idle', 'dizzy']);
  await page.context().close();
});

test('the time slider follows the clock on Auto', async () => {
  const page = await openGame();
  const value = await page.evaluate(() => {
    __skip(3 * 3600 * 1000);
    __step(1);
    return parseFloat(document.getElementById('timeSlider').value);
  });
  const hour = await page.evaluate(() => new Date().getHours() + new Date().getMinutes() / 60);
  assert.ok(Math.abs(value - hour) < 0.3, `slider at ${value}, clock at ${hour}`);
  await page.context().close();
});

test('the jump photo only arms on a real hop and disarms on exit', async () => {
  const page = await openGame();
  const result = await page.evaluate(() => {
    const { save, state } = __clawd;
    const jump = () => document.querySelector('#poseChips [data-id=jump]').click();
    document.getElementById('photoBtn').click();
    state.hopVel = 1;
    jump();
    const armedMidHop = state.jumpPhotoArmed;
    state.hopVel = 0;
    state.hopHeight = 0;
    jump();
    const armedOnHop = state.jumpPhotoArmed;
    const photos = save.photos;
    document.getElementById('exitPhoto').click();
    __step(60);
    return { armedMidHop, armedOnHop, armedAfterExit: state.jumpPhotoArmed, extraPhotos: save.photos - photos };
  });
  assert.deepEqual(result, { armedMidHop: false, armedOnHop: true, armedAfterExit: false, extraPhotos: 0 });
  await page.context().close();
});

test('the sunlight stays put while he walks', async () => {
  const page = await openGame();
  const moved = await page.evaluate(() => {
    const { root, sunLight } = __clawd;
    const before = sunLight.position.clone();
    root.position.set(2, 0, 1);
    __step(2);
    return sunLight.position.distanceTo(before);
  });
  assert.ok(moved < 0.01, `light moved ${moved.toFixed(3)}`);
  await page.context().close();
});

test('a browser without WebGL gets a plain message', async () => {
  const context = await browser.newContext({ viewport: { width: 480, height: 360 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type.startsWith('webgl') ? null : getContext.call(this, type, ...args);
    };
  });
  await page.goto(DEV_BUILD);
  assert.match(await page.textContent('#loading'), /WebGL/);
  assert.equal(await page.isVisible('.hud'), false);
  await context.close();
});

test('the speech bubble stays on screen when zoomed in', async () => {
  const page = await openGame({ viewport: { width: 390, height: 844 }, save: { hat: 'wizard' } });
  const box = await page.evaluate(() => {
    const { camera, controls, root, state } = __clawd;
    state.nextFidget = 99;
    root.position.set(2.2, 0, 0);
    camera.position.sub(controls.target).multiplyScalar(0.45).add(controls.target);
    document.getElementById('bubble').classList.remove('show');
    __step(240);
    document.querySelector('#hatChips [data-id=wizard]').click();
    __step(30);
    const rect = document.getElementById('bubble').getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top };
  });
  assert.ok(box.left >= 0 && box.right <= 390 && box.top >= 0, JSON.stringify(box));
  await page.context().close();
});

test('the mood only promises following to mouse users', async () => {
  const page = await openGame();
  const moods = await page.evaluate(() => {
    const { state } = __clawd;
    state.happiness = 95;
    state.lastPointerMove = -9;
    state.pointerType = 'mouse';
    __step(1);
    const mouse = document.getElementById('mood').textContent;
    state.pointerType = 'touch';
    __step(1);
    return [mouse, document.getElementById('mood').textContent];
  });
  assert.match(moods[0], /follows you/);
  assert.doesNotMatch(moods[1], /follows you/);
  await page.context().close();
});

test('idle quests do not count as the user being active', async () => {
  const page = await openGame();
  const result = await page.evaluate(() => {
    const { startQuest, state } = __clawd;
    const before = state.lastActivity;
    startQuest('sneeze');
    __step(240);
    return { before, after: state.lastActivity, hintGone: document.getElementById('hint').classList.contains('gone') };
  });
  assert.equal(result.after, result.before);
  assert.equal(result.hintGone, false);
  await page.context().close();
});

test('his facing holds steady while a butterfly hovers overhead', async () => {
  const page = await openGame();
  const worst = await page.evaluate(() => {
    const { root, startQuest, state } = __clawd;
    state.nextFidget = 99;
    startQuest('butterfly');
    const targets = [];
    for (let i = 0; i < 30; i++) {
      state.butterfly.group.position.set(root.position.x + Math.cos(i) * 0.05, 2.5, root.position.z + Math.sin(i) * 0.05);
      __step(1);
      targets.push(state.targetYaw);
    }
    return Math.max(...targets.slice(1).map((yaw, i) => Math.abs(Math.atan2(Math.sin(yaw - targets[i]), Math.cos(yaw - targets[i])))));
  });
  assert.ok(worst * DEGREES < 5, `target moved ${(worst * DEGREES).toFixed(0)} degrees in a frame`);
  await page.context().close();
});

test('the wardrobe shows renders of the real items, once', async () => {
  const page = await openGame();
  const result = await page.evaluate(() => {
    document.getElementById('wearBtn').click();
    const canvases = [...document.querySelectorAll('#wearSheet .chip canvas')];
    const painted = canvases.filter((canvas) => {
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
      return false;
    });
    document.querySelector('#wearSheet [data-close]').click();
    document.getElementById('wearBtn').click();
    return { count: canvases.length, painted: painted.length, same: canvases[0] === document.querySelector('#wearSheet .chip canvas') };
  });
  assert.deepEqual(result, { count: 11, painted: 11, same: true });
  await page.context().close();
});

test('the interface colour follows the sky and switches at night', async () => {
  const page = await openGame();
  const read = () =>
    page.evaluate(() => ({
      sky: document.documentElement.style.getPropertyValue('--sky'),
      night: document.body.classList.contains('night'),
    }));
  const noon = await read();
  await page.evaluate(() => {
    __clawd.setHour(22);
    __step(4);
  });
  const late = await read();
  assert.equal(noon.night, false);
  assert.equal(late.night, true);
  assert.notEqual(noon.sky, late.sky);
  await page.context().close();
});

test('the default view shows sky by day and stars at night', async () => {
  const page = await openGame();
  const view = await page.evaluate(() => {
    const { camera, scene, setHour } = __clawd;
    setHour(22);
    __step(2);
    const stars = scene.children.find((child) => child.isPoints);
    const point = camera.position.clone();
    const positions = stars.geometry.attributes.position;
    let visible = 0;
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).add(stars.position).project(camera);
      if (Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1) visible++;
    }
    return { visible, opacity: stars.material.opacity };
  });
  assert.ok(view.opacity > 0.5, `stars at opacity ${view.opacity}`);
  assert.ok(view.visible >= 8, `only ${view.visible} stars in view`);
  await page.context().close();
});

test('at night his shadow falls away from the lamp', async () => {
  const page = await openGame();
  const towardLamp = await page.evaluate(() => {
    const { setHour, sunLight } = __clawd;
    setHour(22);
    __step(2);
    const light = sunLight.position.clone().setY(0).normalize();
    return light.x * (2.5 / Math.hypot(2.5, 2.9)) + light.z * (-2.9 / Math.hypot(2.5, 2.9));
  });
  assert.ok(towardLamp > 0.9, `light direction lines up with the lamp at ${towardLamp.toFixed(2)}`);
  await page.context().close();
});

test('the page allows zooming', async () => {
  const page = await openGame();
  const meta = await page.getAttribute('meta[name=viewport]', 'content');
  assert.doesNotMatch(meta, /user-scalable|maximum-scale/);
  await page.context().close();
});

test('reduced motion removes the spin, sway and flash', async () => {
  const page = await openGame({ reducedMotion: 'reduce' });
  const result = await page.evaluate(() => {
    const { root, setMode, state } = __clawd;
    setMode('spin');
    __step(20);
    const spin = root.rotation.y;
    setMode('dizzy');
    __step(40);
    const sway = state.sway;
    document.getElementById('photoBtn').click();
    document.getElementById('shutter').click();
    return { spin, sway, flash: document.getElementById('flash').style.opacity };
  });
  assert.equal(result.spin, 0);
  assert.ok(Math.abs(result.sway) < 0.001, `sway ${result.sway}`);
  assert.notEqual(result.flash, '1');
  await page.context().close();
});

test('Esc closes the photo, then sheets, then photo mode', async () => {
  const page = await openGame();
  const result = await page.evaluate(() => {
    const press = () => dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    const open = (id) => document.getElementById(id).classList.contains('open');
    document.getElementById('wearBtn').click();
    const sheetOpened = open('wearSheet');
    press();
    const sheetClosed = !open('wearSheet');
    document.getElementById('photoBtn').click();
    document.getElementById('shutter').click();
    __step(30);
    const modal = document.getElementById('modal');
    const modalOpened = modal.classList.contains('show');
    press();
    const modalClosed = !modal.classList.contains('show');
    const stillInPhotoMode = __clawd.state.photoMode;
    press();
    return { sheetOpened, sheetClosed, modalOpened, modalClosed, stillInPhotoMode, leftPhotoMode: !__clawd.state.photoMode };
  });
  assert.ok(Object.values(result).every(Boolean), JSON.stringify(result));
  await page.context().close();
});

test('closed layers stay out of the Tab order', async () => {
  const page = await openGame();
  const reachable = async () =>
    page.evaluate(() =>
      [...document.querySelectorAll('button,input')].filter((element) => !element.closest('[inert]') && !element.closest('#modal')).map((element) => element.id || element.textContent.trim()),
    );
  const closed = await reachable();
  assert.deepEqual(closed, ['treatBtn', 'danceBtn', 'wearBtn', 'photoBtn', 'moreBtn']);
  // A keyboard user has the button focused when they press it.
  await page.evaluate(() => {
    const button = document.getElementById('wearBtn');
    button.focus();
    button.click();
  });
  const open = await reachable();
  assert.ok(open.includes('randomFit'));
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Done');
  await page.evaluate(() => document.querySelector('#wearSheet [data-close]').click());
  assert.equal(await page.evaluate(() => document.activeElement.id), 'wearBtn');
  assert.deepEqual(await reachable(), closed, 'a closed sheet should leave the Tab order again');
  await page.context().close();
});

test('every control is a comfortable tap target on a phone', async () => {
  const page = await openGame({ viewport: { width: 390, height: 844 } });
  const short = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('button,input')]
        .filter((element) => !element.closest('[inert]') && element.offsetParent)
        .filter((element) => element.getBoundingClientRect().height < 43.5) // Sub-pixel rounding from centred transforms.
        .map((element) => element.id || element.textContent.trim()),
    );
  assert.deepEqual(await short(), []);
  for (const id of ['wearBtn', 'moreBtn']) {
    await page.evaluate((button) => document.getElementById(button).click(), id);
    assert.deepEqual(await short(), []);
    await page.evaluate(() => document.querySelector('.sheet.open [data-close]').click());
  }
  await page.evaluate(() => document.getElementById('photoBtn').click());
  assert.deepEqual(await short(), []);
  await page.context().close();
});

test('every photo frame produces a picture', async () => {
  const page = await openGame();
  const sizes = await page.evaluate(() => {
    document.getElementById('photoBtn').click();
    return ['polaroid', 'retro', 'clean'].map((frame) => {
      document.querySelector(`#frameChips [data-id=${frame}]`).click();
      document.getElementById('shutter').click();
      return document.getElementById('photoImg').src.length;
    });
  });
  assert.ok(sizes.every((size) => size > 10000), sizes.join());
  assert.equal(new Set(sizes).size, 3);
  await page.context().close();
});

test('the shipped file plays through every feature offline', async () => {
  const context = await browser.newContext({ viewport: { width: 1000, height: 700 }, acceptDownloads: true });
  await context.setOffline(true);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(SHIPPED_BUILD);
  await page.waitForTimeout(800);
  const click = (selector) => page.click(selector);
  await click('#treatBtn');
  await page.waitForTimeout(2500);
  await click('#danceBtn');
  await page.waitForTimeout(800);
  await click('#wearBtn');
  await click('#hatChips [data-id=crown]');
  await click('#faceChips [data-id=bowtie]');
  await click('#randomFit');
  await click('#wearSheet [data-close]');
  await click('#moreBtn');
  await page.fill('#timeSlider', '22');
  await page.dispatchEvent('#timeSlider', 'input');
  await click('#soundBtn');
  await click('#autoTime');
  await click('#moreSheet [data-close]');
  await click('#photoBtn');
  for (const frame of ['polaroid', 'retro', 'clean']) {
    await click(`#frameChips [data-id=${frame}]`);
    await click('#shutter');
    await page.waitForSelector('#modal.show');
    const [download] = await Promise.all([page.waitForEvent('download'), click('#savePhoto')]);
    assert.match(download.suggestedFilename(), /^clawd-.*\.png$/);
    await click('#closePhoto');
  }
  await click('#exitPhoto');
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('clawd-pet-v1')));
  assert.equal(saved.treats, 1);
  assert.equal(saved.photos, 3);
  assert.deepEqual(errors, []);
  await context.close();
});
