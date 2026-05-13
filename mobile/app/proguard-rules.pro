# Standard ProGuard rules for the statcompy-attendance app
-keep class com.statcosol.attendance.api.** { *; }
-keep class com.statcosol.attendance.db.** { *; }
-dontwarn org.tensorflow.lite.**
-keep class org.tensorflow.lite.** { *; }
