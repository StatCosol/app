// Kotlin 2.2.10 matches the kotlin-stdlib the Azure Face UI SDK ships (2.2.10), so
// enabling that SDK does not produce a metadata-version mismatch.
//
// KNOWN NOISE: AGP 8.4's bundled Android Lint embeds a Kotlin 2.0 analyzer, so
// :app:lintVitalAnalyzeKioskRelease logs three `e:` lines about kotlin-stdlib
// 2.2.10 metadata being version 2.2.0 when it expected 2.0.0. The task still
// succeeds and the APK compiles and packages correctly — it is Lint's analysis of
// the stdlib that is degraded, not the build. Clearing it means bumping AGP, which
// is its own change with its own testing.
plugins {
    id("com.android.application") version "8.4.0" apply false
    id("org.jetbrains.kotlin.android") version "2.2.10" apply false
    id("com.google.devtools.ksp") version "2.2.10-2.0.2" apply false
    // Compose compiler moved into the Kotlin plugin from Kotlin 2.0; version tracks Kotlin.
    id("org.jetbrains.kotlin.plugin.compose") version "2.2.10" apply false
}
