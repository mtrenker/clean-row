package com.cleanrow.bridge

import android.annotation.SuppressLint
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.Process
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

/** Main activity hosting the WebView and coordinating serial communication. */
class MainActivity :
        AppCompatActivity(),
        RowingService.StateListener,
        RowingBridge.CommandHandler,
        ButtonReceiver.ButtonListener {

    companion object {
        private const val TAG = "MainActivity"
        private const val PREF_NAME = "CleanRowPrefs"
        private const val PREF_URL = "web_url"
    }

    private lateinit var webView: WebView
    private lateinit var bridge: RowingBridge

    private var rowingService: RowingService? = null
    private var serviceBound = false
    private var isDisplayDimmed = false

    private val serviceConnection =
            object : ServiceConnection {
                override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
                    Log.d(TAG, "Service connected")
                    val localBinder = binder as? RowingService.LocalBinder
                    rowingService = localBinder?.getService()
                    rowingService?.setStateListener(this@MainActivity)
                    rowingService?.startPolling()
                    serviceBound = true
                }

                override fun onServiceDisconnected(name: ComponentName?) {
                    Log.d(TAG, "Service disconnected")
                    rowingService = null
                    serviceBound = false
                }
            }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Set up immersive fullscreen mode
        setupFullscreenMode()

        // Keep screen on during workouts
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Initialize WebView
        webView = findViewById(R.id.webView)
        setupWebView()

        // Initialize bridge
        bridge = RowingBridge(webView, this)
        bridge.initialize()

        // Register button receiver
        ButtonReceiver.setButtonListener(this)

        // Bind to rowing service
        bindRowingService()

        // Load web interface
        loadWebInterface()
    }

    override fun onDestroy() {
        super.onDestroy()
        ButtonReceiver.setButtonListener(null)
        unbindRowingService()
    }

    /** Set up immersive fullscreen mode (hide system bars). */
    @Suppress("DEPRECATION")
    private fun setupFullscreenMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let { controller ->
                controller.hide(
                        WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars()
                )
                controller.systemBarsBehavior =
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            window.decorView.systemUiVisibility =
                    (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                            View.SYSTEM_UI_FLAG_FULLSCREEN or
                            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                            View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION)
        }
    }

    /** Configure WebView settings. */
    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = false

            // Development settings
            if (BuildConfig.DEBUG) {
                WebView.setWebContentsDebuggingEnabled(true)
            }
        }

        // Set up WebViewClient for navigation handling
        webView.webViewClient =
                object : WebViewClient() {
                    override fun onPageFinished(view: WebView?, url: String?) {
                        super.onPageFinished(view, url)
                        Log.d(TAG, "Page loaded: $url")
                    }

                    override fun onReceivedError(
                            view: WebView?,
                            errorCode: Int,
                            description: String?,
                            failingUrl: String?
                    ) {
                        Log.e(TAG, "WebView error: $description ($errorCode)")
                    }
                }

        // Set up WebChromeClient for console.log debugging
        webView.webChromeClient =
                object : WebChromeClient() {
                    override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                        consoleMessage?.let {
                            Log.d(
                                    "WebView-Console",
                                    "${it.sourceId()}:${it.lineNumber()} - ${it.message()}"
                            )
                        }
                        return true
                    }
                }
    }

    /** Load the web interface from configured URL. */
    private fun loadWebInterface() {
        val prefs = getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        val url =
                prefs.getString(PREF_URL, getString(R.string.default_url))
                        ?: getString(R.string.default_url)

        Log.d(TAG, "Loading URL: $url")
        webView.loadUrl(url)
    }

    /** Bind to the rowing service. */
    private fun bindRowingService() {
        val intent = Intent(this, RowingService::class.java)
        startService(intent)
        bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
    }

    /** Unbind from the rowing service. */
    private fun unbindRowingService() {
        if (serviceBound) {
            unbindService(serviceConnection)
            serviceBound = false
        }
    }

    // RowingService.StateListener implementation

    override fun onStateUpdate(state: RowingProtocol.RowingState) {
        // Forward state to web interface
        bridge.sendRowingData(state)
    }

    override fun onConnectionStatusChanged(connected: Boolean, message: String) {
        Log.d(TAG, "Connection status: $connected - $message")
        bridge.sendConnectionStatus(connected, message)
    }

    // RowingBridge.CommandHandler implementation

    override fun onSetDrag(level: Int) {
        Log.d(TAG, "Set drag level: $level")
        rowingService?.setDragLevel(level)
    }

    override fun onSetWatt(watts: Int) {
        Log.d(TAG, "Set watt target: $watts")
        rowingService?.setWattTarget(watts)
    }

    override fun onSetLedRgb(r: Int, g: Int, b: Int) {
        Log.d(TAG, "Set LED RGB: ($r, $g, $b)")
        rowingService?.setLedRgb(r, g, b)
    }

    override fun onSetLedPreset(preset: Int) {
        Log.d(TAG, "Set LED preset: $preset")
        rowingService?.setLedPreset(preset)
    }

    override fun onClearCounter() {
        Log.d(TAG, "Clear counter")
        rowingService?.clearCounter()
    }

    override fun onPauseWorkout() {
        Log.d(TAG, "Pause workout")
        rowingService?.pausePolling()
    }

    override fun onResumeWorkout() {
        Log.d(TAG, "Resume workout")
        rowingService?.resumePolling()
    }

    override fun onReloadPage() {
        Log.d(TAG, "Reload web page")
        webView.post { webView.reload() }
    }

    override fun onRestartApp() {
        Log.d(TAG, "Restart app")
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        if (launchIntent == null) {
            Log.e(TAG, "Unable to resolve launch intent for restart")
            return
        }

        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        startActivity(launchIntent)
        finishAffinity()
        Process.killProcess(Process.myPid())
    }

    override fun onCloseApp() {
        Log.d(TAG, "Close app")
        finishAffinity()
    }

    override fun onToggleDisplay() {
        Log.d(TAG, "Toggle display from web UI")
        // Call the same logic as onLongPress
        onLongPress()
    }

    // ButtonReceiver.ButtonListener implementation

    override fun onShortPress() {
        Log.d(TAG, "Physical button short press")
        bridge.sendButtonEvent(false)
        // You can add default behavior here, e.g., pause/resume
    }

    override fun onLongPress() {
        Log.d(TAG, "Physical button long press")
        bridge.sendButtonEvent(true)

        // Toggle display on/off
        // Note: When off, press any volume rocker to wake the display
        isDisplayDimmed = !isDisplayDimmed
        val brightness = if (isDisplayDimmed) 0.0f else 1.0f
        window.attributes = window.attributes.apply { screenBrightness = brightness }

        // Also manage screen keep-on flag for better power savings
        if (isDisplayDimmed) {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            Log.d(TAG, "Display off, screen can sleep")
        } else {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            Log.d(TAG, "Display on, keeping screen active")
        }
    }

    // Key event handling for physical buttons and volume rockers
    // Volume buttons: wake the display when dimmed (will not change volume in this state)
    private var buttonPressTime = 0L

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        Log.d(TAG, "onKeyDown: keyCode=$keyCode, action=${event?.action}")

        // Handle volume buttons to wake the screen if it's off
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
            Log.d(TAG, "Volume button pressed")
            if (isDisplayDimmed) {
                // Wake the screen (restore brightness)
                Log.d(TAG, "Screen is off, waking it with volume button")
                isDisplayDimmed = false
                window.attributes = window.attributes.apply { screenBrightness = 1.0f }
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                Log.d(TAG, "Display restored via volume button")
                return true // Consume the event so volume doesn't change
            }
            // If screen is already on, let volume button function normally
            return false
        }

        // Check for common power/home button keycodes or custom button codes
        if (keyCode == KeyEvent.KEYCODE_POWER ||
                        keyCode == KeyEvent.KEYCODE_HOME ||
                        keyCode == 229 || // Some devices use code 229
                        keyCode == 119
        ) { // Some devices use code 119

            buttonPressTime = System.currentTimeMillis()
            Log.d(TAG, "Button pressed, starting timer for long press detection")
            return true
        }

        return super.onKeyDown(keyCode, event)
    }

    override fun onKeyUp(keyCode: Int, event: KeyEvent?): Boolean {
        Log.d(TAG, "onKeyUp: keyCode=$keyCode")

        // Volume buttons already handled in onKeyDown
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
            return isDisplayDimmed // Consume if screen was dimmed, otherwise let volume work
        }

        if (keyCode == KeyEvent.KEYCODE_POWER ||
                        keyCode == KeyEvent.KEYCODE_HOME ||
                        keyCode == 229 ||
                        keyCode == 119
        ) {

            val pressDuration = System.currentTimeMillis() - buttonPressTime
            Log.d(TAG, "Button released after ${pressDuration}ms")

            if (pressDuration > 500) {
                // Long press (> 500ms)
                Log.d(TAG, "Long press detected via key event")
                onLongPress()
            } else {
                // Short press
                Log.d(TAG, "Short press detected via key event")
                onShortPress()
            }
            return true
        }

        return super.onKeyUp(keyCode, event)
    }
}
