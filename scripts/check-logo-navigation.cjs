const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.LOGO_PREVIEW_URL||'http://127.0.0.1:8143';
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const report={routes:[],errors:[],animation:false,reducedMotion:false,keyboard:false,footer:false,admin:false};
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});
    const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
    for(const route of ['/app','/interpretar','/conversar','/tarjetas','/privacidad','/terminos','/consentimiento','/admin']){
      await page.goto(base+route,{waitUntil:'domcontentloaded'});const logo=page.getByRole('link',{name:'DeafApp, volver al inicio',exact:true}).first();await logo.waitFor();
      assert.equal(await logo.getAttribute('href'),'/');
      await page.evaluate(()=>window.__logoNavigationMarker='same-document');await logo.click();await page.waitForURL(base+'/');
      assert.equal(await page.evaluate(()=>window.__logoNavigationMarker),'same-document');
      await page.locator('.deaf-welcome').waitFor();report.routes.push({route,returnedHome:true,withoutReload:true});
    }
    const mark=page.locator('header .brand-logo-bubble-a');const before=await mark.evaluate(el=>getComputedStyle(el).transform);
    await page.waitForTimeout(450);const after=await mark.evaluate(el=>getComputedStyle(el).transform);assert.notEqual(before,after);report.animation=true;
    await page.screenshot({path:'artifacts/logo-animado-inicio-desktop.png'});
    for(let i=0;i<6;i++)await page.locator('header .brand-home').click();assert.equal(new URL(page.url()).pathname,'/');assert.equal(await page.locator('.app-admin-login').count(),0);
    await page.locator('footer .brand-home').scrollIntoViewIfNeeded();await page.locator('footer .brand-home').click();
    await page.waitForFunction(()=>document.querySelector('.deaf-welcome')?.scrollTop<=1);report.footer=true;
    await page.goto(base+'/tarjetas');await page.getByRole('link',{name:'DeafApp, volver al inicio',exact:true}).focus();await page.keyboard.press('Enter');await page.waitForURL(base+'/');report.keyboard=true;
    await page.goto(base+'/admin');await page.getByLabel('Contraseña',{exact:true}).fill('deafapp-prueba-local');await page.getByRole('button',{name:'Entrar al panel',exact:true}).click();await page.locator('.admin-workspace').waitFor();
    for(const section of ['Grabaciones','Revisión de señas','Entrenamiento LSCh','Habilitar señas','Material de LSCh','Datos y diagnóstico']){
      await page.locator('.admin-navigation').getByRole('button',{name:section,exact:true}).click();assert.equal(await page.locator('.admin-brandbar .brand-home').getAttribute('href'),'/');
    }
    await page.locator('.admin-brandbar .brand-home').click();await page.waitForURL(base+'/');report.admin=true;
    for(const width of [390,320]){
      await page.setViewportSize({width,height:950});await page.goto(base+'/tarjetas');
      const logo=page.getByRole('link',{name:'DeafApp, volver al inicio',exact:true});const bounds=await logo.boundingBox();assert.ok(bounds.width>=44&&bounds.height>=44);assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width);
      if(width===390)await page.screenshot({path:'artifacts/logo-animado-movil.png'});
      await logo.click();await page.waitForURL(base+'/');
    }
    const reduced=await browser.newContext({reducedMotion:'reduce'}),reducedPage=await reduced.newPage();
    await reducedPage.goto(base+'/conversar');await reducedPage.locator('.brand-logo-mark').waitFor();
    const names=await reducedPage.locator('.brand-logo-mark g').evaluateAll(elements=>elements.map(el=>getComputedStyle(el).animationName));assert.ok(names.every(name=>name==='none'));report.reducedMotion=true;
    await reduced.close();assert.deepEqual(report.errors,[]);report.ok=true;
    fs.writeFileSync('artifacts/logo-animado-verificacion.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await context.close();
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
