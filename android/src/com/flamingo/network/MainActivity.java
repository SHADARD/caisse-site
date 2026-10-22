package com.flamingo.network;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.ValueCallback;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final String SITE = "https://caisse-site.pages.dev/";
    private WebView web;
    private ProgressBar progress;
    private LinearLayout errorPanel;
    private boolean failed;
    private ValueCallback<Uri[]> fileCallback;
    private static final int PICK_FILE = 7001;

    private static boolean trusted(String url) {
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        return "https".equalsIgnoreCase(uri.getScheme())
            && "caisse-site.pages.dev".equalsIgnoreCase(uri.getHost())
            && (uri.getPort() == -1 || uri.getPort() == 443)
            && uri.getUserInfo() == null;
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        WebView.setWebContentsDebuggingEnabled(false);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(18, 63, 54));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        root.addView(progress, new LinearLayout.LayoutParams(-1, dp(3)));
        FrameLayout content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(245, 247, 245));
        content.addView(web, new FrameLayout.LayoutParams(-1, -1));
        buildErrorPanel(content);
        setContentView(root);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setSupportMultipleWindows(false);
        settings.setUserAgentString(settings.getUserAgentString() + " FlamingoAndroid/1.0.4");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.addJavascriptInterface(new PrintBridge(), "FlamingoPrint");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (trusted(url)) return false;
                if (request.isForMainFrame()) openExternal(url);
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, Bitmap favicon) {
                failed = false;
                errorPanel.setVisibility(View.GONE);
                progress.setVisibility(View.VISIBLE);
            }
            @Override public void onPageFinished(WebView view, String url) {
                progress.setVisibility(View.GONE);
                if (!failed && trusted(url)) {
                    view.evaluateJavascript("window.print=function(){FlamingoPrint.printPage();};", null);
                }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError();
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                showError();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (!trusted(view.getUrl())) { callback.onReceiveValue(null); return true; }
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                picker.addCategory(Intent.CATEGORY_OPENABLE);
                picker.setType("*/*");
                picker.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/*","application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation","text/plain","text/csv"});
                try { startActivityForResult(picker, PICK_FILE); }
                catch (ActivityNotFoundException e) { fileCallback.onReceiveValue(null); fileCallback = null; Toast.makeText(MainActivity.this, "Aucun sélecteur de fichiers disponible.", Toast.LENGTH_LONG).show(); }
                return true;
            }

            @Override public void onProgressChanged(WebView view, int value) { progress.setProgress(value); }
            @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                if (!trusted(url)) { result.cancel(); return true; }
                new AlertDialog.Builder(MainActivity.this).setTitle("Flamingo Network")
                    .setMessage(message).setPositiveButton("Confirmer", (dialog, which) -> result.confirm())
                    .setNegativeButton("Annuler", (dialog, which) -> result.cancel())
                    .setOnCancelListener(dialog -> result.cancel()).show();
                return true;
            }
        });
        web.setDownloadListener((url, ua, disposition, mime, length) -> openExternal(url));
        if (state == null || web.restoreState(state) == null) web.loadUrl(SITE);
    }

    private void buildErrorPanel(FrameLayout content) {
        errorPanel = new LinearLayout(this);
        errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorPanel.setGravity(Gravity.CENTER);
        errorPanel.setPadding(dp(30), dp(30), dp(30), dp(30));
        errorPanel.setBackgroundColor(Color.rgb(245, 247, 245));
        TextView title = new TextView(this);
        title.setText("Connexion indisponible"); title.setTextSize(23);
        title.setTextColor(Color.rgb(18, 63, 54)); title.setGravity(Gravity.CENTER);
        errorPanel.addView(title);
        TextView detail = new TextView(this);
        detail.setText("Vérifiez votre connexion Internet, puis réessayez. Aucun nouveau rapport n’a été envoyé depuis cet écran.");
        detail.setTextSize(16); detail.setGravity(Gravity.CENTER); detail.setPadding(0, dp(20), 0, dp(25));
        errorPanel.addView(detail);
        Button retry = new Button(this); retry.setText("Réessayer");
        retry.setOnClickListener(v -> { errorPanel.setVisibility(View.GONE); web.loadUrl(SITE); });
        errorPanel.addView(retry);
        content.addView(errorPanel, new FrameLayout.LayoutParams(-1, -1));
        errorPanel.setVisibility(View.GONE);
    }
    private void showError() { failed = true; progress.setVisibility(View.GONE); errorPanel.setVisibility(View.VISIBLE); }
    private int dp(int value) { return (int)(value * getResources().getDisplayMetrics().density + .5f); }
    private void openExternal(String url) {
        Uri uri = Uri.parse(url);
        if (!"https".equalsIgnoreCase(uri.getScheme()) && !"mailto".equalsIgnoreCase(uri.getScheme())) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
        catch (ActivityNotFoundException e) { Toast.makeText(this, "Aucune application disponible pour ouvrir ce lien.", Toast.LENGTH_LONG).show(); }
    }
    public final class PrintBridge {
        @JavascriptInterface public void printPage() {
            runOnUiThread(() -> {
                if (!trusted(web.getUrl())) return;
                PrintManager manager = (PrintManager)getSystemService(Context.PRINT_SERVICE);
                if (manager != null) manager.print("Flamingo Network — Rapport", web.createPrintDocumentAdapter("Flamingo Network"), new PrintAttributes.Builder().build());
            });
        }
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_FILE || fileCallback == null) return;
        Uri uri = resultCode == RESULT_OK && data != null ? data.getData() : null;
        // Seuls les documents explicitement sélectionnés dans le sélecteur Android sont transmis.
        fileCallback.onReceiveValue(uri != null && "content".equals(uri.getScheme()) ? new Uri[]{uri} : null);
        fileCallback = null;
    }
    @Override public void onSaveInstanceState(Bundle state) { web.saveState(state); super.onSaveInstanceState(state); }
    @Override public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else new AlertDialog.Builder(this).setTitle("Quitter Flamingo Network ?")
            .setPositiveButton("Quitter", (dialog, which) -> finish()).setNegativeButton("Rester", null).show();
    }
    @Override public void onDestroy() { if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; } web.removeJavascriptInterface("FlamingoPrint"); web.destroy(); super.onDestroy(); }
}
