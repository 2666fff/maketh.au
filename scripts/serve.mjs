import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const portIndex = process.argv.indexOf('--port');
const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : 4173);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Port must be an integer between 1 and 65535');
}

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.xml', 'application/xml; charset=utf-8']
]);

createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (/\.(?:php|sqlite|ini)$/.test(pathname) || /^\/(?:api|admin|\.git|\.codex_tmp|confs\.txt|maketh\.au_key|codex_temp\.txt)(?:\/|$)/.test(pathname)) {
      return sendError(response, 403, 'Use the full PHP preview for the enquiry system.');
    }
    let filePath = resolve(root, `.${pathname}`);

    if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
      return sendError(response, 403, 'Forbidden');
    }

    if (statSync(filePath).isDirectory()) {
      filePath = join(filePath, 'index.html');
    }

    const type = contentTypes.get(extname(filePath).toLowerCase()) || 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type });
    if (request.method === 'HEAD') return response.end();
    createReadStream(filePath).pipe(response);
  } catch (error) {
    if (error?.code === 'ENOENT') return sendError(response, 404, 'Not found');
    console.error(error);
    return sendError(response, 500, 'Internal server error');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`DanaTech site: http://127.0.0.1:${port}/`);
});

function sendError(response, status, message) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(message);
}
