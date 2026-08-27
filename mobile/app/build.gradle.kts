plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization") version "1.9.24"
    id("com.google.devtools.ksp")
}

import java.util.Properties

val releaseSigningProperties = Properties()
val releaseSigningPropertiesFile = rootProject.file("key.properties")
if (releaseSigningPropertiesFile.exists()) {
    releaseSigningPropertiesFile.inputStream().use { releaseSigningProperties.load(it) }
}

android {
    namespace = "com.statcosol.attendance"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.statcosol.attendance"
        minSdk = 26
        targetSdk = 34
        versionCode = 16
        versionName = "0.7.9"

        // Default API host. Override at runtime via Settings screen if needed.
        buildConfigField("String", "DEFAULT_API_BASE", "\"https://app.statcosol.com\"")

        // Admin PIN that unlocks the kiosk lock-task / immersive mode so an
        // operator can exit back to the device launcher (e.g. for app
        // updates or to switch accounts). Long-press the brand label in the
        // kiosk header to bring up the PIN prompt.
        //
        // The PIN is read at build time from one of:
        //   * gradle.properties  →  statco.adminExitPin=...
        //   * CLI                →  -Pstatco.adminExitPin=...
        //   * env var            →  STATCO_ADMIN_EXIT_PIN=...
        // If unset, the value is empty and the exit dialog will refuse to
        // unlock — set a PIN before producing a release build.
        val adminExitPin: String =
            (project.findProperty("statco.adminExitPin") as String?)
                ?: System.getenv("STATCO_ADMIN_EXIT_PIN")
                ?: ""
        buildConfigField("String", "ADMIN_EXIT_PIN", "\"$adminExitPin\"")
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    signingConfigs {
        create("release") {
            if (releaseSigningPropertiesFile.exists()) {
                val storeFilePath = releaseSigningProperties.getProperty("storeFile").orEmpty()
                storeFile = if (storeFilePath.isNotBlank()) rootProject.file(storeFilePath) else null
                storePassword = releaseSigningProperties.getProperty("storePassword")
                keyAlias = releaseSigningProperties.getProperty("keyAlias")
                keyPassword = releaseSigningProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            if (releaseSigningPropertiesFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    flavorDimensions += "mode"
    productFlavors {
        // Single FaceDesk kiosk flavor. The .kiosk applicationId suffix is kept
        // so existing installs/provisioning continue to match.
        create("kiosk") {
            dimension = "mode"
            applicationIdSuffix = ".kiosk"
            versionNameSuffix = "-kiosk"
            resValue("string", "app_name", "StatCo Kiosk")
        }
    }

    packaging {
        resources.excludes += setOf(
            "META-INF/AL2.0",
            "META-INF/LGPL2.1",
            "META-INF/DEPENDENCIES",
        )
    }
}

dependencies {
    val cameraxVersion = "1.3.4"

    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("androidx.activity:activity-ktx:1.9.1")

    // Encrypted SharedPreferences for the install token (AES-256-GCM keyed
    // off the device keystore). Pinned to the last stable; the 1.1.0-alpha
    // line keeps changing API.
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // CameraX
    implementation("androidx.camera:camera-core:$cameraxVersion")
    implementation("androidx.camera:camera-camera2:$cameraxVersion")
    implementation("androidx.camera:camera-lifecycle:$cameraxVersion")
    implementation("androidx.camera:camera-view:$cameraxVersion")

    // ML Kit Face Detection (on-device, no API key)
    implementation("com.google.mlkit:face-detection:16.1.6")

    // TensorFlow Lite for MobileFaceNet embeddings (drop the .tflite into assets)
    implementation("org.tensorflow:tensorflow-lite:2.14.0")
    implementation("org.tensorflow:tensorflow-lite-support:0.4.4")

    // Networking
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("com.squareup.moshi:moshi-kotlin:1.15.1")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")

    // Coroutines. play-services variant supplies Task.await() used by the ML Kit
    // face detector.
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.8.1")

    val roomVersion = "2.6.1"
    implementation("androidx.room:room-runtime:$roomVersion")
    implementation("androidx.room:room-ktx:$roomVersion")
    ksp("androidx.room:room-compiler:$roomVersion")

    implementation("androidx.work:work-runtime-ktx:2.9.1")

    testImplementation("junit:junit:4.13.2")
}
