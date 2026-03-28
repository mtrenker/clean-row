import { useEffect, useRef } from 'react';
import { usePixi } from './PixiContext.js';

/**
 * Registers a per-frame callback on the Pixi ticker.
 *
 * The callback receives `ticker` (same as Pixi's Ticker object) so you can
 * read `ticker.deltaTime` (frame-rate independent delta, ~1 at 60fps) and
 * `ticker.deltaMS` (milliseconds since last frame).
 *
 * The callback ref is always up to date — safe to define inline without
 * causing the ticker listener to re-register on every render.
 *
 * @param {(ticker: Ticker) => void} callback
 *
 * Example:
 *   usePixiTicker((ticker) => {
 *     sprite.x += speed * ticker.deltaTime;
 *   });
 */
export function usePixiTicker(callback) {
    const app = usePixi();
    const callbackRef = useRef(callback);
    useEffect(() => { callbackRef.current = callback; });

    useEffect(() => {
        const listener = (ticker) => callbackRef.current(ticker);
        app.ticker.add(listener);
        return () => {
            if (app.ticker) app.ticker.remove(listener);
        };
    }, [app]);
}
