// Hats and face items. Each builder returns a fresh Group, so the same builders can also draw thumbnails.
import {
  ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshStandardMaterial, OctahedronGeometry,
  PlaneGeometry, TorusGeometry, Vector3,
} from 'three';
import { canvasTexture, disposeObject, leafMaterial, roundedBox, standard, stemMaterial } from './world.js';

export const HATS = [
  ['none', 'None', '∅'],
  ['party', 'Party', '🎉'],
  ['wizard', 'Wizard', '🧙'],
  ['crown', 'Crown', '👑'],
  ['beanie', 'Beanie', '🧶'],
  ['headphones', 'Phones', '🎧'],
  ['flower', 'Flower', '🌼'],
  ['halo', 'Halo', '😇'],
];

export const FACES = [
  ['none', 'None', '∅'],
  ['sunglasses', 'Shades', '😎'],
  ['nerd', 'Nerd', '🤓'],
  ['bowtie', 'Bowtie', '🎀'],
  ['mustache', 'Stache', '🥸'],
];

export const HAT_LINES = {
  party: "it's my party 🎉",
  wizard: "you're a wizard, clawd",
  crown: 'bow before me 👑',
  beanie: 'cozy mode',
  headphones: 'lo-fi beats to pet me to',
  flower: '🌼 so pretty',
  halo: "i'm an angel 😇",
  none: 'free head!',
};

export const FACE_LINES = {
  sunglasses: 'deal with it 😎',
  nerd: 'um, actually ☝️🤓',
  bowtie: 'very dapper',
  mustache: 'bonjour 🥸',
  none: 'the classic look',
};

const BODY_DEPTH = 1.3;
const BODY_HEIGHT = 1.5;

// Where a butterfly lands on each hat, as an offset from the top of his head.
const PERCHES = {
  none: [0.45, 0.04, 0.15],
  party: [-0.5, 0.04, 0.15],
  wizard: [0.74, 0.09, 0.25],
  crown: [0.9, 0.04, 0.2],
  beanie: [0.5, 0.45, 0.1],
  headphones: [0.3, 0.2, 0],
  flower: [0.5, 0.04, 0.15],
  halo: [0.45, 0.04, 0.15],
};

export function perchFor(hat) {
  const [x, y, z] = PERCHES[hat] || PERCHES.none;
  return new Vector3(x, BODY_HEIGHT + y, z);
}

const gold = standard(0xf2c14e, { metalness: 0.55, roughness: 0.3 });
const dark = standard(0x2b2118, { roughness: 0.5 });
const partyStripes = canvasTexture((g) => {
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#FFFFFF' : '#E8607A';
    g.fillRect(0, i * 16, 128, 16);
  }
});

export const disposeOutfit = (outfit) => disposeObject(outfit, [gold, dark, leafMaterial, stemMaterial]);

export function buildHat(id) {
  const hat = new Group();
  if (id === 'party') {
    const cone = new Mesh(new ConeGeometry(0.3, 0.75, 24), standard(0xffffff, { map: partyStripes }));
    cone.position.y = 0.375;
    cone.castShadow = true;
    const pompom = new Mesh(new IcosahedronGeometry(0.1, 1), standard(0xf2c14e));
    pompom.position.y = 0.78;
    hat.add(cone, pompom);
    hat.position.set(0.45, 0, -0.05);
    hat.rotation.z = -0.18;
  } else if (id === 'wizard') {
    const felt = standard(0x3e4fa3, { flatShading: true });
    const brim = new Mesh(new CylinderGeometry(0.85, 0.85, 0.06, 8), felt);
    brim.position.y = 0.03;
    brim.castShadow = true;
    const cone = new Mesh(new ConeGeometry(0.55, 1.2, 8), felt);
    cone.position.y = 0.66;
    cone.castShadow = true;
    const band = new Mesh(new CylinderGeometry(0.5, 0.53, 0.1, 8), gold);
    band.position.y = 0.14;
    hat.add(brim, cone, band);
    [[0.4, 0], [0.65, 1.2], [0.85, -0.9], [0.5, 2.4]].forEach(([height, angle]) => {
      const radius = 0.55 * (1 - (height - 0.06) / 1.2) + 0.02;
      const star = new Mesh(new OctahedronGeometry(0.065), standard(0xf2c14e, { emissive: 0xf2c14e, emissiveIntensity: 0.5 }));
      star.position.set(Math.sin(angle) * radius, height, Math.cos(angle) * radius);
      hat.add(star);
    });
    hat.rotation.z = 0.06;
  } else if (id === 'crown') {
    hat.add(
      roundedBox(1.1, 0.22, 0.07, gold, 0, 0.11, 0.38),
      roundedBox(1.1, 0.22, 0.07, gold, 0, 0.11, -0.38),
      roundedBox(0.07, 0.22, 0.76, gold, 0.55, 0.11, 0),
      roundedBox(0.07, 0.22, 0.76, gold, -0.55, 0.11, 0),
    );
    for (const z of [0.38, -0.38]) {
      for (const x of [-0.42, -0.14, 0.14, 0.42]) {
        const point = roundedBox(0.13, 0.13, 0.05, gold, x, 0.27, z);
        point.rotation.z = Math.PI / 4;
        hat.add(point);
      }
    }
    hat.add(
      roundedBox(0.11, 0.11, 0.04, standard(0xd8344a, { roughness: 0.2 }), 0, 0.11, 0.42),
      roundedBox(0.08, 0.08, 0.04, standard(0x3e7bd8, { roughness: 0.2 }), -0.32, 0.11, 0.42),
      roundedBox(0.08, 0.08, 0.04, standard(0x3e7bd8, { roughness: 0.2 }), 0.32, 0.11, 0.42),
    );
  } else if (id === 'beanie') {
    hat.add(
      roundedBox(2, 0.42, 1.12, standard(0x5e8fd0, { roughness: 0.9 }), 0, 0.21, 0),
      roundedBox(2.1, 0.2, 1.2, standard(0x4b78b8, { roughness: 0.9 }), 0, 0.08, 0),
    );
    const bobble = new Mesh(new IcosahedronGeometry(0.2, 1), standard(0xf4efe6, { roughness: 1 }));
    bobble.position.y = 0.55;
    bobble.castShadow = true;
    hat.add(bobble);
  } else if (id === 'headphones') {
    const cup = standard(0xf4efe6);
    const pad = standard(0xb85e40);
    hat.add(roundedBox(2.52, 0.12, 0.22, dark, 0, 0.14, 0));
    for (const side of [-1, 1]) {
      hat.add(
        roundedBox(0.12, 0.5, 0.22, dark, side * 1.26, -0.08, 0),
        roundedBox(0.22, 0.56, 0.62, cup, side * 1.31, -0.5, 0),
        roundedBox(0.06, 0.36, 0.42, pad, side * 1.43, -0.5, 0),
      );
    }
  } else if (id === 'flower') {
    hat.add(roundedBox(0.06, 0.38, 0.06, stemMaterial, 0, 0.19, 0));
    const leaf = roundedBox(0.2, 0.06, 0.1, leafMaterial, 0.09, 0.15, 0);
    leaf.rotation.z = 0.5;
    hat.add(leaf);
    hat.add(roundedBox(0.16, 0.16, 0.08, standard(0xf2c14e), 0, 0.47, 0));
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      hat.add(roundedBox(0.14, 0.14, 0.06, standard(i % 2 ? 0xffffff : 0xf6b6c8), Math.cos(angle) * 0.16, 0.47 + Math.sin(angle) * 0.16, -0.01));
    }
    hat.position.set(-0.55, 0, 0.15);
    hat.rotation.z = 0.15;
  } else if (id === 'halo') {
    const ring = new Mesh(new TorusGeometry(0.45, 0.055, 10, 40), standard(0xf7d774, { emissive: 0xf2c14e, emissiveIntensity: 0.9, roughness: 0.3 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.5;
    hat.add(ring);
    hat.userData.halo = ring;
  }
  return hat;
}

export function buildFace(id, face = new Group()) {
  const front = BODY_DEPTH / 2;
  const glassesArms = () => {
    for (const side of [-1, 1]) {
      face.add(
        roundedBox(0.42, 0.06, 0.04, dark, side * 0.99, 1.12, front + 0.04),
        roundedBox(0.05, 0.06, 0.7, dark, side * 1.22, 1.12, 0.3),
      );
    }
  };
  if (id === 'sunglasses') {
    const lens = standard(0x111111, { roughness: 0.12, metalness: 0.45 });
    for (const side of [-1, 1]) face.add(roundedBox(0.46, 0.34, 0.05, lens, side * 0.55, 1.03, front + 0.06));
    face.add(roundedBox(0.26, 0.07, 0.04, dark, 0, 1.1, front + 0.06));
    glassesArms();
  } else if (id === 'nerd') {
    const glass = new MeshStandardMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.22, roughness: 0.1 });
    for (const side of [-1, 1]) {
      const x = side * 0.55;
      face.add(
        roundedBox(0.5, 0.055, 0.04, dark, x, 1.29, front + 0.05),
        roundedBox(0.5, 0.055, 0.04, dark, x, 0.77, front + 0.05),
        roundedBox(0.055, 0.55, 0.04, dark, x - 0.25, 1.03, front + 0.05),
        roundedBox(0.055, 0.55, 0.04, dark, x + 0.25, 1.03, front + 0.05),
      );
      const pane = new Mesh(new PlaneGeometry(0.46, 0.48), glass);
      pane.position.set(x, 1.03, front + 0.05);
      face.add(pane);
    }
    face.add(roundedBox(0.18, 0.055, 0.04, dark, 0, 1.1, front + 0.05));
    glassesArms();
  } else if (id === 'bowtie') {
    const ribbon = standard(0xc8423b);
    face.add(roundedBox(0.13, 0.13, 0.09, ribbon, 0, 0.3, front + 0.05));
    for (const side of [-1, 1]) {
      const wing = roundedBox(0.22, 0.22, 0.06, ribbon, side * 0.17, 0.3, front + 0.03);
      wing.rotation.z = Math.PI / 4;
      wing.scale.x = 1.15;
      face.add(wing);
    }
  } else if (id === 'mustache') {
    for (const side of [-1, 1]) {
      const curl = roundedBox(0.34, 0.1, 0.05, dark, side * 0.18, 0.7, front + 0.03);
      curl.rotation.z = side * 0.28;
      face.add(curl);
      face.add(roundedBox(0.09, 0.12, 0.05, dark, side * 0.36, 0.8, front + 0.03));
    }
  }
  return face;
}

