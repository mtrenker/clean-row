# ProGuard rules for Clean Row

# Keep native methods for serial port
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep serial port classes
-keep class android_serialport_api.** { *; }

# Keep WebView JavaScript interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep rowing protocol data classes
-keep class com.cleanrow.bridge.RowingProtocol$** { *; }

# Preserve line numbers for debugging
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
