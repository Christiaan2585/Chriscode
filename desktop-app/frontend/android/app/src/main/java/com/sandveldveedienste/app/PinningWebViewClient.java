package com.sandveldveedienste.app;

import android.net.Uri;
import android.net.http.SslCertificate;
import android.net.http.SslError;
import android.os.Bundle;
import android.webkit.SslErrorHandler;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

import java.security.MessageDigest;

/** The office PC's certificate is self-signed - there's no certificate
 * authority to vouch for it, so the phone instead pins its exact SHA-256
 * fingerprint, learnt once at pairing time from the PC's QR code (see
 * PairingStore). A request to the paired host is trusted only if its
 * certificate's fingerprint matches exactly; anything else is refused,
 * same as a normal failed TLS handshake. */
public class PinningWebViewClient extends BridgeWebViewClient {

    public PinningWebViewClient(Bridge bridge) {
        super(bridge);
    }

    @Override
    public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
        String pinned = PairingStore.getFingerprint(view.getContext());
        String pinnedHost = PairingStore.getHost(view.getContext());
        String requestHost = Uri.parse(error.getUrl()).getHost();
        if (pinned != null && pinnedHost != null && pinnedHost.equalsIgnoreCase(requestHost)) {
            String actual = fingerprintOf(error.getCertificate());
            if (actual != null && actual.equalsIgnoreCase(pinned)) {
                handler.proceed();
                return;
            }
        }
        handler.cancel();
    }

    private static String fingerprintOf(SslCertificate cert) {
        try {
            Bundle bundle = SslCertificate.saveState(cert);
            byte[] der = bundle.getByteArray("x509-certificate");
            if (der == null) return null;
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(der);
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (Exception e) {
            return null;
        }
    }
}
