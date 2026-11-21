// city.js — builds Aurelia Bay: a 7x7 street grid at golden hour, a beach and
// water along the south edge, palm trees, pastel-and-glass buildings with lit
// windows, and the landmarks (lighthouse, marina pier, clock tower, garage).
import * as THREE from "three";

export const STREETS = [-210, -140, -70, 0, 70, 140, 210];
export const ROAD_HALF = 9; // half width of a road
export const WORLD_EDGE = 252; // playable ground half-extent
export const BEACH_Z = 238; // sand starts here, water beyond

const PASTELS = [0xf6c390, 0xf2a7a0, 0xa8d8c8, 0x9fc6e8, 0xf7e3a1, 0xd9b8e6, 0xfdf3e3, 0x8fd0d8];
const GLASS = [0x7fb6c9, 0x5f93b8, 0x8fb8a8, 0x6f7fb8];

// Building facades are painted once onto canvas textures (base colour plus a
// grid of windows, some lit warm for the golden hour). One textured box per
// tower replaces hundreds of individual window meshes.
function facadeTexture(baseHex, litRatio, rand) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  const base = `#${baseHex.toString(16).padStart(6, "0")}`;
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = "rgba(0,0,0,0.12)";
  g.fillRect(0, 0, 128, 10);
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 5; col++) {
      const lit = rand() < litRatio;
      g.fillStyle = lit ? "#ffe9a0" : "rgba(30,42,58,0.85)";
      g.fillRect(10 + col * 23, 16 + row * 20, 14, 11);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function mat(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

function box(w, h, d, color, x, y, z, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  mesh.position.set(x, y, z);
  return mesh;
}

// Deterministic pseudo-random so the city is identical on every load.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function nearestStreet(v) {
  let best = STREETS[0];
  for (const s of STREETS) if (Math.abs(s - v) < Math.abs(best - v)) best = s;
  return best;
}

export function onRoad(x, z) {
  if (z > BEACH_Z - 4) return false;
  for (const s of STREETS) {
    if (Math.abs(x - s) < ROAD_HALF || Math.abs(z - s) < ROAD_HALF) return true;
  }
  return false;
}

export class City {
  constructor(scene) {
    this.scene = scene;
    this.colliders = []; // {minX,maxX,minZ,maxZ} solid building AABBs
    this.palmPositions = [];
    this.build();
  }

  addCollider(x, z, hw, hd) {
    this.colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
  }

  collide(pos, radius) {
    for (const c of this.colliders) {
      if (pos.x > c.minX - radius && pos.x < c.maxX + radius && pos.z > c.minZ - radius && pos.z < c.maxZ + radius) {
        const pushLeft = pos.x - (c.minX - radius);
        const pushRight = c.maxX + radius - pos.x;
        const pushBack = pos.z - (c.minZ - radius);
        const pushFwd = c.maxZ + radius - pos.z;
        const min = Math.min(pushLeft, pushRight, pushBack, pushFwd);
        if (min === pushLeft) pos.x = c.minX - radius;
        else if (min === pushRight) pos.x = c.maxX + radius;
        else if (min === pushBack) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
    pos.x = Math.max(-WORLD_EDGE, Math.min(WORLD_EDGE, pos.x));
    pos.z = Math.max(-WORLD_EDGE, Math.min(BEACH_Z + 6, pos.z));
  }

  build() {
    const scene = this.scene;
    const rand = rng(20261124);

    // Sky, fog and golden-hour light.
    scene.fog = new THREE.Fog(0xf2b880, 180, 720);
    const skyGeo = new THREE.SphereGeometry(900, 16, 12);
    const skyMat = new THREE.MeshBasicMaterial({ color: 0xf7a95c, side: THREE.BackSide, fog: false });
    scene.add(new THREE.Mesh(skyGeo, skyMat));
    const sunBall = new THREE.Mesh(new THREE.SphereGeometry(26, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false }));
    sunBall.position.set(-420, 150, -520);
    scene.add(sunBall);
    scene.add(new THREE.HemisphereLight(0xffd9a0, 0x4a5a78, 0.95));
    const sun = new THREE.DirectionalLight(0xffbe78, 1.6);
    sun.position.set(-160, 220, -190);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.35);
    fill.position.set(140, 120, 200);
    scene.add(fill);

    // Ground: city slab, sand and sea.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_EDGE * 2 + 260, WORLD_EDGE * 2 + 260),
      mat(0x9aa08e));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    scene.add(ground);
    const sand = box(WORLD_EDGE * 2 + 200, 0.3, 46, 0xeed9a0, 0, 0.02, BEACH_Z + 18);
    scene.add(sand);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(1400, 420),
      new THREE.MeshLambertMaterial({ color: 0x2e7fa8, emissive: 0x0d3550 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.12, BEACH_Z + 46 + 190);
    scene.add(water);
    this.water = water;

    // Roads: dark strips along every street line, both directions.
    const roadMat = mat(0x3c3f46);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf7d774 });
    for (const s of STREETS) {
      const h = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_EDGE * 2, ROAD_HALF * 2), roadMat);
      h.rotation.x = -Math.PI / 2;
      h.position.set(0, 0.01, s);
      scene.add(h);
      const v = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, WORLD_EDGE * 2), roadMat);
      v.rotation.x = -Math.PI / 2;
      v.position.set(s, 0.011, 0);
      scene.add(v);
      // One continuous centre line per street: cheap and reads clearly.
      const lineH = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_EDGE * 2, 0.45), lineMat);
      lineH.rotation.x = -Math.PI / 2;
      lineH.position.set(0, 0.03, s);
      scene.add(lineH);
      const lineV = new THREE.Mesh(new THREE.PlaneGeometry(0.45, WORLD_EDGE * 2), lineMat);
      lineV.rotation.x = -Math.PI / 2;
      lineV.position.set(s, 0.031, 0);
      scene.add(lineV);
    }

    // Buildings: fill each block with 1-4 towers, skipping landmark blocks.
    const facades = [];
    for (const color of [...PASTELS, ...GLASS]) {
      facades.push(new THREE.MeshLambertMaterial({ map: facadeTexture(color, 0.42, rand) }));
    }
    for (let bi = 0; bi < STREETS.length - 1; bi++) {
      for (let bj = 0; bj < STREETS.length - 1; bj++) {
        const cx = (STREETS[bi] + STREETS[bi + 1]) / 2;
        const cz = (STREETS[bj] + STREETS[bj + 1]) / 2;
        if (cx === 35 && cz === 35) continue; // clock tower plaza
        if (cx === -175 && cz === 175) continue; // garage block
        const perBlock = 2 + Math.floor(rand() * 2);
        for (let k = 0; k < perBlock; k++) {
          const w = 13 + rand() * 12;
          const d = 13 + rand() * 12;
          const hgt = 14 + rand() * rand() * 52;
          const ox = (rand() - 0.5) * (52 - w);
          const oz = (rand() - 0.5) * (52 - d);
          const facade = facades[Math.floor(rand() * facades.length)];
          const tower = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), facade);
          tower.position.set(cx + ox, hgt / 2, cz + oz);
          scene.add(tower);
          const roof = box(w + 1.2, 1, d + 1.2, 0x8a6f5c, cx + ox, hgt + 0.5, cz + oz);
          scene.add(roof);
          this.addCollider(cx + ox, cz + oz, w / 2, d / 2);
        }
      }
    }

    this.buildLandmarks(rand);
    this.buildPalms(rand);
    this.buildProps(rand);
  }

  buildLandmarks(rand) {
    const scene = this.scene;
    // Clock tower on the central plaza.
    const plaza = box(46, 0.4, 46, 0xd8c9a8, 35, 0.2, 35);
    scene.add(plaza);
    const towerBase = box(9, 34, 9, 0xf2e3c2, 35, 17, 35);
    scene.add(towerBase);
    this.addCollider(35, 35, 4.5, 4.5);
    const clockFace = new THREE.Mesh(new THREE.CircleGeometry(3.4, 20),
      new THREE.MeshBasicMaterial({ color: 0xfff6d8 }));
    clockFace.position.set(35, 29, 39.6);
    scene.add(clockFace);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(5.4, 8, 4), mat(0xb8563f));
    spire.position.set(35, 38, 35);
    spire.rotation.y = Math.PI / 4;
    scene.add(spire);

    // Lighthouse at the south-east shore.
    const lhX = 218, lhZ = BEACH_Z + 6;
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(3.4 - i * 0.3, 3.7 - i * 0.3, 4.4, 12),
        mat(i % 2 ? 0xfdf3e3 : 0xd84f3f));
      seg.position.set(lhX, 2.2 + i * 4.4, lhZ);
      scene.add(seg);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.7, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xfff2a0 }));
    lamp.position.set(lhX, 24.4, lhZ);
    scene.add(lamp);
    const beam = new THREE.PointLight(0xffe9a0, 1.4, 90);
    beam.position.copy(lamp.position);
    scene.add(beam);
    this.addCollider(lhX, lhZ, 4, 4);

    // Marina pier reaching into the water, with moored boat hulls.
    const pier = box(10, 1, 74, 0x9a7a58, -140, 0.6, BEACH_Z + 40);
    scene.add(pier);
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1;
      const boat = box(4.4, 1.6, 10, PASTELS[Math.floor(rand() * PASTELS.length)],
        -140 + side * 9, 0.7, BEACH_Z + 16 + Math.floor(i / 2) * 22);
      scene.add(boat);
      const cabin = box(3, 1.6, 4, 0xfdf3e3, boat.position.x, 2.2, boat.position.z);
      scene.add(cabin);
    }

    // The garage: an open-front workshop block, north-west.
    const gX = -175, gZ = 175;
    const garage = new THREE.Group();
    const back = box(30, 9, 1.4, 0xe8b04a, 0, 4.5, -13);
    const left = box(1.4, 9, 27, 0xe8b04a, -15, 4.5, 0);
    const right = box(1.4, 9, 27, 0xe8b04a, 15, 4.5, 0);
    const roofG = box(32, 1.2, 29, 0x8a6f5c, 0, 9.4, 0);
    const sign = box(20, 2.6, 0.6, 0x2e7fa8, 0, 7.6, 13.4, { emissive: 0x1b4a63 });
    garage.add(back, left, right, roofG, sign);
    garage.position.set(gX, 0, gZ);
    garage.rotation.y = Math.PI; // opening faces the street at z=140 side
    scene.add(garage);
    this.addCollider(gX, gZ - 13, 15, 1.2);
    this.addCollider(gX - 15, gZ, 1.2, 13);
    this.addCollider(gX + 15, gZ, 1.2, 13);
    this.garagePos = new THREE.Vector3(gX, 0, gZ + 4);

    // Clinic (respawn point) near the centre-west.
    const clinic = box(22, 10, 16, 0xfdf3e3, -105, 5, -35);
    scene.add(clinic);
    const cross = box(2, 6, 0.5, 0xd84f3f, -105, 7, -26.6, { emissive: 0x5c1616 });
    scene.add(cross);
    const cross2 = box(6, 2, 0.5, 0xd84f3f, -105, 7, -26.6, { emissive: 0x5c1616 });
    scene.add(cross2);
    this.addCollider(-105, -35, 11, 8);
    this.clinicPos = new THREE.Vector3(-88, 0, -35);
  }

  buildPalms(rand) {
    const scene = this.scene;
    const trunkMat = mat(0x8a6f4d);
    const leafMat = mat(0x3f9e58);
    const spots = [];
    for (const s of STREETS) {
      for (let d = -WORLD_EDGE + 16; d < WORLD_EDGE; d += 55) {
        spots.push([s + ROAD_HALF + 3.4, d + (rand() - 0.5) * 8]);
        spots.push([d + (rand() - 0.5) * 8, s - ROAD_HALF - 3.4]);
      }
    }
    for (let x = -WORLD_EDGE + 10; x < WORLD_EDGE; x += 26) {
      spots.push([x, BEACH_Z + 6 + rand() * 8]);
    }
    for (const [x, z] of spots) {
      if (z > BEACH_Z + 14) continue;
      if (Math.abs(x) > WORLD_EDGE || Math.abs(z) > WORLD_EDGE) continue;
      const h = 6.5 + rand() * 2.5;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, h, 6), trunkMat);
      trunk.position.set(x, h / 2, z);
      trunk.rotation.z = (rand() - 0.5) * 0.14;
      scene.add(trunk);
      // One flattened, drooping cone reads as the whole palm crown.
      const crown = new THREE.Mesh(new THREE.ConeGeometry(3.1, 1.7, 7), leafMat);
      crown.position.set(x, h + 0.55, z);
      crown.rotation.x = Math.PI;
      scene.add(crown);
      this.palmPositions.push([x, z]);
    }
  }

  buildProps(rand) {
    const scene = this.scene;
    // Street lamps with warm glow bulbs along the avenues.
    const poleMat = mat(0x4a4f58);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    for (const s of STREETS) {
      for (let d = -WORLD_EDGE + 24; d < WORLD_EDGE; d += 84) {
        for (const off of [-1, 1]) {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 6.4, 5), poleMat);
          pole.position.set(s + off * (ROAD_HALF + 1.6), 3.2, d);
          scene.add(pole);
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 6, 6), bulbMat);
          bulb.position.set(s + off * (ROAD_HALF + 1.6), 6.6, d);
          scene.add(bulb);
          const pole2 = pole.clone();
          pole2.position.set(d, 3.2, s + off * (ROAD_HALF + 1.6));
          scene.add(pole2);
          const bulb2 = bulb.clone();
          bulb2.position.set(d, 6.6, s + off * (ROAD_HALF + 1.6));
          scene.add(bulb2);
        }
      }
    }
    // Benches and planters on the plaza and beach walk.
    for (let i = 0; i < 14; i++) {
      const x = -220 + rand() * 440;
      const z = BEACH_Z - 6 + rand() * 6;
      scene.add(box(3.4, 0.7, 1, 0x9a7a58, x, 0.35, z));
    }
    void rand;
  }

  update(dt, t) {
    if (this.water) this.water.position.y = 0.12 + Math.sin(t * 0.7) * 0.05;
  }
}
