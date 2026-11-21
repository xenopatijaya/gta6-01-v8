// pedestrians.js — sidewalk walkers for Aurelia Bay. They stroll between
// corners, panic and flee from gunfire, fights and fast cars, and can be
// knocked down (which the wanted system hears about).
import * as THREE from "three";
import { STREETS, ROAD_HALF } from "./city.js";

const SHIRTS = [0xf2f2f2, 0xe86a5a, 0x5a9ee8, 0xf2c14e, 0x7ac74f, 0xb678d8, 0xef8fb8, 0x4ec2b8];
const SKINS = [0xf2c89b, 0xc98d5f, 0x8a5a33, 0x6e4226, 0xffdbac];

export function buildPersonMesh(shirt, skin) {
  const group = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.8, 0.3), mat(0x2c3242));
  legs.position.y = 0.4;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), mat(shirt));
  torso.position.y = 1.16;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.4), mat(skin));
  head.position.y = 1.76;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.66, 0.2), mat(shirt));
  armL.position.set(-0.4, 1.14, 0);
  const armR = armL.clone();
  armR.position.x = 0.4;
  group.add(legs, torso, head, armL, armR);
  group.userData.parts = { legs, armL, armR };
  return group;
}

export class Pedestrian {
  constructor(scene, x, z) {
    this.shirt = SHIRTS[Math.floor(Math.random() * SHIRTS.length)];
    this.skin = SKINS[Math.floor(Math.random() * SKINS.length)];
    this.mesh = buildPersonMesh(this.shirt, this.skin);
    this.pos = this.mesh.position;
    this.pos.set(x, 0, z);
    this.heading = Math.random() * Math.PI * 2;
    this.speed = 0;
    this.walkSpeed = 1.1 + Math.random() * 0.9;
    this.health = 100;
    this.state = "walk"; // walk | flee | down | driver | ejected
    this.panic = 0;
    this.walkPhase = Math.random() * 6;
    this.target = null;
    this.retarget = 0;
    scene.add(this.mesh);
  }

  pickTarget() {
    // Walk along sidewalks: pick a random street corner-ish point.
    const sx = STREETS[Math.floor(Math.random() * STREETS.length)];
    const sz = STREETS[Math.floor(Math.random() * STREETS.length)];
    const sideX = Math.random() < 0.5 ? -1 : 1;
    const sideZ = Math.random() < 0.5 ? -1 : 1;
    this.target = Math.random() < 0.5
      ? { x: sx + sideX * (ROAD_HALF + 2.2), z: sz + (Math.random() - 0.5) * 60 }
      : { x: sx + (Math.random() - 0.5) * 60, z: sz + sideZ * (ROAD_HALF + 2.2) };
  }

  scare(fromPos, seconds = 4) {
    if (this.state === "down" || this.state === "driver") return;
    this.state = "flee";
    this.panic = seconds;
    const dx = this.pos.x - fromPos.x;
    const dz = this.pos.z - fromPos.z;
    this.heading = Math.atan2(dx, dz);
  }

  knockDown(damage) {
    this.health -= damage;
    if (this.health <= 0 && this.state !== "down") {
      this.state = "down";
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.25;
      return true; // newly downed
    }
    return false;
  }

  update(dt, city, threats) {
    if (this.state === "down" || this.state === "driver") return;
    // Sense threats: a fast nearby car or a recent scare source.
    for (const t of threats) {
      const dx = this.pos.x - t.pos.x;
      const dz = this.pos.z - t.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 30 && Math.abs(t.speed || 0) > 9) this.scare(t.pos, 2.5);
    }
    let speed = 0;
    if (this.state === "flee") {
      this.panic -= dt;
      speed = 4.4;
      if (this.panic <= 0) { this.state = "walk"; this.target = null; }
    } else {
      this.retarget -= dt;
      if (!this.target || this.retarget <= 0) {
        this.pickTarget();
        this.retarget = 9 + Math.random() * 8;
      }
      const dx = this.target.x - this.pos.x;
      const dz = this.target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.2) { this.target = null; }
      else {
        this.heading = Math.atan2(dx, dz);
        speed = this.walkSpeed;
      }
    }
    this.speed = speed;
    if (speed > 0) {
      this.pos.x += Math.sin(this.heading) * speed * dt;
      this.pos.z += Math.cos(this.heading) * speed * dt;
      city.collide(this.pos, 0.35);
      this.walkPhase += dt * speed * 3.4;
    }
    this.mesh.rotation.y = this.heading;
    const parts = this.mesh.userData.parts;
    const swing = Math.sin(this.walkPhase) * (speed > 3 ? 0.7 : 0.4);
    parts.armL.rotation.x = swing;
    parts.armR.rotation.x = -swing;
    parts.legs.rotation.x = Math.sin(this.walkPhase) * 0.18;
  }
}

export class PedestrianSystem {
  constructor(scene, city, count = 42) {
    this.list = [];
    for (let i = 0; i < count; i++) {
      const sx = STREETS[Math.floor(Math.random() * STREETS.length)];
      const sz = STREETS[Math.floor(Math.random() * STREETS.length)];
      const ped = new Pedestrian(scene, sx + (Math.random() - 0.5) * 90, sz + (ROAD_HALF + 2.4) * (Math.random() < 0.5 ? -1 : 1));
      city.collide(ped.pos, 0.4);
      this.list.push(ped);
    }
  }

  scareAll(fromPos, radius = 22) {
    for (const ped of this.list) {
      if (ped.pos.distanceTo(fromPos) < radius) ped.scare(fromPos, 4);
    }
  }

  update(dt, city, threats) {
    for (const ped of this.list) ped.update(dt, city, threats);
  }
}
