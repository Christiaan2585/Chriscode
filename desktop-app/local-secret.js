// A per-launch secret between this app's window and the backend it starts, so
// other programs on the PC can't simply talk to the local API (see
// app/core/local_secret.py for the backend half). Kept in its own file so it
// can be tested on its own in a real Electron (scripts/probe-local-secret.js).
const crypto = require('crypto');
const http = require('http');

const HEADER = 'X-Local-Secret';

function createSecret() {
  return crypto.randomBytes(32).toString('hex');
}

// Adds the header to every request this session sends to the backend's
// addresses - and to nothing else, so the secret never goes to a website.
function installHeader(electronSession, secret, urls) {
  electronSession.webRequest.onBeforeSendHeaders({ urls }, (details, callback) => {
    callback({ requestHeaders: { ...details.requestHeaders, [HEADER]: secret } });
  });
}

// Asks a backend that is already running whether it wants a secret and whether
// ours is the one: 'ok' (no secret needed, or ours is right, or an older
// backend that doesn't ask) or 'mismatch' (it was started by something else).
function checkBackend(host, port, secret, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(
      { host, port, path: '/local-check', headers: { [HEADER]: secret }, timeout: timeoutMs },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const answer = JSON.parse(body);
            resolve(answer.secret_required && !answer.match ? 'mismatch' : 'ok');
          } catch {
            resolve('ok');
          }
        });
      }
    );
    req.on('error', () => resolve('ok'));
    req.on('timeout', () => {
      req.destroy();
      resolve('ok');
    });
  });
}

module.exports = { HEADER, createSecret, installHeader, checkBackend };
