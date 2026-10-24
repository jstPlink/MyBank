package app.mybank.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;

/** I dati del widget, letti dal server (/api/widget) e conservati per mostrare subito l'ultimo valore noto. */
final class WidgetData {
    static final String[] KEYS = { "spesa", "svago", "carburante", "altro" };

    boolean ok;          // dati letti (o ripresi dall'ultima lettura)
    boolean needLogin;   // sessione scaduta o mai fatta: si apre l'app
    final double[] budget = new double[KEYS.length];
    final double[] spent = new double[KEYS.length];
    final double[] left = new double[KEYS.length];
    final double[] est = new double[KEYS.length];   // spesa giornaliera stimata (budget / giorni del mese); 0 senza budget
    final double[] real = new double[KEYS.length];  // spesa giornaliera reale (speso / giorni passati)

    private static SharedPreferences prefs(Context c) { return c.getApplicationContext().getSharedPreferences("widget", Context.MODE_PRIVATE); }

    static WidgetData parse(String json) throws Exception {
        JSONObject o = new JSONObject(json);
        JSONObject cats = o.getJSONObject("cats");
        WidgetData d = new WidgetData();
        for (int i = 0; i < KEYS.length; i++) {
            JSONObject c = cats.optJSONObject(KEYS[i]); // una categoria assente resta senza budget
            if (c == null) continue;
            d.budget[i] = c.optDouble("budget", 0);
            d.spent[i] = c.optDouble("spent", 0);
            d.left[i] = c.optDouble("left", 0);
            d.est[i] = c.isNull("estDaily") ? 0 : c.optDouble("estDaily", 0);
            d.real[i] = c.optDouble("realDaily", 0);
        }
        d.ok = true;
        return d;
    }

    static WidgetData fetch(Context c) {
        Server.Reply r = Server.get(c, "/api/widget");
        if (r.status == 401) { WidgetData d = new WidgetData(); d.needLogin = true; return d; }
        if (r.status != 200) return new WidgetData();
        try {
            WidgetData d = parse(r.body);
            prefs(c).edit().putString("json", r.body).apply();
            return d;
        } catch (Exception e) { return new WidgetData(); }
    }

    static WidgetData cached(Context c) {
        try { return parse(prefs(c).getString("json", "")); } catch (Exception e) { return new WidgetData(); }
    }
}
