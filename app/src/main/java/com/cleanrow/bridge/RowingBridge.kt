package com.cleanrow.bridge

import android.net.Uri
import android.util.Log
import android.webkit.WebView
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * Bridge between WebView and native Kotlin code. Handles bidirectional communication:
 * - JS → Kotlin: window.postMessage()
 * - Kotlin → JS: Custom events dispatched on window
 */
class RowingBridge(private val webView: WebView, private val commandHandler: CommandHandler) {
    companion object {
        private const val TAG = "RowingBridge"
        private const val BRIDGE_NAME = "cleanRowBridge"
    }

    /** Interface for handling commands from the web page. */
    interface CommandHandler {
        fun onSetDrag(level: Int)
        fun onSetWatt(watts: Int)
        fun onSetLedRgb(r: Int, g: Int, b: Int)
        fun onSetLedPreset(preset: Int)
        fun onClearCounter()
        fun onPauseWorkout()
        fun onResumeWorkout()
        fun onReloadPage()
        fun onRestartApp()
        fun onCloseApp()
    }

    /** Initialize the bridge using modern WebMessageListener API. */
    fun initialize() {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            Log.d(TAG, "Using WebMessageListener API")
            setupWebMessageListener()
        } else {
            Log.w(TAG, "WebMessageListener not supported, commands from web will not work")
        }
    }

    /** Set up WebMessageListener for receiving messages from JavaScript. */
    private fun setupWebMessageListener() {
        try {
            WebViewCompat.addWebMessageListener(
                    webView,
                    BRIDGE_NAME,
                    setOf("*"), // Allow all origins for development
                    object : WebViewCompat.WebMessageListener {
                        override fun onPostMessage(
                                view: WebView,
                                message: WebMessageCompat,
                                sourceOrigin: Uri,
                                isMainFrame: Boolean,
                                replyProxy: androidx.webkit.JavaScriptReplyProxy
                        ) {
                            handleMessage(message.data ?: "")
                        }
                    }
            )
            Log.d(TAG, "WebMessageListener registered successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register WebMessageListener", e)
        }
    }

    /**
     * Handle incoming message from JavaScript. Expected format: {"type": "command", "action":
     * "setDrag", "value": 8}
     */
    private fun handleMessage(messageData: String) {
        try {
            Log.d(TAG, "Received message: $messageData")

            val json = JSONObject(messageData)
            val type = json.optString("type", "")

            if (type != "command") {
                Log.w(TAG, "Unknown message type: $type")
                return
            }

            val action = json.optString("action", "")

            when (action) {
                "setDrag" -> {
                    val level = json.optInt("value", 0)
                    commandHandler.onSetDrag(level)
                }
                "setWatt" -> {
                    val watts = json.optInt("value", 0)
                    commandHandler.onSetWatt(watts)
                }
                "setLedRgb" -> {
                    val r = json.optInt("r", 0)
                    val g = json.optInt("g", 0)
                    val b = json.optInt("b", 0)
                    commandHandler.onSetLedRgb(r, g, b)
                }
                "setLedPreset" -> {
                    val preset = json.optInt("value", 0)
                    commandHandler.onSetLedPreset(preset)
                }
                "clearCounter" -> {
                    commandHandler.onClearCounter()
                }
                "pause" -> {
                    commandHandler.onPauseWorkout()
                }
                "resume" -> {
                    commandHandler.onResumeWorkout()
                }
                "reload" -> {
                    commandHandler.onReloadPage()
                }
                "restartApp" -> {
                    commandHandler.onRestartApp()
                }
                "closeApp" -> {
                    commandHandler.onCloseApp()
                }
                else -> {
                    Log.w(TAG, "Unknown action: $action")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling message", e)
        }
    }

    /**
     * Send rowing data to JavaScript. Dispatches a custom event: new CustomEvent('rowingData',
     * {detail: {...}})
     */
    fun sendRowingData(state: RowingProtocol.RowingState) {
        val json =
                JSONObject().apply {
                    put("rpm", state.rpm)
                    put("watts", state.watts)
                    put("spm", state.spm)
                    put("strokeCount", state.strokeCount)
                    put("drag", state.drag)
                    put("errorFlags", state.errorFlags)
                    put("timestamp", System.currentTimeMillis())
                }

        dispatchEvent("rowingData", json.toString())
    }

    /** Send button event to JavaScript. */
    fun sendButtonEvent(isLongPress: Boolean) {
        val json =
                JSONObject().apply {
                    put("type", if (isLongPress) "longPress" else "shortPress")
                    put("timestamp", System.currentTimeMillis())
                }

        dispatchEvent("buttonPress", json.toString())
    }

    /** Send connection status update to JavaScript. */
    fun sendConnectionStatus(connected: Boolean, message: String = "") {
        val json =
                JSONObject().apply {
                    put("connected", connected)
                    put("message", message)
                    put("timestamp", System.currentTimeMillis())
                }

        dispatchEvent("connectionStatus", json.toString())
    }

    /** Dispatch a custom event on the window object in JavaScript. */
    private fun dispatchEvent(eventName: String, detailJson: String) {
        val script =
                """
            (function() {
                try {
                    const event = new CustomEvent('$eventName', {
                        detail: $detailJson
                    });
                    window.dispatchEvent(event);
                } catch (e) {
                    console.error('Failed to dispatch event $eventName:', e);
                }
            })();
        """.trimIndent()

        webView.post { webView.evaluateJavascript(script, null) }
    }
}
