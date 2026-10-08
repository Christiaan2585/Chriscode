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
    private static HttpsURLConnection connect(URL url, String fingerprint, int timeoutMs, String method, JSONObject headers, int bodyLength) throws Exception {
        IOException last = null;
        for (int attempt = 0; attempt < 3; attempt++) {
            HttpsURLConnection conn = (HttpsURLConnection) url.openConnection();
            conn.setSSLSocketFactory(pinnedContext(fingerprint).getSocketFactory());
            conn.setHostnameVerifier((hostname, session) -> true); // the pinned certificate IS the identity check
            conn.setConnectTimeout(Math.min(timeoutMs, 6000));
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
            } catch (java.net.SocketTimeoutException | java.net.ConnectException | java.net.NoRouteToHostException e) {
                last = e;
                conn.disconnect();
            }
        }
        throw last;
    }

    static Reply execute(Context ctx, String address, String method, JSONObject headers, byte[] body, int timeoutMs) throws Exception {
        String host = PairingStore.getHost(ctx);
        int port = PairingStore.getPort(ctx);
        String fingerprint = PairingStore.getFingerprint(ctx);
        URL url = new URL(address);
        int urlPort = url.getPort() == -1 ? 443 : url.getPort();
        if (host == null || fingerprint == null || !"https".equals(url.getProtocol())
                || !host.equalsIgnoreCase(url.getHost()) || urlPort != port) {
            throw new IOException("This phone only talks to the office PC it is paired with");
        }

        HttpsURLConnection conn = connect(url, fingerprint, timeoutMs, method, headers, body == null ? 0 : body.length);
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
