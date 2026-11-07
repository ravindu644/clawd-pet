// Short-lived things: floating sprites, cookie crumbs and floor ripples.
import { BoxGeometry, Mesh, MeshBasicMaterial, RingGeometry, Sprite, SpriteMaterial, Vector3 } from 'three';
import { clamp, rand, state } from './state.js';
import { canvasTexture, FLOOR_Y, scene, standard } from './world.js';

export const GLYPH_FONT = '800 96px "JetBrains Mono", monospace';

export function drawGlyph(g, text, color) {
  g.clearRect(0, 0, 128, 128);
  g.font = GLYPH_FONT;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = '#fff';
  g.strokeText(text, 64, 68);
  g.fillStyle = color;
  g.fillText(text, 64, 68);
}

// Canvas text doesn't wait for web fonts, so each glyph is drawn again once the font has loaded.
function glyph(text, color) {
  const texture = canvasTexture((g) => drawGlyph(g, text, color));
  document.fonts.load(GLYPH_FONT, text).then(() => {
    drawGlyph(texture.image.getContext('2d'), text, color);
    texture.needsUpdate = true;
  });
  return texture;
}

export const heartTexture = canvasTexture((g) => {
  g.fillStyle = '#E8607A';
  g.strokeStyle = '#2B2118';
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(64, 108);
  g.bezierCurveTo(14, 72, 10, 34, 38, 26);
  g.bezierCurveTo(52, 22, 62, 32, 64, 44);
  g.bezierCurveTo(66, 32, 76, 22, 90, 26);
  g.bezierCurveTo(118, 34, 114, 72, 64, 108);
  g.closePath();
  g.fill();
  g.stroke();
});
export const zzzTexture = glyph('z', '#7A6A5A');
export const noteTexture = glyph('♪', '#D97757');
export const bangTexture = glyph('!', '#2B2118');
export const starTexture = canvasTexture((g) => {
  g.fillStyle = '#F2C14E';
  g.strokeStyle = '#2B2118';
  g.lineWidth = 6;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const radius = i % 2 ? 16 : 54;
    const angle = (i * Math.PI) / 4 - Math.PI / 2;
    g.lineTo(64 + Math.cos(angle) * radius, 64 + Math.sin(angle) * radius);
  }
  g.closePath();
  g.fill();
  g.stroke();
});
export const pollenTexture = canvasTexture((g) => {
  g.fillStyle = '#F7D774';
  g.beginPath();
  g.arc(64, 64, 40, 0, 7);
  g.fill();
});

const particles = [];

export function spawnSprite(
  texture,
  position,
  {
    vel = new Vector3(rand(-0.3, 0.3), rand(1, 1.6), rand(-0.1, 0.2)),
    life = 1.2,
    size = 0.35,
    grow = 0.3,
    sway = 1,
    grav = 0,
  } = {},
) {
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.position.copy(position);
  sprite.scale.setScalar(size);
  scene.add(sprite);
  particles.push({ object: sprite, vel, life, maxLife: life, size, grow, sway, grav, seed: rand(0, 6) });
  return sprite;
}

const crumbGeometry = new BoxGeometry(0.07, 0.07, 0.07);
const cookieCrumb = standard(0xb67a3e, { roughness: 0.9 });
export const dustCrumb = standard(0xe2d3bc, { roughness: 1 });

export function spawnCrumb(position, material = cookieCrumb, spread = 1) {
  const crumb = new Mesh(crumbGeometry, material);
  crumb.position.copy(position);
  crumb.castShadow = true;
  scene.add(crumb);
  particles.push({
    object: crumb,
    vel: new Vector3(rand(-1.4, 1.4) * spread, rand(1, 2.6), rand(0.3, 1.6) * spread),
    life: 1.6,
    maxLife: 1.6,
    crumb: true,
    spin: rand(-8, 8),
  });
}

const rippleGeometry = new RingGeometry(0.16, 0.24, 32);

export function spawnRipple(position) {
  const ripple = new Mesh(rippleGeometry, new MeshBasicMaterial({ color: 0xd97757, transparent: true, depthWrite: false }));
  ripple.rotation.x = -Math.PI / 2;
  ripple.position.set(position.x, FLOOR_Y + 0.012, position.z);
  scene.add(ripple);
  particles.push({ object: ripple, life: 0.8, maxLife: 0.8, ripple: true });
}

export function spawnHearts(count, position) {
  for (let i = 0; i < count; i++) {
    spawnSprite(heartTexture, position.clone().add(new Vector3(rand(-0.6, 0.6), rand(0, 0.4), rand(-0.2, 0.3))), {
      vel: new Vector3(rand(-0.6, 0.6), rand(1.2, 2), rand(0, 0.4)),
      life: rand(1, 1.5),
      size: rand(0.28, 0.42),
    });
  }
}

// Ends a long-lived sprite in a fade rather than a pop.
export function fadeSprite(sprite) {
  const particle = particles.find((p) => p.object === sprite);
  if (particle) particle.life = 0.2;
}

export function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.crumb) {
      p.vel.y -= 14 * dt;
      p.object.position.addScaledVector(p.vel, dt);
      p.object.rotation.x += p.spin * dt;
      p.object.rotation.z += p.spin * dt;
      if (p.object.position.y < FLOOR_Y + 0.035) {
        p.object.position.y = FLOOR_Y + 0.035;
        p.vel.y *= -0.3;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
        p.spin *= 0.5;
      }
      p.object.scale.setScalar(clamp(p.life / 0.4, 0, 1));
    } else if (p.ripple) {
      const age = 1 - p.life / p.maxLife;
      p.object.scale.setScalar(1 + age * 4);
      p.object.material.opacity = 1 - age;
    } else {
      p.vel.y -= p.grav * dt;
      p.vel.x += Math.sin(state.time * 4 + p.seed) * p.sway * dt;
      p.object.position.addScaledVector(p.vel, dt);
      p.object.material.opacity = clamp(p.life / 0.45, 0, 1);
      p.object.scale.setScalar(p.size * (1 + (1 - p.life / p.maxLife) * p.grow));
    }
    if (p.life <= 0) {
      scene.remove(p.object);
      if (p.object.material && p.object.material !== cookieCrumb && p.object.material !== dustCrumb) p.object.material.dispose();
      particles.splice(i, 1);
    }
  }
}

