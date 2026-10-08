import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const publicRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.glb':'model/gltf-binary', '.jpg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.txt':'text/plain; charset=utf-8' };
const within = (root, target) => { const p = path.relative(root,target); return p === '' || (!p.startsWith('..'+path.sep) && p !== '..' && !path.isAbsolute(p)); };

export function createStaticServer(root = publicRoot) {
  const rootPromise = realpath(root);
  return createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405, {Allow:'GET, HEAD'}).end(); return; }
    try {
      const base = await rootPromise;
      const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (requestPath.includes('\0') || requestPath.includes('\\')) { res.writeHead(400).end(); return; }
      const target = path.resolve(base, '.' + (requestPath === '/' ? '/index.html' : requestPath));
      if (!within(base,target)) { res.writeHead(403).end(); return; }
      const resolved = await realpath(target);
      if (!within(base,resolved)) { res.writeHead(403).end(); return; }
      if (!(await stat(resolved)).isFile()) { res.writeHead(404).end(); return; }
      const bytes = await readFile(resolved);
      res.writeHead(200, {'Content-Type':mime[path.extname(resolved)] || 'application/octet-stream','Content-Length':bytes.length,'Cache-Control':'no-cache'});
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      res.writeHead(error instanceof URIError ? 400 : ['ENOENT','ENOTDIR'].includes(error.code) ? 404 : 500).end();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const value = process.argv.find(a=>a.startsWith('--port='))?.split('=')[1] ?? '4173';
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Use --port=4173 with a valid port number.');
  const server = createStaticServer();
  server.on('error', error=>{ console.error(error.message); process.exitCode=1; });
  server.listen(port,'127.0.0.1',()=>console.log(`Memory Room: http://127.0.0.1:${port}\nPress Ctrl+C to stop.`));
}
