package com.braingames.arcade;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Vibrator;
import android.provider.Settings;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.JavascriptInterface;
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
    private static final String BUNDLED_VERSION = "1.2.0";

    private WebView webView;
    private SharedPreferences prefs;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("braingames", MODE_PRIVATE);

        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);

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

        webView.setWebViewClient(new WebViewClient());
        webView.setBackgroundColor(0xFF0B1020);
        webView.addJavascriptInterface(new NativeBridge(), "AndroidBridge");

        webView.loadUrl(currentIndexUrl());

        // Check for OTA updates in the background (games always work offline regardless).
        if (isOnlineInternal()) {
            new Thread(new Runnable() { public void run() { checkForUpdate(false); checkForApkUpdate(); } }).start();
        }
    }

    /** Load the updated bundle from internal storage if present, else the bundled assets. */
    private String currentIndexUrl() {
        File idx = new File(new File(getFilesDir(), "www"), "index.html");
        if (idx.exists()) return "file://" + idx.getAbsolutePath();
        return "file:///android_asset/www/index.html";
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

    /** Fetch the remote manifest and, if the version differs, download the new bundle. */
    private void checkForUpdate(boolean manual) {
        try {
            String manifestStr = httpGet(UPDATE_BASE + "manifest.json");
            if (manifestStr == null) return;
            JSONObject manifest = new JSONObject(manifestStr);
            String remoteVersion = manifest.optString("version", "");
            String installed = prefs.getString("installedVersion", BUNDLED_VERSION);
            if (remoteVersion.isEmpty() || remoteVersion.equals(installed)) return;

            JSONArray files = manifest.getJSONArray("files");
            File stage = new File(getFilesDir(), "www_stage");
            deleteDir(stage);
            stage.mkdirs();

            for (int i = 0; i < files.length(); i++) {
                String rel = files.getString(i);
                byte[] data = httpGetBytes(UPDATE_BASE + rel);
                if (data == null) { deleteDir(stage); return; } // abort on any failure
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
            conn.setReadTimeout(12000);
            conn.setInstanceFollowRedirects(true);
            if (conn.getResponseCode() != 200) return null;
            InputStream in = conn.getInputStream();
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) != -1) bos.write(buf, 0, n);
            in.close();
            return bos.toByteArray();
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
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
            if (apk == null || apk.length < 10000) return;
            File dir = new File(getCacheDir(), "updates");
            deleteDir(dir); dir.mkdirs();
            final File out = new File(dir, "BrainArcade-update.apk");
            FileOutputStream fos = new FileOutputStream(out);
            fos.write(apk); fos.close();

            final String vn = info.optString("versionName", "");
            runOnUiThread(new Runnable() { public void run() { promptInstall(out, vn); } });
        } catch (Exception ignored) {
        }
    }

    private void promptInstall(File apk, String versionName) {
        try {
            // Android O+ requires the user to allow installs from this app once.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
                if (webView != null) webView.evaluateJavascript(
                        "window.BrainGames && window.BrainGames.toast && window.BrainGames.toast('Allow updates: turn on \\'Install unknown apps\\' for Brain Arcade');", null);
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
            webView.evaluateJavascript(
                    "(window.BrainGames && window.BrainGames.handleBack) ? window.BrainGames.handleBack() : false;",
                    value -> { if (!"true".equals(value)) finish(); });
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
        public void checkUpdate() {
            if (isOnlineInternal()) new Thread(new Runnable() { public void run() { checkForUpdate(true); checkForApkUpdate(); } }).start();
        }
    }
}
