#!/bin/bash
# Deploy script for Clean Row
# Builds and installs the APK to connected rowing machine

set -e

ADB_BIN="${ADB_BIN:-}"
if [ -z "$ADB_BIN" ] && [ -n "$ANDROID_SDK_ROOT" ] && [ -x "$ANDROID_SDK_ROOT/platform-tools/adb" ]; then
    ADB_BIN="$ANDROID_SDK_ROOT/platform-tools/adb"
elif [ -z "$ADB_BIN" ] && [ -x "$HOME/.local/android-sdk/platform-tools/adb" ]; then
    ADB_BIN="$HOME/.local/android-sdk/platform-tools/adb"
else
    ADB_BIN="${ADB_BIN:-adb}"
fi

if [ -z "$JAVA_HOME" ] && [ -x "$HOME/.local/jdks/temurin-17/bin/java" ]; then
    JAVA_HOME="$HOME/.local/jdks/temurin-17"
    export JAVA_HOME
    export PATH="$JAVA_HOME/bin:$PATH"
fi

ADB_SERIAL="${ADB_SERIAL:-}"
WEB_PORT="${WEB_PORT:-3000}"

echo "🚣 Clean Row Deployment"
echo "======================="
echo "Using ADB: $ADB_BIN"
if [ -n "$JAVA_HOME" ]; then
    echo "Using JAVA_HOME: $JAVA_HOME"
fi

"$ADB_BIN" start-server >/dev/null

CONNECTED_SERIAL=""
if [ -n "$ADB_SERIAL" ]; then
    if "$ADB_BIN" -s "$ADB_SERIAL" get-state >/dev/null 2>&1; then
        CONNECTED_SERIAL="$ADB_SERIAL"
    fi
else
    CONNECTED_SERIAL=$("$ADB_BIN" devices | awk '$2 == "device" { print $1; exit }')
fi

# Check for connected device
if [ -z "$CONNECTED_SERIAL" ]; then
    echo "❌ No ADB device connected!"
    echo ""
    echo "Visible devices:"
    "$ADB_BIN" devices -l || true
    echo ""
    echo "If you paired or connected with a different adb version, reconnect with this exact binary:"
    echo "  $ADB_BIN pair <ROWING_MACHINE_IP>:<PAIRING_PORT>"
    echo "Connect to your rowing machine:"
    echo "  $ADB_BIN connect <ROWING_MACHINE_IP>:<PORT>"
    exit 1
fi

echo "📱 Connected device:"
"$ADB_BIN" devices -l | awk -v serial="$CONNECTED_SERIAL" '$1 == serial { print }'
echo ""

echo "🔌 Setting up ADB reverse tcp:$WEB_PORT -> tcp:$WEB_PORT ..."
ADB_REV_OK=false
if "$ADB_BIN" -s "$CONNECTED_SERIAL" reverse "tcp:$WEB_PORT" "tcp:$WEB_PORT" >/dev/null 2>&1; then
    ADB_REV_OK=true
    echo "ADB reverse active. Use http://127.0.0.1:$WEB_PORT in the app for local dev."
else
    echo "⚠️  Failed to set ADB reverse. Direct LAN URL may still work if reachable."
fi
echo ""

# Build
echo "🔨 Building APK..."
./gradlew assembleDebug

# Find APK
APK_PATH="app/build/outputs/apk/debug/app-debug.apk"

if [ ! -f "$APK_PATH" ]; then
    echo "❌ APK not found at $APK_PATH"
    exit 1
fi

# Install
echo ""
echo "📦 Installing..."
"$ADB_BIN" -s "$CONNECTED_SERIAL" install -r "$APK_PATH"

# Configure WebView URL in SharedPreferences
echo ""
echo "🔗 Configuring WebView URL..."
# Prefer a stable LAN IP over the ADB reverse tunnel (127.0.0.1),
# because the ADB wireless reverse is not persistent after disconnect.
# Override at deploy time with: PLATFORM_URL=http://myhost:3000/dashboard/index.html ./deploy.sh
if [ -z "${PLATFORM_URL:-}" ]; then
    LAN_IP=$(hostname -I | awk '{print $1}')
    PLATFORM_URL="http://${LAN_IP}:${WEB_PORT}"
fi
PREFS_XML="<?xml version='1.0' encoding='utf-8' standalone='yes' ?><map><string name=\"web_url\">${PLATFORM_URL}</string></map>"
if echo "$PREFS_XML" | "$ADB_BIN" -s "$CONNECTED_SERIAL" shell run-as com.cleanrow.bridge tee /data/data/com.cleanrow.bridge/shared_prefs/CleanRowPrefs.xml >/dev/null 2>&1; then
    echo "✅ WebView URL set to: $PLATFORM_URL"
else
    echo "⚠️  Could not write SharedPreferences (non-debug build or app not yet launched once?)"
    echo "   Expected URL: $PLATFORM_URL"
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "The app is now installed on your rowing machine."
echo "Launch it from the app launcher."
echo ""
echo "View logs:"
echo "  $ADB_BIN -s $CONNECTED_SERIAL logcat -s MainActivity RowingService RowingBridge"
