package com.statcosol.attendance

import android.app.Application

/**
 * Application entry point. FaceDesk handles its own offline queue and flushes it
 * on resume, so there is no background WorkManager sync to schedule here.
 */
class AttendanceApp : Application()
