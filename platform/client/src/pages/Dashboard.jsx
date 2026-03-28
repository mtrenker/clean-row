import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import styles from './Dashboard.module.css';

const DIFFICULTY_COLOR = {
  easy: '#00ff64',
  medium: '#f7cb15',
  hard: '#ff6b35',
};

export default function Dashboard() {
  const [experiments, setExperiments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/experiments?status=active')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setExperiments)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className={styles.center}>Loading experiments…</div>;
  if (error) return <div className={styles.center}>⚠ {error}</div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.logo}>Clean Row</h1>
        <p className={styles.sub}>Choose your experiment</p>
      </header>

      <div className={styles.grid}>
        {experiments.map((exp) => {
          const manifest = exp.manifest ?? {};
          const diffColor = DIFFICULTY_COLOR[manifest.difficulty] ?? 'rgba(255,255,255,0.5)';

          return (
            <Link
              key={exp.id}
              to={`/experiments/${exp.slug}`}
              className={styles.card}
            >
              <div className={styles.cardMeta}>
                <span className={styles.type}>{manifest.type ?? '—'}</span>
                <span className={styles.difficulty} style={{ color: diffColor }}>
                  {manifest.difficulty ?? ''}
                </span>
              </div>
              <h2 className={styles.name}>{exp.name}</h2>
              {exp.description && (
                <p className={styles.description}>{exp.description}</p>
              )}
              {manifest.tags?.length > 0 && (
                <div className={styles.tags}>
                  {manifest.tags.map((tag) => (
                    <span key={tag} className={styles.tag}>{tag}</span>
                  ))}
                </div>
              )}
              <div className={styles.cardFooter}>
                <span>{exp.play_count ?? 0} plays</span>
                {exp.composite_score > 0 && (
                  <span>★ {Number(exp.composite_score).toFixed(1)}</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
