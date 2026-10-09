const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.bin': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg' };
http.createServer((request, response) => {
  let target;
  try { target = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname)); }
  catch { response.writeHead(400); response.end(); return; }
  if ((target !== root && !target.startsWith(root + path.sep)) || !['GET', 'HEAD'].includes(request.method)) { response.writeHead(403); response.end(); return; }
  // La web es de una sola página: /app y /admin se resuelven en el navegador.
  if (target === root || /^\/(app|admin)\/?$/.test(new URL(request.url, 'http://localhost').pathname)) target = path.join(root, 'index.html');
  fs.stat(target, (error, stat) => {
    if (error || !stat.isFile()) { response.writeHead(404); response.end('No encontrado'); return; }
    response.writeHead(200, { 'content-type': types[path.extname(target)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    if (request.method === 'HEAD') response.end(); else fs.createReadStream(target).pipe(response);
  });
}).listen(8081, '127.0.0.1', () => console.log('DeafApp: http://127.0.0.1:8081/'));
