const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const {spawn,spawnSync} = require('node:child_process');

const root = path.resolve(__dirname,'..'), backend = path.join(root,'backend');
const venv = path.join(backend,'.venv'), venvPython = path.join(venv,process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const candidates = [process.env.DEAFAPP_PYTHON && [process.env.DEAFAPP_PYTHON], fs.existsSync(venvPython) && [venvPython],
  process.platform === 'win32' && ['py','-3.12'], ['python3'], ['python']].filter(Boolean);
const selected = candidates.find(([command,...args]) => spawnSync(command,[...args,'-c','import sys; assert (3, 10) <= sys.version_info[:2] < (3, 14)'],{stdio:'ignore',windowsHide:true}).status === 0);
if (!selected) {console.error('Instala Python 3.12 o indica su ejecutable con DEAFAPP_PYTHON.');process.exit(1);}
const [python,...prefix] = selected;
const runtime = path.join(backend,'.runtime');
const env = {...process.env,PYTHONUTF8:'1',PYTHONUNBUFFERED:'1',TF_CPP_MIN_LOG_LEVEL:'2',
  ...(fs.existsSync(runtime) ? {PYTHONPATH:[runtime,process.env.PYTHONPATH].filter(Boolean).join(path.delimiter)} : {})};
const mode = process.argv[2] || 'start', extra = process.argv.slice(3);

function run(command,args,cwd=backend) {
  const result = spawnSync(command,args,{cwd,env,stdio:'inherit',windowsHide:true});
  if (result.error) console.error(result.error.message);
  return result.status ?? 1;
}
if (mode === 'setup') {
  if (!fs.existsSync(venvPython) && run(python,[...prefix,'-m','venv',venv]) !== 0) process.exit(1);
  process.exit(run(venvPython,['-m','pip','install','-r','requirements-integrated.txt']));
}
const probe = spawnSync(python,[...prefix,'-c',"import importlib.util, sys; missing = [m for m in ['tensorflow','mediapipe','cv2','flask','flask_cors','numpy','requests','sklearn','supabase'] if importlib.util.find_spec(m) is None]; print(', '.join(missing)); sys.exit(bool(missing))"],{cwd:backend,env,stdio:'pipe',windowsHide:true});
if (probe.status !== 0) {console.error('Falta preparar Python: ejecuta npm run backend:setup.\n' + String(probe.stderr || probe.error || ''));process.exit(1);}
if (mode === 'test') process.exit(run(python,[...prefix,'-m','unittest','discover','-s','tests',...extra]));
if (mode === 'check') process.exit(run(python,[...prefix,'probar_api.py',...extra]));
if (mode === 'import') process.exit(run(python,[...prefix,'importar_deafapp.py',...extra]));
if (mode === 'train') {
  const output = path.join(backend,'runs',`cli-${Date.now()}`);
  console.log(`El candidato se guardará en ${output}; el modelo actual se conserva.`);
  process.exit(run(python,[...prefix,'entrenar_modelo.py','--salida',output,...extra]));
}
if (!['start','full'].includes(mode)) {console.error('Comando de backend desconocido.');process.exit(1);}
const children = new Set();
function start(command,args,cwd) {
  const child = spawn(command,args,{cwd,env,stdio:'inherit',windowsHide:true});
  children.add(child);child.on('exit',() => children.delete(child));
  child.on('error',error => {console.error(error.message);stop(1);});
  return child;
}
function stop(code=0) {
  for (const child of children) if (child.pid && !child.killed) {
    if (process.platform === 'win32') spawnSync('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});
    else child.kill();
  }
  process.exit(code);
}
const api = start(python,[...prefix,'deafapp_server.py'],backend);
api.on('exit',code => stop(code ?? 1));
if (mode === 'full') {
  const check = net.createConnection({host:'127.0.0.1',port:8081});
  check.once('connect',() => {check.end();console.log('Web disponible: http://127.0.0.1:8081/');});
  check.once('error',() => {
    const expo = require(path.join(root,'node_modules/expo/package.json'));
    const build = start(process.execPath,[path.join(root,'node_modules/expo',expo.bin.expo),'export','--platform','web'],root);
    build.on('exit',code => {
      if (code !== 0) {stop(code ?? 1);return;}
      const web = start(process.execPath,[path.join(root,'scripts/serve-web.cjs')],root);
      web.on('exit',code => stop(code ?? 1));
    });
  });
}
process.on('SIGINT',() => stop());process.on('SIGTERM',() => stop());
