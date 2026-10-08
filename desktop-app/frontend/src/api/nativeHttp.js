// Android only: every call to the office PC goes through the native PairingStore.request
// instead of the WebView's own networking. The WebView refuses a self-signed certificate on
// data requests (and a page at https://localhost may not call another origin anyway), while the
// native side trusts exactly the certificate fingerprint learnt from the PC's QR code.
// This is an axios adapter, so every existing apiClient call works unchanged.
import axios, { AxiosError, AxiosHeaders } from "axios";

const CHUNK = 0x8000;

export function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

export function base64ToBytes(text) {
  const binary = atob(text || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// What axios hands an adapter: a string (JSON/text), FormData, Blob, ArrayBuffer or nothing.
// FormData is turned into its real multipart bytes (with the boundary header) by Response.
async function bodyOf(data, headers) {
  if (data == null) return null;
  if (typeof data === "string") return new TextEncoder().encode(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const wrapped = new Response(data); // FormData, Blob, URLSearchParams
  const type = wrapped.headers.get("content-type");
  if (type) headers["Content-Type"] = type;
  return new Uint8Array(await wrapped.arrayBuffer());
}

const dataOf = (bytes, type, responseType) => {
  if (responseType === "blob") return new Blob([bytes], { type: type || "application/octet-stream" });
  if (responseType === "arraybuffer") return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new TextDecoder().decode(bytes); // axios parses JSON out of this itself
};

/** `call` is the plugin's request(options) -> {status, headers, body(base64)}. */
export function createAdapter(call) {
  return async function nativeAdapter(config) {
    if (config.signal?.aborted) throw new AxiosError("canceled", AxiosError.ERR_CANCELED, config, {});
    const headers = AxiosHeaders.from(config.headers).toJSON();
    if (config.data instanceof FormData) delete headers["Content-Type"]; // the multipart one (with its boundary) replaces it
    const body = await bodyOf(config.data, headers);
    const url = axios.getUri(config);
    const method = String(config.method || "get").toUpperCase();

    let reply;
    try {
      reply = await call({ url, method, headers, body: body ? bytesToBase64(body) : null, timeout: config.timeout || 120000 });
    } catch (error) {
      const timedOut = error?.code === "TIMEOUT";
      throw new AxiosError(timedOut ? `timeout of ${config.timeout || 120000}ms exceeded` : "Network Error",
        timedOut ? AxiosError.ECONNABORTED : AxiosError.ERR_NETWORK, config, {});
    }

    const replyHeaders = reply.headers || {};
    const response = {
      data: dataOf(base64ToBytes(reply.body), replyHeaders["content-type"], config.responseType),
      status: reply.status,
      statusText: "",
      headers: AxiosHeaders.from(replyHeaders),
      config,
      request: {},
    };
    const accepted = config.validateStatus ? config.validateStatus(reply.status) : reply.status >= 200 && reply.status < 300;
    if (accepted) return response;
    throw new AxiosError(`Request failed with status code ${reply.status}`,
      reply.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST, config, {}, response);
  };
}

let adapter = null;

// Loaded on first use so the web/desktop builds never touch the native plugin.
export async function nativeAdapter(config) {
  if (!adapter) {
    const { registerPlugin } = await import("@capacitor/core");
    const plugin = registerPlugin("PairingStore");
    adapter = createAdapter((options) => plugin.request(options));
  }
  return adapter(config);
}
