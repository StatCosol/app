package com.statcosol.attendance.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.statcosol.attendance.AttendanceApp
import com.statcosol.attendance.R
import com.statcosol.attendance.databinding.ActivitySetupBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * First-launch screen. Operator pastes the install token issued by the admin
 * portal, optionally overrides the API base, and we call `/config` to confirm
 * the token + learn the device mode (KIOSK vs ESS). The full roster loads only
 * after the relevant mode Activity opens.
 */
class SetupActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySetupBinding
    private val app get() = application as AttendanceApp

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySetupBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val cfg = app.deviceConfig
        binding.tokenInput.setText(cfg.installToken ?: "")
        binding.apiInput.setText(cfg.apiBase)

        if (cfg.isRegistered() && cfg.mode != null) {
            // Re-validate the token against the server before launching the
            // mode activity. If admin has revoked the device (or rotated the
            // token) we want to land back on this screen, not deep inside
            // KioskActivity / EssActivity where the user can't recover.
            binding.progress.visibility = View.VISIBLE
            lifecycleScope.launch {
                val ok = runCatching {
                    withContext(Dispatchers.IO) { app.apiClient.fetchDeviceInfo() }
                }
                binding.progress.visibility = View.GONE
                if (ok.isSuccess) {
                    launchModeActivity(cfg.mode!!)
                } else {
                    val msg = ok.exceptionOrNull()?.message.orEmpty()
                    if (msg.contains(" 401") || msg.contains(" 403")) {
                        // Token revoked / rebound — force re-pairing.
                        cfg.installToken = null
                        cfg.mode = null
                        cfg.deviceId = null
                        cfg.essEmployeeId = null
                        binding.tokenInput.setText("")
                        binding.statusText.text =
                            getString(R.string.setup_token_revoked)
                    } else {
                        // Network failure — allow offline use of cached mode.
                        launchModeActivity(cfg.mode!!)
                    }
                }
            }
            binding.registerBtn.setOnClickListener { handleRegister() }
            return
        }

        binding.registerBtn.setOnClickListener { handleRegister() }
    }

    private fun handleRegister() {
        val token = binding.tokenInput.text?.toString()?.trim().orEmpty()
        val apiBase = binding.apiInput.text?.toString()?.trim().orEmpty().ifBlank {
            app.deviceConfig.apiBase
        }
        if (!token.matches(Regex("^[a-f0-9]{64}$"))) {
            binding.statusText.text = getString(R.string.setup_invalid_token)
            return
        }

        binding.progress.visibility = View.VISIBLE
        binding.statusText.text = ""
        app.deviceConfig.installToken = token
        app.deviceConfig.apiBase = apiBase

        lifecycleScope.launch {
            try {
                val info = withContext(Dispatchers.IO) { app.apiClient.fetchDeviceInfo() }
                app.deviceConfig.mode = info.mode
                app.deviceConfig.deviceId = info.deviceId
                app.deviceConfig.essEmployeeId = info.essEmployeeId
                launchModeActivity(info.mode)
            } catch (e: Exception) {
                binding.statusText.text = e.message ?: "registration failed"
                app.deviceConfig.installToken = null
            } finally {
                binding.progress.visibility = View.GONE
            }
        }
    }

    private fun launchModeActivity(mode: String) {
        val cls = if (mode == "ESS") EssActivity::class.java else KioskActivity::class.java
        startActivity(Intent(this, cls))
        finish()
    }
}
