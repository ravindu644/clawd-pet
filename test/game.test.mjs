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


