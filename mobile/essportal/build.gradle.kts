plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.statcosol.ess.portal"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.statco.ess"
        minSdk = 26
        targetSdk = 35
        versionCode = 5
        versionName = "1.0.4"

        // Production ESS portal entry point. Override at runtime via the in-app
        // Settings screen (long-press the toolbar) when pointing at staging.
        buildConfigField("String", "DEFAULT_PORTAL_URL", "\"https://app.statcosol.com/app/ess/login\"")
        buildConfigField("String", "ALLOWED_HOST_SUFFIX", "\"statcosol.com\"")
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
            val path = System.getenv("STATCO_UPLOAD_STORE_FILE")
            if (!path.isNullOrBlank()) {
                storeFile = file(path)
                storePassword = System.getenv("STATCO_UPLOAD_STORE_PASSWORD")
                keyAlias = System.getenv("STATCO_UPLOAD_KEY_ALIAS")
                keyPassword = System.getenv("STATCO_UPLOAD_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.activity:activity-ktx:1.9.1")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("androidx.webkit:webkit:1.11.0")
}
