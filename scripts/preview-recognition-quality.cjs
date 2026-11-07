// Local visual fixture using the real components and authenticated mock API.
// The package entry is restored even if Expo fails; production keeps index.js.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),packagePath=path.join(root,'package.json'),original=fs.readFileSync(packagePath,'utf8');
const output=path.join(root,'dist/recognition-quality-demo');
try{
  fs.writeFileSync(packagePath,JSON.stringify({...JSON.parse(original),main:'tests/fixtures/recognitionQualityPreview.web.jsx'},null,2)+'\n');
  execFileSync(process.execPath,[require.resolve('expo/bin/cli'),'export','--platform','web','--output-dir',output],{cwd:root,stdio:'inherit',env:{...process.env,EXPO_NO_TELEMETRY:'1'}});
}finally{fs.writeFileSync(packagePath,original);}
if(process.argv.includes('--build-only'))process.exit(0);
const port=Number(process.env.QUALITY_PREVIEW_PORT||8097),types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf'};
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Usa un puerto local entre 1024 y 65535.');
http.createServer((request,response)=>{
  if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);response.end();return;}
  if(!['127.0.0.1','localhost'].includes(String(request.headers.host||'').split(':')[0])){response.writeHead(403);response.end();return;}
  let pathname;try{pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);}catch{response.writeHead(400);response.end();return;}
  const target=pathname==='/'?path.join(output,'index.html'):path.resolve(output,'.'+pathname);
  if(!target.startsWith(output+path.sep)){response.writeHead(403);response.end();return;}
  fs.stat(target,(error,stat)=>{if(error||!stat.isFile()){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'content-type':types[path.extname(target)]||'application/octet-stream','cache-control':'no-store','content-security-policy':"connect-src 'self'; object-src 'none'; base-uri 'self'"});
    if(request.method==='HEAD')response.end();else fs.createReadStream(target).pipe(response);
  });
}).listen(port,'127.0.0.1',()=>console.log(`Prueba local de colores: http://127.0.0.1:${port}/`));
