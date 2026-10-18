package app.mybank.mobile;

import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceResponse;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * L'app MyBank: una finestra sulle pagine del server (stesse schede del web) più il widget. Alla prima apertura chiede l'indirizzo del
 * server (a meno che la build non lo contenga già). La pagina, dopo il login, consegna il gettone di accesso che serve al widget.
 */
public class MainActivity extends Activity {
    private WebView web;
    private ValueCallback<Uri[]> fileCallback; // la scelta di un file dalla pagina (caricare documenti, importare movimenti)
    private boolean night;
    private int paper, ink;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        paper = night ? Color.parseColor("#121211") : Color.parseColor("#F3F0EA");
        ink = night ? Color.parseColor("#EDEAE3") : Color.parseColor("#131211");
        getWindow().setStatusBarColor(paper);
        getWindow().setNavigationBarColor(paper);
        if (!night) getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        if (Server.baseUrl(this).isEmpty()) askServer(""); else openWeb();
    }

    // ------------------------------------------------------------------ indirizzo del server

    private void askServer(String error) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setBackgroundColor(paper);
        int pad = dp(24);
        box.setPadding(pad, dp(72), pad, pad);

        TextView title = new TextView(this);
        title.setText("MyBank");
        title.setTextColor(ink);
        title.setTextSize(34);
        title.setTypeface(Typeface.SERIF, Typeface.BOLD);
        box.addView(title);

        TextView hint = new TextView(this);
        hint.setText("Indirizzo del tuo server MyBank: scegli http o https col pulsante e scrivi il resto (es. mybank.miodominio.it, oppure 192.168.1.20:4870 in casa con http).");
        hint.setTextColor(ink);
        hint.setTextSize(14);
        hint.setPadding(0, dp(8), 0, dp(20));
        box.addView(hint);

        // il pulsante sceglie http o https: nel campo basta scrivere l'indirizzo (mybank.miodominio.it)
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        final Button scheme = new Button(this);
        scheme.setText("https://");
        scheme.setAllCaps(false);
        scheme.setTextColor(ink);
        scheme.setBackgroundColor(Color.TRANSPARENT);
        scheme.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { Button b = (Button) v; b.setText("https://".contentEquals(b.getText()) ? "http://" : "https://"); }
        });
        row.addView(scheme, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        final EditText input = new EditText(this);
        input.setHint("mybank.miodominio.it");
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setImeOptions(EditorInfo.IME_ACTION_DONE);
        input.setTextColor(ink);
        input.setHintTextColor(Color.GRAY);
        row.addView(input, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        box.addView(row, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        final TextView err = new TextView(this);
        err.setText(error);
        err.setTextColor(Color.parseColor("#E8431A"));
        err.setTextSize(13);
        err.setPadding(0, dp(8), 0, dp(8));
        box.addView(err);

        Button go = new Button(this);
        go.setText("Collega");
        go.setAllCaps(false);
        go.setTextColor(paper);
        go.setBackgroundColor(ink);
        go.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                String typed = input.getText().toString().trim();
                // un indirizzo scritto con http:// o https:// vale com'è; altrimenti si usa quello del pulsante
                String address = Server.cleanAddress(typed.matches("(?i)^https?://.*") ? typed : scheme.getText().toString() + typed);
                if (address == null) { err.setText("Indirizzo non valido: serve https, oppure un indirizzo di casa (192.168…, 10…, .local)."); return; }
                Server.saveServer(MainActivity.this, address);
                openWeb();
            }
        });
        box.addView(go, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)));
        setContentView(box);
    }

    // ------------------------------------------------------------------ pagine del server

    /** Il tocco aptico: una vibrazione breve e debole (HAPTIC_MS, HAPTIC_AMPLITUDE su 255); sui telefoni senza controllo dell'intensità si ripiega sul tasto della tastiera. */
    private static final int HAPTIC_MS = 8, HAPTIC_AMPLITUDE = 96;

    private void haptic() {
        try {
            android.os.Vibrator v = (android.os.Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (v != null && v.hasAmplitudeControl()) { v.vibrate(android.os.VibrationEffect.createOneShot(HAPTIC_MS, HAPTIC_AMPLITUDE)); return; }
        } catch (Exception e) { /* si ripiega sul tocco di sistema */ }
        if (web != null) web.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
    }


    /** Ponte JavaScript: la pagina consegna il gettone per il widget e può chiedere di aggiornarlo o di cambiare server. */
    private final class Bridge {
        @JavascriptInterface public void saveToken(String token) { Server.saveToken(MainActivity.this, token); MyBankWidget.refreshAll(MainActivity.this); }
        /** La versione dell'app (e quindi del frontend che mostra), che la pagina scrive in alto. */
        @JavascriptInterface public String version() { return Server.version(MainActivity.this); }
        /** Apre un indirizzo nel browser del telefono (i documenti stanno su un sito esterno). */
        @JavascriptInterface public void openUrl(String url) {
            if (url == null || !url.matches("(?i)^https?://.*")) return;
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception e) { /* nessun browser */ }
        }
        /** Un tocco aptico leggero (più breve e debole di un tasto della tastiera) quando si preme un pulsante. */
        @JavascriptInterface public void tick() {
            runOnUiThread(new Runnable() { @Override public void run() { haptic(); } });
        }
        @JavascriptInterface public void refreshWidget() { MyBankWidget.refreshAll(MainActivity.this); }
        /** Rilegge le notifiche dal server e le riprogramma; la prima volta chiede il permesso di mostrarle (Android 13 e successivi). */
        @JavascriptInterface public void syncNotifications() {
            runOnUiThread(new Runnable() { @Override public void run() { askNotificationPermission(); } });
            Notifier.syncAsync(MainActivity.this);
        }
        @JavascriptInterface public void changeServer() {
            runOnUiThread(new Runnable() { @Override public void run() { Server.saveServer(MainActivity.this, ""); askServer(""); } });
        }
        @JavascriptInterface public void retry() {
            runOnUiThread(new Runnable() { @Override public void run() { web.loadUrl(Server.baseUrl(MainActivity.this) + "/"); } });
        }
    }

    private void openWeb() {
        final String base = Server.baseUrl(this);
        web = new WebView(this);
        web.setBackgroundColor(paper);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        web.addJavascriptInterface(new Bridge(), "Native");
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try { startActivityForResult(params.createIntent(), 7); }
                catch (Exception e) { fileCallback = null; return false; }
                return true;
            }
        });
        final Uri server = Uri.parse(base);
        web.setWebViewClient(new WebViewClient() {
            /**
             * Il frontend (pagina, script, stile, icona) è quello dell'APK: l'app mostra sempre l'ultima grafica, qualunque versione abbia il server.
             * Le chiamate ai dati (/api/…) e tutto il resto vanno invece al server, che ha la logica. Solo per l'indirizzo del server scelto.
             */
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
                try {
                    Uri u = req.getUrl();
                    if (!"GET".equals(req.getMethod()) || u.getHost() == null || !u.getHost().equals(server.getHost()) || u.getPort() != server.getPort()) return null;
                    String path = u.getPath() == null || u.getPath().isEmpty() ? "/" : u.getPath();
                    Map<String, String> headers = new HashMap<>();
                    headers.put("Cache-Control", "no-store");
                    if (path.equals("/local-config.json")) { // la modalità «frontend locale» del browser qui non serve
                        return new WebResourceResponse("application/json", "utf-8", 404, "Not Found", headers, new ByteArrayInputStream("{}".getBytes(StandardCharsets.UTF_8)));
                    }
                    String file = path.equals("/") || path.equals("/index.html") ? "index.html" : path.equals("/app.js") ? "app.js" : path.equals("/style.css") ? "style.css" : path.equals("/icon.svg") ? "icon.svg" : null;
                    if (file == null) return null;
                    byte[] body = Server.readAll(getAssets().open("www/" + file));
                    if (file.equals("index.html")) body = new String(body, StandardCharsets.UTF_8).replace("__V__", Server.version(MainActivity.this)).getBytes(StandardCharsets.UTF_8);
                    String mime = file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "image/svg+xml";
                    return new WebResourceResponse(mime, "utf-8", 200, "OK", headers, new ByteArrayInputStream(body));
                } catch (Exception e) { return null; }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                String scheme = req.getUrl().getScheme();
                if ("http".equals(scheme) || "https".equals(scheme)) return false; // anche i siti delle banche si aprono qui
                try { startActivity(new Intent(Intent.ACTION_VIEW, req.getUrl())); } catch (Exception e) { /* nessuna app per questo indirizzo */ }
                return true;
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError e) {
                if (!req.isForMainFrame()) return;
                String html = "<body style='font-family:sans-serif;padding:32px;background:" + (night ? "#121211" : "#F3F0EA") + ";color:" + (night ? "#EDEAE3" : "#131211") + "'>"
                    + "<h2>Server non raggiungibile</h2><p>" + base + "</p>"
                    + "<p><button style='font-size:16px;padding:12px 20px' onclick='Native.retry()'>Riprova</button> "
                    + "<button style='font-size:16px;padding:12px 20px' onclick='Native.changeServer()'>Cambia server</button></p></body>";
                v.loadDataWithBaseURL(base + "/", html, "text/html", "utf-8", null);
            }
        });
        web.loadUrl(base + "/" + pageOf(getIntent()));
    }

    /** La pagina che il widget chiede di aprire (es. «movimenti:spesa»): diventa il frammento dell'indirizzo, che la pagina web sa leggere. */
    private static String pageOf(Intent intent) {
        String open = intent == null ? null : intent.getStringExtra("open");
        return open == null || !open.matches("[a-z]+(:[a-z_]+)?") ? "" : "#" + open;
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != 7 || fileCallback == null) return;
        fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
        fileCallback = null;
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String page = pageOf(intent);
        if (web != null && !page.isEmpty()) web.loadUrl(Server.baseUrl(this) + "/" + page);
    }

    private void askNotificationPermission() {
        if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { "android.permission.POST_NOTIFICATIONS" }, 1);
        }
    }

    @Override protected void onResume() {
        super.onResume();
        if (web != null) { MyBankWidget.refreshAll(this); Notifier.syncAsync(this); }
    }

    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }
}
