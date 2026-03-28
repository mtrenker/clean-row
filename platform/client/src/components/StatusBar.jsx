import { useState, useEffect } from 'react';
import styles from './StatusBar.module.css';

function formatTime(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Persistent top bar shown during any experiment.
 * Subscribes to rowingData events directly so it can update at 10 Hz
 * without causing the experiment tree to re-render.
 */
export default function StatusBar({ connected, elapsedS, onBack }) {
  const [live, setLive] = useState({ watts: 0, spm: 0 });

  useEffect(() => {
    const handler = (e) => setLive({ watts: e.detail.watts, spm: e.detail.spm });
    window.addEventListener('rowingData', handler);
    return () => window.removeEventListener('rowingData', handler);
  }, []);

  return (
    <div className={styles.bar}>
      <button className={styles.back} onClick={onBack} aria-label="Back to dashboard">
        ← Back
      </button>
      <span className={`${styles.dot} ${connected ? styles.connected : styles.disconnected}`}>
        {connected ? '●' : '○'}
      </span>
      <span className={styles.spacer} />
      <span className={styles.stat}>{formatTime(elapsedS)}</span>
      <span className={styles.stat}>{live.spm} <small>SPM</small></span>
      <span className={styles.stat}>{live.watts} <small>W</small></span>
    </div>
  );
}
