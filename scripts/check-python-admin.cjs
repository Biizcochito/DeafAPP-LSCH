// Isolated UI check: uses a simulated admin session and the actual imported report.
// Never logs into Supabase or starts a training job.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const packageRoot = process.env.PLAYWRIGHT_PACKAGE || 'playwright';
const {chromium} = require(packageRoot);

(async () => {
  const root = path.resolve(__dirname,'..');
  const report = JSON.parse(fs.readFileSync(path.join(root,'backend/informe_entrenamiento.json'),'utf8'));
  const browser = await chromium.launch({channel:'msedge',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1365,height:1000}});
    page.setDefaultTimeout(10000);
    const errors=[];
    page.on('pageerror',error => errors.push(error.message));
    await page.route('**/rest/v1/rpc/deafapp_admin_*', async route => {
      const name = new URL(route.request().url()).pathname.split('/').pop();
      const data = name === 'deafapp_admin_login' ? {ok:true,token:'a'.repeat(64),expiresAt:new Date(Date.now()+3600000).toISOString()} :
        name === 'deafapp_admin_list' ? {ok:true,rows:[],total:0,counts:{approved:0,pending:0,rejected:0}} : {ok:true};
      await route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'http://127.0.0.1:8081','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'},body:JSON.stringify(data)});
    });
    await page.route('**/estado',route => route.fulfill({contentType:'application/json',body:JSON.stringify({estado:'activo',clases:report.clases,version:'1.2'})}));
    await page.route('**/admin/training',route => route.fulfill({contentType:'application/json',body:JSON.stringify({report,jobs:[],candidates:[]})}));
    await page.goto('http://127.0.0.1:8081/admin',{waitUntil:'networkidle'});
    console.log((await page.locator('body').innerText()).slice(0,800));
    await page.getByLabel('Contraseña',{exact:true}).fill('prueba-local');
    await page.getByRole('button',{name:'Entrar al panel',exact:true}).click();
    await page.getByRole('button',{name:'Entrenamiento LSCh',exact:true}).click();
    await page.getByText('54,84 %',{exact:true}).waitFor();
    assert.equal(await page.getByText('57,02 %',{exact:true}).count(),1);
    assert.equal(await page.getByText('89,47 %',{exact:true}).count(),1);
    assert.equal(await page.getByRole('button',{name:'Entrenar nuevo candidato',exact:true}).isEnabled(),true);
    const output=path.join(root,'.impeccable/review/python-backend');
    fs.mkdirSync(output,{recursive:true});
    await page.screenshot({path:path.join(output,'admin-desktop.png'),fullPage:true});
    await page.getByRole('tab',{name:'Capturas revisadas',exact:true}).click();
    await page.getByRole('button',{name:'Analizar grabaciones aprobadas',exact:true}).waitFor();
    await page.getByRole('tab',{name:'Modelo del traductor',exact:true}).click();
    await page.getByText('54,84 %',{exact:true}).waitFor();
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(output,'admin-mobile.png'),fullPage:true});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),false);
    assert.deepEqual(errors,[]);
    console.log('Interfaz verificada: apartado interno, tres métricas, cambio de pestañas y ancho móvil.');
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exit(1);});
