/**
 * Минимальный статический сервер без зависимостей.
 * Нужен только чтобы открыть приложение в браузере и установить PWA.
 *
 *   node server.js            # порт 8080
 *   PORT=9000 node server.js
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { networkInterfaces } from 'node:os';

const ROOT = resolve(import.meta.dirname ?? process.cwd());
const PORT = Number(process.env.PORT || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    const filePath = normalize(join(ROOT, pathname));
    if (!filePath.startsWith(ROOT + sep) && filePath !== join(ROOT, 'index.html')) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const info = await stat(filePath);
    if (!info.isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }

    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const addresses = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.family === 'IPv4' && !item.internal) addresses.push(item.address);
    }
  }

  console.log(`Word Cards: http://localhost:${PORT}`);
  for (const address of addresses) console.log(`  в локальной сети: http://${address}:${PORT}`);
  console.log('');
  console.log('Для установки PWA на Android нужен защищённый контекст:');
  console.log(`  adb reverse tcp:${PORT} tcp:${PORT}   → откройте http://localhost:${PORT} на телефоне`);
  console.log('  либо HTTPS-туннель (cloudflared/ngrok) к этому же порту.');
});
