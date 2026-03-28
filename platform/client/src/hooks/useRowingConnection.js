import { useState, useEffect } from 'react';

/**
 * Listens to the `connectionStatus` CustomEvent dispatched by the Android bridge
 * (or the dev simulator) and returns the current connection state.
 */
export function useRowingConnection() {
    const [state, setState] = useState({ connected: false, message: 'Connecting...' });

    useEffect(() => {
        const handler = (e) =>
            setState({ connected: e.detail.connected, message: e.detail.message ?? '' });

        window.addEventListener('connectionStatus', handler);
        return () => window.removeEventListener('connectionStatus', handler);
    }, []);

    return state;
}
