import { useEffect } from 'react';

/**
 * Fires fake rowing data events at 10 Hz when no real Android bridge is present.
 * Mirrors the dev simulator in experiment-sdk.js so the app is fully testable
 * in a browser without the physical machine.
 */
export function useDevSimulator() {
    useEffect(() => {
        if (typeof window.cleanRowBridge !== 'undefined') return;

        console.info('[Dev] Simulator active — fake rowing data streaming');

        let strokeNum = 0;
        let phase = 0;

        const interval = setInterval(() => {
            phase += 0.1;
            const detail = {
                watts: Math.round(120 + Math.sin(phase) * 40 + Math.random() * 10),
                spm: Math.round(22 + Math.sin(phase * 0.5) * 4),
                strokeCount: ++strokeNum,
                drag: 16,
            };
            window.dispatchEvent(new CustomEvent('rowingData', { detail }));
        }, 100);

        const connTimeout = setTimeout(() => {
            window.dispatchEvent(new CustomEvent('connectionStatus', {
                detail: { connected: true, message: 'Dev simulator' },
            }));
        }, 200);

        return () => {
            clearInterval(interval);
            clearTimeout(connTimeout);
        };
    }, []);
}
