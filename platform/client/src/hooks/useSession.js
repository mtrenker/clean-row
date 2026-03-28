import { useState, useRef, useEffect, useCallback } from 'react';

const API = '/api';

/**
 * Manages the full session lifecycle:
 *   - Lazy session creation on the first stroke
 *   - Stroke buffering + 5 s batch flush to backend
 *   - sendBeacon flush on page close
 *   - Session end (completed or quit)
 *   - Fun rating submission
 *
 * @param {string|null} experimentId  The experiment UUID, forwarded to the backend as experiment_id
 */
export function useSession(experimentId) {
    const [sessionId, setSessionId] = useState(null);
    const [elapsedS, setElapsedS] = useState(0);
    const [ended, setEnded] = useState(false);
    const [completed, setCompleted] = useState(false);

    const refs = useRef({
        sessionId: null,
        experimentId,
        strokeBuffer: [],
        startTime: null,
        ended: false,
        creating: false,
    });

    // Keep experimentId in sync without retriggering effects
    useEffect(() => { refs.current.experimentId = experimentId; }, [experimentId]);

    // Elapsed timer — starts once session is created
    useEffect(() => {
        if (!sessionId || ended) return;
        const tick = setInterval(() => {
            setElapsedS(Math.round((Date.now() - refs.current.startTime) / 1000));
        }, 1000);
        return () => clearInterval(tick);
    }, [sessionId, ended]);

    const createSession = useCallback(async () => {
        if (refs.current.sessionId) return refs.current.sessionId;
        if (refs.current.creating) return null;
        refs.current.creating = true;
        try {
            const body = refs.current.experimentId ? { experiment_id: refs.current.experimentId } : {};
            const res = await fetch(`${API}/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(5000),
            });
            if (!res.ok) throw new Error(`${res.status}`);
            const { id } = await res.json();
            refs.current.sessionId = id;
            refs.current.startTime = Date.now();
            setSessionId(id);
            return id;
        } catch (err) {
            console.warn('[Session] Failed to create session:', err.message);
            return null;
        } finally {
            refs.current.creating = false;
        }
    }, []);

    const flushStrokes = useCallback(async () => {
        const { sessionId: id, strokeBuffer } = refs.current;
        if (!id || strokeBuffer.length === 0) return;
        const strokes = [...strokeBuffer];
        refs.current.strokeBuffer = [];
        try {
            await fetch(`${API}/sessions/${id}/strokes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ strokes }),
            });
        } catch {
            // Re-queue on failure so strokes aren't lost
            refs.current.strokeBuffer = [...strokes, ...refs.current.strokeBuffer];
        }
    }, []);

    // Periodic 5 s flush
    useEffect(() => {
        const interval = setInterval(flushStrokes, 5000);
        return () => clearInterval(interval);
    }, [flushStrokes]);

    // Best-effort flush on page unload via sendBeacon
    useEffect(() => {
        const handleUnload = () => {
            const { sessionId: id, ended, strokeBuffer } = refs.current;
            if (!id || ended || strokeBuffer.length === 0) return;
            const blob = new Blob(
                [JSON.stringify({ strokes: strokeBuffer })],
                { type: 'application/json' }
            );
            navigator.sendBeacon(`${API}/sessions/${id}/strokes`, blob);
        };
        window.addEventListener('beforeunload', handleUnload);
        return () => window.removeEventListener('beforeunload', handleUnload);
    }, []);

    /** Called by ExperimentLayout on every rowingData event. */
    const addStroke = useCallback(async (raw) => {
        const id = await createSession();
        if (!id) return;
        refs.current.strokeBuffer.push({
            stroke_num: raw.strokeCount,
            watts: raw.watts,
            spm: raw.spm,
            drag: raw.drag,
        });
    }, [createSession]);

    const endSession = useCallback(async (opts = {}) => {
        const { sessionId: id, ended } = refs.current;
        if (!id || ended) return;
        refs.current.ended = true;
        setEnded(true);
        await flushStrokes();
        try {
            await fetch(`${API}/sessions/${id}/end`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed: false, ...opts }),
            });
        } catch (err) {
            console.warn('[Session] Failed to end session:', err.message);
        }
    }, [flushStrokes]);

    const markComplete = useCallback(async () => {
        setCompleted(true);
        await endSession({ completed: true });
    }, [endSession]);

    /** Submits the fun rating after session end. Matches original SDK behaviour. */
    const submitRating = useCallback(async (rating) => {
        const id = refs.current.sessionId;
        if (!id) return;
        try {
            await fetch(`${API}/sessions/${id}/end`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fun_rating: rating }),
            });
        } catch (err) {
            console.warn('[Session] Failed to submit rating:', err.message);
        }
    }, []);

    return { sessionId, elapsedS, ended, completed, addStroke, endSession, markComplete, submitRating };
}
