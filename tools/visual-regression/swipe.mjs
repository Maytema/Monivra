// Swipe gesture regression test: performs the same touch swipes on two builds and compares screenshots.
// Usage: node swipe.mjs <urlA> <urlB>
import { chromium } from 'playwright';
import crypto from 'crypto';
const sha=(b)=>crypto.createHash('sha1').update(b).digest('hex').slice(0,10);
async function run(url){
  const b=await chromium.launch();const out=[];
  const ctx=await b.newContext({viewport:{width:360,height:800},hasTouch:true,isMobile:true});const p=await ctx.newPage();
  await p.addInitScript(()=>{const base=new Date('2026-10-15T12:00:00').getTime();const real=Date.now();const RD=Date;class FD extends RD{constructor(...a){if(a.length)super(...a);else super(base+(RD.now()-real))} static now(){return base+(RD.now()-real)}};window.Date=FD;});
  await p.goto(url);await p.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'});await p.waitForTimeout(300);
  const cdp=await ctx.newCDPSession(p);
  const touch=async(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
  const swipe=async(x0,x1,y,mid)=>{await touch('touchStart',x0,y);const n=8;for(let i=1;i<=n;i++){await touch('touchMove',x0+(x1-x0)*i/n,y);if(mid&&i===5){await p.waitForTimeout(80);out.push('mid:'+sha(await p.screenshot()));}}await touch('touchEnd');await p.waitForTimeout(700);out.push('end:'+sha(await p.screenshot())+' '+sha(await p.evaluate(()=>document.body.innerText)));};
  const tab=async(i)=>{await p.evaluate((i)=>{const els=[...document.querySelectorAll('.navbar [data-action]')];els[i].click()},i);await p.waitForTimeout(200);};
  for(const t of [0,1,2,3]){await tab(t);for(const [a,b2] of [[300,90],[60,300],[300,90],[300,90]])await swipe(a,b2,400,true);}
  await b.close();return out;
}
const a=await run(process.argv[2]),b=await run(process.argv[3]);
let bad=0;a.forEach((x,i)=>{if(x!==b[i]){bad++;console.log('DIFF',i,x,b[i]);}});console.log("unique",new Set(a).size);console.log("steps",a.length,'diff',bad);
