# Clean Row 🚣

A Kotlin Android app that bridges your rowing machine's serial interface with
web-based interfaces. Build custom workout UIs, mini-games, and interactive
experiences using HTML, CSS, and JavaScript.

## Features

- ✅ **Real-time data streaming** - RPM, watts, SPM, stroke count at 10Hz
- ✅ **Control commands** - Set drag level, target watts, LED colors
- ✅ **Physical button support** - Short/long press events from the machine's
  button
- ✅ **Remote web interface** - Load any HTTP(S) URL during development
- ✅ **Window-based communication** - Simple `postMessage` API for JS ↔ Kotlin
- ✅ **No root required** - Serial port has world read/write permissions

## Prerequisites

- Rowing machine with Android 13 (SP2101V board)
- WiFi debugging enabled (see installation below)
- Development machine on same network as rowing machine
- Web server for hosting your UI (or use the example)

## Installation

### 1. Download `android-serialport-api.jar`

You need the serial port library. Download from
[cepr/android-serialport-api](https://github.com/cepr/android-serialport-api):

```bash
cd clean-row/app/libs
wget https://github.com/cepr/android-serialport-api/releases/download/v2.0/android-serialport-api-v2.0.jar
mv android-serialport-api-v2.0.jar android-serialport-api.jar
```

Or build from source if needed.

### 2. Build the APK

```bash
cd clean-row
./gradlew assembleDebug
```

The APK will be at `app/build/outputs/apk/debug/app-debug.apk`.

### 3. Enable Wireless Debugging on Rowing Machine

On the rowing machine's touchscreen:

1. **Settings → About phone** → tap **Build number** 7 times
2. **Settings → Developer Options** → enable **Wireless debugging**
3. Note the IP address and port shown

### 4. Connect via ADB

On your development machine:

```bash
# Pair (first time only)
adb pair <ROWING_MACHINE_IP>:<PAIRING_PORT>
# Enter the 6-digit code shown on screen

# Connect
adb connect <ROWING_MACHINE_IP>:<CONNECTION_PORT>

# Verify
adb devices  # Should show device connected
```

### 5. Install the APK

```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

### 6. Configure the URL

Edit the default URL in `app/src/main/res/values/strings.xml`:

```xml
<string name="default_url">http://YOUR_DEV_MACHINE_IP:3000</string>
```

Or change it programmatically via SharedPreferences.

### 7. Launch the App

Tap the "Clean Row" icon on the rowing machine. It will load your web interface.

## JavaScript API

### Receiving Real-Time Data

The app dispatches custom events on `window` at 10Hz:

```javascript
// Listen for rowing data
window.addEventListener("rowingData", (event) => {
    const data = event.detail;
    console.log("RPM:", data.rpm);
    console.log("Watts:", data.watts);
    console.log("SPM:", data.spm);
    console.log("Strokes:", data.strokeCount);
    console.log("Drag:", data.drag);
});

// Listen for connection status
window.addEventListener("connectionStatus", (event) => {
    const status = event.detail;
    if (status.connected) {
        console.log("Connected to rowing machine");
    } else {
        console.log("Disconnected:", status.message);
    }
});

// Listen for physical button presses
window.addEventListener("buttonPress", (event) => {
    const button = event.detail;
    if (button.type === "shortPress") {
        // Handle short press
    } else if (button.type === "longPress") {
        // Handle long press (screen will auto-dim)
    }
});
```

### Sending Commands

Use `window.cleanRowBridge.postMessage()` to send commands:

```javascript
// Set drag level (0-24)
window.cleanRowBridge.postMessage({
    type: "command",
    action: "setDrag",
    value: 12,
});

// Set target watts (0-500)
window.cleanRowBridge.postMessage({
    type: "command",
    action: "setWatt",
    value: 150,
});

// Set LED RGB color
window.cleanRowBridge.postMessage({
    type: "command",
    action: "setLedRgb",
    r: 255,
    g: 0,
    b: 128,
});

// Set LED preset (0-7)
// 0=off, 1=blue, 2=cyan, 3=green, 4=yellow, 5=orange, 6=red, 7=purple
window.cleanRowBridge.postMessage({
    type: "command",
    action: "setLedPreset",
    value: 3,
});

// Clear stroke counter
window.cleanRowBridge.postMessage({
    type: "command",
    action: "clearCounter",
});

// Pause/resume data polling
window.cleanRowBridge.postMessage({
    type: "command",
    action: "pause",
});

window.cleanRowBridge.postMessage({
    type: "command",
    action: "resume",
});

// Reload current page inside the app
window.cleanRowBridge.postMessage({
    type: "command",
    action: "reload",
});

// Close app activity
window.cleanRowBridge.postMessage({
    type: "command",
    action: "closeApp",
});

// Restart app process
window.cleanRowBridge.postMessage({
    type: "command",
    action: "restartApp",
});
```

### Helper API (Optional)

Use the included `bridge.js` for a cleaner API:

```javascript
// Import bridge.js in your HTML
<script src="bridge.js"></script>;

// Use the helper functions
CleanRowAPI.setDrag(15);
CleanRowAPI.setWatt(200);
CleanRowAPI.setLedRgb(255, 128, 0);
CleanRowAPI.setLedPreset(6);
CleanRowAPI.clearCounter();
CleanRowAPI.pause();
CleanRowAPI.resume();
CleanRowAPI.reload();
CleanRowAPI.closeApp();
CleanRowAPI.restartApp();
```

## Data Format

### `rowingData` Event Detail

```typescript
{
    rpm: number,          // Flywheel RPM
    watts: number,        // Current power output (W)
    spm: number,          // Strokes per minute
    strokeCount: number,  // Total strokes
    drag: number,         // Current drag level (0-24)
    errorFlags: number,   // Error flags (0 = no error)
    timestamp: number     // Unix timestamp (ms)
}
```

### `connectionStatus` Event Detail

```typescript
{
    connected: boolean,   // Connection status
    message: string,      // Status message
    timestamp: number     // Unix timestamp (ms)
}
```

### `buttonPress` Event Detail

```typescript
{
    type: 'shortPress' | 'longPress',
    timestamp: number
}
```

## Example Web UI

A complete example UI is provided in `example-web/`:

```bash
cd example-web
python3 -m http.server 3000
```

Then update the app's URL to `http://YOUR_IP:3000` and reload.

## Development Workflow

1. **Start your web server** (e.g., React dev server, Vite, etc.)
2. **Update the URL** in the app or strings.xml
3. **Rebuild and install** the APK:
   `./gradlew assembleDebug && adb install -r app/build/outputs/apk/debug/app-debug.apk`
4. **Launch the app** on the rowing machine
5. **Iterate on your web UI** - changes reflect on refresh (pull-down gesture in
   WebView)

### Hot Reload

To avoid rebuilding the APK every time:

- Use a dev server with hot reload (Vite, webpack-dev-server)
- The WebView loads the remote URL, so UI changes reflect immediately
- Only rebuild the bridge app if you change Kotlin code

## Serial Protocol Details

The app communicates with `/dev/ttyS2` at 19200 baud (8N1). The protocol is
fully documented in the Obsidian vault note: **"Escaping the Rowing Machine
Kiosk App via ADB"**.

Key packet format:

```
[0]     0x49 'I'    — header byte 1
[1]     0x54 'T'    — header byte 2
[2]     category    — 0x01=drive, 0x02=LED, 0x03=counters
[3]     command     — specific command
[4]     N           — data length
[5..N]  data        — payload
[N+1]   checksum    — XOR of bytes [2]..[N]
[N+2]   0x61 'a'    — end byte
```

## Troubleshooting

### Web page doesn't load

- Check the URL matches your dev server
- Ensure both devices are on the same WiFi
- Check `network_security_config.xml` allows cleartext HTTP
- View logcat for errors: `adb logcat -s MainActivity WebView-Console`

### No rowing data received

- Check serial port exists: `adb shell ls -la /dev/ttyS2`
- View service logs: `adb logcat -s RowingService SerialInterface`
- Verify permissions (should be `rw-rw-rw-`)

### Commands not working

- Check WebView console: `adb logcat -s WebView-Console`
- Verify `cleanRowBridge` is defined in JS
- Check message format matches the API

### Physical button not working

- Check broadcasts: `adb logcat -s ButtonReceiver`
- Ensure `ButtonReceiver` is registered in manifest

## Architecture

```
┌─────────────────────────────────────────┐
│          Web Interface (HTML/JS)        │
│  ┌──────────────────────────────────┐   │
│  │    Your Custom UI / Mini-Game    │   │
│  └──────────────────────────────────┘   │
└──────────────┬──────────────────────────┘
               │ window.postMessage()
               │ CustomEvent dispatch
               ▼
┌──────────────────────────────────────────┐
│         WebView (MainActivity)           │
│  ┌──────────────────────────────────┐    │
│  │      RowingBridge (Kotlin)       │    │
│  │  - WebMessageListener            │    │
│  │  - evaluateJavascript()          │    │
│  └──────────────────────────────────┘    │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│      RowingService (Background)          │
│  ┌──────────────────────────────────┐    │
│  │   SerialInterface + Protocol     │    │
│  │   - Polling at 10Hz              │    │
│  │   - Command execution            │    │
│  └──────────────────────────────────┘    │
└──────────────┬───────────────────────────┘
               │
               ▼
      /dev/ttyS2 @ 19200 baud
               │
               ▼
┌──────────────────────────────────────────┐
│    Rowing Machine Hardware              │
│  - Brake controller                      │
│  - Sensors (RPM, power)                  │
│  - LED strip                             │
└──────────────────────────────────────────┘
```

## Project Structure

```
clean-row/
├── app/
│   ├── build.gradle.kts
│   ├── src/main/
│   │   ├── AndroidManifest.xml
│   │   ├── java/com/cleanrow/bridge/
│   │   │   ├── MainActivity.kt          — WebView + lifecycle
│   │   │   ├── SerialInterface.kt       — Serial port wrapper
│   │   │   ├── RowingProtocol.kt        — Packet parsing
│   │   │   ├── RowingBridge.kt          — JS ↔ Kotlin bridge
│   │   │   ├── RowingService.kt         — Background polling
│   │   │   └── ButtonReceiver.kt        — Physical button
│   │   └── res/
│   │       ├── layout/activity_main.xml
│   │       └── xml/network_security_config.xml
│   └── libs/
│       └── android-serialport-api.jar
├── example-web/
│   ├── index.html                       — Test UI
│   └── bridge.js                        — JS helper library
└── README.md
```

## License

MIT - Use freely for your own rowing adventures!

## Credits

- Serial protocol reverse-engineered from vendor APK
- Built with AndroidX, Kotlin, and coroutines
- WebView bridge pattern inspired by React Native

## Contributing

Found a bug? Have a feature request? Open an issue or PR!

---

**Happy Rowing! 🚣‍♂️💨**
