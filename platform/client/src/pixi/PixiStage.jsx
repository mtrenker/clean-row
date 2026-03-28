import { useRef } from 'react';
import { PixiContext } from './PixiContext.js';
import { usePixiApp } from './usePixiApp.js';
import styles from './PixiStage.module.css';

/**
 * Full-screen PixiJS canvas container.
 *
 * Renders a positioned div that fills its parent, initialises a PixiJS v8
 * Application sized to that div, and exposes the app to descendants via
 * PixiContext so any child can call `usePixi()` to get the running app.
 *
 * Children are rendered after the app is ready (`app !== null`), so you can
 * safely access `app.stage` and `app.ticker` inside child components without
 * null guards.
 *
 * @param {object}  pixiOptions  - forwarded to Application.init() (background, etc.)
 * @param {node}    children     - React children rendered once pixi is ready
 *
 * Example:
 *   <PixiStage pixiOptions={{ background: '#000011' }}>
 *     <MyScene />   // can call usePixi() here
 *   </PixiStage>
 */
export default function PixiStage({ pixiOptions, children }) {
  const containerRef = useRef(null);
  const app = usePixiApp(containerRef, pixiOptions);

  return (
    <PixiContext.Provider value={app}>
      <div ref={containerRef} className={styles.stage}>
        {/* Children are only rendered once the Pixi app is ready */}
        {app && children}
      </div>
    </PixiContext.Provider>
  );
}
