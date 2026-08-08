package com.statcosol.attendance.roster

import android.util.Base64
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Decrypts `encrypted-v1` roster embeddings from
 * `GET /api/v1/mobile-attendance/punches/roster`.
 *
 * Key derivation matches backend `deriveRosterAesKey()` — only kiosk-held
 * material (device id + bearer install token), no server secret on device.
 */
object RosterCrypto {
    const val KEY_DOMAIN = "statcompy-roster-v1"
    private const val IV_LEN = 12
    private const val TAG_LEN = 16
    private const val GCM_TAG_BITS = 128

    fun deriveAesKey(deviceId: String, installToken: String): ByteArray {
        val material = "$KEY_DOMAIN:$deviceId:$installToken"
        return MessageDigest.getInstance("SHA-256")
            .digest(material.toByteArray(Charsets.UTF_8))
    }

    fun decryptEmbeddingBytes(
        deviceId: String,
        installToken: String,
        embeddingCipherB64: String,
    ): ByteArray {
        val packed = Base64.decode(embeddingCipherB64, Base64.DEFAULT)
        require(packed.size >= IV_LEN + TAG_LEN + 1) { "Invalid roster ciphertext" }
        val iv = packed.copyOfRange(0, IV_LEN)
        val tag = packed.copyOfRange(IV_LEN, IV_LEN + TAG_LEN)
        val ciphertext = packed.copyOfRange(IV_LEN + TAG_LEN, packed.size)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            SecretKeySpec(deriveAesKey(deviceId, installToken), "AES"),
            GCMParameterSpec(GCM_TAG_BITS, iv),
        )
        return cipher.doFinal(ciphertext + tag)
    }

    /** Decode little-endian float32 embedding bytes (MobileFaceNet layout). */
    fun decryptEmbeddingFloats(
        deviceId: String,
        installToken: String,
        embeddingCipherB64: String,
    ): FloatArray {
        val bytes = decryptEmbeddingBytes(deviceId, installToken, embeddingCipherB64)
        require(bytes.size % 4 == 0) { "Embedding length must be a multiple of 4" }
        val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        return FloatArray(bytes.size / 4) { buffer.float }
    }
}
