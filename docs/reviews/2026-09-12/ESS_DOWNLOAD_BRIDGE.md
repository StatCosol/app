# ESS download bridge origin changes

MainActivity now registers the download listener immediately before loading the configured portal. Startup, settings Save, and settings Reset all use this path. A previous listener is removed before registering the new exact HTTPS origin. The callback still requires a main-frame message whose origin matches the current page; wildcard origins were not introduced.

Validation: :essportal:assembleDebug passed. No physical-device test or APK installation was performed.

Device regression checks before release:
1. Download a document on the default portal; complete or cancel Save.
2. Save another allowed statcosol.com portal URL; log in and download a document and payslip without restarting the app.
3. Reset to the default portal; log in and repeat both downloads.
4. Repeat Save with the same URL; verify there is one Save dialog per download.
5. Verify iframe/cross-origin messages remain rejected and unsupported WebViews use the browser fallback.

The release remains subject to the security and review blockers recorded in HOSTED_RELEASE_STATUS.md.
