package com.statcosol.attendance.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.statcosol.attendance.R
import com.statcosol.attendance.api.ApiClient
import com.statcosol.attendance.api.ApiException
import com.statcosol.attendance.api.RegisterDeviceRequest
import com.statcosol.attendance.prefs.DeviceConfig
import kotlinx.coroutines.launch

class SetupActivity : AppCompatActivity() {

    private lateinit var config: DeviceConfig
    private lateinit var etToken: EditText
    private lateinit var etApiBase: EditText
    private lateinit var btnRegister: Button
    private lateinit var progressBar: ProgressBar
    private lateinit var tvError: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        config = DeviceConfig(this)

        if (config.isRegistered()) {
            navigateToMain()
            return
        }

        setContentView(R.layout.activity_setup)

        etToken = findViewById(R.id.tokenInput)
        etApiBase = findViewById(R.id.apiInput)
        btnRegister = findViewById(R.id.registerBtn)
        progressBar = findViewById(R.id.progress)
        tvError = findViewById(R.id.statusText)

        btnRegister.setOnClickListener { attemptRegistration() }
    }

    private fun attemptRegistration() {
        val token = etToken.text.toString().trim()
        val apiBase = etApiBase.text.toString().trim()

        if (!token.matches(Regex("[0-9a-fA-F]{64}"))) {
            tvError.text = getString(R.string.setup_invalid_token)
            tvError.visibility = View.VISIBLE
            return
        }

        tvError.visibility = View.GONE
        setLoading(true)

        if (apiBase.isNotBlank()) {
            config.apiBase = apiBase
        }
        config.installToken = token

        val androidId = android.provider.Settings.Secure.getString(
            contentResolver,
            android.provider.Settings.Secure.ANDROID_ID,
        ) ?: "unknown"
        val deviceName = android.os.Build.MODEL

        lifecycleScope.launch {
            try {
                val client = ApiClient(config)
                val response = client.registerDevice(
                    RegisterDeviceRequest(
                        installToken = token,
                        androidId = androidId,
                        deviceName = deviceName,
                    )
                )

                config.deviceToken = response.deviceToken
                config.deviceMode = response.mode

                navigateToMain()
            } catch (e: ApiException) {
                setLoading(false)
                val msg = when (e.code) {
                    401, 403 -> getString(R.string.setup_invalid_device_token)
                    409 -> getString(R.string.setup_token_already_used)
                    410 -> getString(R.string.setup_token_expired)
                    426 -> getString(R.string.setup_update_app_required)
                    else -> getString(R.string.setup_registration_failed)
                }
                tvError.text = msg
                tvError.visibility = View.VISIBLE
            } catch (e: Exception) {
                setLoading(false)
                tvError.text = getString(R.string.setup_registration_failed)
                tvError.visibility = View.VISIBLE
            }
        }
    }

    private fun navigateToMain() {
        val mode = config.deviceMode
        val intent = if (mode.equals("ess", ignoreCase = true)) {
            Intent(this, EssActivity::class.java)
        } else {
            Intent(this, KioskActivity::class.java)
        }
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }

    private fun setLoading(loading: Boolean) {
        progressBar.visibility = if (loading) View.VISIBLE else View.GONE
        btnRegister.isEnabled = !loading
        etToken.isEnabled = !loading
        etApiBase.isEnabled = !loading
    }
}
