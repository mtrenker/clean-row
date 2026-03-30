import { lazy, Suspense } from 'react';
import { useParams, Link } from 'react-router-dom';
import ExperimentLayout from '../components/ExperimentLayout.jsx';
import styles from './ExperimentPage.module.css';

/**
 * Registry of React-native experiment components.
 * Add an entry here when a new experiment is migrated from HTML.
 */
const EXPERIMENTS = {
  'target-watts': lazy(() => import('../experiments/target-watts/index.jsx')),
  'void-swarm': lazy(() => import('../experiments/void-swarm/index.jsx')),
  'aurora': lazy(() => import('../experiments/aurora/index.jsx')),
};

export default function ExperimentPage() {
  const { slug } = useParams();
  const ExperimentComponent = EXPERIMENTS[slug];

  if (!ExperimentComponent) {
    return (
      <div className={styles.notFound}>
        <p>Experiment <strong>{slug}</strong> not found.</p>
        <Link to="/">← Back to dashboard</Link>
      </div>
    );
  }

  return (
    <ExperimentLayout>
      <Suspense fallback={<div className={styles.loading}>Loading…</div>}>
        <ExperimentComponent />
      </Suspense>
    </ExperimentLayout>
  );
}
