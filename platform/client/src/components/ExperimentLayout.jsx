import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { RowingContext } from '../context/RowingContext.jsx';
import { useDevSimulator } from '../hooks/useDevSimulator.js';
import { useRowingConnection } from '../hooks/useRowingConnection.js';
import { useSession } from '../hooks/useSession.js';
import StatusBar from './StatusBar.jsx';
import RatingOverlay from './RatingOverlay.jsx';
import styles from './ExperimentLayout.module.css';

/**
 * Shell that wraps every React-native experiment. Responsibilities:
 *   - Start the dev simulator in browser environments
 *   - Manage connection status
 *   - Own the session lifecycle (create on first stroke, batch flush, end)
 *   - Render the top StatusBar and end-of-session RatingOverlay
 *   - Provide all session + connection state to children via RowingContext
 */
export default function ExperimentLayout({ children }) {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [experimentId, setExperimentId] = useState(null);

  // Resolve slug → UUID once so the session can reference the right experiment
  useEffect(() => {
    fetch(`/api/experiments/${slug}`)
      .then((r) => r.ok ? r.json() : null)
      .then((exp) => { if (exp?.id) setExperimentId(exp.id); })
      .catch(() => {});
  }, [slug]);

  useDevSimulator();
  const { connected } = useRowingConnection();
  const session = useSession(experimentId);

  // Track every stroke for session logging. Game logic is handled per-experiment.
  const { addStroke } = session;
  useEffect(() => {
    const handler = (e) => addStroke(e.detail);
    window.addEventListener('rowingData', handler);
    return () => window.removeEventListener('rowingData', handler);
  }, [addStroke]);

  const handleBack = useCallback(() => {
    session.endSession({ completed: false });
    navigate('/');
  }, [session, navigate]);

  const ctx = {
    connected,
    sessionId: session.sessionId,
    elapsedS: session.elapsedS,
    ended: session.ended,
    completed: session.completed,
    markComplete: session.markComplete,
    endSession: session.endSession,
    submitRating: session.submitRating,
  };

  return (
    <RowingContext.Provider value={ctx}>
      <div className={styles.layout}>
        <StatusBar
          connected={connected}
          elapsedS={session.elapsedS}
          onBack={handleBack}
        />
        <main className={styles.main}>
          {children}
        </main>
        {session.ended && (
          <RatingOverlay onRate={session.submitRating} />
        )}
      </div>
    </RowingContext.Provider>
  );
}
