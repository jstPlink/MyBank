package app.mybank.mobile;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.widget.RemoteViews;
import java.util.Calendar;

/**
 * Widget 4×2 («MyBank 4×2»), nello stile di quello a livello (MyBankWidget): in alto una striscia bassa con il mese (giorni rimanenti e i giorni del
 * mese su una sola riga, passati chiari, weekend in rosso), sotto tre celle uguali, Spesa, Svago e Auto (niente Altro), con il livello del residuo
 * che riempie la cella dal basso. Nome, residuo, stima e reale come nell'altro widget. Tocchi: mese → Budget, categoria → Movimenti del mese filtrati,
 * resto → app. Testi, immagini e dati sono quelli di MyBankWidget e WidgetData.
 */
public class MyBankWidget4x2 extends AppWidgetProvider {
    private static final int PAPER = 0xFFF3F0EA, MUTE = 0xFFA8A298, LATE = 0xFFFF5A2E;
    private static final int DAY_DONE = 0xFFF1ECE1, DAY_DONE_WE = 0xFFD9573A, DAY_LEFT = 0xFF2A2825, DAY_LEFT_WE = 0xFF3D1710;
    private static final String[] KEYS = WidgetData.KEYS; // le prime tre: spesa, svago, carburante (Altro non c'è)
    private static final int[] CELLS = { R.id.widget_spesa_cell, R.id.widget_svago_cell, R.id.widget_carburante_cell };
    private static final int[] BGS = { R.id.widget_spesa_bg, R.id.widget_svago_bg, R.id.widget_carburante_bg };
    private static final int[][] IDS = {
        { R.id.widget_spesa_left, R.id.widget_spesa_est, R.id.widget_spesa_real },
        { R.id.widget_svago_left, R.id.widget_svago_est, R.id.widget_svago_real },
        { R.id.widget_carburante_left, R.id.widget_carburante_est, R.id.widget_carburante_real },
    };
    // Bitmap di circa 3 px per dp: una cella di categoria è circa 105 × 70 dp, la striscia dei giorni circa 100 × 7 dp.
    private static final int CELL_W = 315, CELL_H = 210, STRIP_W = 600, STRIP_H = 21, MONTH_W = 960, MONTH_H = 126;

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
        final int[] ids = m.getAppWidgetIds(new ComponentName(c, MyBankWidget4x2.class));
        if (ids.length == 0) return;
        new Thread(new Runnable() {
            @Override public void run() { paint(c, m, ids, WidgetData.fetch(c)); }
        }).start();
    }

    /** I giorni del mese su una sola riga: passati (oggi compreso) chiari, quelli che restano scuri; sabato e domenica in rosso. */
    static Bitmap daysStrip() {
        Calendar now = Calendar.getInstance();
        int day = now.get(Calendar.DAY_OF_MONTH);
        int days = now.getActualMaximum(Calendar.DAY_OF_MONTH);
        Calendar first = (Calendar) now.clone();
        first.set(Calendar.DAY_OF_MONTH, 1);
        int offset = (first.get(Calendar.DAY_OF_WEEK) + 5) % 7; // 0 = lunedì
        final int gap = 3;
        float cw = (STRIP_W - (days - 1f) * gap) / days;
        Bitmap b = Bitmap.createBitmap(STRIP_W, STRIP_H, Bitmap.Config.ARGB_8888);
        Canvas g = new Canvas(b);
        for (int d = 1; d <= days; d++) {
            boolean we = (offset + d - 1) % 7 >= 5, done = d <= day;
            int color = done ? (we ? DAY_DONE_WE : DAY_DONE) : (we ? DAY_LEFT_WE : DAY_LEFT);
            float x = (d - 1) * (cw + gap);
            g.drawRect(x, 0, x + cw, STRIP_H, MyBankWidget.fill(color));
        }
        return b;
    }

    static void paint(Context c, AppWidgetManager m, int[] ids, WidgetData d) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_mybank_4x2);
        Calendar now = Calendar.getInstance();
        int daysLeft = now.getActualMaximum(Calendar.DAY_OF_MONTH) - now.get(Calendar.DAY_OF_MONTH);
        v.setImageViewBitmap(R.id.widget_month_bg, MyBankWidget.plainCell(MONTH_W, MONTH_H));
        v.setImageViewBitmap(R.id.widget_weeks, daysStrip());
        v.setTextViewText(R.id.widget_days_num, d.needLogin ? "—" : MyBankWidget.daysLeftNumber(daysLeft));
        v.setTextViewText(R.id.widget_days_text, (d.needLogin ? "accedi in app" : MyBankWidget.daysLeftText(daysLeft)).replace('\n', ' '));

        for (int i = 0; i < CELLS.length; i++) {
            int[] id = IDS[i];
            boolean has = d.ok && d.budget[i] > 0;
            double ratio = has ? d.left[i] / d.budget[i] : 0;
            boolean worse = has && d.real[i] > d.est[i];
            boolean low = has && ratio < 0.25; // il riempimento è rosso solo sotto il 25%
            v.setImageViewBitmap(BGS[i], has ? MyBankWidget.levelCell(ratio, low, CELL_W, CELL_H) : MyBankWidget.plainCell(CELL_W, CELL_H));
            if (!d.ok) {
                v.setTextViewText(id[0], "—");
                v.setTextViewText(id[1], MyBankWidget.chip("stima", "—", PAPER));
                v.setTextViewText(id[2], MyBankWidget.chip("reale", "—", PAPER));
                v.setTextColor(id[0], PAPER);
            } else {
                v.setTextViewText(id[0], has ? MyBankWidget.money(d.left[i]) : "—");
                v.setTextColor(id[0], low ? LATE : PAPER);
                v.setTextViewText(id[1], has ? MyBankWidget.chip("stima", MyBankWidget.perDay(d.est[i]), PAPER) : MyBankWidget.chip("nessun", "budget", MUTE));
                v.setTextViewText(id[2], MyBankWidget.chip("reale", MyBankWidget.perDay(d.real[i]), !has || !worse ? PAPER : LATE));
            }
            v.setOnClickPendingIntent(CELLS[i], MyBankWidget.tap(c, 30 + i, "movimenti:" + KEYS[i]));
        }

        v.setOnClickPendingIntent(R.id.widget_root, MyBankWidget.tap(c, 3, "storico"));
        v.setOnClickPendingIntent(R.id.widget_month_cell, MyBankWidget.tap(c, 4, "budget"));
        m.updateAppWidget(ids, v);
    }
}
