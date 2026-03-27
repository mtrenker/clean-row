# Installing the Serial Port Library

## Quick Method: Extract from Vendor APK

Since you've already decompiled the vendor APK, the easiest way is to extract
their bundled serial library:

```bash
# Navigate to where you decompiled the vendor APK
cd /tmp/stech2  # Or wherever you ran JADX

# Find the library
find . -name "*serialport*.jar" -o -name "libmid_serial.so"

# If you find a JAR file, copy it:
cp path/to/android-serialport-api.jar /home/martin/dev/clean-row/app/libs/

# If you only find .so files, you'll need to build from source (see below)
```

## Alternative: Build from Source

```bash
# Clone the repository
cd /tmp
git clone https://github.com/cepr/android-serialport-api.git
cd android-serialport-api

# Build (requires Android SDK and NDK)
./gradlew assembleRelease

# Copy the output
cp android-serialport-api/build/libs/*.jar /home/martin/dev/clean-row/app/libs/android-serialport-api.jar
```

## Alternative: Use a Different Library

If you can't get android-serialport-api, you can use alternatives:

1. **google/android-serialport-api** (older, but stable)
2. **Build your own JNI wrapper** for `/dev/ttyS*`
3. **Use termios via JNI** (raw POSIX serial access)

If using an alternative, update the imports in `SerialInterface.kt`:

```kotlin
// Change this:
import android_serialport_api.SerialPort

// To match your library, e.g.:
import com.google.android.serialport.SerialPort
```

## Verify Installation

Once you have the JAR:

```bash
cd /home/martin/dev/clean-row

# Check it exists and has reasonable size (>5KB)
ls -lh app/libs/android-serialport-api.jar

# Should show something like:
# -rw-r--r-- 15K martin date android-serialport-api.jar
```

If the file is tiny (<1KB), it's probably a 404 error page or invalid.

## Ready to Build

Once the JAR is in place:

```bash
./gradlew assembleDebug
```

You're ready to go! 🚀
