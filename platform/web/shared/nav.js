/**
 * Injects a "← Dashboard" back button into the experiment's top HUD/status bar.
 * Works with both #status-bar (target-watts) and #hud (breathing-pacer).
 * Include as the first <script> in <body>.
 */
(function () {
  const DASHBOARD_URL = '/dashboard/index.html';

  const style = document.createElement('style');
  style.textContent = `
    .nav-back-btn {
      background: none;
      border: 1px solid rgba(255,255,255,0.25);
      border-radius: 6px;
      color: rgba(255,255,255,0.8);
      cursor: pointer;
      font-family: inherit;
      font-size: 0.85em;
      padding: 3px 10px;
      white-space: nowrap;
      transition: background 0.15s, color 0.15s;
    }
    .nav-back-btn:hover, .nav-back-btn:active {
      background: rgba(255,255,255,0.15);
      color: #fff;
    }
  `;
  document.head.appendChild(style);

  function injectButton() {
    const bar = document.getElementById('status-bar') || document.getElementById('hud');
    if (!bar) return;

    const btn = document.createElement('button');
    btn.className = 'nav-back-btn';
    btn.textContent = '← Dashboard';
    btn.addEventListener('click', () => {
      // End the active SDK session (sendBeacon fires on pagehide automatically,
      // but calling quit() first marks it completed=false cleanly)
      if (window.cleanRowSDK) {
        window.cleanRowSDK.quit();
      }
      window.location.href = DASHBOARD_URL;
    });

    bar.insertBefore(btn, bar.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButton);
  } else {
    injectButton();
  }
})();
