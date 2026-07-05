/**
 * A procedural ambient score. No audio files — the "soundtrack" is synthesized
 * live from each scene's `tone` (0..1 brightness) with the Web Audio API: a
 * detuned oscillator pad under a slow low-pass sweep, plus an occasional bell on
 * scene changes. It's deliberately quiet and unobtrusive.
 *
 * Client-only. All methods are no-ops if the Web Audio API is unavailable.
 */

const PENTATONIC = [220, 246.94, 277.18, 329.63, 369.99]; // A minor-ish, calm

export class Score {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private pad: OscillatorNode[] = [];
  private padGain: GainNode | null = null;
  private muted = false;
  private started = false;

  /** Must be called from a user gesture (e.g. clicking Play). */
  start(tone: number) {
    if (this.started) {
      this.setScene(tone);
      return;
    }
    const AC =
      typeof window !== "undefined"
        ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (!AC) return;

    const ctx = new AC();
    this.ctx = ctx;
    this.started = true;

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.16;
    master.connect(ctx.destination);
    this.master = master;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    filter.Q.value = 6;
    filter.connect(master);
    this.filter = filter;

    const padGain = ctx.createGain();
    padGain.gain.value = 0.0;
    padGain.connect(filter);
    padGain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 2);
    this.padGain = padGain;

    // Two slightly detuned oscillators = a warm pad.
    for (const detune of [-6, 6]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.detune.value = detune;
      osc.connect(padGain);
      osc.start();
      this.pad.push(osc);
    }

    this.setScene(tone);
  }

  /** Re-tune the pad and ring a bell when the scene changes. */
  setScene(tone: number) {
    if (!this.ctx || !this.filter) return;
    const t = this.ctx.currentTime;

    // Base note climbs with brightness; filter opens with brightness.
    const root = 110 + tone * 90; // 110–200 Hz
    this.pad.forEach((osc) => osc.frequency.setTargetAtTime(root, t, 0.6));
    this.filter.frequency.setTargetAtTime(500 + tone * 1600, t, 0.8);

    this.bell(tone, t);
  }

  private bell(tone: number, t: number) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const idx = Math.min(PENTATONIC.length - 1, Math.floor(tone * PENTATONIC.length));
    osc.type = "triangle";
    osc.frequency.value = PENTATONIC[idx] * 2;
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(this.muted ? 0 : 0.12, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 2.5);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.16, this.ctx.currentTime, 0.1);
    }
  }

  stop() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master?.gain.linearRampToValueAtTime(0, t + 0.4);
    this.pad.forEach((osc) => {
      try {
        osc.stop(t + 0.5);
      } catch {
        /* already stopped */
      }
    });
    const ctx = this.ctx;
    setTimeout(() => ctx.close().catch(() => {}), 700);
    this.ctx = null;
    this.pad = [];
    this.started = false;
  }
}
