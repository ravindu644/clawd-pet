# Clawd

A small 3D virtual pet that lives on your clock. Stroke him, boop him, dress him up and take his photo.

The game builds into one file, `dist/clawd.html`, with everything inlined. Open it in a browser and it works with no network.

## Build

```sh
npm install
npm run build
```

This writes `dist/clawd.html`, which is not committed. Edit the files in `src/`.

## Test

```sh
npm test
```

The tests run a dev build in headless Chromium through Playwright, so a browser has to be available:

```sh
npx playwright-core install chromium-headless-shell
```

Set `CHROME_PATH` to use a browser you already have.

## Not affiliated with Anthropic

This is an independent, unofficial fan project. It is not affiliated with, sponsored by or endorsed by Anthropic. The Clawd character is the property of Anthropic, and "Claude" and "Clawd" are trademarks of Anthropic.

Because the character belongs to Anthropic, this repository has no open-source licence. Keep that in mind before you fork or reuse it.

## Credits

Set in [JetBrains Mono](https://www.jetbrains.com/lp/mono/), under the SIL Open Font License 1.1 (`src/fonts/OFL.txt`). Three.js is MIT licensed.

## Layout

| File | What it holds |
| --- | --- |
| `src/main.js` | Boot and the frame loop |
| `src/state.js` | Shared state, the save file, maths helpers |
| `src/world.js` | Renderer, camera, sky, rug, props, day cycle |
| `src/clawd.js` | His body and how it moves each frame |
| `src/outfits.js` | Hats and face items |
| `src/behavior.js` | Moods, walking, quests, cookie, butterfly |
| `src/input.js` | Pointer, keyboard, device motion |
| `src/ui.js` | HUD, speech bubble, sheets, photo controls |
| `src/photo.js` | Photo capture and frames |
| `src/audio.js` | Synthesised sound |
| `src/particles.js` | Sprites, crumbs, ripples |
