package com.cleanrow.bridge

import android.util.Log

/**
 * Rowing machine serial protocol implementation. Handles packet parsing and command building for
 * the rowing machine.
 *
 * Packet format: [0] 0x49 'I' — header byte 1 [1] 0x54 'T' — header byte 2 [2] category — command
 * group (0x01=drive, 0x02=LED, 0x03=counters) [3] command — specific command within group [4] N —
 * number of data bytes that follow [5..4+N] data — N bytes of payload [5+N] checksum — XOR of bytes
 * [2]..[4+N] [6+N] 0x61 'a' — end byte
 */
object RowingProtocol {
    private const val TAG = "RowingProtocol"

    // Packet structure constants
    private const val HEADER_1: Byte = 0x49 // 'I'
    private const val HEADER_2: Byte = 0x54 // 'T'
    private const val END_BYTE: Byte = 0x61 // 'a'

    // Category codes
    private const val CAT_DRIVE: Byte = 0x01
    private const val CAT_LED: Byte = 0x02
    private const val CAT_COUNTER: Byte = 0x03

    // Command codes
    private const val CMD_QUERY_STATE: Byte = 0x00
    private const val CMD_SET_DRAG: Byte = 0x01
    private const val CMD_SET_WATT: Byte = 0x02
    private const val CMD_LED_PRESET: Byte = 0x01
    private const val CMD_LED_RGB: Byte = 0x02
    private const val CMD_CLEAR_COUNTER: Byte = 0x01

    /** Rowing machine state data parsed from response packet. */
    data class RowingState(
            val errorFlags: Int = 0,
            val drag: Int = 0,
            val rpm: Int = 0,
            val watts: Int = 0,
            val spm: Int = 0, // Strokes per minute
            val strokeCount: Int = 0,
            val buttonPressed: Boolean = false,
            val buttonDuration: Int = 0 // Duration in 100ms units
    )

    /** Build a command packet with checksum. */
    private fun buildPacket(category: Byte, command: Byte, data: ByteArray): ByteArray {
        val dataLength = data.size.toByte()
        val packet = ByteArray(7 + data.size)

        packet[0] = HEADER_1
        packet[1] = HEADER_2
        packet[2] = category
        packet[3] = command
        packet[4] = dataLength

        // Copy data
        data.forEachIndexed { index, byte -> packet[5 + index] = byte }

        // Calculate checksum (XOR of bytes 2 through 4+N)
        var checksum: Byte = 0
        for (i in 2 until (5 + data.size)) {
            checksum = (checksum.toInt() xor packet[i].toInt()).toByte()
        }
        packet[5 + data.size] = checksum
        packet[6 + data.size] = END_BYTE

        return packet
    }

    /** Query state command - requests current machine status. */
    fun buildQueryStateCommand(): ByteArray {
        return buildPacket(CAT_DRIVE, CMD_QUERY_STATE, byteArrayOf(0x00, 0x00))
    }

    /** Set drag level command (magnetic brake resistance 0-24). */
    fun buildSetDragCommand(level: Int): ByteArray {
        val clampedLevel = level.coerceIn(0, 24)
        return buildPacket(CAT_DRIVE, CMD_SET_DRAG, byteArrayOf(0x00, clampedLevel.toByte()))
    }

    /** Set target watt command (0-500W). */
    fun buildSetWattCommand(watts: Int): ByteArray {
        val clampedWatts = watts.coerceIn(0, 500)
        val hi = (clampedWatts / 256).toByte()
        val lo = (clampedWatts % 256).toByte()
        return buildPacket(CAT_DRIVE, CMD_SET_WATT, byteArrayOf(hi, lo))
    }

    /**
     * Set LED color preset (0-7). 0=off, 1=blue, 2=cyan, 3=green, 4=yellow, 5=orange, 6=red,
     * 7=purple
     */
    fun buildSetLedPresetCommand(colorId: Int): ByteArray {
        val clampedId = colorId.coerceIn(0, 7)
        return buildPacket(CAT_LED, CMD_LED_PRESET, byteArrayOf(0x00, clampedId.toByte()))
    }

    /** Set LED RGB color (0-255 per channel). Note: Packet order is R, B, G (not R, G, B!) */
    fun buildSetLedRgbCommand(r: Int, g: Int, b: Int): ByteArray {
        val red = r.coerceIn(0, 255).toByte()
        val green = g.coerceIn(0, 255).toByte()
        val blue = b.coerceIn(0, 255).toByte()
        // Quirk: byte order is R, B, G
        return buildPacket(CAT_LED, CMD_LED_RGB, byteArrayOf(red, blue, green))
    }

    /** Clear stroke counter command. */
    fun buildClearCounterCommand(): ByteArray {
        return buildPacket(CAT_COUNTER, CMD_CLEAR_COUNTER, byteArrayOf(0x00, 0x00))
    }

    /**
     * Find the start offset of a valid packet in the buffer. Validates header, end byte, and
     * checksum. Returns -1 if no valid packet found.
     */
    fun findPacketStart(buffer: ByteArray, bytesRead: Int): Int {
        var i = 0
        while (i <=
                bytesRead - 7) { // minimum packet size is 7 (header+cat+cmd+len+0data+checksum+end)
            if (buffer[i] == HEADER_1 && i + 1 < bytesRead && buffer[i + 1] == HEADER_2) {
                if (i + 4 >= bytesRead) break
                val dataLen = buffer[i + 4].toInt() and 0xFF
                val totalLen = dataLen + 7
                if (i + totalLen > bytesRead) {
                    i++
                    continue
                }

                // Check end byte
                if (buffer[i + totalLen - 1] != END_BYTE) {
                    i++
                    continue
                }

                // Validate checksum (XOR of bytes from category through last data byte)
                var checksum: Byte = 0
                for (j in (i + 2) until (i + 5 + dataLen)) {
                    checksum = (checksum.toInt() xor buffer[j].toInt()).toByte()
                }
                if (checksum == buffer[i + 5 + dataLen]) {
                    return i
                }
                Log.w(TAG, "Checksum mismatch at offset $i")
            }
            i++
        }
        return -1
    }

    /** Parse a response packet into RowingState. Scans for a valid packet in the buffer. */
    fun parseResponse(buffer: ByteArray, bytesRead: Int): RowingState? {
        val offset = findPacketStart(buffer, bytesRead)
        if (offset < 0) {
            Log.w(TAG, "No valid packet found in $bytesRead bytes")
            return null
        }

        val dataLen = buffer[offset + 4].toInt() and 0xFF
        if (dataLen < 18) { // need at least 18 data bytes for rowing state (through key duration)
            Log.w(TAG, "Packet data too short for rowing state: $dataLen bytes")
            return null
        }

        return try {
            RowingState(
                    errorFlags = buffer[offset + 10].toInt() and 0xFF,
                    drag = buffer.readUInt16(offset + 11),
                    rpm = buffer.readUInt16(offset + 13),
                    watts = buffer.readUInt16(offset + 15),
                    spm = buffer.readUInt16(offset + 17),
                    strokeCount = buffer.readUInt16(offset + 19),
                    buttonPressed = buffer[offset + 21].toInt() == 0xFF,
                    buttonDuration = buffer[offset + 22].toInt() and 0xFF
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing response", e)
            null
        }
    }

    /** Read 16-bit unsigned integer (big-endian) from buffer. */
    private fun ByteArray.readUInt16(offset: Int): Int {
        return ((this[offset].toInt() and 0xFF) shl 8) or (this[offset + 1].toInt() and 0xFF)
    }

    /** Convert byte to hex string for logging. */
    private fun Byte.toHex(): String = "%02X".format(this)
}
