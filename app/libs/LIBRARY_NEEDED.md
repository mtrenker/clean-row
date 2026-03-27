# Serial Port Library Required

The `android-serialport-api.jar` file is required but must be obtained separately.

## Options:

### Option 1: Build from Source
```bash
git clone https://github.com/cepr/android-serialport-api.git
cd android-serialport-api
./gradlew assembleRelease
cp android-serialport-api/build/outputs/aar/android-serialport-api-release.aar ../clean-row/app/libs/
```

Then extract the JAR from the AAR file.

### Option 2: Use Alternative Library
Consider using the original google-serialport library or its Android Studio port.

### Option 3: Manual Download
Search for "android-serialport-api.jar" on GitHub releases or Maven repositories.

## Temporary Workaround

Place a compatible serial port library JAR in this directory:
`/home/martin/dev/clean-row/app/libs/android-serialport-api.jar`

The library should provide:
- `android_serialport_api.SerialPort` class
- Constructor: `SerialPort(File device, int baudrate, int flags)`
- Methods: `getInputStream()`, `getOutputStream()`, `close()`
