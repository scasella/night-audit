// Development log. On localhost, or with ?devlog in the URL (a phone on a
// tunnel to serve.py), events and errors are mirrored to POST /__log so a
// session can be inspected from the Mac. Elsewhere it only writes to the console.

const ENABLED = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || new URLSearchParams(location.search).has('devlog');

const ser = (a) => {
  if (a instanceof Error) return a.stack || a.message;
  if (typeof a === 'object') { try { return JSON.parse(JSON.stringify(a)); } catch { return String(a); } }
  return a;
};

export function devlog(kind, ...args) {
  console.debug(`[${kind}]`, ...args);
  if (!ENABLED) return;
  fetch('/__log', { method: 'POST', keepalive: true, body: JSON.stringify({ kind, args: args.map(ser), t: Math.round(performance.now()) }) }).catch(() => {});
}

if (ENABLED) {
  addEventListener('error', (e) => devlog('page-error', e.message, `${e.filename}:${e.lineno}:${e.colno}`));
  addEventListener('unhandledrejection', (e) => devlog('page-rejection', ser(e.reason)));
}
