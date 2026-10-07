// Checks local-secret.js inside a real Electron (it needs Electron's session API).
// Run: npx electron scripts/probe-local-secret.js   (from desktop-app/)
// Uses two spare local ports - never the app's own port - and a hidden window.
// Prints PASS/FAIL lines and exits non-zero on any failure.
const { app, BrowserWindow, session } = require('electron');
const http = require('http');
const path = require('path');
const localSecret = require(path.join(__dirname, '..', 'local-secret.js'));

const SECRET = 'probe-secret-123';
const ALLOWED_PORT = 8702; // gets the header
const OTHER_PORT = 8703; // must NOT get it
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`);
  if (!ok) failures += 1;
};

function server(port, handler) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      handler(req, res);
    });
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

const echo = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ header: req.headers[localSecret.HEADER.toLowerCase()] || null }));
};

app.whenReady().then(async () => {
  const withSecret = await server(ALLOWED_PORT, (req, res) => {
    if (req.url === '/local-check') {
      const given = req.headers[localSecret.HEADER.toLowerCase()] || '';
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ secret_required: true, match: given === SECRET }));
    }
    return echo(req, res);
  });
  const other = await server(OTHER_PORT, echo);

  localSecret.installHeader(session.defaultSession, SECRET, [`http://127.0.0.1:${ALLOWED_PORT}/*`]);
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
  await win.loadURL('data:text/html,<title>probe</title>');
  const fetchJson = (url, init) => win.webContents.executeJavaScript(`fetch(${JSON.stringify(url)}, ${JSON.stringify(init || {})}).then(r => r.json())`);

  const got = await fetchJson(`http://127.0.0.1:${ALLOWED_PORT}/x`);
  check('the window\'s request to the backend carries the secret', got.header === SECRET, JSON.stringify(got));
  const post = await fetchJson(`http://127.0.0.1:${ALLOWED_PORT}/x`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
  check('a POST with its own headers carries it too', post.header === SECRET, JSON.stringify(post));
  const elsewhere = await fetchJson(`http://127.0.0.1:${OTHER_PORT}/x`);
  check('a request to any other address does not get it', elsewhere.header === null, JSON.stringify(elsewhere));
  const forged = await fetchJson(`http://127.0.0.1:${ALLOWED_PORT}/x`, { headers: { 'X-Local-Secret': 'page-tried-to-set-its-own' } });
  check('a page cannot set its own value (ours replaces it)', forged.header === SECRET, JSON.stringify(forged));

  check('a backend that knows our secret is "ok"', (await localSecret.checkBackend('127.0.0.1', ALLOWED_PORT, SECRET)) === 'ok');
  check('a backend started with another secret is "mismatch"', (await localSecret.checkBackend('127.0.0.1', ALLOWED_PORT, 'someone-else')) === 'mismatch');
  check('nothing listening is "ok" (nothing to mismatch)', (await localSecret.checkBackend('127.0.0.1', 8799, SECRET, 500)) === 'ok');

  withSecret.close();
  other.close();
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  app.exit(failures ? 1 : 0);
});
