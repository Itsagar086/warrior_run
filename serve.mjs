// Dev server for Naga Loka Runner.
//
//   node serve.mjs            -> http://localhost:8000
//   node serve.mjs 5500       -> a different port, if 8000 is taken
//
// The game is ES modules, so it has to be served over http. Opening index.html
// straight off disk (file://) fails: the browser refuses module imports from a
// file URL. Nothing here needs installing - it is plain Node.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2]) || 8000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.wav': 'audio/wav', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const target = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);

  // Never serve anything outside the project directory.
  if (!path.resolve(target).startsWith(path.resolve(ROOT))) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(target, (err, buf) => {
    if (err) {
      if (!urlPath.includes('favicon')) console.log('  404', urlPath);
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found: ' + urlPath);
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(buf);
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use. Either something else is on it, or a`);
    console.error(`previous server is still running. Try a different one:\n`);
    console.error(`    node serve.mjs ${PORT + 1}\n`);
  } else {
    console.error('\nServer failed to start:', e.message, '\n');
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log('');
  console.log('  Naga Loka Runner is being served from:');
  console.log('    ' + ROOT);
  console.log('');
  console.log('  Open this in your browser:');
  console.log('    http://localhost:' + PORT);
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
