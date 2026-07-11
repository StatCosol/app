# Standard ProGuard rules for the statcompy-attendance app
-keep class com.statcosol.attendance.face.** { *; }
-dontwarn org.tensorflow.lite.**
-keep class org.tensorflow.lite.** { *; }
-keep class org.tensorflow.lite.Interpreter { *; }
-keep class org.tensorflow.lite.Interpreter$Options { *; }

# EncryptedSharedPreferences / security-crypto
-keep class androidx.security.crypto.** { *; }
-dontwarn androidx.security.crypto.**

# OkHttp certificate pinning
-keep class okhttp3.CertificatePinner { *; }
-dontwarn okhttp3.**

# ML Kit Face Detection
-keep class com.google.mlkit.vision.face.** { *; }
-dontwarn com.google.mlkit.**
