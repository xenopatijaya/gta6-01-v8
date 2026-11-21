// activities.js — side content: two checkpoint street races against AI
// drivers, a repeatable parcel delivery job, and the tail-target car the
// story borrows for "Quiet Tail".
import * as THREE from "three";
import { Car } from "./vehicles.js";
import { makeMarker } from "./missions.js";

export const RACES = [
  {
    name: "Harbour Loop",
    reward: 500,
    start: [70, 210],
    checkpoints: [[140, 210], [210, 140], [210, 70], [140, 0], [70, -70], [0, 0], [-70, 70], [-70, 140], [0, 210], [70, 210]],
  },
  {
    name: "Neon Mile",
    reward: 750,
    start: [-210, -140],
    checkpoints: [[-140, -140], [-70, -70], [0, -70], [70, -140], [140, -70], [210, 0], [140, 70], [70, 70], [0, 140], [-70, 140], [-140, 70], [-210, -140]],
  },
];

export class Activities {
  constructor(scene, hud) {
    this.scene = scene;
    this.hud = hud;
    this.raceMarker = makeMarker(scene, 0x53c2c9);
    this.deliveryMarker = makeMarker(scene, 0x7ac74f);
    this.race = null; // {def, index, rivals:[{car, cp}], done, playerDone}
    this.delivery = null; // {at:[x,z], timer, phase}
    this.tailTarget = null;
    this.rivalSpawns = [[62, 196], [-196, -128]];
  }

  raceStartPos(index) {
    return RACES[index].start;
  }

  startRace(index, world, onDone) {
    const def = RACES[index];
    const rivals = [];
    for (let i = 0; i < 2; i++) {
      const car = new Car(this.scene, def.start[0] - 6 + i * 6, def.start[1] - 8, Math.PI, i === 0 ? 0xd84f3f : 0xf2b13f, "racer");
      car.maxSpeedBase = 31 + i * 1.5;
      car.occupied = true;
      rivals.push({ car, cp: 0 });
    }
    this.race = { def, index: 0, rivals, onDone, playerDone: false, rivalWon: false, countdown: 2 };
    this.showCheckpoint(0);
    this.hud.banner("RACE — " + def.name.toUpperCase(), "Follow the cyan rings. First to the last ring wins.", "#53c2c9");
    world.audio.objective();
  }

  showCheckpoint(i) {
    const race = this.race;
    if (!race || i >= race.def.checkpoints.length) {
      this.raceMarker.visible = false;
      return;
    }
    const [x, z] = race.def.checkpoints[i];
    this.raceMarker.position.set(x, 0, z);
    this.raceMarker.visible = true;
  }

  raceMarkerPos() {
    if (this.race && this.raceMarker.visible) {
      return { x: this.raceMarker.position.x, z: this.raceMarker.position.z };
    }
    return null;
  }

  updateRace(dt, world) {
    const race = this.race;
    if (!race) return;
    if (race.countdown > 0) {
      race.countdown -= dt;
      this.hud.setObjective(`Race starts in ${Math.ceil(race.countdown)}…`);
      return;
    }
    // Rivals chase their own checkpoint chain.
    for (const rival of race.rivals) {
      const car = rival.car;
      if (car.dead) continue;
      const target = race.def.checkpoints[Math.min(rival.cp, race.def.checkpoints.length - 1)];
      const dx = target[0] - car.pos.x;
      const dz = target[1] - car.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 9) rival.cp++;
      if (rival.cp >= race.def.checkpoints.length && !race.rivalWon && !race.playerDone) {
        race.rivalWon = true;
        this.endRace(world, false);
        return;
      }
      const desired = Math.atan2(dx, dz);
      let diff = desired - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 2.2));
      car.drive(dt, dist > 4 ? 0.9 : 0.3, steer, false, world.city, world.allCars());
    }
    // Player progress.
    const player = world.player;
    const cp = race.def.checkpoints[race.index];
    if (cp) {
      const dist = Math.hypot(player.pos.x - cp[0], player.pos.z - cp[1]);
      this.hud.setObjective(`Race: checkpoint ${race.index + 1}/${race.def.checkpoints.length} — ${Math.round(dist)} m`);
      if (dist < 10) {
        race.index++;
        world.audio.checkpoint();
        if (race.index >= race.def.checkpoints.length) {
          race.playerDone = true;
          this.endRace(world, true);
          return;
        }
        this.showCheckpoint(race.index);
      }
    }
  }

  endRace(world, won) {
    const race = this.race;
    if (!race) return;
    const onDone = race.onDone;
    for (const rival of race.rivals) rival.car.removeFrom(this.scene);
    this.race = null;
    this.raceMarker.visible = false;
    if (won) {
      world.earn(race.def.reward, "race");
      world.save.stats.racesWon++;
      this.hud.banner("RACE WON", `+${"$"}${race.def.reward} — ${race.def.name} is yours.`, "#7ac74f");
    } else if (onDone) {
      // Story race handles its own failure text.
    } else {
      this.hud.banner("RACE LOST", "The rivals took the line. Run it again from the start marker.", "#e86a5a");
    }
    if (onDone) onDone(won);
  }

  // --- Delivery side job -------------------------------------------------
  startDelivery(world) {
    const spots = [[-210, 0], [140, -140], [210, 210], [-70, -210], [0, 140], [210, -70]];
    const at = spots[Math.floor(Math.random() * spots.length)];
    this.delivery = { at, timer: 75, phase: "deliver" };
    this.deliveryMarker.position.set(at[0], 0, at[1]);
    this.deliveryMarker.visible = true;
    this.hud.banner("PARCEL RUN", "Deliver the parcel before the timer dies. $220 on drop-off.", "#7ac74f");
    world.audio.objective();
  }

  deliveryPos() {
    return this.delivery ? { x: this.delivery.at[0], z: this.delivery.at[1] } : null;
  }

  updateDelivery(dt, world) {
    const job = this.delivery;
    if (!job) return;
    job.timer -= dt;
    const dist = Math.hypot(world.player.pos.x - job.at[0], world.player.pos.z - job.at[1]);
    this.hud.setObjective(`Parcel run — ${Math.round(dist)} m · ${Math.max(0, Math.ceil(job.timer))} s`);
    if (dist < 7) {
      this.delivery = null;
      this.deliveryMarker.visible = false;
      world.save.stats.deliveries++;
      world.earn(220, "job");
      this.hud.banner("DELIVERED", "+$220. Ines always needs parcels moved — the green marker pays again.", "#7ac74f");
      world.audio.cash();
    } else if (job.timer <= 0) {
      this.delivery = null;
      this.deliveryMarker.visible = false;
      this.hud.banner("PARCEL LATE", "The client refused the drop. No pay this time.", "#e86a5a");
    }
  }

  // --- Tail target for the story -----------------------------------------
  startTail(world) {
    const car = new Car(this.scene, -70, -140, 0, 0x8a5fb8, "civilian");
    car.maxSpeedBase = 17;
    car.occupied = true;
    this.tailTarget = { car, street: -140, dir: 1, horizontal: false };
    void world;
  }

  stopTail() {
    if (this.tailTarget) {
      this.tailTarget.car.removeFrom(this.scene);
      this.tailTarget = null;
    }
  }

  updateTail(dt, world) {
    const tail = this.tailTarget;
    if (!tail) return;
    const car = tail.car;
    // Cruise the grid slowly like traffic.
    const fwd = car.forward();
    const cross = tail.horizontal ? car.pos.x : car.pos.z;
    const near = [-210, -140, -70, 0, 70, 140, 210].find((s) => Math.abs(s - cross) < 3);
    if (near !== undefined && Math.random() < 0.012) {
      tail.horizontal = !tail.horizontal;
      tail.dir = Math.random() < 0.5 ? 1 : -1;
    }
    const desired = tail.horizontal ? (tail.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (tail.dir > 0 ? 0 : Math.PI);
    let diff = desired - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2.2));
    void fwd;
    car.drive(dt, car.speed < 12 ? 0.6 : 0, steer, false, world.city, world.allCars());
    if (Math.abs(car.pos.x) > 244 || Math.abs(car.pos.z) > 244) tail.dir *= -1;
  }

  update(dt, world) {
    if (this.raceMarker.visible) this.raceMarker.rotation.y += dt * 1.6;
    if (this.deliveryMarker.visible) this.deliveryMarker.rotation.y += dt * 1.6;
    this.updateRace(dt, world);
    this.updateDelivery(dt, world);
    this.updateTail(dt, world);
  }
}
