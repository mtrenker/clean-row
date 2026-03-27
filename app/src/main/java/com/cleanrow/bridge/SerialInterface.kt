package com.cleanrow.bridge

import android.util.Log
import java.io.File
import java.io.InputStream
import java.io.OutputStream

/**
 * Serial port interface wrapper for /dev/ttyS2 communication.
 * Uses android-serialport-api library.
 */
class SerialInterface {
    private var serialPort: android_serialport_api.SerialPort? = null
    private var inputStream: InputStream? = null
    private var outputStream: OutputStream? = null
    
    companion object {
        private const val TAG = "SerialInterface"
        private const val DEVICE_PATH = "/dev/ttyS2"
        private const val BAUD_RATE = 19200
    }
    
    /**
     * Open the serial port connection.
     * @return true if successful, false otherwise
     */
    fun open(): Boolean {
        return try {
            Log.d(TAG, "Opening serial port: $DEVICE_PATH at $BAUD_RATE baud")
            
            val device = File(DEVICE_PATH)
            if (!device.exists()) {
                Log.e(TAG, "Serial device not found: $DEVICE_PATH")
                return false
            }
            
            serialPort = android_serialport_api.SerialPort(device, BAUD_RATE, 0)
            inputStream = serialPort?.inputStream
            outputStream = serialPort?.outputStream
            
            Log.d(TAG, "Serial port opened successfully")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open serial port", e)
            false
        }
    }
    
    /**
     * Close the serial port connection.
     */
    fun close() {
        try {
            inputStream?.close()
            outputStream?.close()
            serialPort?.close()
            Log.d(TAG, "Serial port closed")
        } catch (e: Exception) {
            Log.e(TAG, "Error closing serial port", e)
        } finally {
            inputStream = null
            outputStream = null
            serialPort = null
        }
    }
    
    /**
     * Write data to serial port.
     * @param data Byte array to send
     * @return true if successful
     */
    fun write(data: ByteArray): Boolean {
        return try {
            outputStream?.write(data)
            outputStream?.flush()
            Log.d(TAG, "Sent ${data.size} bytes: ${data.joinToString(" ") { "%02X".format(it) }}")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to write to serial port", e)
            false
        }
    }
    
    /**
     * Read data from serial port.
     * @param buffer Buffer to read into
     * @param timeout Timeout in milliseconds
     * @return Number of bytes read, or -1 on error
     */
    fun read(buffer: ByteArray, timeout: Int = 1000): Int {
        return try {
            val stream = inputStream ?: return -1
            
            // Non-blocking read with timeout
            val startTime = System.currentTimeMillis()
            var totalRead = 0
            
            while (totalRead < buffer.size && 
                   (System.currentTimeMillis() - startTime) < timeout) {
                if (stream.available() > 0) {
                    val bytesToRead = minOf(stream.available(), buffer.size - totalRead)
                    val bytesRead = stream.read(buffer, totalRead, bytesToRead)
                    if (bytesRead > 0) {
                        totalRead += bytesRead
                    }
                } else {
                    Thread.sleep(10) // Small delay to avoid busy-waiting
                }
            }
            
            if (totalRead > 0) {
                Log.d(TAG, "Read $totalRead bytes: ${buffer.take(totalRead).joinToString(" ") { "%02X".format(it) }}")
            }
            
            totalRead
        } catch (e: Exception) {
            Log.e(TAG, "Failed to read from serial port", e)
            -1
        }
    }
    
    /**
     * Check if serial port is open.
     */
    fun isOpen(): Boolean = serialPort != null && inputStream != null && outputStream != null
}
