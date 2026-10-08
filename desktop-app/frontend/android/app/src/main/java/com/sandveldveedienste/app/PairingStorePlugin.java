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
        if (url == null) {
            call.reject("url is required");
            return;
        }
        network.execute(() -> {
            try {
                byte[] payload = body == null || body.isEmpty() ? null : android.util.Base64.decode(body, android.util.Base64.DEFAULT);
                PinnedHttp.Reply reply = PinnedHttp.execute(getContext(), url, method, headers, payload, timeout);
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
        PairingStore.save(getContext(), host, port, fingerprint, token, deviceName);
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
            ret.put("port", PairingStore.getPort(getContext()));
            ret.put("fingerprint", PairingStore.getFingerprint(getContext()));
            ret.put("token", PairingStore.getToken(getContext()));
            ret.put("deviceName", PairingStore.getDeviceName(getContext()));
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void clear(PluginCall call) {
        PairingStore.clear(getContext());
        call.resolve();
    }
}
