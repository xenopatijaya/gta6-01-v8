// audio.js — all sound in AURELIA BAY is synthesised with WebAudio.
// Three radio stations loop small generative patterns while driving, and a
// handful of one-shot voices cover engines, gunfire, hits and sirens.

const STATIONS = [
  { name: "Sunset FM", root: 220, scale: [0, 2, 4, 7, 9], tempo: 0.24, wave: "triangle", bass: 55 },
  { name: "Coral Wave", root: 262, scale: [0, 3, 5, 7, 10], tempo: 0.19, wave: "sine", bass: 65 },
  { name: "Night Pier", root: 196, scale: [0, 2, 3, 7, 8], tempo: 0.3, wave: "square", bass: 49 },
];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.station = 0;
    this.radioOn = false;
    this.radioTimer = 0;
    this.step = 0;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  stationName() {
    return STATIONS[this.station].name;
  }

  cycleStation() {
    this.station = (this.station + 1) % STATIONS.length;
    this.step = 0;
    return this.stationName();
  }

  setRadio(on) {
    this.radioOn = on;
  }

  tone(freq, dur, type, vol, slideTo, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur, vol, freq = 1200) {
    if (!this.ctx) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
  }

  shot(kind) {
    if (kind === "smg") {
      this.noise(0.07, 0.25, 2400);
      this.tone(190, 0.06, "square", 0.12, 60);
    } else {
      this.noise(0.12, 0.35, 1600);
      this.tone(140, 0.1, "square", 0.16, 45);
    }
  }

  dryFire() {
    this.tone(900, 0.03, "square", 0.08);
  }

  reload() {
    this.tone(500, 0.05, "square", 0.1);
    this.tone(320, 0.05, "square", 0.1, 0, 0.12);
    this.tone(700, 0.05, "square", 0.1, 0, 0.24);
  }

  punch() {
    this.noise(0.08, 0.3, 500);
  }

  hit() {
    this.noise(0.15, 0.4, 700);
    this.tone(90, 0.2, "sawtooth", 0.2, 40);
  }

  crash(big) {
    this.noise(big ? 0.4 : 0.2, big ? 0.6 : 0.35, 420);
    this.tone(70, 0.3, "sawtooth", 0.25, 30);
  }

  cash() {
    this.tone(880, 0.09, "sine", 0.18);
    this.tone(1320, 0.14, "sine", 0.18, 0, 0.08);
  }

  checkpoint() {
    this.tone(660, 0.08, "triangle", 0.2);
    this.tone(990, 0.12, "triangle", 0.2, 0, 0.07);
  }

  objective() {
    this.tone(523, 0.1, "triangle", 0.2);
    this.tone(784, 0.16, "triangle", 0.2, 0, 0.09);
  }

  setEngine(rpm01, driving) {
    if (!this.ctx) return;
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = "sawtooth";
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
    }
    const target = driving ? 0.05 + rpm01 * 0.05 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(55 + rpm01 * 165, this.ctx.currentTime, 0.05);
  }

  setSiren(active, dt) {
    if (!this.ctx) return;
    if (active && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenGain = this.ctx.createGain();
      this.sirenOsc.type = "triangle";
      this.sirenGain.gain.value = 0.018;
      this.sirenOsc.connect(this.sirenGain).connect(this.master);
      this.sirenOsc.start();
    }
    if (this.sirenOsc) {
      this.sirenOsc.frequency.value = 660 + Math.sin(performance.now() * 0.006) * 190;
      if (!active) {
        this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
        const osc = this.sirenOsc;
        setTimeout(() => { try { osc.stop(); } catch { /* already stopped */ } }, 300);
        this.sirenOsc = null;
        this.sirenGain = null;
      }
    }
    void dt;
  }

  updateRadio(dt, driving) {
    if (!this.ctx || !driving || !this.radioOn) return;
    this.radioTimer -= dt;
    if (this.radioTimer > 0) return;
    const st = STATIONS[this.station];
    this.radioTimer = st.tempo;
    const degree = st.scale[this.step % st.scale.length];
    const fifth = st.scale[(this.step + 2) % st.scale.length];
    const freq = st.root * Math.pow(2, degree / 12);
    const freq2 = st.root * Math.pow(2, fifth / 12) * 2;
    this.tone(freq, st.tempo * 1.8, st.wave, 0.055);
    if (this.step % 2 === 0) this.tone(freq2, st.tempo * 0.9, "sine", 0.03);
    if (this.step % 4 === 0) this.tone(st.bass * 2, st.tempo * 3, "sine", 0.09);
    this.step++;
  }
}
