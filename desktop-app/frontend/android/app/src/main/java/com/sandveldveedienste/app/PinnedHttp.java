package com.sandveldveedienste.app;

import android.content.Context;
import android.util.Base64;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

import org.json.JSONException;
import org.json.JSONObject;

/** Talks to the office PC. The WebView refuses a self-signed certificate on data
 * requests (only whole-page loads ever reach the SSL-error callback), so every
 * call the app makes to the PC goes through here instead: an HTTPS connection
 * that trusts exactly one thing - a certificate whose SHA-256 fingerprint is the
 * one learnt from the PC QR code (see PairingStore). It only ever talks to the
 * paired host and port, never to anything else. */
final class PinnedHttp {
    static final int MAX_RESPONSE_BYTES = 64 * 1024 * 1024;

    static final class Reply {
        int status;
        JSONObject headers = new JSONObject();
        String bodyBase64 = "";
    }

    private PinnedHttp() {}

    static String sha256Hex(byte[] der) throws NoSuchAlgorithmException {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(der);
        StringBuilder hex = new StringBuilder(digest.length * 2);
        for (byte b : digest) hex.append(String.format(Locale.ROOT, "%02x", b));
        return hex.toString();
    }

    static javax.net.ssl.SSLSocketFactory pinnedFactory(String fingerprint) throws Exception {
        return pinnedContext(fingerprint).getSocketFactory();
    }

    private static SSLContext pinnedContext(final String fingerprint) throws Exception {
        TrustManager trust = new X509TrustManager() {
            @Override public void checkClientTrusted(X509Certificate[] chain, String authType) throws CertificateException {
                throw new CertificateException("no client certificates");
            }

            @Override public void checkServerTrusted(X509Certificate[] chain, String authType) throws CertificateException {
                try {
                    if (chain == null || chain.length == 0 || !sha256Hex(chain[0].getEncoded()).equalsIgnoreCase(fingerprint)) {
                        throw new CertificateException("This is not the office PC certificate");
                    }
                } catch (NoSuchAlgorithmException e) {
                    throw new CertificateException(e);
                }
            }

            @Override public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
        };
        SSLContext context = SSLContext.getInstance("TLS");
        context.init(null, new TrustManager[] { trust }, null);
        return context;
    }

    /** Opens the connection, trying again if the PC cannot be reached yet: an office PC on Wi-Fi often goes
     * quiet when idle and only answers a moment after the first attempt. Only the connecting is repeated
     * (nothing has been sent), so a retry can never do something twice. */
    private static HttpsURLConnection connect(URL url, String fingerprint, int timeoutMs, String method, JSONObject headers, int bodyLength, int connectMs, int attempts) throws Exception {
        return connect(url, fingerprint, timeoutMs, method, headers, bodyLength, connectMs, attempts, null);
    }

    private static HttpsURLConnection connect(URL url, String fingerprint, int timeoutMs, String method, JSONObject headers, int bodyLength, int connectMs, int attempts, javax.net.ssl.SSLSocketFactory factory) throws Exception {
        IOException last = null;
        for (int attempt = 0; attempt < attempts; attempt++) {
            HttpsURLConnection conn = (HttpsURLConnection) url.openConnection();
            conn.setSSLSocketFactory(factory != null ? factory : pinnedContext(fingerprint).getSocketFactory());
            conn.setHostnameVerifier((hostname, session) -> true); // the pinned certificate IS the identity check
            conn.setConnectTimeout(Math.min(timeoutMs, connectMs));
            conn.setReadTimeout(timeoutMs);
            conn.setInstanceFollowRedirects(false);
            conn.setRequestMethod(method);
            if (bodyLength > 0) { // these can only be set before connecting
                conn.setDoOutput(true);
                conn.setFixedLengthStreamingMode(bodyLength);
            }
            if (headers != null) {
                for (Iterator<String> it = headers.keys(); it.hasNext(); ) {
                    String name = it.next();
                    String value = headers.optString(name, null);
                    if (value != null) conn.setRequestProperty(name, value);
                }
            }
            try {
                conn.connect();
                return conn;
            } catch (java.net.SocketTimeoutException | java.net.ConnectException | java.net.NoRouteToHostException | java.net.UnknownHostException e) {
                last = e;
                conn.disconnect();
            }
        }
        throw last;
    }

    /** One connection to the PC by way of the relay: HTTPS to the relay's address with the relay handshake underneath. */
    private static HttpsURLConnection connectViaRelay(Context ctx, String path, String fingerprint, int timeoutMs, String method, JSONObject headers, int bodyLength) throws IOException {
        try {
            String host = PairingStore.getRelayHost(ctx);
            int port = PairingStore.getRelayPort(ctx);
            javax.net.ssl.SSLSocketFactory factory = new RelayTunnel.RelaySocketFactory(pinnedFactory(fingerprint), PairingStore.getRelayOffice(ctx), PairingStore.getRelayKey(ctx));
            return connect(new URL("https://" + host + ":" + port + path), fingerprint, timeoutMs, method, headers, bodyLength, 6000, 1, factory);
        } catch (IOException e) {
            throw e;
        } catch (Exception e) {
            throw new IOException("Could not connect through the relay", e);
        }
    }

    static Reply execute(Context ctx, String address, String method, JSONObject headers, byte[] body, int timeoutMs, boolean fast) throws Exception {
        int port = PairingStore.getPort(ctx);
        String fingerprint = PairingStore.getFingerprint(ctx);
        URL url = new URL(address);
        int urlPort = url.getPort() == -1 ? 443 : url.getPort();
        // Only the PC this phone is paired with, on any address it has been known by: the app always asks for the
        // address it was given, and this decides which of the PC's addresses actually answers right now.
        if (PairingStore.getHost(ctx) == null || fingerprint == null || !"https".equals(url.getProtocol())
                || !PairingStore.knowsHost(ctx, url.getHost()) || urlPort != port) {
            throw new IOException("This phone only talks to the office PC it is paired with");
        }
        String path = url.getFile();
        int bodyLength = body == null ? 0 : body.length;

        // Every known address gets one try, the one that worked last first. An office PC on Wi-Fi often only answers on
        // the second try after being idle, so if none answered the best address is tried once more, patiently.
        // Still nothing: look for the PC on this network (the router may have given it a new address).
        List<String> hosts = PairingStore.getHosts(ctx);
        boolean several = hosts.size() > 1;
        HttpsURLConnection conn = null;
        String used = null;
        IOException last = null;
        // The internet relay ("Connect from anywhere"): the way in when the office Wi-Fi cannot be used. Tried first for a
        // while after it was last needed (the phone is probably still away), otherwise only after the PC's own addresses.
        boolean relayConfigured = PairingStore.hasRelay(ctx);
        boolean relayFirst = relayConfigured && PairingStore.relayRecentlyUsed(ctx);
        boolean viaRelay = false;
        if (relayFirst) {
            try {
                conn = connectViaRelay(ctx, path, fingerprint, timeoutMs, method, headers, bodyLength);
                viaRelay = true;
            } catch (IOException e) {
                last = e;
            }
        }
        for (int i = 0; i < hosts.size() && conn == null; i++) {
            // With the relay as a fallback, an address that does not answer is not worth waiting long for.
            int connectMs = fast || i > 0 || relayConfigured ? 3500 : several ? 4500 : 6000;
            int attempts = fast || several || i > 0 || relayConfigured ? 1 : 3;
            try {
                conn = connect(new URL("https://" + hosts.get(i) + ":" + port + path), fingerprint, timeoutMs, method, headers, bodyLength, connectMs, attempts);
                used = hosts.get(i);
            } catch (IOException e) {
                last = e;
            }
        }
        if (conn == null && relayConfigured && !relayFirst) {
            try {
                conn = connectViaRelay(ctx, path, fingerprint, timeoutMs, method, headers, bodyLength);
                viaRelay = true;
            } catch (IOException e) {
                last = e;
            }
        }
        if (conn == null && !fast && several) {
            try {
                conn = connect(new URL("https://" + hosts.get(0) + ":" + port + path), fingerprint, timeoutMs, method, headers, bodyLength, 6000, 1);
                used = hosts.get(0);
            } catch (IOException e) {
                last = e;
            }
        }
        if (conn == null) {
            String found = Discovery.find(ctx, hosts, false);
            if (found != null) {
                try {
                    conn = connect(new URL("https://" + found + ":" + port + path), fingerprint, timeoutMs, method, headers, bodyLength, 3500, 1);
                    used = found;
                } catch (IOException e) {
                    last = e;
                }
            }
        }
        if (conn == null) throw last != null ? last : new IOException("Could not reach the office PC");
        if (relayConfigured) PairingStore.markRelayUsed(ctx, viaRelay);
        if (!viaRelay && used != null && !used.equalsIgnoreCase(hosts.get(0))) PairingStore.promote(ctx, used);
        if (body != null && body.length > 0) {
            try (OutputStream out = conn.getOutputStream()) {
                out.write(body);
            }
        }

        Reply reply = new Reply();
        try {
            reply.status = conn.getResponseCode();
            for (Map.Entry<String, List<String>> entry : conn.getHeaderFields().entrySet()) {
                if (entry.getKey() == null || entry.getValue().isEmpty()) continue;
                try {
                    reply.headers.put(entry.getKey().toLowerCase(Locale.ROOT), entry.getValue().get(entry.getValue().size() - 1));
                } catch (JSONException ignored) {
                    // a header that can not be represented is simply not passed on
                }
            }
            InputStream in = reply.status >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (in != null) {
                try (InputStream stream = in) {
                    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                    byte[] buffer = new byte[16384];
                    int read;
                    while ((read = stream.read(buffer)) != -1) {
                        if (bytes.size() + read > MAX_RESPONSE_BYTES) throw new IOException("That answer is too large for the phone");
                        bytes.write(buffer, 0, read);
                    }
                    reply.bodyBase64 = Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP);
                }
            }
        } finally {
            conn.disconnect();
        }
        return reply;
    }
}
