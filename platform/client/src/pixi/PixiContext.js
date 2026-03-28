import { createContext, useContext } from 'react';

/**
 * Holds the initialised PixiJS Application instance.
 * Consumed via usePixi() inside any child of <PixiStage>.
 */
export const PixiContext = createContext(null);

export function usePixi() {
    const app = useContext(PixiContext);
    if (!app) throw new Error('usePixi must be used inside <PixiStage>');
    return app;
}
