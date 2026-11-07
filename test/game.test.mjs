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
