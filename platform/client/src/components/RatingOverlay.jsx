import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './RatingOverlay.module.css';

/**
 * Full-screen overlay shown after a session ends.
 * User picks 1–5 stars; after submission we navigate back to the dashboard.
 */
export default function RatingOverlay({ onRate, summary }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const handleRate = async (rating) => {
    if (submitted) return;
    setSelected(rating);
    setSubmitted(true);
    await onRate(rating);
    setTimeout(() => navigate('/'), 600);
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <h2 className={styles.title}>🏁 Session Complete!</h2>
        {summary && <p className={styles.summary}>{summary}</p>}
        <p className={styles.prompt}>How fun was that?</p>
        <div className={styles.stars}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              className={`${styles.star} ${selected === n ? styles.selected : ''}`}
              onClick={() => handleRate(n)}
              disabled={submitted}
              aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
