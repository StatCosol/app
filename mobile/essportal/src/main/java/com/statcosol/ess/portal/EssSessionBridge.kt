package com.statcosol.ess.portal

import android.content.Context
import android.net.Uri
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import android.webkit.WebView
import androidx.webkit.ScriptHandler
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Device-bound, non-backed-up session storage. Passwords are never accepted. */
class EssSessionBridge(context: Context) {
    private val file = AtomicFile(File(context.noBackupFilesDir, "ess-session.enc"))
    private var script: ScriptHandler? = null
    private var registered = false
    private val alias = "ess-session-v1"
    private val maxAge = 14L * 24 * 60 * 60 * 1000

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        return (store.getKey(alias, null) as? SecretKey) ?: KeyGenerator.getInstance("AES", "AndroidKeyStore").run {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build())
            generateKey()
        }
    }

    private fun read(origin: String): JSONObject? = runCatching {
        val bytes = file.readFully()
        require(bytes.size > 28)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
        cipher.updateAAD(origin.toByteArray(Charsets.UTF_8))
        val saved = JSONObject(String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8))
        require(System.currentTimeMillis() in saved.getLong("createdAt") until saved.getLong("createdAt") + maxAge)
        saved
    }.getOrNull()

    private fun write(origin: String, session: JSONObject) {
        require(JSONObject(session.getString("user")).optString("roleCode") == "EMPLOYEE")
        require(session.getString("accessToken").isNotBlank() && session.getString("refreshToken").isNotBlank())
        val clean = JSONObject()
        for (name in listOf("accessToken", "refreshToken", "user", "encryptionKey")) {
            clean.put(name, session.optString(name))
        }
        val saved = JSONObject().put("createdAt", read(origin)?.getLong("createdAt") ?: System.currentTimeMillis())
            .put("session", clean)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        cipher.updateAAD(origin.toByteArray(Charsets.UTF_8))
        val bytes = cipher.iv + cipher.doFinal(saved.toString().toByteArray(Charsets.UTF_8))
        val stream = file.startWrite()
        try { stream.write(bytes); file.finishWrite(stream) }
        catch (e: Exception) { file.failWrite(stream); throw e }
    }

    private fun installRestore(webView: WebView, origin: String) {
        script?.remove()
        val session = read(origin)?.optJSONObject("session") ?: JSONObject()
        // Runs before Angular's login/route guards. Only the exact trusted main frame
        // receives its own encrypted session; no wildcard origins or iframes.
        val code = """
            (() => {
              if (window.top !== window || location.origin !== ${JSONObject.quote(origin)}) return;
              const saved = $session;
              if (!sessionStorage.getItem('accessToken')) {
                for (const key of ['accessToken','refreshToken','user','encryptionKey']) {
                  if (typeof saved[key] === 'string' && saved[key]) sessionStorage.setItem(key, saved[key]);
                }
              }
              // Compatibility with the currently deployed sessionStorage-based site.
              // Coalesce token/user writes; never send passwords or unrelated storage.
              let pending = false;
              function sync() {
                if (pending) return;
                pending = true;
                queueMicrotask(() => {
                  pending = false;
                  try {
                    const session = {};
                    for (const key of ['accessToken','refreshToken','user','encryptionKey']) {
                      session[key] = sessionStorage.getItem(key) || '';
                    }
                    const employee = session.user && JSON.parse(session.user).roleCode === 'EMPLOYEE';
                    const payload = employee && session.accessToken && session.refreshToken
                      ? {action:'save',session} : {action:'clear'};
                    window.StatcoSession.postMessage(JSON.stringify(payload));
                  } catch (_) {}
                });
              }
              for (const name of ['setItem','removeItem','clear']) {
                const original = Storage.prototype[name];
                Storage.prototype[name] = function(...args) {
                  const result = original.apply(this,args);
                  if (this === sessionStorage && (name === 'clear' ||
                    ['accessToken','refreshToken','user','encryptionKey'].includes(args[0]))) sync();
                  return result;
                };
              }
            })();
        """.trimIndent()
        script = WebViewCompat.addDocumentStartJavaScript(webView, code, setOf(origin))
    }

    fun attach(webView: WebView, portal: String) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) ||
            !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return
        script?.remove()
        if (registered) WebViewCompat.removeWebMessageListener(webView, "StatcoSession")
        val uri = Uri.parse(portal)
        require(uri.scheme == "https")
        val origin = "https://${uri.encodedAuthority}"
        installRestore(webView, origin)
        WebViewCompat.addWebMessageListener(webView, "StatcoSession", setOf(origin)) { _, message, source, mainFrame, _ ->
            val current = webView.url?.let { Uri.parse(it).let { p -> "${p.scheme}://${p.encodedAuthority}" } }
            if (!mainFrame || source.toString().trimEnd('/') != origin || current != origin) return@addWebMessageListener
            try {
                val raw = message.data ?: return@addWebMessageListener
                require(raw.length <= 65536)
                val payload = JSONObject(raw)
                when (payload.optString("action")) {
                    "clear" -> file.delete()
                    "save" -> write(origin, payload.getJSONObject("session"))
                    else -> return@addWebMessageListener
                }
                installRestore(webView, origin)
            } catch (_: Exception) {
                // Never retain an older rotating refresh token after a failed save.
                file.delete()
                script?.remove()
                script = null
            }
        }
        registered = true
    }
}
