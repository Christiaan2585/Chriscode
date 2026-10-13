package com.sandveldveedienste.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** JS-facing wrapper around PairingStore - lets Settings/pairing screens
 * save, read and clear the office-PC pairing. */
@CapacitorPlugin(name = "PairingStore")
public class PairingStorePlugin extends Plugin {
    private final java.util.concurrent.ExecutorService network = java.util.concurrent.Executors.newCachedThreadPool();

    /** Small secrets the app needs while the office PC is out of reach (the offline PIN check):
     * kept sealed with the Keystore key, so a copy of the app data cannot read them. */
    @PluginMethod
    public void secureSet(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || value == null) {
            call.reject("key and value are required");
            return;
        }
        try {
            SecureValues.set(getContext(), key, value);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not store that securely");
        }
    }

    @PluginMethod
    public void secureGet(PluginCall call) {
        String key = call.getString("key");
        if (key == null) {
            call.reject("key is required");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("value", SecureValues.get(getContext(), key)); // null when missing or unreadable
        call.resolve(ret);
    }

    @PluginMethod
    public void secureRemove(PluginCall call) {
        String key = call.getString("key");
        if (key != null) SecureValues.remove(getContext(), key);
        call.resolve();
    }

    /** One HTTPS call to the paired office PC with its certificate pinned (see PinnedHttp).
     * The body goes in and comes back as base64, so uploads and PDFs survive the trip. */
    @PluginMethod
    public void request(final PluginCall call) {
        final String url = call.getString("url");
        final String method = call.getString("method", "GET");
        final JSObject headers = call.getObject("headers");
        final String body = call.getString("body");
        final Integer timeoutValue = call.getInt("timeout", 60000);
        final int timeout = timeoutValue == null ? 60000 : timeoutValue;
        final boolean fast = Boolean.TRUE.equals(call.getBoolean("fast", false)); // one quick try: used to ask "is the PC there?"
        if (url == null) {
            call.reject("url is required");
            return;
        }
        network.execute(() -> {
            try {
                byte[] payload = body == null || body.isEmpty() ? null : android.util.Base64.decode(body, android.util.Base64.DEFAULT);
                PinnedHttp.Reply reply = PinnedHttp.execute(getContext(), url, method, headers, payload, timeout, fast);
                JSObject ret = new JSObject();
                ret.put("status", reply.status);
                ret.put("headers", reply.headers);
                ret.put("body", reply.bodyBase64);
                call.resolve(ret);
            } catch (java.net.SocketTimeoutException e) {
                call.reject("The office PC took too long to answer", "TIMEOUT");
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "Could not reach the office PC" : e.getMessage(), "NETWORK");
            }
        });
    }

    @PluginMethod
    public void save(PluginCall call) {
        String host = call.getString("host");
        Integer port = call.getInt("port");
        String fingerprint = call.getString("fingerprint");
        String token = call.getString("token");
        String deviceName = call.getString("deviceName", "");
        if (host == null || port == null || fingerprint == null || token == null) {
            call.reject("host, port, fingerprint and token are all required");
            return;
        }
        java.util.List<String> hosts = new java.util.ArrayList<>();
        try {
            org.json.JSONArray offered = call.getArray("hosts");
            if (offered != null) for (int i = 0; i < offered.length(); i++) hosts.add(offered.getString(i));
        } catch (org.json.JSONException ignored) {
            // just the one host
        }
        PairingStore.save(getContext(), host, port, fingerprint, token, deviceName, hosts);
        call.resolve();
    }

    @PluginMethod
    public void trust(PluginCall call) {
        String host = call.getString("host");
        Integer port = call.getInt("port");
        String fingerprint = call.getString("fingerprint");
        if (host == null || port == null || fingerprint == null) {
            call.reject("host, port and fingerprint are all required");
            return;
        }
        PairingStore.trust(getContext(), host, port, fingerprint);
        call.resolve();
    }

    @PluginMethod
    public void get(PluginCall call) {
        JSObject ret = new JSObject();
        boolean paired = PairingStore.isPaired(getContext());
        ret.put("paired", paired);
        if (paired) {
            ret.put("host", PairingStore.getHost(getContext()));
            ret.put("hosts", new org.json.JSONArray(PairingStore.getHosts(getContext())));
            ret.put("hasRelay", PairingStore.hasRelay(getContext()));
            ret.put("port", PairingStore.getPort(getContext()));
            ret.put("fingerprint", PairingStore.getFingerprint(getContext()));
            ret.put("token", PairingStore.getToken(getContext()));
            ret.put("deviceName", PairingStore.getDeviceName(getContext()));
        }
        call.resolve(ret);
    }

    /** Relay details from the PC ("Connect from anywhere"). Checked again here, whatever the JavaScript side did. */
    @PluginMethod
    public void setRelay(PluginCall call) {
        String host = call.getString("host");
        Integer port = call.getInt("port");
        String office = call.getString("office");
        String key = call.getString("key");
        if (!PairingStore.isPaired(getContext()) || port == null || !RelayTunnel.isAcceptableRelay(host == null ? null : host.trim().toLowerCase(), port, office, key)) {
            call.reject("Those relay details are not acceptable");
            return;
        }
        PairingStore.setRelay(getContext(), host.trim().toLowerCase(), port, office, key);
        call.resolve();
    }

    @PluginMethod
    public void clearRelay(PluginCall call) {
        PairingStore.clearRelay(getContext());
        call.resolve();
    }

    /** The PC's current addresses, as it reported them over the trusted connection. Only acceptable ones are kept. */
    @PluginMethod
    public void addHosts(PluginCall call) {
        java.util.List<String> offered = new java.util.ArrayList<>();
        try {
            org.json.JSONArray list = call.getArray("hosts");
            if (list != null) for (int i = 0; i < list.length() && i < 32; i++) offered.add(list.getString(i));
        } catch (org.json.JSONException ignored) {
            // nothing usable
        }
        PairingStore.addHosts(getContext(), offered);
        JSObject ret = new JSObject();
        ret.put("hosts", new org.json.JSONArray(PairingStore.getHosts(getContext())));
        call.resolve(ret);
    }

    /** "Check connection": can this phone reach the PC on each address it knows, how fast, and is it really the PC? */
    @PluginMethod
    public void diagnose(final PluginCall call) {
        network.execute(() -> {
            try {
                final int port = PairingStore.getPort(getContext());
                final String fingerprint = PairingStore.getFingerprint(getContext());
                java.util.List<String> hosts = PairingStore.getHosts(getContext());
                org.json.JSONArray results = new org.json.JSONArray();
                for (String host : hosts) {
                    org.json.JSONObject row = new org.json.JSONObject();
                    row.put("host", host);
                    long started = System.currentTimeMillis();
                    boolean tcp = false;
                    try (java.net.Socket probe = new java.net.Socket()) {
                        probe.connect(new java.net.InetSocketAddress(host, port), 3500);
                        tcp = true;
                    } catch (Exception e) {
                        row.put("problem", e instanceof java.net.SocketTimeoutException ? "no answer" : e instanceof java.net.ConnectException ? "refused" : "unreachable");
                    }
                    if (tcp) {
                        boolean pc = Discovery.answersAsThePc(host, port, fingerprint, 3500);
                        row.put("ok", pc);
                        if (!pc) row.put("problem", "something answers, but it is not the office PC");
                    } else {
                        row.put("ok", false);
                    }
                    row.put("ms", System.currentTimeMillis() - started);
                    results.put(row);
                }
                if (PairingStore.hasRelay(getContext())) { // the internet relay, as one more way in
                    org.json.JSONObject row = new org.json.JSONObject();
                    long started = System.currentTimeMillis();
                    String problem = RelayTunnel.check(PairingStore.getRelayHost(getContext()), PairingStore.getRelayPort(getContext()),
                            PairingStore.getRelayOffice(getContext()), PairingStore.getRelayKey(getContext()), fingerprint);
                    row.put("host", PairingStore.getRelayHost(getContext()));
                    row.put("via", "relay");
                    row.put("ok", problem == null);
                    if (problem != null) row.put("problem", problem);
                    row.put("ms", System.currentTimeMillis() - started);
                    results.put(row);
                }
                JSObject ret = new JSObject();
                ret.put("results", results);
                ret.put("current", PairingStore.getHost(getContext()));
                ret.put("phoneAddresses", new org.json.JSONArray(Discovery.phoneAddresses()));
                ret.put("tailnetPhoneAddresses", new org.json.JSONArray(Discovery.tailnetPhoneAddresses()));
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Could not check the connection");
            }
        });
    }

    /** "Find the PC again": looks for it on this network by its certificate, whatever address it has now. */
    @PluginMethod
    public void rediscover(final PluginCall call) {
        network.execute(() -> {
            String found = Discovery.find(getContext(), PairingStore.getHosts(getContext()), true);
            JSObject ret = new JSObject();
            ret.put("found", found);
            call.resolve(ret);
        });
    }

    /** Debug builds only: addresses to scan instead of the real network (testing without Wi-Fi access to the PC). */
    @PluginMethod
    public void debugScanCandidates(PluginCall call) {
        if (!Discovery.debuggable(getContext())) {
            call.reject("Not available");
            return;
        }
        getContext().getSharedPreferences("sandveld_debug", android.content.Context.MODE_PRIVATE).edit().putString("scan_candidates", call.getString("list", "")).apply();
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        PairingStore.clear(getContext());
        SecureValues.clear(getContext());
        call.resolve();
    }
}
