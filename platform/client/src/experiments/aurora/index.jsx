import { useEffect, useRef, useCallback } from 'react';
import { Graphics, Text, TextStyle } from 'pixi.js';
import { PixiStage, usePixi, usePixiTicker } from '../../pixi/index.js';
import { useRowing } from '../../context/RowingContext.jsx';
import { useRowingData } from '../../hooks/useRowingData.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const GOAL_STROKES = 500;
const ICE_Y_FRAC = 0.80;   // aurora curtains fill the top 80% of screen

// Color palette shared by curtains, particles, and LEDs
const AURORA_COLORS = [0x00ff88, 0x00ffff, 0x7700ff, 0xff44aa, 0x44aaff, 0x00ff44];
const AURORA_RGB = [[0, 255, 136], [0, 255, 255], [119, 0, 255], [255, 68, 170], [68, 170, 255], [0, 255, 68]];

// A pentatonic scale for stroke tones (pleasant under any tempo)
const PENTATONIC = [220, 261.6, 293.7, 329.6, 392, 440, 523.2, 587.3];

// ── Root component ────────────────────────────────────────────────────────────
export default function Aurora() {
  return (
    <PixiStage pixiOptions={{ background: '#00010d', antialias: true }}>
      <Scene />
    </PixiStage>
  );
}

// ── Scene — all logic and rendering ──────────────────────────────────────────
function Scene() {
  const app = usePixi();
  const { markComplete } = useRowing();

  // All mutable state lives in a ref — zero React re-renders during workout
  const st = useRef({
    // Rowing
    watts: 0, spm: 0, totalStrokes: 0, elapsedS: 0,
    wattSum: 0, wattCount: 0,
    // Canvas dimensions (set in useEffect)
    W: 0, H: 0,
    // Visuals
    auroraIntensity: 0,   // current smooth value (lerped toward target)
    time: 0,              // animation clock, ~1 unit/s at 60 fps
    curtains: [],
    particles: [],
    // Gameplay mechanics
    consecHigh: 0,        // consecutive strokes > 200W (for glide bonus)
    glideActive: false,
    glideCountdown: 0,
    // Hardware
    currentDrag: -1,
    ledLastStrokeS: -999, // elapsedS at last stroke (for idle LED cycling)
    // Audio & session
    audioStarted: false,
    completed: false,
    // Pixi display objects
    curtainGfx: null,
    particleGfx: null,
    strokeText: null,
    timeText: null,
  });

  const audioRef = useRef(null);

  // Bridge: send command to Android hardware (no-op + console log in browser)
  const bridge = useCallback((action, payload) => {
    if (typeof window.cleanRowBridge !== 'undefined') {
      window.cleanRowBridge.postMessage(JSON.stringify({ type: 'command', action, ...payload }));
    } else {
      console.log('[Bridge]', action, payload);
    }
  }, []);

  // ── Scene setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    const { screen } = app;
    const W = screen.width;
    const H = screen.height;
    const s = st.current;
    s.W = W; s.H = H;

    // ── Stars — drawn once, static ──────────────────────────────────────────
    const starGfx = new Graphics();
    for (let i = 0; i < 280; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H * ICE_Y_FRAC;
      const r = Math.random() * 1.8 + 0.2;
      starGfx.circle(x, y, r);
      starGfx.fill({ color: 0xffffff, alpha: Math.random() * 0.65 + 0.35 });
    }
    app.stage.addChild(starGfx);

    // ── Aurora curtain layer — redrawn every frame ──────────────────────────
    const curtainGfx = new Graphics();
    app.stage.addChild(curtainGfx);
    s.curtainGfx = curtainGfx;

    // ── Particle layer — redrawn every frame ────────────────────────────────
    const particleGfx = new Graphics();
    app.stage.addChild(particleGfx);
    s.particleGfx = particleGfx;

    // ── Ice silhouette — drawn once, three layers for depth ─────────────────
    const iceGfx = new Graphics();
    drawIce(iceGfx, W, H);
    app.stage.addChild(iceGfx);

    // ── HUD text — stroke counter and elapsed time ───────────────────────────
    const strokeStyle = new TextStyle({
      fill: '#00ff88',
      fontSize: 26,
      fontFamily: 'Courier New, monospace',
      dropShadow: { distance: 0, blur: 10, color: '#00ff88', alpha: 0.8 },
    });
    const strokeText = new Text({ text: `◈ 0 / ${GOAL_STROKES}`, style: strokeStyle });
    strokeText.anchor.set(1, 0);
    strokeText.position.set(W - 28, 26);
    app.stage.addChild(strokeText);
    s.strokeText = strokeText;

    const timeText = new Text({
      text: '0:00',
      style: new TextStyle({ fill: '#44aaff', fontSize: 26, fontFamily: 'Courier New, monospace' }),
    });
    timeText.position.set(28, 26);
    app.stage.addChild(timeText);
    s.timeText = timeText;

    // ── Initialise aurora curtains ──────────────────────────────────────────
    s.curtains = initCurtains(W, H);

    // ── Set initial drag ────────────────────────────────────────────────────
    bridge('setDrag', { value: 13 });
    s.currentDrag = 13;

    return () => {
      [starGfx, curtainGfx, particleGfx, iceGfx, strokeText, timeText]
        .forEach(g => { try { g.destroy(); } catch (_) { } });

      // Reset mutable state for StrictMode double-mount
      Object.assign(s, {
        curtainGfx: null, particleGfx: null, strokeText: null, timeText: null,
        particles: [], curtains: [],
        watts: 0, totalStrokes: 0, auroraIntensity: 0,
        completed: false, currentDrag: -1, audioStarted: false,
        elapsedS: 0, wattSum: 0, wattCount: 0, time: 0,
        consecHigh: 0, glideActive: false, glideCountdown: 0,
      });

      if (audioRef.current) {
        try { audioRef.current.ctx.close(); } catch (_) { }
        audioRef.current = null;
      }
    };
  }, [app, bridge]);

  // ── Rowing data ───────────────────────────────────────────────────────────
  useRowingData({
    onStroke: useCallback(({ watts, spm }) => {
      const s = st.current;
      s.watts = watts;
      s.spm = spm;
      s.totalStrokes++;
      s.wattSum += watts;
      s.wattCount++;

      // ── Audio: init on very first stroke (satisfies browser autoplay policy) ─
      if (!s.audioStarted) {
        initAudio(audioRef);
        s.audioStarted = true;
      }
      if (audioRef.current) {
        updateAudio(audioRef, watts);
        playStrokeTone(audioRef, s.totalStrokes);
      }

      // ── LED: pulse current aurora colour, brightness scales with watts ──────
      const ledIdx = s.totalStrokes % AURORA_RGB.length;
      const [r, g, b] = AURORA_RGB[ledIdx];
      const bright = 0.3 + Math.min(1, watts / 300) * 0.7;
      bridge('setLedRgb', {
        r: Math.round(r * bright),
        g: Math.round(g * bright),
        b: Math.round(b * bright),
      });
      s.ledLastStrokeS = s.elapsedS;

      // High power burst → purple flash on LED
      if (watts > 200) bridge('setLedPreset', { value: 7 });

      // ── Glide bonus: 10 consecutive high-watt strokes → drop drag to 11 ────
      if (watts > 200) {
        s.consecHigh++;
        if (s.consecHigh >= 10 && !s.glideActive) {
          s.glideActive = true;
          s.glideCountdown = 15;
          s.currentDrag = 11;
          bridge('setDrag', { value: 11 });
        }
      } else {
        s.consecHigh = 0;
      }
      if (s.glideActive) {
        s.glideCountdown--;
        if (s.glideCountdown <= 0) s.glideActive = false;
      }

      // ── Particle burst from ice line ─────────────────────────────────────
      if (s.curtainGfx) {
        const curtainColor = AURORA_COLORS[s.totalStrokes % AURORA_COLORS.length];
        spawnParticles(s.particles, s.W, s.H * ICE_Y_FRAC, curtainColor);
      }

      // ── Burst curtain on power stroke ────────────────────────────────────
      if (watts > 175 && s.curtains.length) {
        const bi = Math.floor(Math.random() * s.curtains.length);
        s.curtains[bi].burst = true;
        s.curtains[bi].burstTtlMs = 1600;
      }

      // ── HUD update ────────────────────────────────────────────────────────
      if (s.strokeText) s.strokeText.text = `◈ ${s.totalStrokes} / ${GOAL_STROKES}`;

      // ── Goal: 500 strokes → complete ─────────────────────────────────────
      if (s.totalStrokes >= GOAL_STROKES && !s.completed) {
        s.completed = true;
        markComplete();
        if (audioRef.current) playCompleteChord(audioRef);

        // LED cascade: green → cyan → white → aurora, 10 × 200ms
        let ci = 0;
        const cascade = setInterval(() => {
          const cols = [[0, 255, 136], [0, 255, 255], [255, 255, 255], [0, 200, 255], [255, 255, 255]];
          const [cr, cg, cb] = cols[ci % cols.length];
          bridge('setLedRgb', { r: cr, g: cg, b: cb });
          if (++ci >= 10) clearInterval(cascade);
        }, 200);
      }
    }, [markComplete, bridge]),

    onInterval: useCallback(({ watts }) => {
      const s = st.current;
      s.elapsedS++;

      // ── HUD: elapsed time ─────────────────────────────────────────────────
      if (s.timeText) {
        const m = Math.floor(s.elapsedS / 60);
        const sec = s.elapsedS % 60;
        s.timeText.text = `${m}:${String(sec).padStart(2, '0')}`;
      }

      // ── Dynamic drag (phase-based unless glide is active) ─────────────────
      if (!s.glideActive) {
        let targetDrag;
        const es = s.elapsedS;
        if (es < 90) {
          targetDrag = 13;                               // warm-up: light resistance
        } else if (es < 180) {
          targetDrag = 16;                               // building: medium resistance
        } else if (es < 300) {
          const avgW = s.wattCount > 0 ? s.wattSum / s.wattCount : 0;
          targetDrag = avgW >= 150 ? 14 : 18;            // reward or push
        } else {
          targetDrag = 16;                               // hold steady
        }
        if (targetDrag !== s.currentDrag) {
          s.currentDrag = targetDrag;
          bridge('setDrag', { value: targetDrag });
        }
      }

      // ── LED: soft idle cycling when no stroke for >2 s ───────────────────
      if (s.elapsedS - s.ledLastStrokeS > 2) {
        const idx = Math.floor(s.elapsedS / 2) % AURORA_RGB.length;
        const [r, g, b] = AURORA_RGB[idx];
        bridge('setLedRgb', {
          r: Math.round(r * 0.22),
          g: Math.round(g * 0.22),
          b: Math.round(b * 0.22),
        });
      }

      // ── Keep audio response in sync with current power ────────────────────
      if (audioRef.current) updateAudio(audioRef, watts);
    }, [bridge]),
  });

  // ── Per-frame rendering (Pixi ticker) ─────────────────────────────────────
  usePixiTicker(useCallback((ticker) => {
    const s = st.current;
    if (!s.curtainGfx || !s.particleGfx) return;

    const dt = ticker.deltaTime;   // ≈ 1 at 60 fps, frame-rate normalised
    const dms = ticker.deltaMS;

    // Advance animation clock (~1 unit per second at 60 fps)
    s.time += dt / 60;

    // Smoothly lerp aurora intensity toward watts-driven target
    const target = Math.min(1, s.watts / 250);
    s.auroraIntensity += (target - s.auroraIntensity) * 0.008 * dt;

    // Tick burst timers
    for (const c of s.curtains) {
      if (c.burst) {
        c.burstTtlMs -= dms;
        if (c.burstTtlMs <= 0) c.burst = false;
      }
    }

    // ── Draw aurora curtains ───────────────────────────────────────────────
    const cgfx = s.curtainGfx;
    cgfx.clear();

    for (const c of s.curtains) {
      const baseAlpha = c.burst
        ? 0.55 * Math.max(0, c.burstTtlMs / 1600)
        : 0.03 + s.auroraIntensity * 0.45;

      if (baseAlpha < 0.008) continue;

      // Core curtain band
      drawCurtainBand(cgfx, c, s.H, s.time, baseAlpha);
      // Soft wide halo (glow bloom effect)
      drawCurtainBand(
        cgfx,
        { ...c, width: c.width * 2.1, amplitude: c.amplitude * 1.15 },
        s.H,
        s.time,
        baseAlpha * 0.18,
      );
    }

    // ── Draw / update particles ────────────────────────────────────────────
    const pgfx = s.particleGfx;
    pgfx.clear();

    for (let i = s.particles.length - 1; i >= 0; i--) {
      const p = s.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy -= 0.03 * dt;  // upward deceleration (simulates rising gas/light)
      p.ttl -= dt;
      if (p.ttl <= 0) { s.particles.splice(i, 1); continue; }

      const frac = p.ttl / p.maxTtl;
      const radius = 1 + frac * 2.5;
      pgfx.circle(p.x, p.y, radius);
      pgfx.fill({ color: p.color, alpha: frac * 0.82 });
    }
  }, [app]));

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Visual helpers
// ─────────────────────────────────────────────────────────────────────────────

function initCurtains(W, H) {
  // Six curtains distributed across the sky, each with its own personality
  return [
    { xBase: W * 0.09, width: W * 0.22, color: 0x00ff88, amplitude: 48, freq: 0.0070, speed: 0.55, phaseOff: 0.0 },
    { xBase: W * 0.22, width: W * 0.18, color: 0x00ffff, amplitude: 36, freq: 0.0090, speed: -0.42, phaseOff: 1.1 },
    { xBase: W * 0.40, width: W * 0.26, color: 0x7700ff, amplitude: 58, freq: 0.0062, speed: 0.62, phaseOff: 0.5 },
    { xBase: W * 0.58, width: W * 0.20, color: 0xff44aa, amplitude: 42, freq: 0.0081, speed: -0.38, phaseOff: 2.1 },
    { xBase: W * 0.73, width: W * 0.22, color: 0x44aaff, amplitude: 52, freq: 0.0074, speed: 0.48, phaseOff: 1.7 },
    { xBase: W * 0.89, width: W * 0.17, color: 0x00ff44, amplitude: 32, freq: 0.0098, speed: -0.52, phaseOff: 0.9 },
  ].map(c => ({ ...c, burst: false, burstTtlMs: 0 }));
}

/**
 * Draw one aurora curtain band as a filled polygon.
 * The band is traced down the left wavy edge, then back up the right wavy edge.
 * Separate phase offsets on each edge give the curtain a natural "width that breathes".
 */
function drawCurtainBand(gfx, c, H, time, alpha) {
  const { xBase, width, amplitude, freq, speed, color, phaseOff = 0 } = c;
  const STEPS = 48;

  // Top of curtain varies by position and time for a ragged natural look
  const topY = H * 0.03 + H * 0.25 * Math.abs(Math.sin(xBase * 0.003 + time * 0.09));
  const botY = H * ICE_Y_FRAC;

  // Left edge (top → bottom)
  gfx.moveTo(
    xBase - width / 2 + amplitude * Math.sin(freq * topY + time * speed + phaseOff),
    topY,
  );
  for (let i = 1; i <= STEPS; i++) {
    const y = topY + ((botY - topY) / STEPS) * i;
    gfx.lineTo(xBase - width / 2 + amplitude * Math.sin(freq * y + time * speed + phaseOff), y);
  }

  // Right edge (bottom → top, slight phase shift so the band "breathes")
  for (let i = STEPS; i >= 0; i--) {
    const y = topY + ((botY - topY) / STEPS) * i;
    gfx.lineTo(xBase + width / 2 + amplitude * Math.sin(freq * y + time * speed + phaseOff + 0.72), y);
  }

  gfx.closePath();
  gfx.fill({ color, alpha });
}

/**
 * Draw three layers of dark ice/mountain silhouette at the bottom of the screen.
 * Back = darkest blue-black, foreground = slightly lighter — gives depth.
 */
function drawIce(gfx, W, H) {
  const Y = H * ICE_Y_FRAC;

  // ── Back range — tallest, darkest ───────────────────────────────────────
  gfx.moveTo(0, H);
  gfx.lineTo(0, Y + 18);
  gfx.lineTo(W * 0.06, Y - 52);
  gfx.lineTo(W * 0.13, Y + 8);
  gfx.lineTo(W * 0.22, Y - 92);
  gfx.lineTo(W * 0.31, Y - 28);
  gfx.lineTo(W * 0.40, Y - 72);
  gfx.lineTo(W * 0.50, Y - 10);
  gfx.lineTo(W * 0.58, Y - 86);
  gfx.lineTo(W * 0.66, Y - 34);
  gfx.lineTo(W * 0.75, Y - 68);
  gfx.lineTo(W * 0.83, Y + 5);
  gfx.lineTo(W * 0.91, Y - 45);
  gfx.lineTo(W, Y + 12);
  gfx.lineTo(W, H);
  gfx.closePath();
  gfx.fill({ color: 0x000810, alpha: 1 });

  // ── Mid range ───────────────────────────────────────────────────────────
  gfx.moveTo(0, H);
  gfx.lineTo(0, Y + 35);
  gfx.lineTo(W * 0.04, Y + 18);
  gfx.lineTo(W * 0.11, Y + 5);
  gfx.lineTo(W * 0.18, Y - 22);
  gfx.lineTo(W * 0.26, Y + 12);
  gfx.lineTo(W * 0.35, Y - 18);
  gfx.lineTo(W * 0.44, Y + 8);
  gfx.lineTo(W * 0.52, Y - 30);
  gfx.lineTo(W * 0.61, Y + 15);
  gfx.lineTo(W * 0.70, Y - 15);
  gfx.lineTo(W * 0.78, Y + 22);
  gfx.lineTo(W * 0.86, Y + 5);
  gfx.lineTo(W * 0.93, Y + 18);
  gfx.lineTo(W, Y + 30);
  gfx.lineTo(W, H);
  gfx.closePath();
  gfx.fill({ color: 0x010c1a, alpha: 1 });

  // ── Foreground ridge — lightest dark, flattest profile ──────────────────
  gfx.moveTo(0, H);
  gfx.lineTo(0, Y + 55);
  gfx.lineTo(W * 0.08, Y + 40);
  gfx.lineTo(W * 0.18, Y + 28);
  gfx.lineTo(W * 0.30, Y + 48);
  gfx.lineTo(W * 0.42, Y + 35);
  gfx.lineTo(W * 0.55, Y + 55);
  gfx.lineTo(W * 0.65, Y + 42);
  gfx.lineTo(W * 0.75, Y + 58);
  gfx.lineTo(W * 0.85, Y + 45);
  gfx.lineTo(W * 0.93, Y + 60);
  gfx.lineTo(W, Y + 50);
  gfx.lineTo(W, H);
  gfx.closePath();
  gfx.fill({ color: 0x02141f, alpha: 1 });
}

/**
 * Spawn 12 upward-drifting particles from the ice line.
 * Particles rise, slow, and fade — like bioluminescent breath.
 */
function spawnParticles(particles, W, iceY, color) {
  for (let k = 0; k < 12; k++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
    const speed = 1.5 + Math.random() * 3.5;
    const ttl = 65 + Math.random() * 90;
    particles.push({
      x: Math.random() * W,
      y: iceY - Math.random() * 15,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      ttl,
      maxTtl: ttl,
      color,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Web Audio engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the audio graph. Called on first stroke to satisfy browser autoplay policy.
 *
 * Graph overview:
 *   [drone osc + LFO] → droneGain ─┐
 *   [pad osc1]                      ├─ padFilter → padGain ─┐
 *   [pad osc2]                      │                        ├─ compressor → destination
 *   [per-stroke tones]              │                        │
 *   [feedback delay1 + delay2] ────────────────────────────┘ (reverb tail)
 */
function initAudio(audioRef) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Master compressor (tames dynamics, keeps it from clipping)
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 6;
    comp.attack.value = 0.01;
    comp.release.value = 0.15;
    comp.connect(ctx.destination);

    // Reverb: two cross-coupled feedback delay lines (a simple but effective FDN)
    const d1 = ctx.createDelay(1.0); d1.delayTime.value = 0.11;
    const d2 = ctx.createDelay(1.0); d2.delayTime.value = 0.073;
    const fb1 = ctx.createGain(); fb1.gain.value = 0.32;
    const fb2 = ctx.createGain(); fb2.gain.value = 0.22;
    const rev = ctx.createGain(); rev.gain.value = 0.35;
    d1.connect(fb1); fb1.connect(d1); fb1.connect(rev);
    d2.connect(fb2); fb2.connect(d2); fb2.connect(rev);
    rev.connect(comp);

    // Drone: A1 (55 Hz) sine + slow LFO vibrato
    const drone = ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 55;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0;          // starts silent; watts drive the level
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.07;          // once every ~14 s
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 2.8;           // ±2.8 Hz wobble on the drone
    lfo.connect(lfoGain);
    lfoGain.connect(drone.frequency);
    drone.connect(droneGain);
    droneGain.connect(comp);
    droneGain.connect(d1);
    droneGain.connect(d2);
    drone.start();
    lfo.start();

    // Pad: two triangle oscillators (A2 + E3) through a resonant lowpass
    const p1 = ctx.createOscillator(); p1.type = 'triangle'; p1.frequency.value = 110;
    const p2 = ctx.createOscillator(); p2.type = 'triangle'; p2.frequency.value = 165;
    const padFilt = ctx.createBiquadFilter();
    padFilt.type = 'lowpass'; padFilt.frequency.value = 300; padFilt.Q.value = 2.5;
    const padGain = ctx.createGain(); padGain.gain.value = 0.04;
    p1.connect(padFilt); p2.connect(padFilt);
    padFilt.connect(padGain);
    padGain.connect(comp);
    padGain.connect(d1);
    p1.start(); p2.start();

    audioRef.current = { ctx, comp, droneGain, padFilt, padGain, d1, d2 };
  } catch (e) {
    console.warn('[Aurora] Audio unavailable:', e);
  }
}

/** Map watts to audio mix parameters. Called on every stroke and interval. */
function updateAudio(audioRef, watts) {
  const a = audioRef.current;
  if (!a) return;
  const t = a.ctx.currentTime;
  const n = Math.min(1, watts / 300);   // normalised 0–1

  a.droneGain.gain.setTargetAtTime(n * 0.26, t, 0.6);              // louder drone with power
  a.padFilt.frequency.setTargetAtTime(200 + n * 2600, t, 0.6);     // pad opens up
  a.padGain.gain.setTargetAtTime(0.04 + n * 0.13, t, 0.6);         // pad gets louder
}

/**
 * Play a short pentatonic tone tied to the current stroke count.
 * Each note gets a simple ADSR envelope and feeds into the reverb.
 */
function playStrokeTone(audioRef, strokeCount) {
  const a = audioRef.current;
  if (!a) return;

  const freq = PENTATONIC[strokeCount % PENTATONIC.length];
  const ctx = a.ctx;
  const t = ctx.currentTime;

  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  osc.connect(env);
  env.connect(a.comp);
  env.connect(a.d1);

  // ADSR: 25ms attack, hold, exponential decay to silence in ~0.9s
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.13, t + 0.025);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.9);

  osc.start(t);
  osc.stop(t + 0.95);
}

/**
 * A major chord arpeggio (A2, C#3, E3, A3, E4) — plays on session completion.
 * Notes arrive 100ms apart and sustain for ~5 seconds, letting the reverb bloom.
 */
function playCompleteChord(audioRef) {
  const a = audioRef.current;
  if (!a) return;
  const ctx = a.ctx;

  [220, 277.2, 329.6, 440, 659.3].forEach((freq, i) => {
    const t = ctx.currentTime + i * 0.1;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    osc.connect(env);
    env.connect(a.comp);
    env.connect(a.d1);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.18, t + 0.12);
    env.gain.exponentialRampToValueAtTime(0.001, t + 5.2);
    osc.start(t);
    osc.stop(t + 5.4);
  });
}
