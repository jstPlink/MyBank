package app.mybank.mobile;

import android.content.Context;
import android.content.res.Configuration;

/**
 * Colori dei widget, tema grafite (come la palette «Grafite» dell'app), chiaro e scuro: si sceglie col tema del telefono. Le tinte dei layout e dei drawable
 * stanno in res/values/widget_colors.xml (chiaro) e res/values-night/widget_colors.xml (scuro); queste sono le stesse, per le immagini disegnate a codice.
 * load() va chiamato prima di disegnare (lo fanno i tre paint()).
 */
final class WidgetPal {
    private WidgetPal() {}

    static int PAPER, MUTE, LATE, ACC, CELL, FILL, FILL_LATE, TICK, EMPTY;
    static int DAY_DONE, DAY_DONE_WE, DAY_LEFT, DAY_LEFT_WE;

    static boolean night(Context c) {
        return (c.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    static void load(Context c) {
        if (night(c)) {
            PAPER = 0xFFF2F4F7; MUTE = 0xFF8D94A0; LATE = 0xFFFF8F8F; ACC = 0xFFE9EBEF;
            CELL = 0xFF1C2025; FILL = 0xFF64676C; FILL_LATE = 0xFF6B474A; TICK = 0x408D94A0; EMPTY = 0xFF2B3037;
            DAY_DONE = 0xFFE9EBEF; DAY_DONE_WE = 0xFFFF8F8F; DAY_LEFT = 0xFF2B3037; DAY_LEFT_WE = 0xFF3C2F31;
        } else {
            PAPER = 0xFF1B1F24; MUTE = 0xFF6B7380; LATE = 0xFFC93A3A; ACC = 0xFF2B3038;
            CELL = 0xFFE3E6EA; FILL = 0xFFB5B8BD; FILL_LATE = 0xFFDCBBBE; TICK = 0x406B7380; EMPTY = 0xFFD3D7DD;
            DAY_DONE = 0xFF2B3038; DAY_DONE_WE = 0xFFC93A3A; DAY_LEFT = 0xFFD3D7DD; DAY_LEFT_WE = 0xFFE6D2D4;
        }
    }
}
