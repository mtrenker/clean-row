#!/bin/bash
# Deploy script for Clean Row
# Builds and installs the APK to connected rowing machine

set -e

echo "🚣 Clean Row Deployment"
echo "======================="

# Check for connected device
if ! adb devices | grep -q "device$"; then
    echo "❌ No ADB device connected!"
    echo ""
    echo "Connect to your rowing machine:"
    echo "  adb connect <ROWING_MACHINE_IP>:<PORT>"
    exit 1
fi

echo "📱 Connected device:"
adb devices | grep "device$"
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
adb install -r "$APK_PATH"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "The app is now installed on your rowing machine."
echo "Launch it from the app launcher."
echo ""
echo "View logs:"
echo "  adb logcat -s MainActivity RowingService RowingBridge"
