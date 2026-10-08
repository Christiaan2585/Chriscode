package com.sandveldveedienste.app;

import android.content.Context;
import android.content.SharedPreferences;

import java.security.GeneralSecurityException;

/** A tiny key/value store whose values are sealed with the Android Keystore key (see SecretBox). */
final class SecureValues {
    private static final String PREFS = "sandveld_secure";

    private SecureValues() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void set(Context ctx, String key, String value) throws GeneralSecurityException {
        prefs(ctx).edit().putString(key, SecretBox.seal(value)).apply();
    }

    /** The stored text, or null if there is none or it cannot be opened any more. */
    static String get(Context ctx, String key) {
        String sealed = prefs(ctx).getString(key, null);
        return sealed == null ? null : SecretBox.open(sealed);
    }

    static void remove(Context ctx, String key) {
        prefs(ctx).edit().remove(key).apply();
    }

    static void clear(Context ctx) {
        prefs(ctx).edit().clear().apply();
    }
}
