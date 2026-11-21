// garage.js — Salgado's Auto Works: drive in, press G, and spend cash on
// repairs, repaints and permanent armour/engine upgrades for your ride.
import { CAR_COLORS } from "./vehicles.js";

export const GARAGE_SERVICES = [
  { id: "repair", name: "Full repair", price: () => 120, hint: "Restore this car to 100% health" },
  { id: "paint", name: "Repaint", price: () => 60, hint: "Cycle to the next colour" },
  { id: "armor", name: "Armour upgrade", price: (save) => 300 + save.upgrades.armor * 250, hint: "Your body armour refills bigger after every bust or visit" },
  { id: "engine", name: "Engine upgrade", price: (save) => 350 + save.upgrades.engine * 300, hint: "+16% top speed on every car you drive" },
];

export class Garage {
  constructor(hud) {
    this.hud = hud;
    this.open = false;
    this.paintIndex = 0;
  }

  inGarage(world) {
    const g = world.city.garagePos;
    return g && world.player.pos.distanceTo(g) < 15;
  }

  toggle(world) {
    if (!this.inGarage(world)) return false;
    this.open = !this.open;
    if (this.open) this.render(world);
    else this.hud.hideGarage();
    return true;
  }

  render(world) {
    const car = world.player.driving;
    const rows = GARAGE_SERVICES.map((svc, i) => {
      const price = svc.price(world.save);
      const maxed = (svc.id === "armor" && world.save.upgrades.armor >= 3) ||
        (svc.id === "engine" && world.save.upgrades.engine >= 3);
      const label = maxed ? "MAXED" : `$${price}`;
      const afford = world.save.cash >= price && !maxed;
      return { key: String(i + 1), name: svc.name, price: label, hint: svc.hint, disabled: !afford || (svc.id !== "paint" && svc.id !== "armor" && svc.id !== "engine" && !car && svc.id === "repair") };
    });
    this.hud.showGarage(rows, world.save.cash, car ? "Your current ride" : "On foot — repairs need a car, upgrades apply anyway");
  }

  buy(index, world) {
    if (!this.open) return;
    const svc = GARAGE_SERVICES[index];
    if (!svc) return;
    const price = svc.price(world.save);
    const car = world.player.driving;
    if ((svc.id === "armor" && world.save.upgrades.armor >= 3) ||
        (svc.id === "engine" && world.save.upgrades.engine >= 3)) {
      this.hud.banner("GARAGE", "That upgrade is already maxed out.", "#e8b04a");
      return;
    }
    if (svc.id === "repair" && !car) {
      this.hud.banner("GARAGE", "Bring a car in first — there is nothing to repair.", "#e8b04a");
      return;
    }
    if (world.save.cash < price) {
      this.hud.banner("GARAGE", "Not enough cash. Run a job and come back.", "#e86a5a");
      return;
    }
    world.save.cash -= price;
    if (svc.id === "repair") {
      car.repair();
      this.hud.banner("GARAGE", "Repaired. She purrs again.", "#7ac74f");
    } else if (svc.id === "paint") {
      this.paintIndex = (this.paintIndex + 1) % CAR_COLORS.length;
      const color = CAR_COLORS[this.paintIndex];
      world.save.paint = color;
      if (car) car.repaint(color);
      this.hud.banner("GARAGE", "Fresh paint. The Bay will notice.", "#7ac74f");
    } else if (svc.id === "armor") {
      world.save.upgrades.armor++;
      world.player.armor = world.save.upgrades.armor * 25;
      this.hud.banner("GARAGE", `Armour level ${world.save.upgrades.armor}. You walk away from worse now.`, "#7ac74f");
    } else if (svc.id === "engine") {
      world.save.upgrades.engine++;
      if (car) car.engineLevel = world.save.upgrades.engine;
      this.hud.banner("GARAGE", `Engine level ${world.save.upgrades.engine}. Every ride just got faster.`, "#7ac74f");
    }
    world.audio.cash();
    world.persist();
    this.render(world);
  }
}
