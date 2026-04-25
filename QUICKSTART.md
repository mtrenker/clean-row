# Quick Start Guide - Clean Row

## ⚠️ Important: Missing Library

Before building, you need to obtain the serial port library. This is the **only manual step required**.

### Getting the Serial Port Library

The easiest method (if you have Node.js/npm):

```bash
# Option A: Download pre-built JAR from Maven/releases
# Search for: android-serialport-api on GitHub releases

# Option B: Build from source (requires Android SDK)
cd /tmp
git clone https://github.com/cepr/android-serialport-api.git
cd android-serialport-api
# Follow build instructions in their README
# Copy resulting JAR to: /home/martin/dev/clean-row/app/libs/android-serialport-api.jar
```

### Alternative: Extract from Sportstech APK

Since you already have the Sportstech APK decompiled, you can extract their serial library:

```bash
# If you still have the decompiled Sportstech app:
# Look for: libmid_serial.so in the lib/ folder
# Or use the android-serialport-api.jar bundled with it

# Copy to your project:
cp /path/to/sportstech/lib/android-serialport-api.jar /home/martin/dev/clean-row/app/libs/
```

## Build Steps

Once the JAR is in place:

```bash
cd /home/martin/dev/clean-row

# Install Gradle wrapper (first time only)
# If you don't have gradle installed globally, download it:
# wget https://services.gradle.org/distributions/gradle-8.2-bin.zip
# unzip gradle-8.2-bin.zip
# ./gradle-8.2/bin/gradle wrapper

# Or if gradle is available:
gradle wrapper

# Build the APK
./gradlew assembleDebug
```

## Install on Rowing Machine

```bash
# Connect to your S-Row via WiFi debugging
adb connect 192.168.178.40:PORT

# Install
adb install app/build/outputs/apk/debug/app-debug.apk

# Launch the app from the launcher
```

## Configure Your Web URL

Edit `app/src/main/res/values/strings.xml`:

```xml
<string name="default_url">http://YOUR_DEV_MACHINE_IP:3000</string>
```

Rebuild and reinstall after changing the URL.

## Test with Example UI

```bash
cd example-web
python3 -m http.server 3000

# Or use any web server:
# npx serve -p 3000
# php -S 0.0.0.0:3000
```

Make sure your dev machine and rowing machine are on the same network.

## Troubleshooting

### Build fails with "SerialPort not found"

The android-serialport-api.jar is missing or invalid. See the library section above.

### Can't connect via ADB

Ensure wireless debugging is enabled on the S-Row. The connection port changes on reboot, so you may need to re-pair.

### Web page doesn't load

1. Check the URL in strings.xml matches your web server
2. Verify both devices are on the same WiFi
3. Check logcat: `adb logcat -s MainActivity`

### No data from rowing machine

1. Check if /dev/ttyS2 exists: `adb shell ls -la /dev/ttyS2`
2. View serial logs: `adb logcat -s SerialInterface RowingService`

## Next Steps

Once the app is running:

1. Open the WebView DevTools: Chrome → `chrome://inspect`
2. Select your Clean Row WebView
3. See console output and debug your web interface
4. Build amazing rowing experiences! 🚣‍♂️

---

**Full documentation:** See [README.md](README.md)
