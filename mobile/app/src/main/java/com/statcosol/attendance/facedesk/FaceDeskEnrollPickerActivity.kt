package com.statcosol.attendance.facedesk

import android.content.Intent
import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.ListView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.statcosol.attendance.R
import com.statcosol.attendance.prefs.DeviceConfig
import kotlinx.coroutines.launch

/**
 * FaceDesk V2 enrollment-mode home: lists employees pending enrollment for the
 * device's client/branch. Admin taps one to open the enrollment camera. Keeps
 * enrollment strictly admin-driven and one-employee-at-a-time.
 */
class FaceDeskEnrollPickerActivity : AppCompatActivity() {

    private lateinit var list: ListView
    private lateinit var tvStatus: TextView
    private lateinit var api: FaceDeskApiClient
    private var pending: List<PendingEmployee> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_facedesk_enroll_picker)
        list = findViewById(R.id.fdpList)
        tvStatus = findViewById(R.id.fdpStatus)
        api = FaceDeskApiClient(DeviceConfig(this))

        list.setOnItemClickListener { _, _, position, _ ->
            val emp = pending.getOrNull(position) ?: return@setOnItemClickListener
            startActivity(
                Intent(this, FaceDeskEnrollmentActivity::class.java).apply {
                    putExtra(FaceDeskEnrollmentActivity.EXTRA_EMPLOYEE_ID, emp.employeeId)
                    putExtra(FaceDeskEnrollmentActivity.EXTRA_EMPLOYEE_NAME, emp.name)
                },
            )
        }
    }

    override fun onResume() {
        super.onResume()
        loadPending()
    }

    private fun loadPending() {
        tvStatus.text = getString(R.string.facedesk_loading_pending)
        lifecycleScope.launch {
            try {
                pending = api.pendingEnrollment()
                val labels = pending.map { "${it.employeeCode} — ${it.name}" }
                list.adapter = ArrayAdapter(
                    this@FaceDeskEnrollPickerActivity,
                    android.R.layout.simple_list_item_1,
                    labels,
                )
                tvStatus.text = if (pending.isEmpty())
                    getString(R.string.facedesk_all_enrolled)
                else
                    getString(R.string.facedesk_pick_employee)
            } catch (e: FaceDeskApiException) {
                tvStatus.text = e.userMessage(this@FaceDeskEnrollPickerActivity, R.string.facedesk_pending_failed)
            } catch (e: Exception) {
                tvStatus.text = getString(R.string.facedesk_pending_failed)
            }
        }
    }
}
