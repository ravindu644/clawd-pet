// Runs the game in headless Chromium with time and randomness frozen, so every run is identical.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright-core';

const DEV_BUILD = 'file://' + resolve('.test/clawd.html');
const SHIPPED_BUILD = 'file://' + resolve('clawd.html');

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

async function openGame({ viewport = { width: 480, height: 360 }, save = {} } = {}) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(freezeTime);
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
  assert.equal(await page.evaluate(() => 'clawdDebug' in window && '__clawd' in window), false);
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
