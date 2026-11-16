// Vista local con Node existente, sin paquetes adicionales.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const allowed=new Set(['index.html','app.js','config.js','styles.css']);
http.createServer(async(req,res)=>{
 const file=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
 if(!allowed.has(file)){res.writeHead(404);res.end('No encontrado');return;}
 try{const data=await readFile(new URL(file,import.meta.url));res.writeHead(200,{'Content-Type':types[file.slice(file.lastIndexOf('.'))],'Cache-Control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end('No encontrado');}
}).listen(4173,'127.0.0.1',()=>console.log('DASA: http://localhost:4173 · Ctrl+C para detener'));
