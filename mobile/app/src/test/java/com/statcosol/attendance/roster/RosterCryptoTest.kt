package com.statcosol.attendance.roster

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * JVM cross-platform vectors shared with backend `roster-crypto.util.spec.ts`.
 */
class RosterCryptoTest {
    private val deviceId = "device-abc"
    private val installToken = "install-token-xyz"

    @Test
    fun deriveAesKey_matchesBackendSha256Hex() {
        val key = RosterCrypto.deriveAesKey(deviceId, installToken)
        assertEquals(32, key.size)
        assertEquals(
            "aaddce422deade191b890996803d917d482ed1ca7537a4950c328b10c3e80c73",
            key.joinToString("") { "%02x".format(it) },
        )
    }

    @Test
    fun decryptEmbeddingBytes_matchesBackendFixedIvVector() {
        // Node: iv=12 zero bytes, plain = Float32Array([0.1, 0.2, 0.3, 0.4])
        val cipherB64 = "AAAAAAAAAAAAAAAApjW5lFdk8NiJdfyHCD1niCZH0uQWHY7ToxrTs/+uBKc="

        val plain = RosterCrypto.decryptEmbeddingBytes(deviceId, installToken, cipherB64)
        val floats = ByteBuffer.wrap(plain).order(ByteOrder.LITTLE_ENDIAN).let { buffer ->
            FloatArray(plain.size / 4) { buffer.float }
        }

        assertArrayEquals(floatArrayOf(0.1f, 0.2f, 0.3f, 0.4f), floats, 0.0001f)
    }

    @Test
    fun decryptEmbeddingFloats_rejectsWrongInstallToken() {
        val cipherB64 = "AAAAAAAAAAAAAAAApjW5lFdk8NiJdfyHCD1niCZH0uQWHY7ToxrTs/+uBKc="

        assertThrows(Exception::class.java) {
            RosterCrypto.decryptEmbeddingFloats(deviceId, "other-token", cipherB64)
        }
    }

    @Test
    fun decryptEmbeddingBytes_rejectsTruncatedCiphertext() {
        assertThrows(IllegalArgumentException::class.java) {
            RosterCrypto.decryptEmbeddingBytes(deviceId, installToken, "AAAA")
        }
    }
}
