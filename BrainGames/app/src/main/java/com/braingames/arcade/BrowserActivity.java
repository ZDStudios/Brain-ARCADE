package com.braingames.arcade;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;

/** A simple in-app web browser (address bar + back/forward), launched from Settings. */
public class BrowserActivity extends Activity {

    private WebView web;
    private EditText addr;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xFF0B1020);
        root.setFitsSystemWindows(true);

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setPadding(dp(6), dp(6), dp(6), dp(6));
        bar.setBackgroundColor(0xFF141B33);
        bar.setGravity(Gravity.CENTER_VERTICAL);

        Button back = navButton("←");
        back.setOnClickListener(v -> { if (web.canGoBack()) web.goBack(); });

        addr = new EditText(this);
        addr.setSingleLine(true);
        addr.setHint("Search or type a website");
        addr.setTextColor(Color.WHITE);
        addr.setHintTextColor(0xFF98A2C7);
        addr.setBackgroundColor(0xFF1E2748);
        addr.setPadding(dp(12), dp(10), dp(12), dp(10));
        addr.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        addr.setImeOptions(EditorInfo.IME_ACTION_GO);
        LinearLayout.LayoutParams ap = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        ap.leftMargin = dp(6); ap.rightMargin = dp(6);
        addr.setLayoutParams(ap);
        addr.setOnEditorActionListener((v, actionId, event) -> { go(addr.getText().toString()); return true; });

        Button close = navButton("✕");
        close.setOnClickListener(v -> finish());

        bar.addView(back);
        bar.addView(addr);
        bar.addView(close);

        ProgressBar progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)));

        web = new WebView(this);
        web.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setSupportZoom(true);
        web.getSettings().setBuiltInZoomControls(true);
        web.getSettings().setDisplayZoomControls(false);
        web.getSettings().setLoadWithOverviewMode(true);
        web.getSettings().setUseWideViewPort(true);
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) { addr.setText(url); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int p) { progress.setProgress(p); progress.setVisibility(p >= 100 ? View.GONE : View.VISIBLE); }
        });

        root.addView(bar);
        root.addView(progress);
        root.addView(web);
        setContentView(root);

        web.loadUrl("https://www.google.com/");
    }

    private Button navButton(String label) {
        Button b = new Button(this);
        b.setText(label);
        b.setTextColor(Color.WHITE);
        b.setBackgroundColor(0xFF1E2748);
        b.setAllCaps(false);
        b.setMinWidth(dp(44));
        return b;
    }

    private void go(String text) {
        String t = text.trim();
        if (t.isEmpty()) return;
        String url;
        if (t.matches("^[a-zA-Z]+://.*")) url = t;
        else if (t.contains(".") && !t.contains(" ")) url = "https://" + t;
        else {
            try { url = "https://www.google.com/search?q=" + java.net.URLEncoder.encode(t, "UTF-8"); }
            catch (Exception e) { url = "https://www.google.com/"; }
        }
        web.loadUrl(url);
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) { web.goBack(); return true; }
        return super.onKeyDown(keyCode, event);
    }
}
