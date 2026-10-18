package app.mybank.mobile;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.RectF;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.text.style.StyleSpan;
import android.widget.RemoteViews;
import java.text.NumberFormat;
import java.util.Calendar;
import java.util.Locale;

/**
 * Widget 5×1 in cinque celle di uguale larghezza: Mese, Spesa, Svago, Auto, Altro. Ogni cella di categoria è un'immagine a tutta cella: il livello
 * del residuo del budget la riempie dal basso, con una linea sul bordo del livello e tre tacche al 25, 50 e 75%; il livello è rosso solo sotto il 25%. Il nome e il residuo stanno su una targhetta scura; sotto, la stima giornaliera (budget diviso i giorni
 * del mese) e la reale (speso diviso i giorni passati, oggi compreso; rossa se peggiore della stima), in due etichette piene. Il mese: i giorni che
 * restano e le settimane del calendario (lunedì-domenica), passati chiari e weekend in rosso. Un tocco sul mese apre il Budget; su una categoria i
 * Movimenti del mese già filtrati per quella categoria; sul resto apre l'app. Un solo carattere (sans-serif), carta e inchiostro con il rosso come accento.
 */
public class MyBankWidget extends AppWidgetProvider {
    private static final int PAPER = 0xFFF3F0EA, MUTE = 0xFFA8A298, LATE = 0xFFFF5A2E;
    private static final int CELL = 0xFF1C1A18, FILL = 0xFF5B564C, FILL_LATE = 0xFF8A2A17, TICK = 0x40A8A298;
    private static final int DAY_DONE = 0xFFF1ECE1, DAY_DONE_WE = 0xFFD9573A, DAY_LEFT = 0xFF2A2825, DAY_LEFT_WE = 0xFF3D1710;
    private static final String[] KEYS = WidgetData.KEYS;
    private static final int[] CELLS = { R.id.widget_spesa_cell, R.id.widget_svago_cell, R.id.widget_carburante_cell, R.id.widget_altro_cell };
    private static final int[] BGS = { R.id.widget_spesa_bg, R.id.widget_svago_bg, R.id.widget_carburante_bg, R.id.widget_altro_bg };
    // per ogni categoria: valore, stima, reale
    private static final int[][] IDS = {
        { R.id.widget_spesa_left, R.id.widget_spesa_est, R.id.widget_spesa_real },
        { R.id.widget_svago_left, R.id.widget_svago_est, R.id.widget_svago_real },
        { R.id.widget_carburante_left, R.id.widget_carburante_est, R.id.widget_carburante_real },
        { R.id.widget_altro_left, R.id.widget_altro_est, R.id.widget_altro_real },
    };

    @Override public void onUpdate(final Context c, final AppWidgetManager m, final int[] ids) {
        paint(c, m, ids, WidgetData.cached(c)); // subito l'ultimo dato noto, poi si aggiorna
        final PendingResult pending = goAsync();
        new Thread(new Runnable() {
            @Override public void run() {
                try { paint(c, m, ids, WidgetData.fetch(c)); Notifier.sync(c); } finally { pending.finish(); } // l'aggiornamento periodico rilegge anche le notifiche
            }
        }).start();
    }

    /** Rilegge i dati dal server e ridisegna tutti i widget presenti sulla Home. */
    static void refreshAll(final Context context) {
        final Context c = context.getApplicationContext();
        MyBankWidgetBarre.refreshAll(c); // anche la seconda versione del widget
        MyBankWidget4x2.refreshAll(c); // e quella 4×2
        final AppWidgetManager m = AppWidgetManager.getInstance(c);
        final int[] ids = m.getAppWidgetIds(new ComponentName(c, MyBankWidget.class));
        if (ids.length == 0) return;
        new Thread(new Runnable() {
            @Override public void run() { paint(c, m, ids, WidgetData.fetch(c)); }
        }).start();
    }

    // ------------------------------------------------------------------ testi

    /** Il residuo senza centesimi (la cella è stretta), con i centesimi solo sotto i 10 €. */
    static String money(double v) {
        if (Math.abs(v) >= 10) return NumberFormat.getIntegerInstance(Locale.ITALY).format(Math.round(v)) + " €";
        return NumberFormat.getCurrencyInstance(Locale.ITALY).format(v);
    }

    static String perDay(double v) { return String.format(Locale.ITALY, "%.1f", v); }

    /** «stima» o «reale» in grigio e, dopo, il valore in grassetto (di un altro colore se serve). */
    static CharSequence chip(String word, String value, int valueColor) {
        SpannableString s = new SpannableString(word + " " + value);
        s.setSpan(new ForegroundColorSpan(MUTE), 0, word.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        s.setSpan(new ForegroundColorSpan(valueColor), word.length() + 1, s.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        s.setSpan(new StyleSpan(android.graphics.Typeface.BOLD), word.length() + 1, s.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        return s;
    }

    /** I giorni che restano alla fine del mese: il numero grande e, accanto, «giorni rimanenti» su due righe. */
    static String daysLeftNumber(int n) { return String.valueOf(Math.max(0, n)); }

    static String daysLeftText(int n) {
        if (n <= 0) return "ultimo\ngiorno";
        return n == 1 ? "giorno\nrimanente" : "giorni\nrimanenti";
    }

    // ------------------------------------------------------------------ immagini

    // Le immagini sono bitmap di circa 3 px per dp (una cella è circa 68 × 75 dp).
    private static final int CELL_W = 204, CELL_H = 225, CELL_RADIUS = 12;
    private static final int WEEKS_W = 210, WEEKS_H = 72;

    static Paint fill(int color) {
        Paint p = new Paint();
        p.setColor(color);
        return p;
    }

    /** Arrotonda di poco gli angoli dell'immagine (maschera con bordo sfumato). */
    private static Bitmap rounded(Bitmap src) {
        Bitmap out = Bitmap.createBitmap(src.getWidth(), src.getHeight(), Bitmap.Config.ARGB_8888);
        Canvas g = new Canvas(out);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        g.drawRoundRect(new RectF(0, 0, src.getWidth(), src.getHeight()), CELL_RADIUS, CELL_RADIUS, p);
        p.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));
        g.drawBitmap(src, 0, 0, p);
        return out;
    }

    /** Fondo della cella del mese (e di una categoria senza dati). */
    static Bitmap plainCell() { return plainCell(CELL_W, CELL_H); }

    static Bitmap plainCell(int w, int h) {
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        new Canvas(b).drawColor(CELL);
        return rounded(b);
    }

    /**
     * La cella di una categoria: il residuo riempie la cella dal basso (`ratio` da 0 a 1), con la linea del livello sul bordo e tre tacche
     * (25%, 50%, 75%). Rosso solo sotto il 25% (`low`).
     */
    static Bitmap levelCell(double ratio, boolean low) { return levelCell(ratio, low, CELL_W, CELL_H); }

    static Bitmap levelCell(double ratio, boolean low, int w, int h) {
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas g = new Canvas(b);
        g.drawColor(CELL);
        float level = (float) (h * Math.max(0, Math.min(1, ratio)));
        g.drawRect(0, h - level, w, h, fill(low ? FILL_LATE : FILL));
        Paint tick = fill(TICK);
        for (int quarter = 1; quarter <= 3; quarter++) {
            float y = h * quarter / 4f;
            g.drawRect(0, y - 1f, w, y + 1f, tick); // soglie leggere: sottili e quasi trasparenti
        }
        float top = Math.max(0, h - level - 6); // la linea del livello sta sopra il riempimento; a livello zero resta in fondo, rossa
        if (level <= 0) g.drawRect(0, h - 6, w, h, fill(LATE));
        else g.drawRect(0, top, w, top + 6, fill(low ? LATE : PAPER));
        return rounded(b);
    }

    /**
     * Le settimane del mese in calendario (lunedì-domenica, una riga per settimana): i giorni passati (oggi compreso) chiari, quelli che restano scuri;
     * sabato e domenica in rosso (più vivo se passati, scurissimo se restano).
     */
    static Bitmap weeks() {
        Calendar now = Calendar.getInstance();
        int day = now.get(Calendar.DAY_OF_MONTH);
        int days = now.getActualMaximum(Calendar.DAY_OF_MONTH);
        Calendar first = (Calendar) now.clone();
        first.set(Calendar.DAY_OF_MONTH, 1);
        int offset = (first.get(Calendar.DAY_OF_WEEK) + 5) % 7; // 0 = lunedì
        int rows = (offset + days + 6) / 7;
        final int gapX = 3, gapY = 6;
        float cw = (WEEKS_W - 6f * gapX) / 7, ch = (WEEKS_H - (rows - 1f) * gapY) / rows;
        Bitmap b = Bitmap.createBitmap(WEEKS_W, WEEKS_H, Bitmap.Config.ARGB_8888);
        Canvas g = new Canvas(b);
        for (int d = 1; d <= days; d++) {
            int i = offset + d - 1, r = i / 7, col = i % 7;
            boolean we = col >= 5, done = d <= day;
            int color = done ? (we ? DAY_DONE_WE : DAY_DONE) : (we ? DAY_LEFT_WE : DAY_LEFT);
            float x = col * (cw + gapX), y = r * (ch + gapY);
            g.drawRect(x, y, x + cw, y + ch, fill(color));
        }
        return b;
    }

    // ------------------------------------------------------------------ disegno

    static PendingIntent tap(Context c, int code, String open) {
        Intent i = new Intent(c, MainActivity.class).putExtra("open", open);
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static void paint(Context c, AppWidgetManager m, int[] ids, WidgetData d) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_mybank);
        Calendar now = Calendar.getInstance();
        int daysLeft = now.getActualMaximum(Calendar.DAY_OF_MONTH) - now.get(Calendar.DAY_OF_MONTH);
        v.setImageViewBitmap(R.id.widget_month_bg, plainCell());
        v.setImageViewBitmap(R.id.widget_weeks, weeks());
        v.setTextViewText(R.id.widget_days_num, d.needLogin ? "—" : daysLeftNumber(daysLeft));
        v.setTextViewText(R.id.widget_days_text, d.needLogin ? "accedi\nin app" : daysLeftText(daysLeft));

        for (int i = 0; i < KEYS.length; i++) {
            int[] id = IDS[i];
            boolean has = d.ok && d.budget[i] > 0;
            double ratio = has ? d.left[i] / d.budget[i] : 0;
            boolean worse = has && d.real[i] > d.est[i]; // spesa reale oltre la stima
            boolean low = has && ratio < 0.25; // il riempimento è rosso solo sotto il 25%
            v.setImageViewBitmap(BGS[i], has ? levelCell(ratio, low) : plainCell());
            if (!d.ok) {
                v.setTextViewText(id[0], "—");
                v.setTextViewText(id[1], chip("stima", "—", PAPER));
                v.setTextViewText(id[2], chip("reale", "—", PAPER));
                v.setTextColor(id[0], PAPER);
            } else {
                v.setTextViewText(id[0], has ? money(d.left[i]) : "—");
                v.setTextColor(id[0], low ? LATE : PAPER); // il residuo è rosso con la stessa regola del livello: solo sotto il 25%
                v.setTextViewText(id[1], has ? chip("stima", perDay(d.est[i]), PAPER) : chip("nessun", "budget", MUTE));
                v.setTextViewText(id[2], chip("reale", perDay(d.real[i]), !has || !worse ? PAPER : LATE)); // migliore della stima: bianco; peggiore: rosso
            }
            // un tocco apre i Movimenti del mese filtrati per questa categoria
            v.setOnClickPendingIntent(CELLS[i], tap(c, 10 + i, "movimenti:" + KEYS[i]));
        }

        v.setOnClickPendingIntent(R.id.widget_root, tap(c, 1, "storico"));
        v.setOnClickPendingIntent(R.id.widget_month_cell, tap(c, 2, "budget")); // la prima cella apre il Budget
        m.updateAppWidget(ids, v);
        if (d.ok) updatePreview(c, m, v);
    }

    /**
     * Anteprima «vera» nella lista dei widget (Android 15 e successivi): l'ultimo aspetto con i dati reali. Prima di Android 15 vale
     * l'anteprima statica con dati di esempio (previewLayout). Il sistema limita le richieste: al massimo una l'ora e senza errori.
     */
    private static void updatePreview(Context c, AppWidgetManager m, RemoteViews v) {
        if (android.os.Build.VERSION.SDK_INT < 35) return;
        android.content.SharedPreferences p = c.getSharedPreferences("anteprima", Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        if (now - p.getLong("quando", 0) < 3600000L) return;
        try {
            m.setWidgetPreview(new ComponentName(c, MyBankWidget.class), android.appwidget.AppWidgetProviderInfo.WIDGET_CATEGORY_HOME_SCREEN, v);
            p.edit().putLong("quando", now).apply();
        } catch (Throwable e) { /* limite di richieste o non supportato: resta l'anteprima statica */ }
    }
}
