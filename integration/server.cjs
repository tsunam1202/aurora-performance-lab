'use strict';
// Zero dependencies. Serves only dist/ and the explicit embedding example.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const DIST = fs.realpathSync(path.join(ROOT, 'dist'));
const EXAMPLE = path.join(__dirname, 'embed-example.html');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.avif': 'image/avif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.pdf': 'application/pdf'
};
function reply(req, res, status, text, headers = {}) {
  const body = Buffer.from(text);
  res.writeHead(status, {'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': body.length,
    'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', ...headers});
  res.end(req.method === 'HEAD' ? undefined : body);
}
function inside(file, directory) { return file === directory || file.startsWith(directory + path.sep); }
function createServer() {
  return http.createServer(async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) return reply(req, res, 405, 'Method not allowed', {'Allow': 'GET, HEAD'});
    let pathname;
    try { pathname = decodeURIComponent((req.url || '/').split('?')[0]); }
    catch { return reply(req, res, 400, 'Invalid URL encoding'); }
    // Validate before URL normalization, on Windows as well as POSIX.
    if (!pathname.startsWith('/') || /[\x00-\x1f\\]/.test(pathname) || pathname.split('/').some(s => s === '..' || s === '.')) {
      return reply(req, res, 403, 'Path is not allowed');
    }
    if (pathname === '/__aurora_health') return reply(req, res, 200, JSON.stringify({app: 'aurora-performance-lab', version: '5.0.0'}), {'Content-Type': 'application/json; charset=utf-8'});
    const isExample = pathname === '/integration/embed-example.html';
    let file;
    if (isExample) file = EXAMPLE;
    else {
      if (pathname === '/dist' || pathname === '/dist/') pathname = '/';
      else if (pathname.startsWith('/dist/')) pathname = pathname.slice(5);
      file = path.resolve(DIST, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!inside(file, DIST)) return reply(req, res, 403, 'Path is not allowed');
    }
    try {
      const real = await fs.promises.realpath(file);
      if (isExample ? real !== fs.realpathSync(EXAMPLE) : !inside(real, DIST)) return reply(req, res, 403, 'Path is not allowed');
      const stat = await fs.promises.stat(real);
      if (!stat.isFile()) return reply(req, res, 404, 'Not found');
      res.writeHead(200, {'Content-Type': MIME[path.extname(real).toLowerCase()] || 'application/octet-stream',
        'Content-Length': stat.size, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff'});
      if (req.method === 'HEAD') return res.end();
      const stream = fs.createReadStream(real);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    } catch (error) {
      reply(req, res, error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500, error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 'Not found' : 'Unable to read file');
    }
  });
}
if (require.main === module) {
  const args = process.argv.slice(2), index = args.indexOf('--port');
  const portValue = index >= 0 ? args[index + 1] : process.env.PORT || '4180';
  if (!/^\d+$/.test(portValue || '') || +portValue < 1 || +portValue > 65535) {
    console.error('Port must be an integer from 1 to 65535.'); process.exit(1);
  }
  const server = createServer();
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${portValue} is already in use. Choose another port with --port.` : error.message); process.exitCode = 1; });
  server.listen(+portValue, '127.0.0.1', () => {
    console.log(`AURORA local website: http://127.0.0.1:${portValue}/#home`);
    console.log(`Embedding example: http://127.0.0.1:${portValue}/integration/embed-example.html`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
module.exports = {createServer};
