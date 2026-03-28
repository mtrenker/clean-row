/**
 * Clean Row Bridge - JavaScript Client
 * 
 * This module handles communication with the Clean Row Android app.
 * It provides a simple API for sending commands and receiving real-time data.
 */

// Bridge interface for posting messages to native Android
const cleanRowBridge = (function () {
    const isAndroid = typeof window.cleanRowBridge !== 'undefined';

    if (isAndroid) {
        // Use the native WebMessageListener interface
        return {
            postMessage: (data) => {
                window.cleanRowBridge.postMessage(JSON.stringify(data));
            }
        };
    } else {
        // Fallback for testing in browser
        console.warn('Clean Row Bridge not available (running in browser)');
        return {
            postMessage: (data) => {
                console.log('Bridge command (simulated):', data);
            }
        };
    }
})();

/**
 * Listen for rowing data updates from the machine.
 * Fires approximately 10 times per second (10Hz).
 */
window.addEventListener('rowingData', (event) => {
    const data = event.detail;
    console.log('Rowing data:', data);

    // Update UI elements
    document.getElementById('rpm').textContent = data.rpm;
    document.getElementById('watts').textContent = data.watts;
    document.getElementById('spm').textContent = data.spm;
    document.getElementById('strokes').textContent = data.strokeCount;
    document.getElementById('drag').textContent = data.drag;

    // You can add custom logic here, e.g.:
    // - Update charts
    // - Calculate pace
    // - Trigger game events
    // - Check workout goals
});

/**
 * Listen for connection status changes.
 */
window.addEventListener('connectionStatus', (event) => {
    const status = event.detail;
    console.log('Connection status:', status);

    const statusEl = document.getElementById('status');
    if (status.connected) {
        statusEl.textContent = 'Connected to rowing machine';
        statusEl.className = 'status connected';
    } else {
        statusEl.textContent = status.message || 'Disconnected';
        statusEl.className = 'status disconnected';
    }
});

/**
 * Listen for physical button presses.
 */
window.addEventListener('buttonPress', (event) => {
    const buttonData = event.detail;
    console.log('Button pressed:', buttonData);

    if (buttonData.type === 'shortPress') {
        // Handle short press (e.g., pause/resume)
        console.log('Short press detected');
    } else if (buttonData.type === 'longPress') {
        // Handle long press (screen will dim automatically)
        console.log('Long press detected');
    }
});

/**
 * API Helper Functions
 * Use these to send commands to the rowing machine.
 */
const CleanRowAPI = {
    /**
     * Set drag level (magnetic brake resistance).
     * @param {number} level - Resistance level 0-24
     */
    setDrag(level) {
        cleanRowBridge.postMessage({
            type: 'command',
            action: 'setDrag',
            value: level
        });
    },

    /**
     * Set target wattage.
     * @param {number} watts - Target power output 0-500W
     */
    setWatt(watts) {
        cleanRowBridge.postMessage({
            type: 'command',
            action: 'setWatt',
            value: watts
        });
    },

    /**
     * Set LED RGB color.
     * @param {number} r - Red 0-255
     * @param {number} g - Green 0-255
     * @param {number} b - Blue 0-255
     */
    setLedRgb(r, g, b) {
        cleanRowBridge.postMessage({
            type: 'command',
            action: 'setLedRgb',
            r: r,
            g: g,
            b: b
        });
    },

    /**
     * Set LED preset color.
     * @param {number} preset - Preset ID: 0=off, 1=blue, 2=cyan, 3=green, 
     *                          4=yellow, 5=orange, 6=red, 7=purple
     */
    setLedPreset(preset) {
        cleanRowBridge.postMessage({
            type: 'command',
            action: 'setLedPreset',
            value: preset
        });
    },

    /**
     * Clear the stroke counter.
     */
    clearCounter() {
        cleanRowBridge.postMessage({
            type: 'command',
            action: 'clearCounter'
        });
    },

    /**
     * Pause workout polling (stops receiving updates).
     */
    pause() {
        cleanRowBridge.postMessage({
            type: 'command',
            action: 'pause'
        });
    },

    /**
     * Resume workout polling.
     */
    resume() {
        cleanRowBridge.postMessage({
            type: 'command',
            action: 'resume'
        });
    },

    /**
     * Reload the currently loaded web page inside the app WebView.
     */
    reload() {
        cleanRowBridge.postMessage({
            type: 'command',
            action: 'reload'
        });
    },

    /**
     * Close the app activity.
     */
    closeApp() {
        cleanRowBridge.postMessage({
            type: 'command',
            action: 'closeApp'
        });
    },

    /**
     * Restart the app process.
     */
    restartApp() {
        cleanRowBridge.postMessage({
            type: 'command',
            action: 'restartApp'
        });
    },

    /**
     * Toggle the display on/off (dims or restores brightness).
     * When dimmed, press any volume button to wake the screen.
     */
    toggleDisplay() {
        cleanRowBridge.postMessage({
            type: 'command',
            action: 'toggleDisplay'
        });
    }
};

// Export API for easy access
window.CleanRowAPI = CleanRowAPI;

// Log when bridge is ready
console.log('Clean Row Bridge loaded');
if (typeof window.cleanRowBridge !== 'undefined') {
    console.log('Native bridge detected - commands will be sent to rowing machine');
} else {
    console.log('Running in browser mode - commands will be simulated');
}
