package com.cleanrow.bridge

import android.app.Service
import android.content.Intent
import android.os.Binder
import android.os.IBinder
import android.util.Log
import java.util.concurrent.ConcurrentLinkedQueue
import kotlinx.coroutines.*

/**
 * Background service for serial communication with the rowing machine. Polls the serial port at
 * 10Hz and notifies listeners of state changes.
 */
class RowingService : Service() {

    companion object {
        private const val TAG = "RowingService"
        private const val POLL_INTERVAL_MS = 100L // 10Hz
    }

    private val binder = LocalBinder()
    private val serialInterface = SerialInterface()
    private var serviceScope: CoroutineScope? = null
    private var pollingJob: Job? = null
    private var listener: StateListener? = null
    private var isPaused = false
    private val commandQueue = ConcurrentLinkedQueue<ByteArray>()

    /** Interface for receiving rowing state updates. */
    interface StateListener {
        fun onStateUpdate(state: RowingProtocol.RowingState)
        fun onConnectionStatusChanged(connected: Boolean, message: String)
    }

    /** Binder for local binding to MainActivity. */
    inner class LocalBinder : Binder() {
        fun getService(): RowingService = this@RowingService
    }

    override fun onBind(intent: Intent?): IBinder {
        return binder
    }

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service created")
        serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "Service destroyed")
        stopPolling()
        serialInterface.close()
        serviceScope?.cancel()
        serviceScope = null
    }

    /** Set the state listener for receiving updates. */
    fun setStateListener(listener: StateListener) {
        this.listener = listener
    }

    /** Start polling the serial port. */
    fun startPolling() {
        if (pollingJob?.isActive == true) {
            Log.d(TAG, "Polling already active")
            return
        }

        pollingJob =
                serviceScope?.launch {
                    if (!serialInterface.isOpen()) {
                        val success = serialInterface.open()
                        if (!success) {
                            withContext(Dispatchers.Main) {
                                listener?.onConnectionStatusChanged(
                                        false,
                                        "Failed to open serial port"
                                )
                            }
                            return@launch
                        }

                        withContext(Dispatchers.Main) {
                            listener?.onConnectionStatusChanged(true, "Connected to rowing machine")
                        }
                    }

                    Log.d(TAG, "Starting serial polling loop")
                    var tryQueryCount = 0

                    while (isActive) {
                        if (!isPaused) {
                            try {
                                // Send any pending commands first (drag, watt, LED, etc.)
                                var pendingCmd = commandQueue.poll()
                                while (pendingCmd != null) {
                                    serialInterface.drain()
                                    serialInterface.write(pendingCmd)
                                    delay(80) // Wait for ACK like the original app
                                    // Read and discard ACK
                                    val ackBuf = ByteArray(64)
                                    serialInterface.read(ackBuf, timeout = 80)
                                    pendingCmd = commandQueue.poll()
                                }

                                // First try to read unsolicited data from the device
                                val buffer = ByteArray(64)
                                val bytesRead = serialInterface.read(buffer, timeout = 80)

                                if (bytesRead > 0) {
                                    tryQueryCount = 0
                                    val state = RowingProtocol.parseResponse(buffer, bytesRead)
                                    if (state != null) {
                                        withContext(Dispatchers.Main) {
                                            listener?.onStateUpdate(state)
                                        }
                                    }
                                } else {
                                    // No unsolicited data; after 2 misses, send explicit query
                                    tryQueryCount++
                                    if (tryQueryCount > 1) {
                                        tryQueryCount = 0
                                        serialInterface.drain()
                                        val queryCmd = RowingProtocol.buildQueryStateCommand()
                                        serialInterface.write(queryCmd)
                                        delay(20)

                                        val respBuf = ByteArray(64)
                                        val respRead = serialInterface.read(respBuf, timeout = 80)
                                        if (respRead > 0) {
                                            val state =
                                                    RowingProtocol.parseResponse(respBuf, respRead)
                                            if (state != null) {
                                                withContext(Dispatchers.Main) {
                                                    listener?.onStateUpdate(state)
                                                }
                                            }
                                        }
                                    }
                                }
                            } catch (e: Exception) {
                                Log.e(TAG, "Error in polling loop", e)
                                withContext(Dispatchers.Main) {
                                    listener?.onConnectionStatusChanged(
                                            false,
                                            "Communication error: ${e.message}"
                                    )
                                }
                            }
                        }

                        delay(POLL_INTERVAL_MS)
                    }
                }
    }

    /** Stop polling the serial port. */
    fun stopPolling() {
        Log.d(TAG, "Stopping polling")
        pollingJob?.cancel()
        pollingJob = null
    }

    /** Pause polling (stops sending queries but keeps connection open). */
    fun pausePolling() {
        Log.d(TAG, "Pausing polling")
        isPaused = true
    }

    /** Resume polling after pause. */
    fun resumePolling() {
        Log.d(TAG, "Resuming polling")
        isPaused = false
    }

    /** Queue a command to be sent from the polling loop (thread-safe). */
    fun sendCommand(command: ByteArray): Boolean {
        return if (serialInterface.isOpen()) {
            commandQueue.add(command)
            true
        } else {
            Log.w(TAG, "Cannot send command: serial port not open")
            false
        }
    }

    /** Set drag level (0-24). */
    fun setDragLevel(level: Int) {
        val cmd = RowingProtocol.buildSetDragCommand(level)
        sendCommand(cmd)
    }

    /** Set target watt (0-500). */
    fun setWattTarget(watts: Int) {
        val cmd = RowingProtocol.buildSetWattCommand(watts)
        sendCommand(cmd)
    }

    /** Set LED RGB color. */
    fun setLedRgb(r: Int, g: Int, b: Int) {
        val cmd = RowingProtocol.buildSetLedRgbCommand(r, g, b)
        sendCommand(cmd)
    }

    /** Set LED preset color (0-7). */
    fun setLedPreset(preset: Int) {
        val cmd = RowingProtocol.buildSetLedPresetCommand(preset)
        sendCommand(cmd)
    }

    /** Clear stroke counter. */
    fun clearCounter() {
        val cmd = RowingProtocol.buildClearCounterCommand()
        sendCommand(cmd)
    }
}
