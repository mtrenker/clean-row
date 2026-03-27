#!/bin/bash
# Setup script for Clean Row project

set -e

echo "🚣 Clean Row Setup"
echo "=================="

# Check for serial port library
if [ ! -f "app/libs/android-serialport-api.jar" ]; then
    echo "⚠️  Serial port library not found!"
    echo ""
    echo "Please obtain android-serialport-api.jar and place it in app/libs/"
    echo ""
    echo "Option 1: Build from source"
    echo "  git clone https://github.com/cepr/android-serialport-api.git /tmp/serialport"
    echo "  cd /tmp/serialport"
    echo "  ./gradlew assembleRelease"
    echo "  cp android-serialport-api/build/libs/android-serialport-api.jar $PWD/app/libs/"
    echo ""
    echo "Option 2: Use a pre-built version from a trusted source"
    echo ""
    echo "Option 3: Alternative library (modify imports in SerialInterface.kt)"
    echo "  - google/android-serialport-api"
    echo "  - Other UART/serial libraries for Android"
    echo ""
    read -p "Continue without library? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check Gradle wrapper
if [ ! -f "gradlew" ]; then
    echo "📦 Installing Gradle wrapper..."
    gradle wrapper --gradle-version 8.2
fi

# Make gradlew executable
chmod +x gradlew

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Ensure android-serialport-api.jar is in app/libs/"
echo "2. Build: ./gradlew assembleDebug"
echo "3. Install: adb install app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "See README.md for full instructions."
