// police.js — the Aurelia Bay PD: wanted stars, interceptor cars that chase
// and ram, foot officers at high heat, roadblocks from 3 stars, and a
// helicopter with a sweeping searchlight at 4 stars and up.
import * as THREE from "three";
import { Car } from "./vehicles.js";
import { buildPersonMesh } from "./pedestrians.js";
import { STREETS } from "./city.js";

export const CRIME_HEAT = {
  carTheft: 1,
  carjack: 1.4,
  crashCar: 0.45,
  crashPed: 1.6,
  pedDown: 1.8,
  assault: 0.9,
  shots: 0.8,
  officerDown: 2.2,
  mission: 1,
};

export class PoliceSystem {
  constructor(scene) {
    this.scene = scene;
    this.heat = 0; // 0..5 float; stars = floor
    this.cars = [];
    this.officers = [];
    this.blocks = [];
    this.heli = null;
    this.heliLight = null;
    this.hideTimer = 0;
    this.spawnTimer = 0;
    this.bustTimer = 0;
    this.seenTimer = 0;
  }

  get stars() {
    return Math.max(0, Math.min(5, Math.floor(this.heat)));
  }

  addHeat(amount) {
    this.heat = Math.min(5.6, this.heat + amount);
  }

  clearWanted() {
    this.heat = 0;
    this.hideTimer = 0;
    this.bustTimer = 0;
  }

  desiredCars() {
    return [0, 1, 2, 3, 4, 4][this.stars] || 0;
  }

  desiredOfficers() {
    return this.stars >= 3 ? (this.stars - 2) * 2 : 0;
  }

  spawnCar(world) {
    const player = world.player;
    const angle = Math.random() * Math.PI * 2;
    const dist = 65 + Math.random() * 25;
    const x = Math.max(-240, Math.min(240, player.pos.x + Math.sin(angle) * dist));
    const z = Math.max(-240, Math.min(228, player.pos.z + Math.cos(angle) * dist));
    const car = new Car(this.scene, x, z, Math.atan2(player.pos.x - x, player.pos.z - z), 0x1c2733, "police");
    car.maxSpeedBase = 38;
    car.occupied = true;
    this.cars.push(car);
  }

  spawnOfficer(world) {
    const player = world.player;
    const angle = Math.random() * Math.PI * 2;
    const mesh = buildPersonMesh(0x24344d, 0xc98d5f);
    const officer = {
      mesh,
      pos: mesh.position,
      health: 100,
      down: false,
      heading: 0,
      shootTimer: 1 + Math.random(),
      walkPhase: Math.random() * 6,
    };
    officer.pos.set(
      Math.max(-245, Math.min(245, player.pos.x + Math.sin(angle) * 34)),
      0,
      Math.max(-245, Math.min(232, player.pos.z + Math.cos(angle) * 34))
    );
    this.scene.add(mesh);
    this.officers.push(officer);
  }

  hurtOfficer(officer, damage, world) {
    officer.health -= damage;
    if (officer.health <= 0 && !officer.down) {
      officer.down = true;
      officer.mesh.rotation.x = -Math.PI / 2;
      officer.mesh.position.y = 0.25;
      world.onCrime("officerDown", officer.pos);
    }
  }

  buildRoadblocks(world) {
    // Barricade cars across the street ahead of the player.
    this.clearRoadblocks();
    const player = world.player;
    const ahead = player.driving
      ? player.driving.pos.clone().addScaledVector(player.driving.forward(), 55)
      : player.pos.clone().add(new THREE.Vector3(0, 0, 40));
    const streetX = STREETS.reduce((a, b) => (Math.abs(b - ahead.x) < Math.abs(a - ahead.x) ? b : a), STREETS[0]);
    for (let i = 0; i < 3; i++) {
      const car = new Car(this.scene, streetX - 6 + i * 6, ahead.z, Math.PI / 2 + (Math.random() - 0.5) * 0.3, 0x1c2733, "police");
      car.occupied = true;
      this.blocks.push(car);
    }
    void world;
  }

  clearRoadblocks() {
    for (const car of this.blocks) car.removeFrom(this.scene);
    this.blocks = [];
  }

  ensureHelicopter() {
    if (this.heli) return;
    const group = new THREE.Group();
    const mat = (c, e = 0x000000) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2, 6.4), mat(0x24344d));
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 5.4), mat(0x24344d));
    tail.position.set(0, 0.3, -5.4);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 0.7), mat(0x16181c));
    rotor.position.y = 1.5;
    const lampMesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff6c8 }));
    lampMesh.position.set(0, -1.2, 1.6);
    group.add(body, tail, rotor, lampMesh);
    group.userData.rotor = rotor;
    this.scene.add(group);
    const spot = new THREE.SpotLight(0xfff2b0, 2.6, 130, 0.32, 0.5);
    this.scene.add(spot);
    this.scene.add(spot.target);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(9, 34, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffeeb0, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false })
    );
    this.scene.add(cone);
    this.heli = group;
    this.heliLight = spot;
    this.heliCone = cone;
    this.heliAngle = 0;
  }

  dropHelicopter() {
    if (!this.heli) return;
    this.scene.remove(this.heli, this.heliLight, this.heliLight.target, this.heliCone);
    this.heli = null;
    this.heliLight = null;
    this.heliCone = null;
  }

  // Can any unit currently see the player?
  playerSeen(world) {
    const player = world.player;
    let seen = false;
    const check = (pos, range) => {
      if (pos.distanceTo(player.pos) < range) seen = true;
    };
    for (const car of this.cars) check(car.pos, 46);
    for (const officer of this.officers) if (!officer.down) check(officer.pos, 30);
    if (this.heli) check(this.heli.position, 999); // the eye in the sky always sees
    return seen;
  }

  update(dt, world) {
    const player = world.player;
    const stars = this.stars;
    if (stars === 0) {
      // Everyone stands down and drifts away.
      for (const car of this.cars) car.drive(dt, 0.3, 0, false, world.city, world.allCars());
      if (this.cars.length && this.cars[0].pos.distanceTo(player.pos) > 90) {
        for (const car of this.cars) car.removeFrom(this.scene);
        this.cars = [];
        for (const o of this.officers) this.scene.remove(o.mesh);
        this.officers = [];
        this.clearRoadblocks();
      }
      this.dropHelicopter();
      world.audio.setSiren(false, dt);
      return;
    }

    const seen = this.playerSeen(world);
    if (seen) {
      this.hideTimer = 0;
      this.seenTimer += dt;
    } else {
      this.hideTimer += dt;
      const decayAfter = 6;
      if (this.hideTimer > decayAfter) {
        this.heat = Math.max(0, this.heat - dt * 0.14);
      }
    }

    // Dispatch.
    this.spawnTimer -= dt;
    if (this.cars.length < this.desiredCars() && this.spawnTimer <= 0) {
      this.spawnCar(world);
      this.spawnTimer = 2.5;
    }
    if (this.officers.length < this.desiredOfficers() && this.spawnTimer <= 0) {
      this.spawnOfficer(world);
      this.spawnTimer = 2;
    }
    if (stars >= 3 && this.blocks.length === 0) this.buildRoadblocks(world);
    if (stars < 3 && this.blocks.length) this.clearRoadblocks();
    if (stars >= 4) this.ensureHelicopter();
    else this.dropHelicopter();

    // Interceptors: steer at the player, ram on contact.
    for (const car of this.cars) {
      if (car.dead) continue;
      const target = player.driving ? player.driving.pos : player.pos;
      const dx = target.x - car.pos.x;
      const dz = target.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      const desired = Math.atan2(dx, dz);
      let diff = desired - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 2.4));
      let throttle = 1;
      if (dist < 6 && Math.abs(diff) > 2.4) throttle = -0.8;
      const impact = car.drive(dt, throttle, steer, false, world.city, world.allCars());
      if (impact > 8) {
        world.onPlayerRam(car, impact);
      }
    }
    for (const car of this.blocks) car.updateEffects(dt);

    // Foot officers: close in on foot, fire when in range.
    for (const officer of this.officers) {
      if (officer.down) continue;
      const dx = player.pos.x - officer.pos.x;
      const dz = player.pos.z - officer.pos.z;
      const dist = Math.hypot(dx, dz);
      officer.heading = Math.atan2(dx, dz);
      officer.mesh.rotation.y = officer.heading;
      if (dist > 13) {
        officer.pos.x += Math.sin(officer.heading) * 3.6 * dt;
        officer.pos.z += Math.cos(officer.heading) * 3.6 * dt;
        world.city.collide(officer.pos, 0.4);
        officer.walkPhase += dt * 8;
        const parts = officer.mesh.userData.parts;
        parts.armL.rotation.x = Math.sin(officer.walkPhase) * 0.5;
        parts.armR.rotation.x = -Math.sin(officer.walkPhase) * 0.5;
      } else if (!player.driving) {
        officer.shootTimer -= dt;
        if (officer.shootTimer <= 0) {
          officer.shootTimer = 0.8 + Math.random() * 0.7;
          if (Math.random() < 0.55) {
            player.hurt(4 + Math.random() * 5);
            world.onPlayerShot();
          }
        }
      }
    }

    // Helicopter: circle the player, searchlight cone tracks the ground.
    if (this.heli) {
      this.heliAngle += dt * 0.45;
      const hx = player.pos.x + Math.sin(this.heliAngle) * 26;
      const hz = player.pos.z + Math.cos(this.heliAngle) * 26;
      this.heli.position.set(hx, 30, hz);
      this.heli.rotation.y = this.heliAngle + Math.PI;
      this.heli.userData.rotor.rotation.y += dt * 28;
      this.heliLight.position.copy(this.heli.position);
      this.heliLight.target.position.copy(player.pos);
      const cone = this.heliCone;
      cone.position.set((hx + player.pos.x) / 2, 15, (hz + player.pos.z) / 2);
      cone.lookAt(player.pos);
      cone.rotateX(-Math.PI / 2);
    }

    // Busted check: pinned at low speed with police close for a while.
    const pinned = player.driving
      ? Math.abs(player.driving.speed) < 1.6 && this.cars.some((c) => !c.dead && c.pos.distanceTo(player.pos) < 9)
      : this.officers.some((o) => !o.down && o.pos.distanceTo(player.pos) < 3.4) ||
        this.cars.some((c) => !c.dead && c.pos.distanceTo(player.pos) < 6);
    if (pinned && stars >= 1) {
      this.bustTimer += dt;
      if (this.bustTimer > 2.4) world.onBusted();
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
    }

    world.audio.setSiren(this.cars.some((c) => !c.dead && c.pos.distanceTo(player.pos) < 55), dt);
  }
}
