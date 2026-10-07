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
