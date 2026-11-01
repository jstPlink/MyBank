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
import android.graphics.RectF;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.text.style.StyleSpan;
import android.widget.RemoteViews;
import java.util.Calendar;

/**
 * Seconda versione del widget 5×1 («MyBank barre»), accanto a quella a livello (MyBankWidget): cinque celle di uguale larghezza, Mese, Spesa, Svago,
 * Auto, Altro. In ogni categoria, a sinistra, una barra a due blocchi separati da uno spazio (niente tacche): in alto la parte vuota, in basso il
 * livello del residuo del budget (rosso solo sotto il 25%). A destra il nome, il residuo e, in basso, la stima giornaliera (budget diviso i giorni del
 * mese) e la reale (speso diviso i giorni passati, oggi compreso; rossa se peggiore della stima). Il mese e i tocchi sono come nell'altro widget:
 * mese → Budget, categoria → Movimenti del mese filtrati, resto → app. Mese, testi di base e dati sono quelli di MyBankWidget e WidgetData.
 */
public class MyBankWidgetBarre extends AppWidgetProvider {
    private static final int PAPER = 0xFFF3F0EA, MUTE = 0xFFA8A298, LATE = 0xFFFF5A2E, EMPTY = 0xFF2A2825;
    private static final String[] KEYS = WidgetData.KEYS;
    private static final int[] CELLS = { R.id.widget_spesa_cell, R.id.widget_svago_cell, R.id.widget_carburante_cell, R.id.widget_altro_cell };
    private static final int[] BARS = { R.id.widget_spesa_bar, R.id.widget_svago_bar, R.id.widget_carburante_bar, R.id.widget_altro_bar };
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
                try { paint(c, m, ids, WidgetData.fetch(c)); Notifier.sync(c); } finally { pending.finish(); }
            }
        }).start();
    }

    /** Rilegge i dati dal server e ridisegna tutti i widget di questa versione presenti sulla Home. */
    static void refreshAll(final Context context) {
        final Context c = context.getApplicationContext();
        final AppWidgetManager m = AppWidgetManager.getInstance(c);
        final int[] ids = m.getAppWidgetIds(new ComponentName(c, MyBankWidgetBarre.class));
        if (ids.length == 0) return;
        new Thread(new Runnable() {
            @Override public void run() { paint(c, m, ids, WidgetData.fetch(c)); }
        }).start();
    }

    /** «stima» o «reale» in grigio e, dopo, il valore in grassetto (di un altro colore se serve). */
    private static CharSequence pair(String word, String value, int valueColor) {
        SpannableString s = new SpannableString(word + " " + value);
        s.setSpan(new ForegroundColorSpan(MUTE), 0, word.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        s.setSpan(new ForegroundColorSpan(valueColor), word.length() + 1, s.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        s.setSpan(new StyleSpan(android.graphics.Typeface.BOLD), word.length() + 1, s.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        return s;
    }

    private static String perDay(double v) { return String.format(java.util.Locale.ITALY, "%.1f", v); }

    // La barra di una categoria: circa 12 × 62 dp, a 3 px per dp.
    private static final int BAR_W = 36, BAR_H = 186, BAR_GAP = 9, BAR_RADIUS = 5;

    /**
     * La barra di una categoria, verticale e a due blocchi separati da uno spazio (niente tacche): in alto la parte vuota, in basso il livello del
     * residuo (`ratio` da 0 a 1). Il livello è rosso solo sotto il 25% (`low`). Senza budget o senza residuo resta un solo blocco vuoto; a pieno, uno solo pieno.
     */
    static Bitmap levelBar(double ratio, boolean low) {
        final int w = BAR_W, h = BAR_H;
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas g = new Canvas(b);
        double r = Math.max(0, Math.min(1, ratio));
        Paint empty = new Paint(Paint.ANTI_ALIAS_FLAG);
        empty.setColor(EMPTY);
        Paint full = new Paint(Paint.ANTI_ALIAS_FLAG);
        full.setColor(low ? LATE : PAPER);
        if (r <= 0) { g.drawRoundRect(new RectF(0, 0, w, h), BAR_RADIUS, BAR_RADIUS, empty); return b; }
        if (r >= 1) { g.drawRoundRect(new RectF(0, 0, w, h), BAR_RADIUS, BAR_RADIUS, full); return b; }
        float avail = h - BAR_GAP, level = (float) (avail * r);
        g.drawRoundRect(new RectF(0, 0, w, avail - level), BAR_RADIUS, BAR_RADIUS, empty);
        g.drawRoundRect(new RectF(0, h - level, w, h), BAR_RADIUS, BAR_RADIUS, full);
        return b;
    }

    private static PendingIntent tap(Context c, int code, String open) {
        Intent i = new Intent(c, MainActivity.class).putExtra("open", open);
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static void paint(Context c, AppWidgetManager m, int[] ids, WidgetData d) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_mybank_barre);
        Calendar now = Calendar.getInstance();
        int daysLeft = now.getActualMaximum(Calendar.DAY_OF_MONTH) - now.get(Calendar.DAY_OF_MONTH) + 1; // i giorni rimanenti includono oggi
        v.setImageViewBitmap(R.id.widget_month_bg, MyBankWidget.plainCell());
        v.setImageViewBitmap(R.id.widget_weeks, MyBankWidget.weeks());
        v.setTextViewText(R.id.widget_days_num, d.needLogin ? "—" : MyBankWidget.daysLeftNumber(daysLeft));
        v.setTextViewText(R.id.widget_days_text, d.needLogin ? "accedi\nin app" : MyBankWidget.daysLeftText(daysLeft));

        for (int i = 0; i < KEYS.length; i++) {
            int[] id = IDS[i];
            boolean has = d.ok && d.budget[i] > 0;
            double ratio = has ? d.left[i] / d.budget[i] : 0;
            boolean worse = has && d.real[i] > d.est[i]; // spesa reale oltre la stima
            boolean low = has && ratio < 0.25; // il livello è rosso solo sotto il 25%
            v.setImageViewBitmap(BGS[i], MyBankWidget.plainCell());
            v.setImageViewBitmap(BARS[i], levelBar(has ? ratio : 0, low));
            if (!d.ok) {
                v.setTextViewText(id[0], "—");
                v.setTextViewText(id[1], pair("stima", "—", PAPER));
                v.setTextViewText(id[2], pair("reale", "—", PAPER));
                v.setTextColor(id[0], PAPER);
            } else {
                v.setTextViewText(id[0], has ? MyBankWidget.money(d.left[i]) : "—");
                v.setTextColor(id[0], low ? LATE : PAPER); // il residuo è rosso con la stessa regola del livello: solo sotto il 25%
                v.setTextViewText(id[1], has ? pair("stima", perDay(d.est[i]), PAPER) : pair("nessun", "budget", MUTE));
                v.setTextViewText(id[2], pair("reale", perDay(d.real[i]), !has || !worse ? PAPER : LATE)); // migliore della stima: bianco; peggiore: rosso
            }
            // un tocco apre i Movimenti del mese filtrati per questa categoria
            v.setOnClickPendingIntent(CELLS[i], tap(c, 30 + i, "movimenti:" + KEYS[i]));
        }

        v.setOnClickPendingIntent(R.id.widget_root, tap(c, 21, "storico"));
        v.setOnClickPendingIntent(R.id.widget_month_cell, tap(c, 22, "budget")); // la prima cella apre il Budget
        m.updateAppWidget(ids, v);
    }
}
