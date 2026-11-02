import { createServer, request as proxyRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const port = Number(process.env.FRONTEND_PORT || 3000);
const backendPort = Number(process.env.BACKEND_PORT || 5000);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

createServer((incoming, outgoing) => {
  if (incoming.url?.startsWith('/api/')) {
    const upstream = proxyRequest({
      hostname: '127.0.0.1', port: backendPort, method: incoming.method,
      path: incoming.url, headers: { ...incoming.headers, host: `localhost:${backendPort}` }
    }, response => {
      outgoing.writeHead(response.statusCode || 502, response.headers);
      response.pipe(outgoing);
    });
    upstream.on('error', () => {
      if (!outgoing.headersSent) outgoing.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
      outgoing.end(JSON.stringify({ status: 'error', message: 'The SheKeeps API is unavailable. Start the backend on port 5000.' }));
    });
    incoming.pipe(upstream);
    return;
  }

  let pathname;
  try { pathname = decodeURIComponent(new URL(incoming.url || '/', 'http://localhost').pathname); }
  catch { outgoing.writeHead(400).end('Bad request'); return; }
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = resolve(root, requested);
  if (file !== root && !file.startsWith(root + sep)) { outgoing.writeHead(403).end('Forbidden'); return; }
  readFile(file).then(content => {
    outgoing.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    outgoing.end(content);
  }).catch(() => { outgoing.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found'); });
}).listen(port, '127.0.0.1', () => console.log(`SheKeeps frontend ready at http://localhost:${port} (API: http://localhost:${backendPort})`));
