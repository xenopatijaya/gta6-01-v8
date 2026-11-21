// player.js — Rafe Delgado on foot: WASD movement relative to the camera,
// mouse-look (pointer lock, with drag fallback), sprint, jump, and the
// third-person / chase cameras for both modes.
import * as THREE from "three";
import { buildPersonMesh } from "./pedestrians.js";

export class Player {
  constructor(scene) {
    this.mesh = buildPersonMesh(0x2456a8, 0xc98d5f);
    this.pos = this.mesh.position;
    this.pos.set(44, 0, 44);
    this.heading = Math.PI * 0.75;
    this.velY = 0;
    this.grounded = true;
    this.health = 100;
    this.armor = 0;
    this.driving = null; // Car or null
    this.walkPhase = 0;
    this.yaw = Math.PI * 0.75;
    this.pitch = 0.32;
    this.shake = 0;
    scene.add(this.mesh);
  }

  get alive() {
    return this.health > 0;
  }

  respawn(atPos, armorLevel) {
    this.health = 100;
    this.armor = armorLevel * 25;
    this.driving = null;
    this.mesh.visible = true;
    this.pos.copy(atPos);
    this.velY = 0;
  }

  hurt(amount) {
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, amount * 0.65);
      this.armor -= absorbed;
      amount -= absorbed;
    }
    this.health = Math.max(0, this.health - amount);
  }

  heal(amount) {
    this.health = Math.min(100, this.health + amount);
  }

  updateOnFoot(dt, input, city) {
    const sprint = input.keys.has("shift") ? 1.65 : 1;
    const speedBase = 5.4 * sprint;
    let mx = 0, mz = 0;
    if (input.keys.has("w")) mz += 1;
    if (input.keys.has("s")) mz -= 1;
    if (input.keys.has("a")) mx -= 1;
    if (input.keys.has("d")) mx += 1;
    const moving = mx !== 0 || mz !== 0;
    if (moving) {
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      const wx = mx * cos - mz * sin;
      const wz = -mx * sin - mz * cos;
      // Camera forward is (-sin yaw, -cos yaw) in world XZ for our rig below;
      // movement uses the same basis so W always walks away from camera.
      const fx = -sin, fz = -cos;
      const rx = cos, rz = -sin;
      const moveX = fx * mz + rx * mx;
      const moveZ = fz * mz + rz * mx;
      void wx; void wz;
      this.pos.x += moveX * speedBase * dt;
      this.pos.z += moveZ * speedBase * dt;
      this.heading = Math.atan2(moveX, moveZ);
      this.walkPhase += dt * speedBase * 2.2;
    }
    if (input.keys.has(" ") && this.grounded) {
      this.velY = 7.6;
      this.grounded = false;
      input.keys.delete(" ");
    }
    if (!this.grounded) {
      this.velY -= 22 * dt;
      this.pos.y += this.velY * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.grounded = true; this.velY = 0; }
    }
    city.collide(this.pos, 0.45);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    const parts = this.mesh.userData.parts;
    const swing = moving ? Math.sin(this.walkPhase) * 0.55 : 0;
    parts.armL.rotation.x = swing;
    parts.armR.rotation.x = -swing;
    parts.legs.rotation.x = moving ? Math.sin(this.walkPhase) * 0.22 : 0;
    this.speedNow = moving ? speedBase : 0;
  }

  updateCamera(dt, camera, input) {
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const shakeX = (Math.random() - 0.5) * this.shake * 0.5;
    const shakeY = (Math.random() - 0.5) * this.shake * 0.5;
    if (this.driving) {
      const car = this.driving;
      const back = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
      const target = car.pos.clone()
        .addScaledVector(back, -10.5)
        .add(new THREE.Vector3(0, 4.4, 0));
      camera.position.lerp(target, Math.min(1, dt * 5.5));
      camera.position.x += shakeX;
      camera.position.y += shakeY;
      const look = car.pos.clone().addScaledVector(back, 8).add(new THREE.Vector3(0, 1.4, 0));
      camera.lookAt(look);
      this.yaw = car.heading + Math.PI;
    } else {
      const dist = 8.5;
      const cx = this.pos.x + Math.sin(this.yaw) * Math.cos(this.pitch) * dist;
      const cz = this.pos.z + Math.cos(this.yaw) * Math.cos(this.pitch) * dist;
      const cy = this.pos.y + 2 + Math.sin(this.pitch) * dist;
      camera.position.set(cx + shakeX, cy + shakeY, cz);
      camera.lookAt(this.pos.x, this.pos.y + 1.6, this.pos.z);
    }
  }

  aimDirection() {
    // Shots travel from the player toward the camera's forward line.
    return new THREE.Vector3(-Math.sin(this.yaw), 0.12, -Math.cos(this.yaw)).normalize();
  }
}
