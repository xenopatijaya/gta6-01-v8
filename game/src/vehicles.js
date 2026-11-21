// vehicles.js — car models, arcade driving physics, damage and wrecks.
// One Car class serves the player's ride, traffic, police and racers; the
// controllers live in their own modules and steer through the same inputs.
import * as THREE from "three";

export const CAR_COLORS = [0xd84f3f, 0x2e7fa8, 0xf2b13f, 0x3f9e58, 0xfdf3e3, 0x8a5fb8, 0x333a44, 0xe87fb0, 0x53c2c9];

const boxGeoCache = new Map();
function boxGeo(w, h, d) {
  const key = `${w}|${h}|${d}`;
  if (!boxGeoCache.has(key)) boxGeoCache.set(key, new THREE.BoxGeometry(w, h, d));
  return boxGeoCache.get(key);
}

function part(w, h, d, color, x, y, z, emissive = 0x000000) {
  const m = new THREE.Mesh(boxGeo(w, h, d), new THREE.MeshLambertMaterial({ color, emissive }));
  m.position.set(x, y, z);
  return m;
}

export function buildCarMesh(color, kind = "civilian") {
  const group = new THREE.Group();
  const body = part(2, 0.62, 4.3, color, 0, 0.62, 0);
  const nose = part(1.9, 0.4, 0.9, color, 0, 0.5, 2.3);
  const cabin = part(1.7, 0.58, 2.1, 0x22303e, 0, 1.18, -0.25, 0x0a141e);
  group.add(body, nose, cabin);
  if (kind === "police") {
    group.add(part(2.02, 0.5, 2.2, 0xf4f6f8, 0, 0.66, -0.4));
    group.add(part(1.2, 0.22, 0.5, 0x2456c8, 0, 1.58, -0.25, 0x102a66));
    group.add(part(0.5, 0.22, 0.5, 0xd83a3a, -0.65, 1.58, -0.25, 0x661010));
    group.children[0].material = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
  }
  if (kind === "racer") {
    group.add(part(1.9, 0.16, 0.5, 0x222222, 0, 1.05, -2.2));
    group.add(part(0.18, 0.4, 0.4, 0x222222, -0.8, 0.82, -2.2));
    group.add(part(0.18, 0.4, 0.4, 0x222222, 0.8, 0.82, -2.2));
  }
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x16181c });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.42, wz);
    group.add(wheel);
    wheels.push(wheel);
  }
  // Headlight glow cones (cheap sprites of light): two small emissive discs.
  const hl = part(0.34, 0.2, 0.06, 0xfff2b0, -0.6, 0.62, 2.76, 0x8a742a);
  const hr = part(0.34, 0.2, 0.06, 0xfff2b0, 0.6, 0.62, 2.76, 0x8a742a);
  const tl = part(0.34, 0.18, 0.06, 0xd83a3a, -0.6, 0.7, -2.16, 0x550d0d);
  const tr = part(0.34, 0.18, 0.06, 0xd83a3a, 0.6, 0.7, -2.16, 0x550d0d);
  group.add(hl, hr, tl, tr);
  group.userData.wheels = wheels;
  return group;
}

export class Car {
  constructor(scene, x, z, heading, color, kind = "civilian") {
    this.kind = kind;
    this.color = color;
    this.mesh = buildCarMesh(color, kind);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    this.pos = this.mesh.position;
    this.heading = heading;
    this.speed = 0; // signed, units/s along heading
    this.steer = 0;
    this.health = 100;
    this.dead = false;
    this.occupied = false; // has a driver (traffic) or the player
    this.driver = null; // pedestrian object when an NPC drives
    this.smokeTimer = 0;
    this.burnTimer = 0;
    this.maxSpeedBase = 34;
    this.engineLevel = 0;
    scene.add(this.mesh);
  }

  get maxSpeed() {
    return this.maxSpeedBase * (1 + this.engineLevel * 0.16);
  }

  forward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  // Arcade step: throttle -1..1, steer -1..1. Returns impact speed if a wall
  // or car stopped us this frame, else 0.
  drive(dt, throttle, steer, handbrake, city, others) {
    if (this.dead) { this.speed = 0; return 0; }
    const accel = throttle > 0 ? 17 : throttle < 0 ? (this.speed > 0.5 ? -26 : -10) : 0;
    this.speed += accel * dt * (throttle > 0 ? (1 - Math.max(0, this.speed) / this.maxSpeed) : 1);
    const drag = handbrake ? 2.6 : 0.55;
    this.speed -= this.speed * drag * dt * 0.4;
    if (throttle === 0 && !handbrake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 3.2 * dt);
    const topReverse = -11;
    this.speed = Math.max(topReverse, Math.min(this.maxSpeed, this.speed));
    this.steer += ((steer || 0) - this.steer) * Math.min(1, dt * 8);
    const steerAuthority = Math.min(1, Math.abs(this.speed) / 9) * (handbrake ? 1.5 : 1);
    this.heading -= this.steer * steerAuthority * dt * 1.55 * Math.sign(this.speed || 1);
    const fwd = this.forward();
    const before = this.pos.clone();
    this.pos.addScaledVector(fwd, this.speed * dt);
    let impact = 0;
    const probe = this.pos.clone().addScaledVector(fwd, 1.7);
    const px = probe.x, pz = probe.z;
    city.collide(probe, 0.4);
    if (Math.abs(probe.x - px) > 0.01 || Math.abs(probe.z - pz) > 0.01) {
      impact = Math.abs(this.speed);
      this.pos.copy(before);
      this.speed = -this.speed * 0.25;
    }
    city.collide(this.pos, 1.2);
    // Car-to-car: simple circle push-out.
    for (const other of others) {
      if (other === this || other.dead && false) continue;
      const dx = this.pos.x - other.pos.x;
      const dz = this.pos.z - other.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 12.5 && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (3.55 - d) / 2;
        const nx = dx / d, nz = dz / d;
        this.pos.x += nx * push; this.pos.z += nz * push;
        other.pos.x -= nx * push; other.pos.z -= nz * push;
        const rel = Math.abs(this.speed - other.speed);
        if (rel > 4) {
          impact = Math.max(impact, rel);
          this.damage(rel * 1.4);
          other.damage(rel * 1.1);
          const swap = this.speed;
          this.speed = other.speed * 0.6;
          other.speed = swap * 0.6 + Math.sign(other.speed || 1) * 1.5;
        }
      }
    }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    const roll = -this.steer * Math.min(0.09, Math.abs(this.speed) * 0.004);
    this.mesh.rotation.z = roll;
    for (const wheel of this.mesh.userData.wheels) wheel.rotation.x += (this.speed * dt) / 0.42;
    this.updateEffects(dt);
    return impact;
  }

  damage(amount) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.speed = 0;
      this.burnTimer = 6;
      this.mesh.children[0].material = new THREE.MeshLambertMaterial({ color: 0x232323, emissive: 0x992200 });
    }
  }

  repair() {
    this.health = 100;
    this.dead = false;
    this.burnTimer = 0;
    this.mesh.children[0].material = new THREE.MeshLambertMaterial({
      color: this.kind === "police" ? 0x1c2733 : this.color,
    });
  }

  repaint(color) {
    this.color = color;
    if (this.kind !== "police") {
      this.mesh.children[0].material = new THREE.MeshLambertMaterial({ color });
      this.mesh.children[1].material = new THREE.MeshLambertMaterial({ color });
    }
  }

  updateEffects(dt) {
    // Smoke puffs above a hurt engine, flames on a fresh wreck.
    this.smokeTimer -= dt;
    const hurt = this.health < 45 && !this.dead;
    const burning = this.dead && this.burnTimer > 0;
    if ((hurt || burning) && this.smokeTimer <= 0) {
      this.smokeTimer = burning ? 0.05 : 0.16;
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(burning ? 0.55 : 0.4, 6, 6),
        new THREE.MeshLambertMaterial({ color: burning ? 0xff7a2a : 0x555a60, emissive: burning ? 0xa83c00 : 0x111111, transparent: true, opacity: 0.85 })
      );
      puff.position.copy(this.pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 1.2, 0.8));
      puff.userData.life = burning ? 0.7 : 1.3;
      puff.userData.rise = 2.4;
      this.mesh.parent.add(puff);
      (this.mesh.parent.userData.fx ??= []).push(puff);
    }
    if (burning) this.burnTimer -= dt;
  }

  removeFrom(scene) {
    scene.remove(this.mesh);
  }
}

// Shared floating effects (smoke/fire puffs) update.
export function updateFx(scene, dt) {
  const fx = scene.userData.fx;
  if (!fx) return;
  for (let i = fx.length - 1; i >= 0; i--) {
    const puff = fx[i];
    puff.userData.life -= dt;
    puff.position.y += puff.userData.rise * dt;
    puff.scale.multiplyScalar(1 + dt * 0.9);
    if (puff.material) puff.material.opacity = Math.max(0, puff.userData.life);
    if (puff.userData.life <= 0) {
      scene.remove(puff);
      fx.splice(i, 1);
    }
  }
}
