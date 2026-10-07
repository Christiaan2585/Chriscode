package com.sandveldveedienste.app;

import android.content.Context;
import android.content.SharedPreferences;

import java.security.GeneralSecurityException;

/** Where this phone's pairing with the office PC lives: the host/port to
 * call, the PC certificate's pinned SHA-256 fingerprint, and the device
 * token. Read by both the JS side (via PairingStorePlugin) and
 * PinningWebViewClient, which needs it synchronously during the TLS
 * handshake - that's why this isn't just the JS-facing Preferences plugin.
 *
 * The device token is the one real secret here, so it is stored encrypted
 * with a Keystore key (see SecretBox) and is never part of an Android backup
 * (the manifest turns backup off). A token saved in plain by an earlier
 * version is encrypted the first time it is read. */
final class PairingStore {
    private static final String PREFS = "sandveld_pairing";

    private PairingStore() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void save(Context ctx, String host, int port, String fingerprint, String token, String deviceName) {
        String sealed;
        try {
            sealed = SecretBox.seal(token);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("This phone couldn't store the pairing securely", e);
        }
        prefs(ctx).edit()
            .putString("host", host)
            .putInt("port", port)
            .putString("fingerprint", fingerprint)
            .putString("token_enc", sealed)
            .remove("token")
            .putString("deviceName", deviceName)
            .apply();
    }

    /** Pins a host's certificate fingerprint without a device token yet -
     * used right before the pairing call itself, which needs the TLS
     * handshake trusted before any token exists to prove this phone is paired. */
    static void trust(Context ctx, String host, int port, String fingerprint) {
        prefs(ctx).edit()
            .putString("host", host)
            .putInt("port", port)
            .putString("fingerprint", fingerprint)
            .remove("token")
            .remove("token_enc")
            .apply();
    }

    static void clear(Context ctx) {
        prefs(ctx).edit().clear().apply();
    }

    static String getHost(Context ctx) {
        return prefs(ctx).getString("host", null);
    }

    static int getPort(Context ctx) {
        return prefs(ctx).getInt("port", 0);
    }

    static String getFingerprint(Context ctx) {
        return prefs(ctx).getString("fingerprint", null);
    }

    static String getToken(Context ctx) {
        SharedPreferences prefs = prefs(ctx);
        String sealed = prefs.getString("token_enc", null);
        if (sealed != null) {
            return SecretBox.open(sealed);
        }
        String legacy = prefs.getString("token", null); // saved in plain by an earlier version: lock it now
        if (legacy != null) {
            try {
                prefs.edit().putString("token_enc", SecretBox.seal(legacy)).remove("token").apply();
            } catch (GeneralSecurityException ignored) {
                // keep working with the old value rather than unpair the phone
            }
        }
        return legacy;
    }

    static String getDeviceName(Context ctx) {
        return prefs(ctx).getString("deviceName", null);
    }

    static boolean isPaired(Context ctx) {
        return getToken(ctx) != null && getFingerprint(ctx) != null && getHost(ctx) != null;
    }
}
