// Tiny zero-dependency HTTP kit shared by every lab's api.js.
// Every topic keeps ONE API contract across its 4 levels; only the backend architecture changes.
//
//   serve(__dirname, {
//     meta: { title, profile, architecture, ideas, tradeoffs },
//     controls: { chaos: { label, type: 'toggle' | 'number' | 'select', value, options? } },
//     routes: { 'GET /feed': (ctx) => ({ items }), 'POST /posts': async (ctx) => ... },
//     reset: () => {...},
//   })
//
// Handler ctx: { query, body, params, trace(msg), control(id), req, res, raw() }
// JSON responses are wrapped as { ...result, trace: [...], ms }.
const http = require('http');
const path = require('path');
const labs = require('../labs.json');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function locate(dir) {
  const level = path.basename(dir).split('-').pop();
  const topic = path.basename(path.dirname(dir));
  const port = labs[topic]?.[level];
  if (!port) throw new Error(`no port in labs.json for ${topic}/${level}`);
  return { topic, level, port };
}

function compile(routes) {
  return Object.entries(routes).map(([key, handler]) => {
    const [method, pattern] = key.split(' ');
    const parts = pattern.split('/').filter(Boolean);
    return { method, parts, handler };
  });
}
function match(route, method, pathname) {
  if (route.method !== method) return null;
  const segs = pathname.split('/').filter(Boolean);
  if (segs.length !== route.parts.length) return null;
  const params = {};
  for (let i = 0; i < segs.length; i++) {
    if (route.parts[i].startsWith(':')) params[route.parts[i].slice(1)] = decodeURIComponent(segs[i]);
    else if (route.parts[i] !== segs[i]) return null;
  }
  return params;
}

async function readJson(req) {
  let body = '';
  for await (const c of req) {
    body += c;
    if (body.length > 1e6) fail(413, 'body too large');
  }
  if (!body) return {};
  try { return JSON.parse(body); } catch { fail(400, 'invalid JSON body'); }
}

function serve(dir, spec) {
  const { topic, level, port } = locate(dir);
  const controls = spec.controls ?? {}; // same object the lab reads, so background workers see changes
  const routes = compile(spec.routes);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (status, body) => {
      if (res.headersSent) return;
      res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify(body));
    };
    const t0 = performance.now();
    const trace = [];
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' });
        return res.end();
      }
      if (req.method === 'GET' && url.pathname === '/meta') {
        return send(200, { topic, level, ...spec.meta, controls: Object.entries(controls).map(([id, c]) => ({ id, ...c })) });
      }
      if (req.method === 'POST' && url.pathname === '/control') {
        const { id, value } = await readJson(req);
        if (!controls[id]) fail(404, `unknown control ${id}`);
        controls[id].value = value;
        spec.onControl?.(id, value);
        return send(200, { ok: true, id, value });
      }
      if (req.method === 'POST' && url.pathname === '/reset') {
        await spec.reset?.();
        return send(200, { ok: true });
      }
      for (const route of routes) {
        const params = match(route, req.method, url.pathname);
        if (!params) continue;
        let raw = false;
        const ctx = {
          req, res, params,
          query: Object.fromEntries(url.searchParams),
          body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readJson(req) : {},
          trace: (msg) => trace.push(msg),
          control: (id) => controls[id]?.value,
          raw: () => { raw = true; }, // handler writes the response itself (SSE, custom status)
        };
        const result = await route.handler(ctx);
        if (raw) return;
        return send(result?.status ?? 200, { ...result, status: undefined, trace, ms: +(performance.now() - t0).toFixed(1) });
      }
      fail(404, `no route ${req.method} ${url.pathname}`);
    } catch (e) {
      if (!(e instanceof HttpError)) console.error(`[${topic}/${level}]`, e);
      send(e.status ?? 500, { error: e.message, trace, ms: +(performance.now() - t0).toFixed(1) });
    }
  });
  server.on('error', (e) => {
    if (e.code !== 'EADDRINUSE') throw e;
    console.error(`${topic}/${level}: port ${port} is already in use (is another start-apis / npm run dev still running?)`);
  });
  server.listen(port, () => console.log(`${topic}/${level} api on :${port}`));
  return server;
}

module.exports = { serve, fail, sleep, HttpError };
