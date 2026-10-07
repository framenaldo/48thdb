/* A static file server for previewing the site locally.
 *
 * The site is one index.html plus its assets — no build step and no framework,
 * so previewing it only needs something that hands files over. Python's
 * http.server would do, except that the 3.9 build shipped with macOS reads the
 * working directory at import time, which this sandbox refuses; this serves
 * from an absolute root instead and never asks.
 *
 * Run: node .claude/serve.mjs [port]   (the "48thDb site" launch config does).
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const PORT = Number(process.argv[2]) || 8823;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.ics': 'text/calendar; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    // keep the request inside the site, whatever it asks for
    const full = normalize(join(ROOT, path));
    if (full !== ROOT && !full.startsWith(ROOT + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    let info = await stat(full).catch(() => null);
    let file = full;
    // a folder with a page of its own (/m, /p) gets its slash, as the host does
    if (info && info.isDirectory() && await stat(join(full, 'index.html')).catch(() => null)) {
      res.writeHead(301, { location: url.pathname + '/' + url.search }).end();
      return;
    }
    // /privacy is privacy.html, as the host serves it (html_handling = auto-trailing-slash)
    if (!info && !/\.[a-z0-9]+$/i.test(path)) {
      const page = await stat(full + '.html').catch(() => null);
      if (page && page.isFile()) { file = full + '.html'; info = page; }
    }
    // any other address a browser opens is the site's own page, which reads
    // the path itself (the host's not_found_handling = "single-page-application")
    if ((!info || !info.isFile()) && (req.headers['sec-fetch-mode'] === 'navigate' || /text\/html/.test(req.headers.accept || ''))) {
      file = join(ROOT, 'index.html'); info = await stat(file);
    }
    if (!info || !info.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': info.size,
      // a preview should always show what is on disk right now
      'cache-control': 'no-store',
    });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file).pipe(res);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end(String(err));
  }
}).listen(PORT, () => console.log(`Serving ${ROOT} on http://localhost:${PORT}`));
