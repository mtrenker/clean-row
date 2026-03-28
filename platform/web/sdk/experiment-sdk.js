/**
 * Clean Row Experiment SDK
 * 
 * Drop this into any experiment HTML. It:
 *   - Hooks into the Android bridge (rowingData, connectionStatus, buttonPress events)
 *   - Calls your experiment lifecycle hooks (onStroke, onInterval, onSessionEnd)
 *   - Batches and reports stroke data to the backend automatically
 *   - Exposes machine control helpers (setDrag, setLed, markComplete)
 * 
 * Usage:
 *   const sdk = new ExperimentSDK({ onStroke, onInterval, onSessionEnd });
 */

(function (global) {
    'use strict';

    // ── Config ────────────────────────────────────────────────────────────────
    const API_BASE = '/api';
    const STROKE_BATCH_INTERVAL_MS = 5000;   // flush strokes every 5s
    const INTERVAL_TICK_MS = 1000;            // onInterval fires every 1s

    // ── Android bridge passthrough ─────────────────────────────────────────────
    const bridge = (function () {
        if (typeof window.cleanRowBridge !== 'undefined') {
            return {
                postMessage: (data) => window.cleanRowBridge.postMessage(JSON.stringify(data))
            };
        }
        // Browser dev fallback: simulate data
        return {
            postMessage: (data) => console.log('[SDK bridge]', data)
        };
    })();

    // ── Dev simulator (browser-only) ─────────────────────────────────────────
    function startDevSimulator(sdk) {
        let strokeNum = 0;
        let phase = 0;
        // Simulate rowing data at 10Hz
        setInterval(() => {
            phase += 0.1;
            const simData = {
                watts: Math.round(120 + Math.sin(phase) * 40 + Math.random() * 10),
                spm: Math.round(22 + Math.sin(phase * 0.5) * 4),
                strokeCount: ++strokeNum,
                drag: 16,
            };
            window.dispatchEvent(new CustomEvent('rowingData', { detail: simData }));
        }, 100);

        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('connectionStatus', {
                detail: { connected: true, message: 'Simulated connection' }
            }));
        }, 200);

        console.info('[SDK] Dev simulator active — fake rowing data streaming');
    }

    // ── Main SDK class ─────────────────────────────────────────────────────────
    class ExperimentSDK {
        constructor(options = {}) {
            this._onStroke = options.onStroke || (() => { });
            this._onInterval = options.onInterval || (() => { });
            this._onSessionEnd = options.onSessionEnd || (() => { });

            this._sessionId = null;
            this._experimentSlug = new URLSearchParams(location.search).get('experiment') || null;
            this._strokeBuffer = [];
            this._lastStrokeNum = 0;
            this._startTime = null;
            this._completed = false;
            this._ended = false;
            this._latestData = { watts: 0, spm: 0, drag: 0 };

            this._init();
        }

        // ── Internal init ────────────────────────────────────────────────────

        _init() {
            // Session starts lazily on first stroke so page-peeks don't create ghost sessions
            this._listenToMachine();
            this._startBatchFlush();
            this._startIntervalTick();

            // Auto-end session when page is hidden/unloaded (back button, tab close, etc.)
            window.addEventListener('pagehide', () => this._beaconEnd());

            // Expose on window so nav.js can call quit() before navigating
            window.cleanRowSDK = this;

            // In browser without Android bridge, start simulator
            if (typeof window.cleanRowBridge === 'undefined') {
                startDevSimulator(this);
            }
        }

        async _startSession() {
            try {
                let experimentId = null;

                // Resolve experiment UUID from slug if present
                if (this._experimentSlug) {
                    const res = await fetch(`${API_BASE}/experiments/${this._experimentSlug}`);
                    if (res.ok) {
                        const exp = await res.json();
                        experimentId = exp.id;
                    }
                }

                const res = await fetch(`${API_BASE}/sessions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ experiment_id: experimentId }),
                });
                if (res.ok) {
                    const session = await res.json();
                    this._sessionId = session.id;
                    this._startTime = Date.now();
                    console.info(`[SDK] Session started: ${this._sessionId}`);
                }
            } catch (e) {
                console.warn('[SDK] Could not start session:', e);
            }
        }

        _listenToMachine() {
            window.addEventListener('rowingData', (event) => {
                const data = event.detail;
                this._latestData = { watts: data.watts, spm: data.spm, drag: data.drag };

                // Start session lazily on first actual stroke
                if (!this._sessionId && !this._ended) {
                    this._startSession();
                }

                // Only fire onStroke when stroke count increases
                if (data.strokeCount > this._lastStrokeNum) {
                    this._lastStrokeNum = data.strokeCount;
                    const strokeData = {
                        strokeNum: data.strokeCount,
                        watts: data.watts,
                        spm: data.spm,
                        drag: data.drag,
                        elapsedS: this._elapsedS(),
                        sessionId: this._sessionId,
                    };
                    this._strokeBuffer.push({
                        stroke_num: data.strokeCount,
                        watts: data.watts,
                        spm: data.spm,
                        drag: data.drag,
                    });
                    this._onStroke(strokeData);
                }
            });

            window.addEventListener('connectionStatus', (event) => {
                console.info('[SDK] Connection:', event.detail);
            });

            window.addEventListener('buttonPress', (event) => {
                const btn = event.detail;
                if (btn.type === 'longPress') {
                    this._endSession(false);
                }
            });
        }

        _startBatchFlush() {
            this._flushInterval = setInterval(() => this._flushStrokes(), STROKE_BATCH_INTERVAL_MS);
        }

        _startIntervalTick() {
            this._tickInterval = setInterval(() => {
                this._onInterval({ ...this._latestData, sessionId: this._sessionId }, this._elapsedS());
            }, INTERVAL_TICK_MS);
        }

        async _flushStrokes() {
            if (!this._sessionId || this._strokeBuffer.length === 0) return;
            const batch = this._strokeBuffer.splice(0);
            try {
                await fetch(`${API_BASE}/sessions/${this._sessionId}/strokes`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ strokes: batch }),
                });
            } catch (e) {
                // Re-add to buffer on failure
                this._strokeBuffer.unshift(...batch);
            }
        }

        async _endSession(completed) {
            if (!this._sessionId || this._ended) return;
            this._ended = true;
            clearInterval(this._flushInterval);
            clearInterval(this._tickInterval);

            await this._flushStrokes();

            const summary = this._buildSummary(completed);
            this._onSessionEnd(summary);

            try {
                await fetch(`${API_BASE}/sessions/${this._sessionId}/end`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        total_strokes: this._lastStrokeNum,
                        completed,
                        ...summary,
                    }),
                });
            } catch (e) {
                console.warn('[SDK] Could not finalize session:', e);
            }
        }

        /** End session via sendBeacon (safe during pagehide — no await needed). */
        _beaconEnd() {
            if (!this._sessionId || this._ended) return;
            this._ended = true;
            clearInterval(this._flushInterval);
            clearInterval(this._tickInterval);
            const summary = this._buildSummary(false);
            const payload = JSON.stringify({
                total_strokes: this._lastStrokeNum,
                completed: this._completed,
                ...summary,
            });
            navigator.sendBeacon(
                `${API_BASE}/sessions/${this._sessionId}/end`,
                new Blob([payload], { type: 'application/json' })
            );
        }

        _buildSummary(completed) {
            return {
                total_strokes: this._lastStrokeNum,
                avg_watts: this._latestData.watts,
                avg_spm: this._latestData.spm,
                duration_s: this._elapsedS(),
                completed,
                sessionId: this._sessionId,
            };
        }

        _elapsedS() {
            return this._startTime ? Math.floor((Date.now() - this._startTime) / 1000) : 0;
        }

        // ── Public API ────────────────────────────────────────────────────────

        /** Set magnetic brake resistance (0-24) */
        setDrag(level) {
            bridge.postMessage({ type: 'command', action: 'setDrag', value: level });
        }

        /** Set LED to RGB color */
        setLed(r, g, b) {
            bridge.postMessage({ type: 'command', action: 'setLedRgb', r, g, b });
        }

        /** Set LED to a preset (0=off, 1=blue, 2=cyan, 3=green, 4=yellow, 5=orange, 6=red, 7=purple) */
        setLedPreset(preset) {
            bridge.postMessage({ type: 'command', action: 'setLedPreset', value: preset });
        }

        /** Call this when your experiment goal is completed */
        markComplete() {
            if (this._completed) return;
            this._completed = true;
            this.setLedPreset(3); // Green = success
            this._endSession(true);
        }

        /** Force-end without completion (e.g. user quit) */
        quit() {
            this._endSession(false);
        }

        /** Submit fun rating (1-5) after session ends */
        async submitRating(rating) {
            if (!this._sessionId || rating < 1 || rating > 5) return;
            try {
                await fetch(`${API_BASE}/sessions/${this._sessionId}/end`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fun_rating: Math.round(rating) }),
                });
            } catch (e) {
                console.warn('[SDK] Could not submit rating:', e);
            }
        }

        get elapsedS() { return this._elapsedS(); }
        get sessionId() { return this._sessionId; }
    }

    global.ExperimentSDK = ExperimentSDK;

})(window);
