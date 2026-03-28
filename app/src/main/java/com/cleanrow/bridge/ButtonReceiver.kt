package com.cleanrow.bridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Receiver for physical button broadcasts from CVTE sport device. The rowing machine's physical
 * button sends system-wide intents.
 */
class ButtonReceiver : BroadcastReceiver() {

    interface ButtonListener {
        fun onShortPress()
        fun onLongPress()
    }

    companion object {
        private const val TAG = "ButtonReceiver"
        const val ACTION_SHORT_PRESS = "com.cvte.sport.device.DISPLAY_BTN_SHORT_PRESSED"
        const val ACTION_LONG_PRESS = "com.cvte.sport.device.DISPLAY_BTN_LONG_PRESSED"

        // Alternative button actions that might be sent by the device
        private val BUTTON_ACTIONS =
                listOf(
                        ACTION_SHORT_PRESS,
                        ACTION_LONG_PRESS,
                        "android.intent.action.USER_PRESENT",
                        "android.intent.action.SCREEN_ON",
                        "com.sportstech.rowing.BUTTON_PRESSED",
                        "com.sportstech.BUTTON_EVENT",
                        "com.cvte.BUTTON_EVENT"
                )

        // Internal actions for local broadcast to MainActivity
        const val ACTION_BUTTON_EVENT = "com.cleanrow.bridge.BUTTON_EVENT"
        const val EXTRA_IS_LONG_PRESS = "is_long_press"

        private var buttonListener: ButtonListener? = null

        fun setButtonListener(listener: ButtonListener?) {
            buttonListener = listener
        }
    }

    override fun onReceive(context: Context?, intent: Intent?) {
        Log.d(
                TAG,
                "onReceive called: action=${intent?.action}, buttonListener=${buttonListener != null}"
        )

        if (context == null || intent == null) {
            Log.w(TAG, "Null context or intent")
            return
        }

        val action = intent.action ?: return
        Log.d(TAG, "Received broadcast: $action")

        // Check if this is a button-related action
        if (!BUTTON_ACTIONS.contains(action)) {
            Log.d(TAG, "Action not in button list, ignoring")
            return
        }

        when (action) {
            ACTION_SHORT_PRESS -> {
                Log.d(TAG, "Short press detected, calling listener")
                buttonListener?.onShortPress()
            }
            ACTION_LONG_PRESS -> {
                Log.d(TAG, "Long press detected, calling listener")
                buttonListener?.onLongPress()
            }
            else -> {
                // For unknown button actions, treat as long press (display toggle)
                Log.d(TAG, "Unknown button action, treating as long press: $action")
                buttonListener?.onLongPress()
            }
        }
    }
}
