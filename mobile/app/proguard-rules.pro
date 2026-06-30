# Standard ProGuard rules for the statcompy-attendance app
-keep class com.statcosol.attendance.api.** { *; }
-keep class com.statcosol.attendance.db.** { *; }
-keep class com.statcosol.attendance.admin.** { *; }
-keep class com.statcosol.attendance.face.** { *; }
-dontwarn org.tensorflow.lite.**
-keep class org.tensorflow.lite.** { *; }
-keep class org.tensorflow.lite.Interpreter { *; }
-keep class org.tensorflow.lite.Interpreter$Options { *; }

# Keep LivenessChallenge enum — fromWire() uses name-based lookup
-keep enum com.statcosol.attendance.face.LivenessChallenge { *; }
-keepclassmembers enum com.statcosol.attendance.face.LivenessChallenge {
    public static ** values();
    public static ** valueOf(java.lang.String);
}

# EncryptedSharedPreferences / security-crypto
-keep class androidx.security.crypto.** { *; }
-dontwarn androidx.security.crypto.**

# OkHttp certificate pinning
-keep class okhttp3.CertificatePinner { *; }
-dontwarn okhttp3.**

# ML Kit Face Detection
-keep class com.google.mlkit.vision.face.** { *; }
-dontwarn com.google.mlkit.**
