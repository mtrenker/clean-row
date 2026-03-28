import { useEffect, useRef, useCallback } from 'react';
import { Graphics, Text, TextStyle, Container } from 'pixi.js';
import { PixiStage, usePixi, usePixiTicker } from '../../pixi/index.js';
import { useRowing } from '../../context/RowingContext.jsx';
import { useRowingData } from '../../hooks/useRowingData.js';

// ── Tuning constants ──────────────────────────────────────────────────────────
const SURVIVE_S        = 300;   // 5 minutes to win
const HERO_RADIUS      = 14;
const ENEMY_RADIUS     = 9;
const BULLET_RADIUS    = 4;
const HERO_BASE_SPEED  = 1.2;   // px per frame at 0W
const HERO_WATT_SPEED  = 0.018; // additional px per watt
const BASE_FIRE_MS     = 900;   // ms between shots at 0W
const WATT_FIRE_REDUCE = 3.5;   // ms reduction per watt
const MIN_FIRE_MS      = 120;
const BULLET_SPEED     = 7;
const BULLET_DAMAGE    = 1;
const ENEMY_BASE_HP    = 3;
const ENEMY_SPEED_BASE = 0.6;
const ENEMY_SPEED_RAMP = 0.00015; // per elapsed second
const SPAWN_BASE_MS    = 1400;
const SPAWN_MIN_MS     = 260;
const SPAWN_RAMP       = 1.7;   // ms reduction per second

export default function VoidSwarm() {
  return (
    <PixiStage pixiOptions={{ background: '#08050f' }}>
      <Scene />
    </PixiStage>
  );
}

// ── All game logic lives here, inside PixiStage ───────────────────────────────
function Scene() {
  const app         = usePixi();
  const { markComplete, elapsedS } = useRowing();

  // Live rowing state — written from event, read in ticker (no re-renders)
  const rowing = useRef({ watts: 0 });

  // Game state — entirely mutable, ticker owns it
  const state = useRef({
    // Hero
    hero: { x: 0, y: 0, vx: 0, vy: 0, hp: 10, maxHp: 10, invincibleMs: 0, angle: 0 },
    // Collections
    enemies:  [],
    bullets:  [],
    particles:[],
    // Timers
    fireTimer:  0,
    spawnTimer: 0,
    // Meta
    kills:    0,
    wave:     1,
    gameOver: false,
    won:      false,
    elapsedMs: 0,
    // Display refs (set during setup)
    gfx: null,      // shared Graphics object (redrawn every frame)
    hud: null,      // Text node for overlays
    kText: null,    // kills counter
    wText: null,    // wave counter
    tText: null,    // timer
  });

  // ── Scene setup ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const s = state.current;
    const { screen } = app;

    // Reset hero position to centre
    s.hero.x = screen.width  / 2;
    s.hero.y = screen.height / 2;

    // Main graphics layer
    const gfx = new Graphics();
    app.stage.addChild(gfx);
    s.gfx = gfx;

    // HUD container (sits on top)
    const hudContainer = new Container();
    app.stage.addChild(hudContainer);

    const hudStyle = new TextStyle({ fill: '#ffffff', fontSize: 22, fontFamily: 'Courier New', dropShadow: { distance: 2, blur: 4, color: '#000' } });
    const dimStyle  = new TextStyle({ fill: 'rgba(255,255,255,0.45)', fontSize: 17, fontFamily: 'Courier New' });

    s.kText = new Text({ text: 'Kills: 0',  style: dimStyle });
    s.wText = new Text({ text: 'Wave 1',    style: hudStyle });
    s.tText = new Text({ text: '5:00',      style: dimStyle });

    s.kText.position.set(14, 52);
    s.wText.position.set(screen.width / 2, 52);
    s.tText.position.set(screen.width - 14, 52);
    s.wText.anchor.set(0.5, 0);
    s.tText.anchor.set(1, 0);

    hudContainer.addChild(s.kText, s.wText, s.tText);

    // Big message overlay (game over / win)
    const msgStyle = new TextStyle({ fill: '#ffffff', fontSize: 52, fontFamily: 'Courier New', fontWeight: 'bold', dropShadow: { distance: 4, blur: 12, color: '#000' } });
    s.hud = new Text({ text: '', style: msgStyle });
    s.hud.anchor.set(0.5);
    s.hud.position.set(screen.width / 2, screen.height / 2);
    hudContainer.addChild(s.hud);

    // Hero movement via arrow keys (for browser dev)
    const keys = new Set();
    const onKey = (e, down) => { if (down) keys.add(e.key); else keys.delete(e.key); };
    window.addEventListener('keydown', (e) => onKey(e, true));
    window.addEventListener('keyup',   (e) => onKey(e, false));
    s._keys = keys;

    return () => {
      gfx.destroy();
      hudContainer.destroy({ children: true });
      window.removeEventListener('keydown', (e) => onKey(e, true));
      window.removeEventListener('keyup',   (e) => onKey(e, false));
      // Reset state for StrictMode double-mount
      Object.assign(s, {
        enemies: [], bullets: [], particles: [],
        fireTimer: 0, spawnTimer: 0, kills: 0, wave: 1,
        gameOver: false, won: false, elapsedMs: 0,
        gfx: null, hud: null, kText: null, wText: null, tText: null,
      });
    };
  }, [app]);

  // ── Rowing input ─────────────────────────────────────────────────────────────
  useRowingData({
    onStroke: useCallback(({ watts }) => {
      rowing.current.watts = watts;
    }, []),
  });

  // ── Ticker — all game logic ───────────────────────────────────────────────────
  usePixiTicker(useCallback((ticker) => {
    const s     = state.current;
    const w     = rowing.current.watts;
    const gfx   = s.gfx;
    if (!gfx || s.gameOver || s.won) return;

    const dt  = ticker.deltaTime;   // ~1 at 60fps
    const dms = ticker.deltaMS;
    const { screen } = app;

    s.elapsedMs += dms;
    const elapsed = s.elapsedMs / 1000;

    // ── Win condition ──────────────────────────────────────────────────────────
    if (elapsed >= SURVIVE_S) {
      s.won = true;
      s.hud.text = '✓ You Survived!';
      s.hud.style.fill = '#00ff64';
      markComplete();
      return;
    }

    // ── Update HUD ─────────────────────────────────────────────────────────────
    const remaining = Math.max(0, SURVIVE_S - elapsed);
    s.tText.text = `${Math.floor(remaining / 60)}:${String(Math.floor(remaining % 60)).padStart(2, '0')}`;
    s.kText.text = `Kills: ${s.kills}`;
    s.wave = 1 + Math.floor(elapsed / 30);
    s.wText.text = `Wave ${s.wave}`;

    // ── Hero movement (keyboard for dev, always drifts toward centre per watts) ─
    const hero  = s.hero;
    const speed = HERO_BASE_SPEED + w * HERO_WATT_SPEED;
    const keys  = s._keys || new Set();

    let dx = 0, dy = 0;
    if (keys.has('ArrowLeft')  || keys.has('a')) dx -= 1;
    if (keys.has('ArrowRight') || keys.has('d')) dx += 1;
    if (keys.has('ArrowUp')    || keys.has('w')) dy -= 1;
    if (keys.has('ArrowDown')  || keys.has('s')) dy += 1;

    // Without keyboard: wander slowly in a gentle figure-eight so something moves
    if (dx === 0 && dy === 0) {
      const t = elapsed;
      dx = Math.sin(t * 0.4);
      dy = Math.sin(t * 0.25) * 0.6;
    }

    const len = Math.hypot(dx, dy) || 1;
    hero.vx = (dx / len) * speed;
    hero.vy = (dy / len) * speed;
    hero.x  = Math.max(HERO_RADIUS, Math.min(screen.width  - HERO_RADIUS, hero.x + hero.vx * dt));
    hero.y  = Math.max(HERO_RADIUS, Math.min(screen.height - HERO_RADIUS, hero.y + hero.vy * dt));
    hero.angle += 2 * dt;

    // Aim toward nearest enemy
    let aimX = Math.cos(hero.angle * 0.05), aimY = Math.sin(hero.angle * 0.05);
    let minDist = Infinity;
    for (const e of s.enemies) {
      const d = Math.hypot(e.x - hero.x, e.y - hero.y);
      if (d < minDist) { minDist = d; aimX = e.x - hero.x; aimY = e.y - hero.y; }
    }
    const aimLen = Math.hypot(aimX, aimY) || 1;
    aimX /= aimLen; aimY /= aimLen;

    // ── Auto-fire ──────────────────────────────────────────────────────────────
    const fireInterval = Math.max(MIN_FIRE_MS, BASE_FIRE_MS - w * WATT_FIRE_REDUCE);
    s.fireTimer += dms;
    if (s.fireTimer >= fireInterval) {
      s.fireTimer = 0;
      // Spread shot: 1 main + extras at higher watts
      const shots = 1 + Math.floor(w / 80);
      for (let i = 0; i < shots; i++) {
        const spread = (i - (shots - 1) / 2) * 0.28;
        const bx = Math.cos(Math.atan2(aimY, aimX) + spread);
        const by = Math.sin(Math.atan2(aimY, aimX) + spread);
        s.bullets.push({
          x: hero.x, y: hero.y,
          vx: bx * BULLET_SPEED, vy: by * BULLET_SPEED,
          ttl: 80,
          dmg: BULLET_DAMAGE + Math.floor(w / 60),
        });
      }
    }

    // ── Enemy spawning ─────────────────────────────────────────────────────────
    const spawnInterval = Math.max(SPAWN_MIN_MS, SPAWN_BASE_MS - elapsed * SPAWN_RAMP);
    s.spawnTimer += dms;
    if (s.spawnTimer >= spawnInterval) {
      s.spawnTimer = 0;
      const spawnCount = 1 + Math.floor(s.wave / 3);
      for (let i = 0; i < spawnCount; i++) spawnEnemy(s, screen, elapsed);
    }

    // ── Update bullets ─────────────────────────────────────────────────────────
    for (let i = s.bullets.length - 1; i >= 0; i--) {
      const b = s.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.ttl -= dt;
      if (b.ttl <= 0 || b.x < 0 || b.x > screen.width || b.y < 0 || b.y > screen.height) {
        s.bullets.splice(i, 1);
      }
    }

    // ── Update enemies + collision ─────────────────────────────────────────────
    const enemySpeed = ENEMY_SPEED_BASE + elapsed * ENEMY_SPEED_RAMP + s.wave * 0.04;
    for (let i = s.enemies.length - 1; i >= 0; i--) {
      const e = s.enemies[i];
      // Move toward hero
      const ex = hero.x - e.x, ey = hero.y - e.y;
      const ed = Math.hypot(ex, ey) || 1;
      e.x += (ex / ed) * enemySpeed * dt;
      e.y += (ey / ed) * enemySpeed * dt;

      // Bullet hit?
      let hit = false;
      for (let j = s.bullets.length - 1; j >= 0; j--) {
        const b = s.bullets[j];
        if (Math.hypot(b.x - e.x, b.y - e.y) < ENEMY_RADIUS + BULLET_RADIUS) {
          e.hp -= b.dmg;
          s.bullets.splice(j, 1);
          hit = true;
          // Spark particles
          for (let k = 0; k < 4; k++) {
            const angle = Math.random() * Math.PI * 2;
            s.particles.push({ x: e.x, y: e.y, vx: Math.cos(angle) * 2.5, vy: Math.sin(angle) * 2.5, ttl: 14, color: e.color });
          }
          break;
        }
      }

      if (e.hp <= 0) {
        s.kills++;
        // Death burst
        for (let k = 0; k < 8; k++) {
          const angle = Math.random() * Math.PI * 2;
          s.particles.push({ x: e.x, y: e.y, vx: Math.cos(angle) * 3.5, vy: Math.sin(angle) * 3.5, ttl: 22, color: e.color });
        }
        s.enemies.splice(i, 1);
        continue;
      }

      // Hero hit?
      if (hero.invincibleMs <= 0 && Math.hypot(e.x - hero.x, e.y - hero.y) < HERO_RADIUS + ENEMY_RADIUS) {
        hero.hp -= 1;
        hero.invincibleMs = 800;
        if (hero.hp <= 0) {
          s.gameOver = true;
          s.hud.text = '☠ Overwhelmed';
          s.hud.style.fill = '#ff3333';
          return;
        }
      }
    }

    if (hero.invincibleMs > 0) hero.invincibleMs -= dms;

    // ── Update particles ───────────────────────────────────────────────────────
    for (let i = s.particles.length - 1; i >= 0; i--) {
      const p = s.particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.ttl -= dt;
      if (p.ttl <= 0) s.particles.splice(i, 1);
    }

    // ── Render all via single Graphics object ─────────────────────────────────
    gfx.clear();

    // Subtle grid
    gfx.setStrokeStyle({ width: 1, color: 0x1a1025, alpha: 0.8 });
    const gridSize = 60;
    const ox = hero.x % gridSize, oy = hero.y % gridSize;
    for (let x = -ox; x < screen.width; x += gridSize) {
      gfx.moveTo(x, 0); gfx.lineTo(x, screen.height);
    }
    for (let y = -oy; y < screen.height; y += gridSize) {
      gfx.moveTo(0, y); gfx.lineTo(screen.width, y);
    }
    gfx.stroke();

    // Particles
    for (const p of s.particles) {
      const alpha = p.ttl / 22;
      gfx.circle(p.x, p.y, 2.5);
      gfx.fill({ color: p.color, alpha });
    }

    // Bullets — bright plasma bolts
    for (const b of s.bullets) {
      const bAlpha = Math.min(1, b.ttl / 20);
      gfx.circle(b.x, b.y, BULLET_RADIUS);
      gfx.fill({ color: 0xc0f0ff, alpha: bAlpha });
      gfx.circle(b.x, b.y, BULLET_RADIUS + 2);
      gfx.fill({ color: 0x4080ff, alpha: bAlpha * 0.35 });
    }

    // Enemies
    for (const e of s.enemies) {
      const hpPct = e.hp / e.maxHp;
      gfx.circle(e.x, e.y, ENEMY_RADIUS);
      gfx.fill({ color: e.color, alpha: 0.85 });
      // HP bar
      gfx.rect(e.x - ENEMY_RADIUS, e.y - ENEMY_RADIUS - 5, ENEMY_RADIUS * 2 * hpPct, 3);
      gfx.fill({ color: 0xff3030, alpha: 0.9 });
    }

    // Hero (blinks when invincible)
    const heroVisible = hero.invincibleMs <= 0 || Math.floor(hero.invincibleMs / 80) % 2 === 0;
    if (heroVisible) {
      // Body
      gfx.circle(hero.x, hero.y, HERO_RADIUS);
      gfx.fill({ color: 0x00ff88, alpha: 1 });
      // Aiming indicator
      gfx.moveTo(hero.x, hero.y);
      gfx.lineTo(hero.x + aimX * (HERO_RADIUS + 8), hero.y + aimY * (HERO_RADIUS + 8));
      gfx.setStrokeStyle({ width: 2.5, color: 0xffffff, alpha: 0.7 });
      gfx.stroke();
    }

    // Hero HP bar (bottom of screen)
    const hpBarW = 200;
    const hpX = screen.width / 2 - hpBarW / 2;
    const hpY = screen.height - 28;
    gfx.rect(hpX, hpY, hpBarW, 10);
    gfx.fill({ color: 0x331122, alpha: 0.8 });
    gfx.rect(hpX, hpY, hpBarW * (hero.hp / hero.maxHp), 10);
    gfx.fill({ color: 0xff4466, alpha: 0.9 });

    // Watts power aura on hero
    if (w > 30) {
      const auraR = HERO_RADIUS + 4 + (w / 200) * 10;
      gfx.circle(hero.x, hero.y, auraR);
      gfx.fill({ color: 0x00ccff, alpha: (w / 300) * 0.18 });
    }
  }, [app, markComplete]));

  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const ENEMY_COLORS = [0xff3355, 0xff7722, 0xcc22ff, 0xff22aa, 0xffcc00];

function spawnEnemy(state, screen, elapsed) {
  const side = Math.floor(Math.random() * 4);
  let x, y;
  const pad = 20;
  if (side === 0) { x = Math.random() * screen.width;  y = -pad; }
  else if (side === 1) { x = screen.width  + pad; y = Math.random() * screen.height; }
  else if (side === 2) { x = Math.random() * screen.width;  y = screen.height + pad; }
  else                 { x = -pad;                y = Math.random() * screen.height; }

  const wave = 1 + Math.floor(elapsed / 30);
  const hp   = ENEMY_BASE_HP + wave;
  state.enemies.push({
    x, y,
    hp, maxHp: hp,
    color: ENEMY_COLORS[Math.floor(Math.random() * ENEMY_COLORS.length)],
  });
}
