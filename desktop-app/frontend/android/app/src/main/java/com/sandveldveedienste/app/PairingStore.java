package com.sandveldveedienste.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;

import java.security.GeneralSecurityException;
import java.util.ArrayList;
import java.util.List;

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
    private static final int MAX_HOSTS = 8;

    private PairingStore() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void save(Context ctx, String host, int port, String fingerprint, String token, String deviceName, List<String> hosts) {
        String sealed;
        try {
            sealed = SecretBox.seal(token);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("This phone couldn't store the pairing securely", e);
        }
        prefs(ctx).edit()
            .putString("host", host)
            .putString("hosts", joinHosts(host, hosts))
            .putInt("port", port)
            .putString("fingerprint", fingerprint)
            .putString("token_enc", sealed)
            .remove("token")
            .putString("deviceName", deviceName)
            .remove("relay_host").remove("relay_port").remove("relay_office").remove("relay_key_enc").remove("relay_used_at")
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

    /** `first` first, then the others, no repeats, at most MAX_HOSTS. */
    private static String joinHosts(String first, List<String> others) {
        JSONArray array = new JSONArray();
        List<String> seen = new ArrayList<>();
        List<String> all = new ArrayList<>();
        all.add(first);
        if (others != null) all.addAll(others);
        for (String h : all) {
            if (h == null) continue;
            String clean = h.trim();
            boolean repeat = false;
            for (String s : seen) if (s.equalsIgnoreCase(clean)) repeat = true;
            if (clean.isEmpty() || repeat || seen.size() >= MAX_HOSTS) continue;
            seen.add(clean);
            array.put(clean);
        }
        return array.toString();
    }

    /** Every address this phone knows for the PC, the one that worked last first. */
    static List<String> getHosts(Context ctx) {
        List<String> out = new ArrayList<>();
        String current = getHost(ctx);
        try {
            JSONArray array = new JSONArray(prefs(ctx).getString("hosts", "[]"));
            for (int i = 0; i < array.length(); i++) out.add(array.getString(i));
        } catch (JSONException ignored) {
            // fall through: just the current host
        }
        if (current != null) {
            boolean listed = false;
            for (String h : out) if (h.equalsIgnoreCase(current)) listed = true;
            if (!listed) out.add(0, current);
        }
        return out;
    }

    /** Addresses the PC reported over the connection that is already trusted: the acceptable new ones are kept
     * (first, they are the newest news), everything already known stays, the one in use stays first. */
    static void addHosts(Context ctx, List<String> offered) {
        String current = getHost(ctx);
        if (current == null || offered == null) return;
        List<String> merged = new ArrayList<>();
        for (String h : offered) if (Discovery.isAcceptableHost(h)) merged.add(h.trim());
        merged.addAll(getHosts(ctx));
        prefs(ctx).edit().putString("hosts", joinHosts(current, merged)).apply();
    }

    // --- the internet relay ("Connect from anywhere" on the PC): host, port, office id, and the key phones use ---

    static void setRelay(Context ctx, String host, int port, String office, String key) {
        String sealed;
        try {
            sealed = SecretBox.seal(key); // the key lets a phone in through the relay, so it is sealed like the device token
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("This phone couldn't store the relay key securely", e);
        }
        prefs(ctx).edit().putString("relay_host", host).putInt("relay_port", port).putString("relay_office", office).putString("relay_key_enc", sealed).apply();
    }

    static void clearRelay(Context ctx) {
        prefs(ctx).edit().remove("relay_host").remove("relay_port").remove("relay_office").remove("relay_key_enc").remove("relay_used_at").apply();
    }

    static boolean hasRelay(Context ctx) {
        return getRelayHost(ctx) != null && getRelayOffice(ctx) != null && prefs(ctx).getString("relay_key_enc", null) != null;
    }

    static String getRelayHost(Context ctx) { return prefs(ctx).getString("relay_host", null); }
    static int getRelayPort(Context ctx) { return prefs(ctx).getInt("relay_port", 0); }
    static String getRelayOffice(Context ctx) { return prefs(ctx).getString("relay_office", null); }

    static String getRelayKey(Context ctx) {
        String sealed = prefs(ctx).getString("relay_key_enc", null);
        return sealed == null ? null : SecretBox.open(sealed);
    }

    /** The last time a call went through the relay (0 = the last one went straight to the PC). While the phone is away
     * from the office the relay is tried first, so every call does not first wait for the office Wi-Fi to time out. */
    static void markRelayUsed(Context ctx, boolean used) {
        prefs(ctx).edit().putLong("relay_used_at", used ? System.currentTimeMillis() : 0L).apply();
    }

    static boolean relayRecentlyUsed(Context ctx) {
        long at = prefs(ctx).getLong("relay_used_at", 0L);
        return at > 0 && System.currentTimeMillis() - at < 10 * 60 * 1000L;
    }

    static boolean knowsHost(Context ctx, String host) {
        for (String h : getHosts(ctx)) if (h.equalsIgnoreCase(host)) return true;
        return false;
    }

    /** `host` answered: use it first from now on (added to the list if it is new, e.g. found by Discovery). */
    static void promote(Context ctx, String host) {
        List<String> rest = getHosts(ctx);
        prefs(ctx).edit().putString("host", host).putString("hosts", joinHosts(host, rest)).apply();
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
