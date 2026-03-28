import { useState, useEffect, useRef } from 'react';
import { Application } from 'pixi.js';

/**
 * Initialises a PixiJS v8 Application attached to a container element.
 *
 * @param {React.RefObject} containerRef  - ref pointing to the DOM container
 * @param {object}          options       - forwarded to Application.init() (except `canvas`)
 * @returns {Application|null}  the initialised app, or null while loading
 *
 * Usage:
 *   const containerRef = useRef(null);
 *   const app = usePixiApp(containerRef, { background: '#0a0a1a' });
 */
export function usePixiApp(containerRef, options = {}) {
    const [app, setApp] = useState(null);
    const optionsRef = useRef(options);

    useEffect(() => {
        let pixi = null;
        let cancelled = false;

        async function init() {
            pixi = new Application();
            await pixi.init({
                resizeTo: containerRef.current,
                antialias: true,
                autoDensity: true,
                resolution: window.devicePixelRatio || 1,
                background: '#0a0a1a',
                ...optionsRef.current,
            });

            if (cancelled) {
                pixi.destroy(true);
                return;
            }

            containerRef.current.appendChild(pixi.canvas);
            setApp(pixi);
        }

        init().catch(console.error);

        return () => {
            cancelled = true;
            if (pixi) {
                pixi.destroy(true, { children: true });
            }
            setApp(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [containerRef]);

    return app;
}
