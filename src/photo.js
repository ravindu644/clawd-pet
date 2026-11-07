// Takes a high-resolution photo of the scene and frames it.
import { sfx, unlockAudio } from './audio.js';
import { addBond } from './behavior.js';
import { currentHour, friendshipLevel, save, state } from './state.js';
import { formatHour, persist } from './ui.js';
import { camera, canvas as stage, renderer, scene } from './world.js';

const $ = (id) => document.getElementById(id);

// The speech bubble is DOM, so it has to be redrawn by hand to appear in the photo.
function drawBubble(g, scale) {
  const bubble = $('bubble');
  if (!bubble.classList.contains('show')) return;
  const rect = bubble.getBoundingClientRect();
  const x = rect.left * scale;
  const y = rect.top * scale;
  const width = rect.width * scale;
  const height = rect.height * scale;
  g.save();
  g.fillStyle = '#fff';
  g.strokeStyle = '#d4d4d4';
  g.lineWidth = scale;
  g.beginPath();
  g.roundRect(x, y, width, height, 8 * scale);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(x + width / 2 - 6 * scale, y + height - scale);
  g.lineTo(x + width / 2, y + height + 6 * scale);
  g.lineTo(x + width / 2 + 6 * scale, y + height - scale);
  g.fill();
  g.beginPath();
  g.moveTo(x + width / 2 - 6 * scale, y + height);
  g.lineTo(x + width / 2, y + height + 6 * scale);
  g.lineTo(x + width / 2 + 6 * scale, y + height);
  g.stroke();
  g.fillStyle = '#0a0a0a';
  g.font = font(500, 14 * scale);
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText(bubble.textContent, x + width / 2, y + height / 2 + scale);
  g.restore();
}

function blankCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  return canvas;
}

const font = (weight, size) => `${weight} ${size}px Geist, system-ui, sans-serif`;

function polaroidFrame(shot, scale, date) {
  const side = Math.round(Math.min(innerWidth, innerHeight) * 0.9 * scale);
  const cropX = (shot.width - side) / 2;
  const cropY = (shot.height - side) / 2;
  const border = Math.round(side * 0.06);
  const caption = Math.round(side * 0.24);
  const frame = blankCanvas(side + border * 2, side + border + caption);
  const g = frame.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, frame.width, frame.height);
  g.drawImage(shot, cropX, cropY, side, side, border, border, side, side);
  g.strokeStyle = 'rgba(10,10,10,.12)';
  g.lineWidth = Math.max(2, side * 0.003);
  g.strokeRect(border, border, side, side);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#141414';
  g.font = font(500, side * 0.06);
  g.fillText('clawd ♥', frame.width / 2, side + border + caption * 0.42);
  g.fillStyle = '#6b6b6b';
  g.font = font(400, side * 0.032);
  g.fillText(`${date} · friendship lvl ${friendshipLevel()}`, frame.width / 2, side + border + caption * 0.72);
  return frame;
}

function retroFrame(shot, date) {
  const width = shot.width;
  const height = shot.height;
  const short = Math.min(width, height);
  const border = Math.round(short * 0.025);
  const titleBar = Math.round(short * 0.08);
  const statusBar = Math.round(short * 0.06);
  const frame = blankCanvas(width + border * 2, height + titleBar + statusBar + border * 2);
  const g = frame.getContext('2d');
  g.fillStyle = '#141414';
  g.fillRect(0, 0, frame.width, frame.height);
  g.drawImage(shot, border, border + titleBar);
  g.fillStyle = '#eee';
  g.fillRect(border, border + titleBar + height, width, statusBar);
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.font = font(500, titleBar * 0.42);
  g.textAlign = 'left';
  g.fillText('■ clawd.exe', border + titleBar * 0.35, border + titleBar / 2);
  g.textAlign = 'right';
  g.fillText('_  □  ✕', border + width - titleBar * 0.35, border + titleBar / 2);
  g.fillStyle = '#141414';
  g.font = font(500, statusBar * 0.42);
  g.textAlign = 'left';
  g.fillText(`♥ ${save.pets}  boops ${save.boops}  lvl ${friendshipLevel()}`, border + statusBar * 0.4, border + titleBar + height + statusBar / 2);
  g.textAlign = 'right';
  g.fillText(`${date}  ${formatHour(currentHour())}`, border + width - statusBar * 0.4, border + titleBar + height + statusBar / 2);
  return frame;
}

function cleanFrame(shot, scale) {
  const frame = blankCanvas(shot.width, shot.height);
  const g = frame.getContext('2d');
  g.drawImage(shot, 0, 0);
  g.font = font(500, 16 * scale);
  g.textAlign = 'right';
  g.textBaseline = 'bottom';
  g.lineWidth = 4 * scale;
  g.strokeStyle = 'rgba(255,255,255,.85)';
  g.strokeText('clawd ♥', frame.width - 14 * scale, frame.height - 12 * scale);
  g.fillStyle = '#141414';
  g.fillText('clawd ♥', frame.width - 14 * scale, frame.height - 12 * scale);
  return frame;
}

export function takePhoto() {
  const width = innerWidth;
  const height = innerHeight;
  const normalRatio = renderer.getPixelRatio();
  const photoRatio = Math.min(3, Math.max(1.5, 2600 / Math.max(width, height)));
  renderer.setPixelRatio(photoRatio);
  renderer.setSize(width, height, false);
  renderer.render(scene, camera);
  const shot = blankCanvas(stage.width, stage.height);
  shot.getContext('2d').drawImage(stage, 0, 0);
  renderer.setPixelRatio(normalRatio);
  renderer.setSize(width, height, false);

  const scale = shot.width / width;
  drawBubble(shot.getContext('2d'), scale);
  const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const framed = state.frame === 'polaroid' ? polaroidFrame(shot, scale, date) : state.frame === 'retro' ? retroFrame(shot, date) : cleanFrame(shot, scale);
  try {
    state.photoUrl = framed.toDataURL('image/png');
  } catch {
    return;
  }
  $('photoImg').src = state.photoUrl;

  if (!state.calm) {
    const flash = $('flash');
    flash.style.transition = 'none';
    flash.style.opacity = '1';
    requestAnimationFrame(() => {
      flash.style.transition = 'opacity .6s';
      flash.style.opacity = '0';
    });
  }
  sfx.shutter();
  save.photos++;
  addBond(2);
  persist();
  setTimeout(() => $('modal').classList.add('show'), 350);
}

function savePhoto() {
  const filename = `clawd-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
  try {
    const link = document.createElement('a');
    link.href = state.photoUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch {}
}

export const closePhoto = () => $('modal').classList.remove('show');
export const photoIsOpen = () => $('modal').classList.contains('show');

export function initPhoto() {
  $('shutter').addEventListener('click', () => {
    unlockAudio();
    takePhoto();
  });
  $('closePhoto').addEventListener('click', closePhoto);
  $('savePhoto').addEventListener('click', savePhoto);
}
