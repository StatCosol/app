package com.statcosol.attendance.face

enum class LivenessChallenge {
    BLINK,
    SMILE,
    HEAD_TURN_LEFT,
    HEAD_TURN_RIGHT;

    companion object {
        fun fromWire(name: String): LivenessChallenge? =
            entries.firstOrNull { it.name.equals(name.trim(), ignoreCase = true) }
    }
}
