import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(process.argv[2]||'site');const types={'.html':'text/html; charset=utf-8','.jpg':'image/jpeg','.json':'application/json'};
http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';const f=path.join(root,p);if(!f.startsWith(root)||!fs.existsSync(f)){r.writeHead(404);return r.end('no');}
r.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});fs.createReadStream(f).pipe(r);}).listen(3150,'127.0.0.1',()=>console.log('http://127.0.0.1:3150'));
