// Arranca la versión web con el administrador simulado (sin Supabase). Solo para pruebas locales.
const { spawn } = require('node:child_process');
const port = process.env.PORT || '8082';
const child = spawn('npx', ['expo', 'start', '--web', '--port', port], { stdio: 'inherit', shell: true, env: { ...process.env, EXPO_PUBLIC_ADMIN_MOCK: '1' } });
child.on('exit', code => process.exit(code ?? 0));
