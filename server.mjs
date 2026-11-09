import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import geocode from './api/geocode.js';
import restaurants from './api/restaurants.js';
const root=path.dirname(fileURLToPath(import.meta.url));
const files={'/':'index.html','/index.html':'index.html','/sw.js':'sw.js','/manifest.webmanifest':'manifest.webmanifest','/icon.svg':'icon.svg'};
const mime={'html':'text/html; charset=utf-8','js':'text/javascript','svg':'image/svg+xml','webmanifest':'application/manifest+json'};
createServer(async(request,response)=>{
  const url=new URL(request.url,'http://localhost');
  if(url.pathname.startsWith('/api/')){
    const f=url.pathname==='/api/geocode'?geocode:url.pathname==='/api/restaurants'?restaurants:null;
    if(!f){response.writeHead(404);response.end();return}
    response.status=(n)=>{response.statusCode=n;return response};
    response.json=(obj)=>{response.setHeader('Content-Type','application/json; charset=utf-8');response.end(JSON.stringify(obj));return response};
    request.query=Object.fromEntries(url.searchParams);
    try{await f(request,response)}catch(e){response.status(500).json({error:'Internal server error'})}
    return;
  }
  const file=files[url.pathname];if(!file){response.writeHead(404);response.end('Not found');return}
  try{const body=await readFile(path.join(root,file));response.setHeader('Content-Type',mime[file.split('.').pop()]||'text/plain');response.end(body)}catch{response.writeHead(500);response.end('Unable to load app')}
}).listen(process.env.PORT||8080,()=>console.log('Table for Two: http://localhost:'+(process.env.PORT||8080)));
