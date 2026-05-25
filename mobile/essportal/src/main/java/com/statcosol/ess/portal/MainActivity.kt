package com.statcosol.ess.portal

import android.Manifest
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.text.InputType
import android.view.KeyEvent
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.statcosol.ess.portal.databinding.ActivityMainBinding

/**
 * Thin WebView wrapper that hosts the existing Angular ESS portal at
 * [BuildConfig.DEFAULT_PORTAL_URL]. The web app continues to be the source of
 * truth — this Activity only provides:
 *
 *  * native camera + geolocation permission grants for the in-page Face ID and
 *    geofence flows,
 *  * a file chooser bridge for document uploads,
 *  * a system DownloadManager handoff for payslip / report downloads,
 *  * pull-to-refresh and a hardware back-button → webview history bridge,
 *  * a hidden Settings dialog (long-press anywhere on the offline banner) to
 *    point the app at staging during QA.
 *
 * Navigation is locked to the Statcosol domain — anything else opens in the
 * external browser so the user cannot get phished into typing their ESS
 * password into a third-party page that loaded inside this WebView.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: SharedPreferences
    private var pendingFileChooser: ValueCallback<Array<Uri>>? = null
    private var pendingPermissionRequest: PermissionRequest? = null

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val cb = pendingFileChooser ?: return@registerForActivityResult
        pendingFileChooser = null
        val uris: Array<Uri>? = if (result.resultCode == RESULT_OK) {
            val data = result.data
            when {
                data?.clipData != null -> Array(data.clipData!!.itemCount) { i ->
                    data.clipData!!.getItemAt(i).uri
                }
                data?.data != null -> arrayOf(data.data!!)
                else -> null
            }
        } else null
        cb.onReceiveValue(uris)
    }

    private val cameraPermLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val req = pendingPermissionRequest ?: return@registerForActivityResult
        pendingPermissionRequest = null
        if (granted) {
            req.grant(req.resources)
        } else {
            req.deny()
            Toast.makeText(this, R.string.permission_camera_denied, Toast.LENGTH_LONG).show()
        }
    }

    private val locationPermLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { perms ->
        if (perms.values.none { it }) {
            Toast.makeText(this, R.string.permission_location_denied, Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        prefs = getSharedPreferences("ess_portal", Context.MODE_PRIVATE)

        configureWebView()

        binding.swipeRefresh.setOnRefreshListener {
            binding.webView.reload()
        }

        // Hidden settings: long-press the offline banner area to change URL.
        binding.offlineBanner.setOnLongClickListener {
            showSettingsDialog(); true
        }

        // Hardware back → webview history.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (binding.webView.canGoBack()) binding.webView.goBack() else finish()
            }
        })

        // Pre-warm location permission on first run; the geofence call inside
        // the page will fail silently otherwise.
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED) {
            locationPermLauncher.launch(arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
            ))
        }

        loadStartUrl()
    }

    private fun configureWebView() {
        val wv = binding.webView
        with(wv.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            setGeolocationEnabled(true)
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(false)
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
            // Honour the page's <meta name="viewport" content="width=device-width">
            // so ESS pages render at phone width instead of pretending to be a
            // 980-px desktop viewport.
            useWideViewPort = true
            loadWithOverviewMode = true
            // Pinch-to-zoom is allowed (page is responsive) but the on-screen
            // zoom controls are hidden — they overlap the bottom nav.
            setSupportZoom(true)
            builtInZoomControls = true
            displayZoomControls = false
            userAgentString = "$userAgentString StatcoEssPortal/${BuildConfig.VERSION_NAME}"
        }
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true)

        wv.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView, request: WebResourceRequest
            ): Boolean {
                val host = request.url.host ?: return false
                return if (isAllowedHost(host)) {
                    false // let WebView load it
                } else {
                    // External link → system browser, never inside this app.
                    runCatching {
                        startActivity(Intent(Intent.ACTION_VIEW, request.url))
                    }
                    true
                }
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                binding.swipeRefresh.isRefreshing = false
                binding.offlineBanner.visibility = android.view.View.GONE
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: android.webkit.WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true && !isOnline()) {
                    binding.offlineBanner.visibility = android.view.View.VISIBLE
                }
            }
        }

        wv.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                binding.progress.progress = newProgress
                binding.progress.visibility =
                    if (newProgress in 1..99) android.view.View.VISIBLE else android.view.View.GONE
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val needsCam = request.resources.any {
                        it == PermissionRequest.RESOURCE_VIDEO_CAPTURE
                    }
                    if (needsCam && ContextCompat.checkSelfPermission(
                            this@MainActivity, Manifest.permission.CAMERA
                        ) != PackageManager.PERMISSION_GRANTED) {
                        pendingPermissionRequest = request
                        cameraPermLauncher.launch(Manifest.permission.CAMERA)
                    } else {
                        request.grant(request.resources)
                    }
                }
            }

            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: android.webkit.GeolocationPermissions.Callback?
            ) {
                val granted = ContextCompat.checkSelfPermission(
                    this@MainActivity, Manifest.permission.ACCESS_FINE_LOCATION
                ) == PackageManager.PERMISSION_GRANTED
                callback?.invoke(origin, granted, false)
                if (!granted) {
                    locationPermLauncher.launch(arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION,
                    ))
                }
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                pendingFileChooser?.onReceiveValue(null)
                pendingFileChooser = filePathCallback
                val intent = fileChooserParams.createIntent().apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    if (fileChooserParams.mode == FileChooserParams.MODE_OPEN_MULTIPLE) {
                        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                    }
                }
                return runCatching { fileChooserLauncher.launch(intent); true }
                    .getOrElse {
                        pendingFileChooser = null
                        false
                    }
            }
        }

        // PDF / image / etc. downloads → system DownloadManager.
        wv.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            try {
                val fileName = URLUtil.guessFileName(url, contentDisposition, mimeType)
                val req = DownloadManager.Request(Uri.parse(url)).apply {
                    setMimeType(mimeType)
                    addRequestHeader("User-Agent", userAgent)
                    addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url) ?: "")
                    setNotificationVisibility(
                        DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
                    )
                    setDestinationInExternalPublicDir(
                        Environment.DIRECTORY_DOWNLOADS, fileName
                    )
                }
                (getSystemService(DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
                Toast.makeText(this, "Downloading $fileName", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Toast.makeText(this, "Download failed: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun loadStartUrl() {
        val stored = prefs.getString(KEY_PORTAL_URL, null)
        val url = if (stored != null && isAllowedUrl(stored)) {
            stored
        } else {
            // Clear any previously-saved out-of-allowlist URL so the hidden
            // settings dialog can't be used to silently pin the app to a
            // phishing host across launches.
            if (stored != null) prefs.edit().remove(KEY_PORTAL_URL).apply()
            BuildConfig.DEFAULT_PORTAL_URL
        }
        if (!isOnline()) {
            binding.offlineBanner.visibility = android.view.View.VISIBLE
        }
        binding.webView.loadUrl(url)
    }

    private fun isAllowedHost(host: String): Boolean {
        val suffix = BuildConfig.ALLOWED_HOST_SUFFIX
        return host == suffix || host.endsWith(".$suffix")
    }

    private fun isAllowedUrl(raw: String): Boolean {
        return try {
            val u = Uri.parse(raw)
            val scheme = u.scheme?.lowercase()
            val host = u.host?.lowercase()
            if (scheme != "https" && scheme != "http") return false
            if (host.isNullOrBlank()) return false
            isAllowedHost(host)
        } catch (_: Exception) {
            false
        }
    }

    private fun isOnline(): Boolean {
        val cm = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val n = cm.activeNetwork ?: return false
            cm.getNetworkCapabilities(n) != null
        } else {
            @Suppress("DEPRECATION") cm.activeNetworkInfo?.isConnected == true
        }
    }

    private fun showSettingsDialog() {
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setText(prefs.getString(KEY_PORTAL_URL, BuildConfig.DEFAULT_PORTAL_URL))
            setSelection(text.length)
            hint = getString(R.string.settings_hint)
        }
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 24, 48, 0)
            addView(input)
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.settings_title)
            .setView(container)
            .setPositiveButton(R.string.settings_save) { _, _ ->
                val v = input.text.toString().trim()
                if (isAllowedUrl(v)) {
                    prefs.edit().putString(KEY_PORTAL_URL, v).apply()
                    binding.webView.loadUrl(v)
                } else {
                    Toast.makeText(
                        this,
                        getString(
                            R.string.settings_invalid_host,
                            BuildConfig.ALLOWED_HOST_SUFFIX,
                        ),
                        Toast.LENGTH_LONG,
                    ).show()
                }
            }
            .setNeutralButton(R.string.settings_reset) { _, _ ->
                prefs.edit().remove(KEY_PORTAL_URL).apply()
                binding.webView.loadUrl(BuildConfig.DEFAULT_PORTAL_URL)
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK && binding.webView.canGoBack()) {
            binding.webView.goBack()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    companion object {
        private const val KEY_PORTAL_URL = "portal_url"
    }
}
