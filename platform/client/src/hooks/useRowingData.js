import { useEffect, useRef } from 'react';

/**
 * Subscribes to `rowingData` CustomEvents for an experiment's game loop.
 *
 * - onStroke fires on every stroke event (~10 Hz from the machine)
 * - onInterval fires every 1 second with the latest data reading
 *
 * Callbacks are kept in refs so they can be defined inline in components
 * without causing the event listener to re-subscribe on every render.
 *
 * NOTE: session tracking (addStroke / session creation) is handled by
 * ExperimentLayout — experiment components should NOT call addStroke here.
 */
export function useRowingData({ onStroke, onInterval } = {}) {
    const latestRef = useRef({ watts: 0, spm: 0, drag: 16 });
    const onStrokeRef = useRef(onStroke);
    const onIntervalRef = useRef(onInterval);

    useEffect(() => { onStrokeRef.current = onStroke; });
    useEffect(() => { onIntervalRef.current = onInterval; });

    useEffect(() => {
        const handler = (e) => {
            const d = e.detail;
            latestRef.current = { watts: d.watts, spm: d.spm, drag: d.drag };
            onStrokeRef.current?.(d);
        };
        window.addEventListener('rowingData', handler);
        return () => window.removeEventListener('rowingData', handler);
    }, []);

    useEffect(() => {
        const tick = setInterval(() => {
            onIntervalRef.current?.(latestRef.current);
        }, 1000);
        return () => clearInterval(tick);
    }, []);
}
