const fs = require('node:fs'), path = require('node:path'), puppeteer = require('puppeteer');
const output = path.resolve(__dirname,'../../docs/reviews/2026-09-12/ui');
const portals = JSON.parse(fs.readFileSync(path.join(output,'portal-smoke.json'),'utf8')).map(item=>item.portal);
const image = name => 'data:image/png;base64,' + fs.readFileSync(path.join(output,name)).toString('base64');
const styles = `body{margin:0;padding:24px;font:14px system-ui;background:#eaf0f6;color:#142c49}h1{font-size:25px}p{color:#52647a}.grid{display:grid;gap:16px}figure{margin:0;background:white;border:1px solid #cbd5e1;border-radius:12px;overflow:hidden}figcaption{padding:12px;font-weight:650;text-transform:capitalize}img{display:block;width:100%;height:auto}`;
async function main(){const browser=await puppeteer.launch({headless:true});try{const page=await browser.newPage();for(const mode of ['desktop','mobile']){
 const width=mode==='mobile'?320:480; const cols=mode==='mobile'?4:3;
 await page.setViewport({width:width*cols+16*(cols-1)+48,height:1000,deviceScaleFactor:1});
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><title>StatCo UI · ${mode}</title><style>${styles}.grid{grid-template-columns:repeat(${cols},1fr)}</style><h1>StatCo workspace upgrade · ${mode}</h1><p>Representative portal screens. Synthetic preview data only.</p><div class="grid">${portals.map(portal=>`<figure><figcaption>${portal}</figcaption><img alt="${portal} ${mode} preview" src="${image(`${portal}-${mode}.png`)}"></figure>`).join('')}</div></html>`;
 await page.setContent(html,{waitUntil:'load'});await page.screenshot({path:path.join(output,`overview-${mode}.png`),fullPage:true});
}
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>StatCo workspace UI review</title><style>${styles}.grid{grid-template-columns:minmax(0,3fr) minmax(0,1fr)}section{margin:24px 0}a{color:#14624f}@media(max-width:700px){.grid{grid-template-columns:1fr}}</style><h1>StatCo workspace UI review</h1><p>All 13 portal shells · Desktop and mobile · Synthetic data only. These screenshots are representative views, not a certification of every workflow.</p>${portals.map(portal=>`<section><h2>${portal}</h2><div class="grid"><figure><figcaption>Desktop</figcaption><img loading="lazy" alt="${portal} desktop" src="${portal}-desktop.png"></figure><figure><figcaption>Mobile</figcaption><img loading="lazy" alt="${portal} mobile" src="${portal}-mobile.png"></figure></div></section>`).join('')}</html>`;
 fs.writeFileSync(path.join(output,'index.html'),html);console.log('Created portal review gallery and overview screenshots.');
}finally{await browser.close();}}
main().catch(error=>{console.error(error);process.exitCode=1;});
