package com.sandveldveedienste.app;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/** The phone's side of the connection relay (the server is relay/server.py, the PC's side app/core/relay_agent.py).
 * When the office PC cannot be reached directly, the phone connects OUT to the relay, says which office it wants and
 * proves it with the key from pairing; the relay joins it to the PC. What then flows is the same TLS the phone would
 * speak to the PC itself - and the phone still checks the PC's certificate fingerprint - so the relay cannot read or
 * change anything. */
final class RelayTunnel {
    static final class RelayException extends IOException {
        RelayException(String message) { super(message); }
    }

    private RelayTunnel() {}

    /** Tests only: the factory used to encrypt the hop to the relay (the phone's own trust store when null). */
    static volatile SSLSocketFactory outerTlsFactory = null;

    private static final java.util.regex.Pattern HOST = java.util.regex.Pattern.compile("(?i)([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)*[a-z0-9]([a-z0-9-]*[a-z0-9])?");
    private static final java.util.regex.Pattern OFFICE = java.util.regex.Pattern.compile("[0-9a-f]{32}");
    private static final java.util.regex.Pattern KEY = java.util.regex.Pattern.compile("[0-9a-f]{64}");

    /** May this phone keep relay details that the PC reported? Whatever arrives is checked here, in the phone's own code. */
    static boolean isAcceptableRelay(String host, int port, String office, String key) {
        return host != null && host.length() <= 253 && HOST.matcher(host).matches() && port >= 1 && port <= 65535
                && office != null && OFFICE.matcher(office).matches() && key != null && KEY.matcher(key).matches();
    }

    /** The connection to the relay is encrypted unless the relay is on this phone's own side of things (testing). */
    static boolean needsTls(String host) {
        if ("localhost".equalsIgnoreCase(host)) return false;
        if (!host.matches("\\d{1,3}(\\.\\d{1,3}){3}")) return true;
        return !(host.startsWith("127.") || Discovery.isPrivate(host));
    }

    private static String readLine(InputStream in, int max) throws IOException {
        StringBuilder line = new StringBuilder();
        while (line.length() < max) {
            int b = in.read();
            if (b < 0) throw new IOException("The relay closed the connection");
            if (b == '\n') return line.toString().trim();
            line.append((char) b);
        }
        throw new IOException("That is not a Sandveld relay");
    }

    /** Runs the relay's handshake on a freshly connected socket to the relay and returns the socket to carry on with
     * (wrapped in TLS to the relay when it is not on a private address). After READY the other end is the office PC. */
    static Socket handshake(Socket plain, String relayHost, int relayPort, String office, String key) throws IOException {
        Socket s = plain;
        if (needsTls(relayHost)) {
            SSLSocketFactory outer = outerTlsFactory != null ? outerTlsFactory : (SSLSocketFactory) SSLSocketFactory.getDefault();
            SSLSocket tls = (SSLSocket) outer.createSocket(plain, relayHost, relayPort, true);
            javax.net.ssl.SSLParameters parameters = tls.getSSLParameters();
            parameters.setEndpointIdentificationAlgorithm("HTTPS"); // the handshake itself checks the certificate is for relayHost
            tls.setSSLParameters(parameters);
            tls.startHandshake();
            s = tls;
        }
        int before = s.getSoTimeout();
        s.setSoTimeout(15000);
        OutputStream out = s.getOutputStream();
        out.write(("PHONE " + office + " " + key + "\n").getBytes(StandardCharsets.US_ASCII));
        out.flush();
        String answer = readLine(s.getInputStream(), 32);
        s.setSoTimeout(before);
        switch (answer) {
            case "READY": return s;
            case "OFFLINE": throw new RelayException("the office PC is not connected to the relay");
            case "TIMEOUT": throw new RelayException("the office PC did not answer the relay in time");
            case "BUSY": throw new RelayException("the relay is busy right now");
            default: throw new IOException("That is not a Sandveld relay");
        }
    }

    /** Plugs the relay handshake in under the pinned TLS: HttpsURLConnection connects to the relay's address, asks this
     * factory to put TLS on that socket, and the handshake happens first - so everything above it (HTTP, the pinned
     * certificate check) is exactly as if the PC had been reached directly. */
    static final class RelaySocketFactory extends SSLSocketFactory {
        private final SSLSocketFactory delegate;
        private final String office;
        private final String key;

        RelaySocketFactory(SSLSocketFactory delegate, String office, String key) {
            this.delegate = delegate;
            this.office = office;
            this.key = key;
        }

        @Override public Socket createSocket(Socket s, String host, int port, boolean autoClose) throws IOException {
            return delegate.createSocket(handshake(s, host, port, office, key), host, port, autoClose);
        }

        @Override public String[] getDefaultCipherSuites() { return delegate.getDefaultCipherSuites(); }
        @Override public String[] getSupportedCipherSuites() { return delegate.getSupportedCipherSuites(); }
        @Override public Socket createSocket(String host, int port) throws IOException { throw new IOException("only through the relay"); }
        @Override public Socket createSocket(String host, int port, InetAddress local, int localPort) throws IOException { throw new IOException("only through the relay"); }
        @Override public Socket createSocket(InetAddress host, int port) throws IOException { throw new IOException("only through the relay"); }
        @Override public Socket createSocket(InetAddress host, int port, InetAddress local, int localPort) throws IOException { throw new IOException("only through the relay"); }
    }

    /** "Check connection": can this phone reach the relay, is the PC on it, and is that really the PC? Returns null
     * when all is well, otherwise a short reason. */
    static String check(String relayHost, int relayPort, String office, String key, String fingerprint) {
        try (Socket plain = new Socket()) {
            plain.connect(new InetSocketAddress(relayHost, relayPort), 4000);
            Socket tunnel = handshake(plain, relayHost, relayPort, office, key);
            tunnel.setSoTimeout(8000);
            try (SSLSocket tls = (SSLSocket) PinnedHttp.pinnedFactory(fingerprint).createSocket(tunnel, relayHost, relayPort, true)) {
                tls.startHandshake();
                return null;
            }
        } catch (RelayException e) {
            return e.getMessage();
        } catch (javax.net.ssl.SSLException e) {
            return "something answers through the relay, but it is not the office PC";
        } catch (Exception e) {
            return "the relay cannot be reached";
        }
    }
}
