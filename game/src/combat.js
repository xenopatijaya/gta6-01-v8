// combat.js — weapons for AURELIA BAY: fists, pistol and SMG with ammo and
// reloads, tracer lines, muzzle flashes, melee, and hit resolution against
// pedestrians, officers, drivers and cars.
import * as THREE from "three";

export const WEAPONS = {
  fists: { name: "Fists", damage: 22, range: 2.4, cooldown: 0.38, auto: false, ammo: Infinity, mag: Infinity },
  pistol: { name: "Pistol", damage: 34, range: 90, cooldown: 0.24, auto: false, ammo: 90, mag: 12 },
  smg: { name: "SMG", damage: 20, range: 80, cooldown: 0.085, auto: true, ammo: 240, mag: 30 },
};

export class Combat {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.slot = "fists";
    this.state = {};
    for (const [key, w] of Object.entries(WEAPONS)) {
      this.state[key] = { ammo: w.ammo, mag: w.mag === Infinity ? Infinity : w.mag };
    }
    this.cooldown = 0;
    this.reloading = 0;
    this.tracers = [];
    this.flash = null;
    this.firing = false;
  }

  current() {
    return WEAPONS[this.slot];
  }

  select(slotKey) {
    if (WEAPONS[slotKey] && slotKey !== this.slot) {
      this.slot = slotKey;
      this.reloading = 0;
    }
  }

  ammoText() {
    const w = this.current();
    if (this.slot === "fists") return "—";
    const s = this.state[this.slot];
    return `${s.mag} / ${s.ammo === Infinity ? "∞" : s.ammo}`;
  }

  startReload() {
    const w = this.current();
    const s = this.state[this.slot];
    if (this.slot === "fists" || this.reloading > 0) return;
    if (s.mag >= w.mag || s.ammo <= 0) return;
    this.reloading = 0.9;
    this.audio.reload();
  }

  // Attempt a shot. world supplies targets and callbacks (onCrime etc).
  tryFire(dt, world) {
    this.cooldown -= dt;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this.finishReload();
      return;
    }
    if (!this.firing || this.cooldown > 0) return;
    const w = this.current();
    const player = world.player;
    if (player.driving) return;
    this.cooldown = w.cooldown;
    if (this.slot === "fists") {
      this.audio.punch();
      this.melee(world);
      return;
    }
    const s = this.state[this.slot];
    if (s.mag <= 0) {
      this.audio.dryFire();
      this.cooldown = 0.3;
      this.startReload();
      return;
    }
    s.mag--;
    this.audio.shot(this.slot);
    world.onCrime("shots", player.pos);
    this.muzzleFlash(player);
    const dir = player.aimDirection();
    const origin = player.pos.clone().add(new THREE.Vector3(0, 1.45, 0));
    this.resolveShot(origin, dir, w, world);
    if (s.mag === 0) this.startReload();
  }

  finishReload() {
    const w = this.current();
    const s = this.state[this.slot];
    const need = w.mag - s.mag;
    const take = Math.min(need, s.ammo);
    s.mag += take;
    if (s.ammo !== Infinity) s.ammo -= take;
  }

  melee(world) {
    const player = world.player;
    const facing = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
    let hitSomething = false;
    const check = (target, radius, onHit) => {
      const to = target.pos.clone().sub(player.pos);
      to.y = 0;
      if (to.length() < radius && to.normalize().dot(facing) > 0.25) { onHit(); hitSomething = true; }
    };
    for (const ped of world.pedestrians.list) {
      if (ped.state === "down" || ped.state === "driver") continue;
      check(ped, 2.4, () => {
        if (ped.knockDown(WEAPONS.fists.damage * 3)) world.onCrime("pedDown", ped.pos);
        else { ped.scare(player.pos, 4); world.onCrime("assault", ped.pos); }
      });
    }
    for (const officer of world.police.officers) {
      if (officer.down) continue;
      check(officer, 2.4, () => world.police.hurtOfficer(officer, WEAPONS.fists.damage, world));
    }
    for (const car of world.allCars()) {
      check(car, 3.4, () => { car.damage(4); world.audio.hit(); });
    }
    if (hitSomething) world.audio.hit();
    world.pedestrians.scareAll(player.pos, 9);
  }

  resolveShot(origin, dir, weapon, world) {
    let bestT = weapon.range;
    let bestHit = null;
    const consider = (center, radius, height, apply) => {
      const to = center.clone().sub(origin);
      const t = to.dot(dir);
      if (t < 0 || t > bestT) return;
      const closest = origin.clone().addScaledVector(dir, t);
      const dx = closest.x - center.x;
      const dz = closest.z - center.z;
      const dy = closest.y - (center.y + height / 2);
      if (dx * dx + dz * dz < radius * radius && Math.abs(dy) < height) {
        bestT = t;
        bestHit = apply;
      }
    };
    for (const ped of world.pedestrians.list) {
      if (ped.state === "down" || ped.state === "driver") continue;
      consider(ped.pos, 0.65, 1.9, () => {
        if (ped.knockDown(weapon.damage * 3)) world.onCrime("pedDown", ped.pos);
        else { ped.knockDown(weapon.damage); ped.scare(origin, 5); world.onCrime("assault", ped.pos); }
      });
    }
    for (const officer of world.police.officers) {
      if (officer.down) continue;
      consider(officer.pos, 0.65, 1.9, () => world.police.hurtOfficer(officer, weapon.damage, world));
    }
    for (const car of world.allCars()) {
      consider(car.pos, 2.1, 1.6, () => {
        car.damage(weapon.damage * 0.5);
        if (car.driver) car.driver.scare(origin, 5);
      });
    }
    const end = origin.clone().addScaledVector(dir, bestT);
    this.spawnTracer(origin, end);
    if (bestHit) { bestHit(); world.audio.hit(); }
    world.pedestrians.scareAll(origin, 20);
  }

  muzzleFlash(player) {
    if (this.flash) this.scene.remove(this.flash);
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd76a })
    );
    const dir = player.aimDirection();
    flash.position.copy(player.pos).add(new THREE.Vector3(0, 1.45, 0)).addScaledVector(dir, 0.7);
    flash.userData.life = 0.05;
    this.scene.add(flash);
    this.flash = flash;
  }

  spawnTracer(a, b) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0 }));
    line.userData.life = 0.06;
    this.scene.add(line);
    this.tracers.push(line);
  }

  update(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      this.tracers[i].userData.life -= dt;
      if (this.tracers[i].userData.life <= 0) {
        this.scene.remove(this.tracers[i]);
        this.tracers.splice(i, 1);
      }
    }
    if (this.flash) {
      this.flash.userData.life -= dt;
      if (this.flash.userData.life <= 0) {
        this.scene.remove(this.flash);
        this.flash = null;
      }
    }
  }
}
