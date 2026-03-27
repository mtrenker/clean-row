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

        // Internal actions for local broadcast to MainActivity
        const val ACTION_BUTTON_EVENT = "com.cleanrow.bridge.BUTTON_EVENT"
        const val EXTRA_IS_LONG_PRESS = "is_long_press"

        private var buttonListener: ButtonListener? = null

        fun setButtonListener(listener: ButtonListener?) {
            buttonListener = listener
        }
    }

    override fun onReceive(context: Context?, intent: Intent?) {
        if (context == null || intent == null) return

        Log.d(TAG, "Received button broadcast: ${intent.action}")

        when (intent.action) {
            ACTION_SHORT_PRESS -> {
                Log.d(TAG, "Short press detected")
                buttonListener?.onShortPress()
            }
            ACTION_LONG_PRESS -> {
                Log.d(TAG, "Long press detected")
                buttonListener?.onLongPress()
            }
        }
    }
}
