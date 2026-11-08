import { test, expect, type Page } from '@playwright/test';
import type { DiagnosticSnapshot } from '../../src/scene/Diagnostics';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const output=process.env.SOLAR_QA_OUTPUT;
async function capture(page:Page,name:string){if(output){mkdirSync(output,{recursive:true});await page.screenshot({path:join(output,name+'.png')});}}
async function settle(page:Page){await page.waitForTimeout(2100);}
async function diagnostic(page:Page):Promise<DiagnosticSnapshot>{return page.evaluate(()=>window.__solarDiagnostics!());}
async function canvasColorFraction(page:Page,requireColor=true){
  const png=await page.locator('canvas').screenshot();
  return page.evaluate(async({base64,requireColor})=>{
    const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const c=canvas.getContext('2d')!;c.drawImage(image,0,0);
    const data=c.getImageData(0,0,canvas.width,canvas.height).data;let colorful=0;
    for(let i=0;i<data.length;i+=16){if(Math.max(data[i],data[i+1],data[i+2])>45&&(!requireColor||Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2])>20))colorful++;}
    return colorful/(data.length/16);
  },{base64:png.toString('base64'),requireColor});
}
async function cloudBandChanges(page:Page){
  const png=await page.locator('canvas').screenshot();
  return page.evaluate(async base64=>{
    const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const c=canvas.getContext('2d')!;c.drawImage(image,0,0);
    const data=c.getImageData(Math.floor(canvas.width*.5),Math.floor(canvas.height*.3),1,Math.floor(canvas.height*.4)).data;
    let last=0,changes=0;
    for(let i=8;i<data.length;i+=8){const d=(data[i]-data[i-8])*.21+(data[i+1]-data[i-7])*.72+(data[i+2]-data[i-6])*.07;if(Math.abs(d)>1){const sign=Math.sign(d);if(last&&sign!==last)changes++;last=sign;}}
    return changes;
  },png.toString('base64'));
}
test.beforeEach(async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/');await expect(page.getByRole('heading',{name:'我们的太阳系'})).toBeVisible();await settle(page);
  (page as Page & {appErrors:string[]}).appErrors=errors;
});
test.afterEach(async({page})=>{expect((page as Page & {appErrors:string[]}).appErrors).toEqual([]);});

test('A: panorama, camera presets, time controls and Jupiter round trip',async({page})=>{
  await expect(page).toHaveTitle(/Solar Odyssey/);await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.getByRole('button',{name:'俯视',exact:true}).click();await settle(page);
  expect((await diagnostic(page)).camera[1]).toBeGreaterThan(250);
  await page.getByRole('button',{name:'侧视',exact:true}).click();await settle(page);
  expect((await diagnostic(page)).camera[1]).toBeLessThan(20);
  await page.getByRole('button',{name:'自由视角',exact:true}).click();await settle(page);
  await page.getByLabel('时间流速').fill('1.7');await expect(page.locator('.speed-control output')).toContainText('50');
  await page.getByRole('button',{name:'暂停模拟',exact:true}).click();await expect(page.getByRole('button',{name:'恢复模拟',exact:true})).toBeVisible();await page.waitForTimeout(600);const date=await page.getByTestId('simulation-date').innerText(),days=(await diagnostic(page)).days;await page.waitForTimeout(650);await expect(page.getByTestId('simulation-date')).toHaveText(date);expect((await diagnostic(page)).days).toBe(days);
  await capture(page,'qa-overview');
  await page.getByTestId('nav-jupiter').click();await settle(page);await expect(page.locator('.info-heading h1')).toHaveText('木星');
  expect(await canvasColorFraction(page)).toBeGreaterThan(.08);
  expect(await cloudBandChanges(page)).toBeGreaterThan(4);
  await capture(page,'qa-jupiter');
  await page.getByRole('button',{name:'返回太阳系全景',exact:true}).click();await settle(page);await expect(page.locator('.info-heading h1')).toHaveText('我们的太阳系');
});
test('B: Earth atmosphere and night lights, Saturn rings and orbit drag',async({page})=>{
  await page.getByRole('button',{name:'暂停模拟',exact:true}).click();
  await page.getByTestId('nav-earth').click();await settle(page);expect(await canvasColorFraction(page)).toBeGreaterThan(.05);await capture(page,'qa-earth');
  const box=(await page.locator('canvas').boundingBox())!;const start=await diagnostic(page);
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.45);await page.mouse.down();await page.mouse.move(box.x+box.width*.87,box.y+box.height*.5,{steps:20});await page.mouse.up();await page.waitForTimeout(500);
  expect((await diagnostic(page)).camera).not.toEqual(start.camera);await capture(page,'qa-earth-rotated');
  await page.getByRole('button',{name:'观察夜间灯光',exact:true}).click();await settle(page);await capture(page,'qa-earth-night');
  await page.getByTestId('nav-saturn').click();await settle(page);await expect(page.locator('.info-heading h1')).toHaveText('土星');expect(await canvasColorFraction(page)).toBeGreaterThan(.04);await capture(page,'qa-saturn');
  await page.getByRole('button',{name:'俯视',exact:true}).click();await settle(page);await capture(page,'qa-saturn-top');
});
test('C: animated Sun, seven selectable layers, energy, transparency and exit',async({page})=>{
  await page.getByTestId('nav-sun').click();await settle(page);expect(await canvasColorFraction(page)).toBeGreaterThan(.13);await capture(page,'qa-sun');
  await page.getByRole('button',{name:/模拟一次太阳耀斑/}).click();await page.waitForTimeout(300);
  await page.getByTestId('enter-interior').click();await settle(page);
  await page.getByTestId('show-all-layers').click();
  for(const [id,name] of Object.entries({core:'核心区',radiative:'辐射区',convective:'对流区',photosphere:'光球层',chromosphere:'色球层',transition:'过渡区',corona:'日冕'})){
    await page.getByTestId('layer-'+id).click();await expect(page.locator('.layer-detail h2')).toHaveText(name);await expect(page.locator('.layer-detail .source-link')).toHaveAttribute('href',/^https:\/\//);
  }
  await page.getByTestId('layer-core').click();await expect(page.locator('.layer-detail')).toContainText('核聚变');
  await page.getByTestId('energy-toggle').click();await expect(page.getByTestId('energy-toggle')).toHaveAttribute('aria-pressed','true');await page.waitForTimeout(700);await capture(page,'qa-interior-energy');
  await page.getByTestId('layer-convective').click();await expect(page.locator('.layer-detail')).toContainText('上升');
  await page.getByRole('button',{name:'分层展开',exact:true}).click();await expect(page.getByTestId('energy-toggle')).toHaveAttribute('aria-pressed','false');await page.waitForTimeout(1200);
  await page.getByRole('slider',{name:'外层透明度',exact:true}).fill('0.3');await capture(page,'qa-interior-exploded');
  await page.getByRole('button',{name:'返回太阳外部',exact:true}).click();await settle(page);await expect(page.getByTestId('enter-interior')).toBeVisible();
  await page.getByRole('button',{name:'返回太阳系全景',exact:true}).click();await settle(page);await expect(page.locator('.info-heading h1')).toHaveText('我们的太阳系');
});
test('D: repeated navigation, true scale, quality and bounded GPU resources',async({page})=>{
  await page.getByRole('button',{name:'暂停模拟',exact:true}).click();
  let baseline=await diagnostic(page);
  for(let cycle=0;cycle<3;cycle++){
    for(const id of ['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune','sun']){await page.getByTestId('nav-'+id).click();await page.waitForTimeout(180);}
    await page.getByTestId('enter-interior').click();await page.waitForTimeout(200);await page.getByRole('button',{name:'返回太阳系全景',exact:true}).click();await settle(page);
    console.log('GPU CYCLE',cycle,JSON.stringify(await diagnostic(page)));
    if(cycle===1)baseline=await diagnostic(page);
  }
  const after=await diagnostic(page);expect(after.geometries).toBeLessThanOrEqual(baseline.geometries+3);expect(after.textures).toBeLessThanOrEqual(baseline.textures+1);
  console.log('GPU RESOURCES',JSON.stringify({baseline,after}));
  await page.getByLabel('场景比例',{exact:true}).selectOption('real');await settle(page);await expect(page.locator('.model-notice')).toContainText('同一物理比例');
  await page.getByTestId('nav-earth').click();await settle(page);expect(await canvasColorFraction(page)).toBeGreaterThan(.05);
  await page.getByRole('button',{name:'画质与显示设置',exact:true}).click();await page.getByRole('button',{name:/流畅模式/}).click();await page.getByRole('button',{name:'继续探索',exact:true}).click();await settle(page);
  await page.getByRole('button',{name:'操作帮助',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('E: mobile starts with an unobstructed scene and supports navigation/info',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.reload();await settle(page);
  await expect(page.getByRole('button',{name:'展开科普信息',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button',{name:'切换天体导航',exact:true}).click();await page.getByTestId('nav-sun').click();await settle(page);
  await page.getByRole('button',{name:'展开科普信息',exact:true}).click();await expect(page.getByTestId('enter-interior')).toBeVisible();await page.getByTestId('enter-interior').click();await settle(page);await capture(page,'qa-mobile');
  await expect(page.getByTestId('layer-core')).toBeVisible();
});
test('F: remaining rocky and ice planets render distinct textured closeups',async({page})=>{
  await page.getByRole('button',{name:'暂停模拟',exact:true}).click();
  for(const [id,name] of Object.entries({mercury:'水星',venus:'金星',mars:'火星',uranus:'天王星',neptune:'海王星'})){
    await page.getByTestId('nav-'+id).click();await settle(page);await expect(page.locator('.info-heading h1')).toHaveText(name);
    const colored=await canvasColorFraction(page,id!=='mercury');expect(colored).toBeGreaterThan(id==='mercury'?.08:.03);await capture(page,'qa-'+id);
  }
});
