# Keep WebView JavaScript interface (none currently, but reserved).
-keepattributes *Annotation*
-keepclassmembers class com.statcosol.ess.portal.** {
    @android.webkit.JavascriptInterface <methods>;
}
