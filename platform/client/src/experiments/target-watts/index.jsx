import { useState, useRef, useCallback, useEffect } from 'react';
import { useRowing } from '../../context/RowingContext.jsx';
import { useRowingData } from '../../hooks/useRowingData.js';
import styles from './TargetWatts.module.css';

const MAX_WATTS = 300;
const TOTAL_ROUNDS = 8;
const ROUND_DURATION_S = 45;
const REST_DURATION_S = 15;

const ROUNDS = [
  { target: 100, tolerance: 30 },
  { target: 130, tolerance: 25 },
  { target: 150, tolerance: 25 },
  { target: 170, tolerance: 20 },
  { target: 150, tolerance: 20 },
  { target: 180, tolerance: 20 },
  { target: 200, tolerance: 15 },
  { target: 160, tolerance: 25 }, // cooldown
];

function fmtTime(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function TargetWatts() {
  const { markComplete } = useRowing();

  // UI state (drives re-renders)
  const [watts, setWatts] = useState(0);
  const [score, setScore] = useState(0);
  const [timerDisplay, setTimerDisplay] = useState(ROUND_DURATION_S);
  const [phaseLabel, setPhaseLabel] = useState(null); // { text, color }
  const [flash, setFlash] = useState(null);           // 'hit' | 'miss'
  const [roundState, setRoundState] = useState({
    roundIdx: 0,
    inRest: false,
    target: ROUNDS[0].target,
    tolerance: ROUNDS[0].tolerance,
  });

  // Mutable game state lives in a ref to avoid stale-closure issues in callbacks
  const g = useRef({
    roundIdx: 0,
    inRest: false,
    timer: 0,
    hitStreak: 0,
    score: 0,
  });

  const showPhase = useCallback((text, color) => {
    setPhaseLabel({ text, color });
    setTimeout(() => setPhaseLabel(null), 1500);
  }, []);

  const startRound = useCallback((idx) => {
    if (idx >= TOTAL_ROUNDS) {
      markComplete();
      return;
    }
    const r = ROUNDS[idx];
    g.current.roundIdx = idx;
    g.current.inRest = false;
    g.current.timer = ROUND_DURATION_S;
    setTimerDisplay(ROUND_DURATION_S);
    setRoundState({ roundIdx: idx, inRest: false, target: r.target, tolerance: r.tolerance });
    showPhase(`Round ${idx + 1}`, '#f7cb15');
  }, [markComplete, showPhase]);

  const startRest = useCallback(() => {
    g.current.inRest = true;
    g.current.timer = REST_DURATION_S;
    setTimerDisplay(REST_DURATION_S);
    setRoundState((s) => ({ ...s, inRest: true }));
    showPhase('Rest', '#4fc3f7');
  }, [showPhase]);

  // Kick off first round after mount
  useEffect(() => {
    const t = setTimeout(() => startRound(0), 500);
    return () => clearTimeout(t);
  }, [startRound]);

  const handleStroke = useCallback((data) => {
    if (g.current.inRest) return;

    setWatts(data.watts);

    const r = ROUNDS[g.current.roundIdx];
    const hit = Math.abs(data.watts - r.target) <= r.tolerance;

    if (hit) {
      g.current.hitStreak++;
      g.current.score += 10 + Math.floor(g.current.hitStreak * 2);
      setScore(g.current.score);
      setFlash('hit');
    } else {
      g.current.hitStreak = 0;
      setFlash('miss');
    }
    setTimeout(() => setFlash(null), 120);
  }, []);

  const handleInterval = useCallback(() => {
    if (g.current.timer > 0) {
      g.current.timer--;
      setTimerDisplay(g.current.timer);
    } else {
      if (g.current.inRest) {
        startRound(g.current.roundIdx + 1);
      } else {
        startRest();
      }
    }
  }, [startRound, startRest]);

  useRowingData({ onStroke: handleStroke, onInterval: handleInterval });

  const r = ROUNDS[Math.min(roundState.roundIdx, TOTAL_ROUNDS - 1)];
  const powerPct = Math.min(100, (watts / MAX_WATTS) * 100);
  const targetBottomPct = ((r.target - r.tolerance) / MAX_WATTS) * 100;
  const targetHeightPct = ((r.tolerance * 2) / MAX_WATTS) * 100;

  return (
    <div className={styles.arena}>
      {/* Screen flash on hit / miss */}
      {flash && <div className={`${styles.flash} ${styles[flash]}`} />}

      {/* Phase label (round X / Rest) */}
      {phaseLabel && (
        <div className={styles.phaseLabel} style={{ color: phaseLabel.color }}>
          {phaseLabel.text}
        </div>
      )}

      {/* Score + timer */}
      <div className={styles.score}>Score: {score}</div>
      <div className={styles.roundTimer}>
        {roundState.inRest ? 'Rest' : `Round ${roundState.roundIdx + 1}`}
        {' · '}
        {fmtTime(timerDisplay)}
      </div>

      {/* Vertical power bar + target zone */}
      <div className={styles.barSection}>
        <div className={styles.barTrack}>
          <div className={styles.powerFill} style={{ height: `${powerPct}%` }} />
        </div>

        {!roundState.inRest && (
          <div
            className={styles.targetZone}
            style={{
              bottom: `${targetBottomPct}%`,
              height: `${targetHeightPct}%`,
            }}
          >
            {r.target}W ±{r.tolerance}
          </div>
        )}
      </div>

      <div className={styles.wattLabel}>{watts}W</div>
    </div>
  );
}
