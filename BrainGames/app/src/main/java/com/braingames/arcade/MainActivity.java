package com.braingames.arcade;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.ActivityManager;
import android.app.UiModeManager;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Vibrator;
import android.provider.Settings;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {

    // Where over-the-air game updates come from (raw files on the main branch).
    private static final String UPDATE_BASE =
            "https://raw.githubusercontent.com/ZDStudios/Brain-ARCADE/main/www/";
    // Where the app checks for a newer APK (self-update).
    private static final String APK_INFO_URL =
            "https://raw.githubusercontent.com/ZDStudios/Brain-ARCADE/main/app-latest.json";
    private static final String BUNDLED_VERSION = "1.9.1";
    private static final String ASSET_INDEX = "file:///android_asset/www/index.html";

    private static final String PREF_KIOSK = "kioskEnabled";

    private WebView webView;
    private SharedPreferences prefs;
    private DevicePolicyManager dpm;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("braingames", MODE_PRIVATE);
        dpm = (DevicePolicyManager) getSystemService(DEVICE_POLICY_SERVICE);

        applySystemUi(isKioskEnabled());

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        // Needed so the WebView can load the updated bundle from internal storage
        // (file:// access is off by default on Android 11+ / targetSdk 30+).
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                // If the updated (internal-storage) bundle fails to load for any reason,
                // throw it away and fall back to the built-in copy bundled in the APK.
                if (req != null && req.isForMainFrame()) {
                    String url = req.getUrl() != null ? req.getUrl().toString() : "";
                    if (url.indexOf(getFilesDir().getAbsolutePath()) >= 0) {
                        deleteDir(new File(getFilesDir(), "www"));
                        prefs.edit().remove("installedVersion").apply();
                        view.post(new Runnable() { public void run() { webView.loadUrl(ASSET_INDEX); } });
                    }
                }
            }
        });
        webView.setBackgroundColor(0xFF0B1020);
        webView.addJavascriptInterface(new NativeBridge(), "AndroidBridge");

        webView.loadUrl(currentIndexUrl());

        // Re-enter kiosk if it was left on (including after a reboot).
        if (isKioskEnabled()) applyKiosk(true);

        // Check for OTA updates in the background (games always work offline regardless).
        if (isOnlineInternal()) {
            new Thread(new Runnable() { public void run() { checkForUpdate(false); checkForApkUpdate(); } }).start();
        }
    }

    /* ================= Kiosk mode =================
       Replaces the old separate "Kiosk Lock" app. Brain Arcade becomes the device's
       HOME app, so the tablet always returns here. Screen pinning is not used - see
       applyKiosk() for why.                                                        */

    private boolean isKioskEnabled() { return prefs.getBoolean(PREF_KIOSK, false); }

    private boolean isDeviceOwnerInternal() {
        try { return dpm != null && dpm.isDeviceOwnerApp(getPackageName()); } catch (Exception e) { return false; }
    }

    private boolean inLockTask() {
        try {
            ActivityManager am = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
            return am != null && am.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE;
        } catch (Exception e) { return false; }
    }

    /**
     * The HOME entry point is a disabled alias by default, so a normal install never
     * asks "which Home app?". It is switched on when kiosk mode is enabled, or when
     * the user explicitly asks to set Brain Arcade as the Home app.
     *
     * It is never switched off while Brain Arcade IS the current Home app — disabling
     * the registered home component would leave the device with a dead Home button.
     */
    private void setHomeAliasEnabled(boolean enabled) {
        try {
            ComponentName alias = new ComponentName(this, getPackageName() + ".HomeAlias");
            getPackageManager().setComponentEnabledSetting(
                    alias,
                    enabled ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                            : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    PackageManager.DONT_KILL_APP);
        } catch (Exception ignored) {}
    }

    private void applySystemUi(boolean kiosk) {
        int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN;
        if (kiosk) {
            flags |= View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
        }
        try { getWindow().getDecorView().setSystemUiVisibility(flags); } catch (Exception ignored) {}
    }

    /**
     * Kiosk mode works by being the device's HOME app, not by screen pinning.
     *
     * Pinning caused more problems than it solved: it blocked the app's own updater
     * and the permission screen (they opened for a moment and bounced back), and it
     * needed a fiddly escape gesture. As the Home app the tablet simply always comes
     * back to Brain Arcade — from the Home button, after a reboot, after any app
     * closes — while normal things like installing an update still work.
     */
    private void applyKiosk(boolean on) {
        prefs.edit().putBoolean(PREF_KIOSK, on).apply();
        if (on) {
            setHomeAliasEnabled(true);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            // Turning kiosk off has to actually release the device. While Brain Arcade
            // remains the Home app the tablet keeps coming back here, so switching
            // kiosk off looked like it did nothing at all.
            boolean wasHome = isHomeAppInternal();
            if (hasOtherLauncherInternal()) {
                setHomeAliasEnabled(false);      // stop being a Home candidate
                // Android may hold on to the old default until another launcher is
                // picked, so show the picker — otherwise nothing visibly changes.
                if (wasHome) openHomeSettingsInternal();
            }
            // If Brain Arcade is the ONLY launcher we keep it enabled on purpose:
            // disabling it would leave the device with no home screen at all.
            // hasOtherLauncher() lets the web layer explain that.
        }
        // Release any pin left over from an older version — pinning is no longer used.
        try { if (inLockTask()) stopLockTask(); } catch (Exception ignored) {}
        applySystemUi(on);
    }

    private boolean isTvInternal() {
        try {
            UiModeManager um = (UiModeManager) getSystemService(UI_MODE_SERVICE);
            if (um != null && um.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION) return true;
        } catch (Exception ignored) {}
        try {
            PackageManager pm = getPackageManager();
            if (pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK)) return true;
            return !pm.hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN);
        } catch (Exception e) { return false; }
    }

    private boolean isHomeAppInternal() {
        try {
            Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
            ResolveInfo ri = getPackageManager().resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY);
            return ri != null && ri.activityInfo != null && getPackageName().equals(ri.activityInfo.packageName);
        } catch (Exception e) { return false; }
    }

    /** Is there any Home app besides Brain Arcade to fall back to? */
    private boolean hasOtherLauncherInternal() {
        try {
            Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
            java.util.List<ResolveInfo> all = getPackageManager().queryIntentActivities(home, 0);
            for (int i = 0; i < all.size(); i++) {
                ResolveInfo ri = all.get(i);
                if (ri.activityInfo != null && !getPackageName().equals(ri.activityInfo.packageName)) return true;
            }
        } catch (Exception ignored) {}
        return false;
    }

    /** Open Android's Home-app picker, stepping out of any pin so it can actually show. */
    private void openHomeSettingsInternal() {
        setHomeAliasEnabled(true);
        try { if (inLockTask()) stopLockTask(); } catch (Exception ignored) {}
        try {
            Intent i = new Intent(Settings.ACTION_HOME_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            try {
                Intent i2 = new Intent(Settings.ACTION_SETTINGS);
                i2.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i2);
            } catch (Exception ignored) {}
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Kiosk no longer pins the screen; clear a pin an older build may have set,
        // which would otherwise keep blocking updates.
        if (inLockTask()) { try { stopLockTask(); } catch (Exception ignored) {} }
        applySystemUi(isKioskEnabled());
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applySystemUi(isKioskEnabled());
    }

    /** Load the updated bundle from internal storage if present, else the bundled assets. */
    private String currentIndexUrl() {
        File www = new File(getFilesDir(), "www");
        File idx = new File(www, "index.html");
        File appjs = new File(www, "js/app.js");
        // Only use the updated bundle if it looks complete and readable; otherwise built-in.
        if (idx.exists() && idx.canRead() && appjs.exists() && idx.length() > 0) {
            return "file://" + idx.getAbsolutePath();
        }
        return ASSET_INDEX;
    }

    private boolean isOnlineInternal() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Network n = cm.getActiveNetwork();
                if (n == null) return false;
                NetworkCapabilities caps = cm.getNetworkCapabilities(n);
                return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
            } else {
                NetworkInfo ni = cm.getActiveNetworkInfo();
                return ni != null && ni.isConnected();
            }
        } catch (Exception e) { return false; }
    }

    /** Fetch the single bundle.json (all games in one file) and, if newer, install it. */
    private void checkForUpdate(boolean manual) {
        try {
            String bundleStr = httpGet(UPDATE_BASE + "bundle.json");
            if (bundleStr == null) return;
            JSONObject bundle = new JSONObject(bundleStr);
            String remoteVersion = bundle.optString("version", "");
            String installed = prefs.getString("installedVersion", BUNDLED_VERSION);
            if (remoteVersion.isEmpty() || remoteVersion.equals(installed)) return;

            JSONObject files = bundle.getJSONObject("files"); // { "js/app.js": "<content>", ... }
            File stage = new File(getFilesDir(), "www_stage");
            deleteDir(stage);
            stage.mkdirs();

            java.util.Iterator<String> keys = files.keys();
            while (keys.hasNext()) {
                String rel = keys.next();
                byte[] data = files.getString(rel).getBytes(java.nio.charset.StandardCharsets.UTF_8);
                File out = new File(stage, rel);
                File parent = out.getParentFile();
                if (parent != null) parent.mkdirs();
                FileOutputStream fos = new FileOutputStream(out);
                fos.write(data);
                fos.close();
            }

            // Swap staged bundle into place atomically-ish.
            File live = new File(getFilesDir(), "www");
            deleteDir(live);
            stage.renameTo(live);
            prefs.edit().putString("installedVersion", remoteVersion).apply();

            final String v = remoteVersion;
            runOnUiThread(new Runnable() { public void run() {
                // Reload so the update takes effect right away.
                webView.loadUrl(currentIndexUrl());
                webView.postDelayed(new Runnable() { public void run() {
                    webView.evaluateJavascript("window.BrainGames && window.BrainGames.onUpdate && window.BrainGames.onUpdate('" + v + "');", null);
                } }, 1200);
            } });
        } catch (Exception ignored) {
        }
    }

    private String httpGet(String urlStr) {
        byte[] b = httpGetBytes(urlStr);
        return b == null ? null : new String(b, java.nio.charset.StandardCharsets.UTF_8);
    }

    private byte[] httpGetBytes(String urlStr) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(20000);
            conn.setInstanceFollowRedirects(true);
            int code = conn.getResponseCode();
            // GitHub release assets redirect to a different host; HttpURLConnection
            // will not follow that automatically when the scheme changes.
            if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                String next = conn.getHeaderField("Location");
                conn.disconnect();
                if (next == null || next.isEmpty()) return null;
                return httpGetBytes(next);
            }
            if (code != 200) return null;
            long expected = -1;
            try { expected = Long.parseLong(conn.getHeaderField("Content-Length")); } catch (Exception ignored) {}
            InputStream in = conn.getInputStream();
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) != -1) bos.write(buf, 0, n);
            in.close();
            byte[] data = bos.toByteArray();
            // A truncated download produces a corrupt APK and the installer then
            // reports a useless "problem parsing the package" — reject it here.
            if (expected > 0 && data.length != expected) return null;
            return data;
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** Cheap sanity check: an APK is a ZIP, so it must start with "PK\003\004". */
    private boolean looksLikeApk(byte[] b) {
        return b != null && b.length > 100000
                && b[0] == 0x50 && b[1] == 0x4B && b[2] == 0x03 && b[3] == 0x04;
    }

    /** SHA-256 of an APK file's signing certificate, or null if it can't be read. */
    @SuppressWarnings("deprecation")
    private String archiveSignature(String archivePath) {
        try {
            PackageManager pm = getPackageManager();
            android.content.pm.Signature[] sigs;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                PackageInfo pi = pm.getPackageArchiveInfo(archivePath, PackageManager.GET_SIGNING_CERTIFICATES);
                if (pi == null || pi.signingInfo == null) return null;
                sigs = pi.signingInfo.getApkContentsSigners();
            } else {
                PackageInfo pi = pm.getPackageArchiveInfo(archivePath, PackageManager.GET_SIGNATURES);
                if (pi == null) return null;
                sigs = pi.signatures;
            }
            return digestOf(sigs);
        } catch (Exception e) { return null; }
    }

    /** SHA-256 of the currently installed app's signing certificate. */
    @SuppressWarnings("deprecation")
    private String installedSignature() {
        try {
            PackageManager pm = getPackageManager();
            android.content.pm.Signature[] sigs;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                PackageInfo pi = pm.getPackageInfo(getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
                if (pi.signingInfo == null) return null;
                sigs = pi.signingInfo.getApkContentsSigners();
            } else {
                PackageInfo pi = pm.getPackageInfo(getPackageName(), PackageManager.GET_SIGNATURES);
                sigs = pi.signatures;
            }
            return digestOf(sigs);
        } catch (Exception e) { return null; }
    }

    private String digestOf(android.content.pm.Signature[] sigs) {
        try {
            if (sigs == null || sigs.length == 0) return null;
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            byte[] d = md.digest(sigs[0].toByteArray());
            StringBuilder sb = new StringBuilder();
            for (byte x : d) sb.append(String.format("%02x", x));
            return sb.toString();
        } catch (Exception e) { return null; }
    }

    private void deleteDir(File dir) {
        if (dir == null || !dir.exists()) return;
        File[] kids = dir.listFiles();
        if (kids != null) for (File k : kids) { if (k.isDirectory()) deleteDir(k); else k.delete(); }
        dir.delete();
    }

    /* ---------- APK self-update ---------- */
    private long currentVersionCode() {
        try {
            PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? pi.getLongVersionCode() : (long) pi.versionCode;
        } catch (Exception e) { return Long.MAX_VALUE; }
    }

    /** Look for a newer APK on GitHub and, if found, download it and offer to install. */
    private void checkForApkUpdate() {
        try {
            String infoStr = httpGet(APK_INFO_URL);
            if (infoStr == null) return;
            JSONObject info = new JSONObject(infoStr);
            long remote = info.optLong("versionCode", 0);
            String apkUrl = info.optString("apkUrl", "");
            if (remote <= currentVersionCode() || apkUrl.isEmpty()) return; // already up to date

            byte[] apk = httpGetBytes(apkUrl);
            if (!looksLikeApk(apk)) return;   // partial download or an HTML error page
            File dir = new File(getCacheDir(), "updates");
            deleteDir(dir); dir.mkdirs();
            final File out = new File(dir, "BrainArcade-update.apk");
            FileOutputStream fos = new FileOutputStream(out);
            fos.write(apk); fos.close();

            // Make sure the file really is a Brain Arcade package before handing it
            // to the installer — otherwise the user just sees "problem parsing the
            // package" with no idea why.
            PackageInfo pkg = getPackageManager().getPackageArchiveInfo(out.getAbsolutePath(), 0);
            if (pkg == null || !getPackageName().equals(pkg.packageName)) {
                deleteDir(dir);
                return;
            }

            // The usual cause of "App not installed" / "package conflicts with an
            // existing package": the update is signed with a different key than the
            // copy already on the device. Detect it and say so plainly.
            String mine = installedSignature(), theirs = archiveSignature(out.getAbsolutePath());
            final boolean signatureClash = mine != null && theirs != null && !mine.equals(theirs);

            final String vn = info.optString("versionName", "");
            runOnUiThread(new Runnable() { public void run() {
                if (signatureClash) warnSignatureClash(vn);
                else promptInstall(out, vn);
            } });
        } catch (Exception ignored) {
        }
    }

    /**
     * Tell the user why Android will refuse this update, instead of letting them
     * hit the installer's opaque "App not installed" message.
     */
    private void warnSignatureClash(String versionName) {
        if (webView == null) return;
        String msg = "Update " + versionName + " was built with a different signing key than the copy "
                + "installed on this device, so Android will not install it over the top. "
                + "Uninstall Brain Arcade once, then install the new version — after that, "
                + "updates will work normally.";
        webView.evaluateJavascript(
                "window.BrainGames && window.BrainGames.updateBlocked && window.BrainGames.updateBlocked("
                        + JSONObject.quote(msg) + ");", null);
    }

    private void promptInstall(File apk, String versionName) {
        try {
            // Screen pinning blocks launching other apps, so the installer and the
            // permission screen would open for a split second and bounce straight
            // back. Step out of lock task first; onResume() restores kiosk after.
            try { if (inLockTask()) stopLockTask(); } catch (Exception ignored) {}

            // Android O+ requires the user to allow installs from this app once.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
                if (webView != null) webView.evaluateJavascript(
                        "window.BrainGames && window.BrainGames.updateBlocked && window.BrainGames.updateBlocked("
                        + JSONObject.quote("Android needs permission before Brain Arcade can install its own updates. "
                        + "The settings screen is opening now — turn ON \"Allow from this source\", press Back, "
                        + "then tap Check for updates again.") + ");", null);
                Intent allow = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getPackageName()));
                allow.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(allow);
                return;
            }
            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", apk);
            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(uri, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            if (webView != null) webView.evaluateJavascript(
                    "window.BrainGames && window.BrainGames.toast && window.BrainGames.toast('&#11015;&#65039; Update " + versionName + " ready \\u2014 tap Install');", null);
            startActivity(install);
        } catch (Exception ignored) {
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView != null) {
            final boolean kiosk = isKioskEnabled();
            webView.evaluateJavascript(
                    "(window.BrainGames && window.BrainGames.handleBack) ? window.BrainGames.handleBack() : false;",
                    value -> {
                        // In kiosk mode Back never leaves the app — it only steps back
                        // inside Brain Arcade.
                        if (!"true".equals(value) && !kiosk) finish();
                    });
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    /** Bridge exposed to the web app. */
    public class NativeBridge {
        @JavascriptInterface
        public void vibrate(int ms) {
            try {
                Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
                if (v != null && v.hasVibrator()) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        v.vibrate(android.os.VibrationEffect.createOneShot(ms, android.os.VibrationEffect.DEFAULT_AMPLITUDE));
                    } else {
                        v.vibrate(ms);
                    }
                }
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public boolean isOnline() { return isOnlineInternal(); }

        @JavascriptInterface
        public int getBattery() {
            try {
                BatteryManager bm = (BatteryManager) getSystemService(BATTERY_SERVICE);
                if (bm != null) {
                    int pct = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
                    if (pct >= 0 && pct <= 100) return pct;
                }
            } catch (Exception ignored) {}
            return -1;
        }

        @JavascriptInterface
        public void openBrowser() {
            runOnUiThread(new Runnable() { public void run() {
                try { startActivity(new android.content.Intent(MainActivity.this, BrowserActivity.class)); } catch (Exception ignored) {}
            } });
        }

        @JavascriptInterface
        public void checkUpdate() {
            if (isOnlineInternal()) new Thread(new Runnable() { public void run() { checkForUpdate(true); checkForApkUpdate(); } }).start();
        }

        /* ---------- kiosk + TV ---------- */

        @JavascriptInterface
        public boolean isKiosk() { return isKioskEnabled(); }

        /** Turn kiosk mode on/off. Returns the state actually reached. */
        @JavascriptInterface
        public boolean setKiosk(final boolean on) {
            // Persist synchronously so an immediate isKiosk() from the web app is
            // accurate — applyKiosk() itself has to run on the UI thread.
            prefs.edit().putBoolean(PREF_KIOSK, on).commit();
            runOnUiThread(new Runnable() { public void run() { applyKiosk(on); } });
            return on;
        }

        /** True when provisioned as device owner (kiosk with no escape gesture). */
        @JavascriptInterface
        public boolean isDeviceOwner() { return isDeviceOwnerInternal(); }

        /** True when Brain Arcade is the current Home app. */
        @JavascriptInterface
        public boolean isHomeApp() { return isHomeAppInternal(); }

        /** Open Android's "Default apps / Home app" picker so Brain Arcade can be set as Home. */
        @JavascriptInterface
        public void openHomeSettings() {
            runOnUiThread(new Runnable() { public void run() { openHomeSettingsInternal(); } });
        }

        /** True when some other launcher exists to hand Home back to. */
        @JavascriptInterface
        public boolean hasOtherLauncher() { return hasOtherLauncherInternal(); }

        /** Whether Android actually has the screen pinned right now. */
        @JavascriptInterface
        public boolean isPinned() { return inLockTask(); }

        /** True on Android TV / any device without a touchscreen. */
        @JavascriptInterface
        public boolean isTV() { return isTvInternal(); }

        /** A stable per-device id so scores can be restored after a reinstall. */
        @JavascriptInterface
        public String getDeviceId() {
            try {
                String id = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
                return id != null ? id : "";
            } catch (Exception e) { return ""; }
        }

        /** Capture the current WebView as a small base64 JPEG (for on-demand remote view). */
        @JavascriptInterface
        public String captureScreen() {
            final String[] result = { "" };
            final java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);
            runOnUiThread(new Runnable() { public void run() {
                try {
                    int w = webView.getWidth(), h = webView.getHeight();
                    if (w <= 0 || h <= 0) { latch.countDown(); return; }
                    Bitmap full = Bitmap.createBitmap(w, h, Bitmap.Config.RGB_565);
                    Canvas c = new Canvas(full);
                    webView.draw(c);
                    // Scale down so frames stay small over the network.
                    int maxW = 480;
                    Bitmap small = full;
                    if (w > maxW) {
                        int nh = Math.round(h * (maxW / (float) w));
                        small = Bitmap.createScaledBitmap(full, maxW, nh, true);
                    }
                    java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                    small.compress(Bitmap.CompressFormat.JPEG, 45, bos);
                    result[0] = android.util.Base64.encodeToString(bos.toByteArray(), android.util.Base64.NO_WRAP);
                    if (small != full) small.recycle();
                    full.recycle();
                } catch (Throwable t) {
                    result[0] = "";
                } finally { latch.countDown(); }
            } });
            try { latch.await(2, java.util.concurrent.TimeUnit.SECONDS); } catch (InterruptedException e) {}
            return result[0];
        }
    }
}
