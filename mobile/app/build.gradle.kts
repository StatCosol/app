plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization") version "2.2.10"
    id("com.google.devtools.ksp")
}

import java.util.Properties

// Whether to pull in the Azure AI Vision Face UI SDK. Off by default; see the
// dependency block for why enabling it is a migration rather than a switch.
val azureFaceSdkEnabled =
    (findProperty("azureFaceSdkEnabled") as String?)?.toBoolean() ?: false
val azureFaceUiVersion = (findProperty("azureFaceUiVersion") as String?) ?: "1.5.0"

// Applied only with the SDK. The Compose compiler plugin activates the compiler
// wherever it is applied — buildFeatures.compose = false does not stop it — and it
// then fails the build demanding a Compose runtime this app otherwise has no reason
// to ship. So it is applied conditionally rather than declared in the plugins block.
if (azureFaceSdkEnabled) {
    apply(plugin = "org.jetbrains.kotlin.plugin.compose")
}

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
        versionCode = 31
        versionName = "0.7.24"

        // Default API host. Override at runtime via Settings screen if needed.
        buildConfigField("String", "DEFAULT_API_BASE", "\"https://app.statcosol.com\"")

        // Admin PIN that unlocks the kiosk lock-task / immersive mode so an
        // operator can exit back to the device launcher (e.g. for app
        // updates or to switch accounts). Long-press the brand label in the
        // kiosk header to bring up the PIN prompt.
        //
        // The PIN is read at build time from one of:
        //   * secrets.properties →  statco.adminExitPin=...  (gitignored; see example)
        //   * CLI                →  -Pstatco.adminExitPin=...
        //   * env var            →  STATCO_ADMIN_EXIT_PIN=...
        // If unset, the value is empty and the exit dialog will refuse to
        // unlock — set a PIN before producing a release build.
        val secretsProperties = Properties()
        val secretsFile = rootProject.file("secrets.properties")
        if (secretsFile.exists()) {
            secretsFile.inputStream().use { secretsProperties.load(it) }
        }
        val adminExitPin: String =
            (project.findProperty("statco.adminExitPin") as String?)
                ?: secretsProperties.getProperty("statco.adminExitPin")
                ?: System.getenv("STATCO_ADMIN_EXIT_PIN")
                ?: ""
        buildConfigField("String", "ADMIN_EXIT_PIN", "\"$adminExitPin\"")
    }

    buildFeatures {
        // Only with the Azure SDK. Its FaceLivenessDetector is a @Composable, so
        // hosting it needs the Compose compiler — but nothing else in this app is
        // Compose, and turning it on unconditionally would demand a Compose runtime
        // in every build and grow the shipped APK for no benefit. With the SDK on,
        // its own POM brings compose.ui / material3 transitively.
        compose = azureFaceSdkEnabled
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

    // Azure AI Vision Face UI SDK — cloud-backed on-device liveness, intended to
    // replace KioskFaceDetector's naive eye-open/head-pose score.
    //
    // PINNED TO 1.5.0, NOT the latest 1.5.1, because Microsoft's 1.5.1 is
    // broken: mavenCentral carries azure-ai-vision-face-ui:1.5.1, whose POM
    // requires azure-ai-vision-face-ui-assets:1.5.1 — but the gated feed only
    // publishes assets through 1.5.0, so 1.5.1 cannot resolve for anybody. Read
    // off the feed directly: assets 1.4.5 / 1.4.7 / 1.4.8 / 1.5.0 are present,
    // 1.5.1 is a 404. The same mismatch is reported against their npm package.
    // Revisit when assets 1.5.1+ ships; override with -PazureFaceUiVersion.
    //
    // OFF by default: enabling it is not a one-line change, because the SDK
    // brings four migrations with it (all read off the POM, not assumed):
    //   1. azure-ai-vision-face-ui-assets is a compile-scope dependency that is
    //      NOT on mavenCentral — it needs the gated feed wired in
    //      settings.gradle.kts. The main -ui artifact IS public.
    //   2. The SDK is built against Kotlin 2.x (kotlin-stdlib 2.2.10); this
    //      module is on Kotlin 1.9.24, so it needs a Kotlin bump first.
    //   3. FaceLivenessDetector is a @Composable and the POM pulls
    //      compose.ui 1.7.3 + material3 1.3.0 + activity-compose. This module is
    //      View-based (AppCompat/ConstraintLayout) with no Compose at all.
    //   4. It pulls androidx.camera 1.4.2, bumping this module's pinned CameraX
    //      1.3.4 — which the existing face capture pipeline is built on.
    // The backend session-token endpoint it talks to does not exist yet either.
    //
    // Once the token is configured, verify resolution on its own with:
    //   ./gradlew :app:dependencies --configuration kioskDebugRuntimeClasspath     //       -PazureFaceSdkEnabled=true
    if (azureFaceSdkEnabled) {
        implementation("com.azure:azure-ai-vision-face-ui:$azureFaceUiVersion")
        implementation("com.azure.android:azure-core-http-okhttp:1.0.0-beta.12")
    }

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
