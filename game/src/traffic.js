// traffic.js — AI traffic driving the street grid plus parked cars.
// Drivers follow their street to an intersection, then turn (or go straight),
// slow for the car ahead, and stop dead when the player stands in the way.
import * as THREE from "three";
import { Car, CAR_COLORS } from "./vehicles.js";
import { STREETS, nearestStreet } from "./city.js";

const LANE = 4.2;

export class TrafficCar {
  constructor(scene, city) {
    const horizontal = Math.random() < 0.5;
    const street = STREETS[Math.floor(Math.random() * STREETS.length)];
    const along = -230 + Math.random() * 460;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const x = horizontal ? along : street + dir * LANE;
    const z = horizontal ? street - dir * LANE : along;
    const heading = horizontal ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    this.car = new Car(scene, x, z, heading, color, "civilian");
    this.car.occupied = true;
    this.horizontal = horizontal;
    this.dir = dir;
    this.street = street;
    this.cruise = 10 + Math.random() * 5;
    this.turnCooldown = 0;
    this.stuck = 0;
    void city;
  }

  update(dt, world) {
    const car = this.car;
    if (car.dead) return;
    this.turnCooldown -= dt;
    // Desired heading along current street.
    let desired = this.horizontal ? (this.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (this.dir > 0 ? 0 : Math.PI);
    // Near an intersection, maybe turn onto the crossing street.
    const crossCoord = this.horizontal ? car.pos.x : car.pos.z;
    const crossStreet = nearestStreet(crossCoord);
    const distToCross = Math.abs(crossStreet - crossCoord);
    if (distToCross < 2.2 && this.turnCooldown <= 0) {
      const roll = Math.random();
      if (roll < 0.42) {
        // Turn: new street is the crossing one, direction chosen by lane side.
        this.horizontal = !this.horizontal;
        this.street = crossStreet;
        this.dir = Math.random() < 0.5 ? 1 : -1;
        this.turnCooldown = 3;
        // Snap into the new lane.
        if (this.horizontal) car.pos.z = this.street - this.dir * LANE;
        else car.pos.x = this.street + this.dir * LANE;
        desired = this.horizontal ? (this.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (this.dir > 0 ? 0 : Math.PI);
      } else {
        this.turnCooldown = 1.2;
      }
    }
    // Steer toward desired heading smoothly.
    let diff = desired - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2.2));
    // Hold the lane centre on straights.
    const laneError = this.horizontal ? (this.street - this.dir * LANE) - car.pos.z : car.pos.x - (this.street + this.dir * LANE);
    const laneSteer = Math.max(-0.5, Math.min(0.5, laneError * 0.12)) * (this.horizontal ? 1 : -1) * this.dir;

    // Slow for obstacles ahead: cars and the player on foot.
    let targetSpeed = this.cruise;
    const fwd = car.forward();
    const ahead = (o, range, width) => {
      const dx = o.pos.x - car.pos.x;
      const dz = o.pos.z - car.pos.z;
      const along = dx * fwd.x + dz * fwd.z;
      const side = Math.abs(dx * fwd.z - dz * fwd.x);
      return along > 0 && along < range && side < width;
    };
    for (const other of world.allCars()) {
      if (other === car) continue;
      if (ahead(other, 9, 2.4)) { targetSpeed = Math.min(targetSpeed, Math.max(0, Math.abs(other.speed)) * 0.8); break; }
    }
    if (world.player && !world.player.driving && ahead(world.player, 8, 2.2)) targetSpeed = 0;
    for (const ped of world.pedestrians.list) {
      if (ped.state !== "down" && ped.state !== "driver" && ahead(ped, 7, 2)) { targetSpeed = 0; break; }
    }
    let throttle = 0;
    if (car.speed < targetSpeed) throttle = 0.55;
    else if (car.speed > targetSpeed + 1) throttle = -0.5;
    const impact = car.drive(dt, throttle, steer + laneSteer * 0.4, false, world.city, world.allCars());
    if (impact > 7) world.onTrafficCrash(car, impact);
    // Despawn far wrecks' drivers logic lives elsewhere; keep traffic in bounds.
    if (Math.abs(car.pos.x) > 246 || Math.abs(car.pos.z) > 246) {
      this.dir *= -1;
    }
    this.stuck = Math.abs(car.speed) < 0.4 && targetSpeed > 2 ? this.stuck + dt : 0;
    if (this.stuck > 5) {
      // Nudge around a jam: reverse briefly.
      car.drive(dt, -0.7, -steer, false, world.city, world.allCars());
      if (this.stuck > 6.4) this.stuck = 0;
    }
  }
}

export class TrafficSystem {
  constructor(scene, city) {
    this.drivers = [];
    this.parked = [];
    for (let i = 0; i < 15; i++) this.drivers.push(new TrafficCar(scene, city));
    // Parked cars along kerbs, ready to be borrowed.
    const randSpots = [];
    for (const s of STREETS) {
      for (let d = -220; d < 230; d += 46) randSpots.push([s, d]);
    }
    let placed = 0;
    for (const [s, d] of randSpots) {
      if (placed >= 16) break;
      if (Math.random() < 0.4) continue;
      const horizontal = Math.random() < 0.5;
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = horizontal ? d + (Math.random() - 0.5) * 14 : s + side * 7.4;
      const z = horizontal ? s + side * 7.4 : d + (Math.random() - 0.5) * 14;
      if (Math.abs(x) > 240 || Math.abs(z) > 240) continue;
      const heading = horizontal ? Math.PI / 2 : 0;
      const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
      const car = new Car(scene, x, z, heading, color, "civilian");
      this.parked.push(car);
      placed++;
    }
    // One reliable starter car near the spawn plaza, always present.
    const starter = new Car(scene, 52, 14, Math.PI / 2, 0x2e7fa8, "civilian");
    this.parked.push(starter);
  }

  update(dt, world) {
    for (const driver of this.drivers) driver.update(dt, world);
    for (const car of this.parked) car.updateEffects(dt);
  }

  movingCars() {
    return this.drivers.map((d) => d.car);
  }
}
