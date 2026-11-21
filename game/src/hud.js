// hud.js — DOM HUD and the live canvas minimap for AURELIA BAY.
// The minimap is north-up: streets as a grid, the player as an arrow, police
// as blue/red blips, and the current objective as a gold diamond.
import { STREETS, WORLD_EDGE } from "./city.js";

export class Hud {
  constructor() {
    this.el = {};
    for (const id of ["stars", "cash", "respect", "healthFill", "armorFill", "speedo", "weapon",
      "objective", "banner", "bannerTitle", "bannerText", "dialogue", "dialogueWho", "dialogueText",
      "radioName", "garageMenu", "garageRows", "garageCash", "garageNote", "bustBar", "bustFill", "interact"]) {
      this.el[id] = document.getElementById(id);
    }
    this.mapCanvas = document.getElementById("minimap");
    this.mapCtx = this.mapCanvas.getContext("2d");
    this.bannerTimer = 0;
    this.lastObjective = "";
  }

  setStars(n) {
    this.el.stars.textContent = "★".repeat(n) + "☆".repeat(5 - n);
    this.el.stars.style.opacity = n > 0 ? "1" : "0.25";
  }

  setMoney(cash, title) {
    this.el.cash.textContent = `$${cash.toLocaleString("en-US")}`;
    this.el.respect.textContent = title;
  }

  setVitals(health, armor) {
    this.el.healthFill.style.width = `${Math.max(0, health)}%`;
    this.el.armorFill.style.width = `${Math.max(0, Math.min(100, armor))}%`;
    this.el.healthFill.style.background = health < 30 ? "#e83a3a" : "#7ac74f";
  }

  setSpeed(kmh, visible) {
    this.el.speedo.style.display = visible ? "block" : "none";
    if (visible) this.el.speedo.textContent = `${Math.round(kmh)} km/h`;
  }

  setWeapon(name, ammo, reloading) {
    this.el.weapon.textContent = reloading ? `${name} — RELOADING` : `${name}  ${ammo}`;
  }

  setRadio(name) {
    this.el.radioName.textContent = name ? `♪ ${name}` : "";
  }

  setObjective(text) {
    if (text !== this.lastObjective) {
      this.lastObjective = text;
      this.el.objective.textContent = text;
      this.el.objective.style.display = text ? "block" : "none";
    }
  }

  setInteract(text) {
    this.el.interact.textContent = text || "";
    this.el.interact.style.display = text ? "block" : "none";
  }

  setBust(frac) {
    this.el.bustBar.style.display = frac > 0 ? "block" : "none";
    if (frac > 0) this.el.bustFill.style.width = `${Math.min(100, frac * 100)}%`;
  }

  banner(title, text, color = "#ffd23f") {
    this.el.bannerTitle.textContent = title;
    this.el.bannerTitle.style.color = color;
    this.el.bannerText.textContent = text;
    this.el.banner.style.display = "block";
    this.bannerTimer = 4.2;
  }

  showDialogue(who, text) {
    this.el.dialogueWho.textContent = who;
    this.el.dialogueText.textContent = text;
    this.el.dialogue.style.display = "block";
  }

  hideDialogue() {
    this.el.dialogue.style.display = "none";
  }

  showGarage(rows, cash, note) {
    this.el.garageCash.textContent = `$${cash.toLocaleString("en-US")}`;
    this.el.garageNote.textContent = note;
    this.el.garageRows.innerHTML = rows.map((r) =>
      `<div class="grow ${r.disabled ? "disabled" : ""}"><span class="gkey">${r.key}</span><span class="gname">${r.name}<small>${r.hint}</small></span><span class="gprice">${r.price}</span></div>`
    ).join("");
    this.el.garageMenu.style.display = "block";
  }

  hideGarage() {
    this.el.garageMenu.style.display = "none";
  }

  update(dt) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el.banner.style.display = "none";
    }
  }

  drawMinimap(world) {
    const ctx = this.mapCtx;
    const S = this.mapCanvas.width;
    const scale = S / (WORLD_EDGE * 2 + 40);
    const toMap = (x, z) => [S / 2 + x * scale, S / 2 + z * scale];
    ctx.fillStyle = "#1d2733";
    ctx.fillRect(0, 0, S, S);
    // Water band at the south edge.
    ctx.fillStyle = "#2e7fa8";
    const [, wy] = toMap(0, 238);
    ctx.fillRect(0, wy, S, S - wy);
    // Streets.
    ctx.strokeStyle = "#4a5568";
    ctx.lineWidth = Math.max(2, 18 * scale);
    for (const s of STREETS) {
      const [x] = toMap(s, 0);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
      const [, y] = toMap(0, s);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
    }
    // Race checkpoints.
    if (world.activities.race) {
      ctx.fillStyle = "#53c2c9";
      for (const [cx, cz] of world.activities.race.def.checkpoints) {
        const [mx, my] = toMap(cx, cz);
        ctx.fillRect(mx - 2, my - 2, 4, 4);
      }
    }
    // Objective marker (mission first, then delivery).
    const target = world.missions.markerPos() || world.activities.deliveryPos() || world.activities.raceMarkerPos();
    if (target) {
      const [mx, my] = toMap(target.x, target.z);
      ctx.fillStyle = "#ffd23f";
      ctx.beginPath();
      ctx.moveTo(mx, my - 6); ctx.lineTo(mx + 5, my); ctx.lineTo(mx, my + 6); ctx.lineTo(mx - 5, my);
      ctx.closePath(); ctx.fill();
    }
    // Police blips flash blue/red.
    const flash = Math.floor(performance.now() / 300) % 2 === 0;
    for (const car of world.police.cars) {
      const [mx, my] = toMap(car.pos.x, car.pos.z);
      ctx.fillStyle = flash ? "#3a7bd8" : "#e83a3a";
      ctx.fillRect(mx - 3, my - 3, 6, 6);
    }
    for (const officer of world.police.officers) {
      if (officer.down) continue;
      const [mx, my] = toMap(officer.pos.x, officer.pos.z);
      ctx.fillStyle = flash ? "#3a7bd8" : "#e83a3a";
      ctx.fillRect(mx - 2, my - 2, 4, 4);
    }
    if (world.police.heli) {
      const [mx, my] = toMap(world.police.heli.position.x, world.police.heli.position.z);
      ctx.fillStyle = "#ffd23f";
      ctx.fillRect(mx - 3, my - 3, 6, 6);
    }
    // Player arrow.
    const player = world.player;
    const [px, py] = toMap(player.pos.x, player.pos.z);
    const heading = player.driving ? player.driving.heading : player.heading;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(Math.sin(heading), -Math.cos(heading)) + Math.PI);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // North label.
    ctx.fillStyle = "#f2f2f2";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText("N", S - 14, 14);
  }
}
