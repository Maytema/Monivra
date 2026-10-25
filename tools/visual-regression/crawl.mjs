// Visual regression crawler.
//   record mode: clicks through the UI (breadth-first) and stores a screenshot hash per reachable screen.
//   replay mode: opens exactly the recorded click paths again and stores the new hashes.
// Usage: node crawl.mjs record|replay <url> <result.json> [recorded-result.json]
// Compare two result files with: node compare.mjs <a.json> <b.json>
import { chromium } from 'playwright';
import fs from 'fs'; import crypto from 'crypto';
const [,, mode, url, outFile, pathsFile] = process.argv;
const SKIP=/delete|remove|reset|clear|erase|export|download|print|import|photo|camera|backup|restore|share|rate us|feedback/i;
const MAXD=+(process.env.MAXD||3), CAP=[999,+(process.env.C1||60),+(process.env.C2||14),+(process.env.C3||5)];
const b=await chromium.launch();
const sha=(x)=>crypto.createHash('sha1').update(x).digest('hex').slice(0,12);
async function fresh(){
  const ctx=await b.newContext({viewport:{width:360,height:800},deviceScaleFactor:1,hasTouch:true,isMobile:true});
  const p=await ctx.newPage();
  await p.addInitScript(()=>{const F=Date.now;const base=new Date('2026-10-15T12:00:00').getTime();const real=F.call(Date);const RD=Date;
    class FD extends RD{constructor(...a){if(a.length)super(...a);else super(base+(RD.now()-real))} static now(){return base+(RD.now()-real)}};window.Date=FD;});
  await p.addStyleTag({content:''}).catch(()=>{});
  await p.goto(url);
  await p.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'});
  await p.waitForTimeout(150);
  return {ctx,p};
}
const targetsFn=()=>{const out=[];for(const el of document.querySelectorAll('[data-action]')){const r=el.getBoundingClientRect();if(r.width<2||r.height<2)continue;if(r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth)continue;
  const cx=Math.min(Math.max(r.left+r.width/2,1),innerWidth-1),cy=Math.min(Math.max(r.top+r.height/2,1),innerHeight-1);const t=document.elementFromPoint(cx,cy);if(!(t===el||el.contains(t)))continue;
  out.push((el.getAttribute('aria-label')||el.innerText||'').trim().replace(/\s+/g,' ').slice(0,40));}return out;};
const clickFn=(i)=>{const els=[];for(const el of document.querySelectorAll('[data-action]')){const r=el.getBoundingClientRect();if(r.width<2||r.height<2)continue;if(r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth)continue;
  const cx=Math.min(Math.max(r.left+r.width/2,1),innerWidth-1),cy=Math.min(Math.max(r.top+r.height/2,1),innerHeight-1);const t=document.elementFromPoint(cx,cy);if(!(t===el||el.contains(t)))continue;els.push(el);}
  if(!els[i])return false;els[i].click();return true;};
async function walk(p,path){for(const i of path){const ok=await p.evaluate(clickFn,i);if(!ok)return false;await p.waitForTimeout(60);}return true;}
async function snap(p){const png=await p.screenshot();const txt=await p.evaluate(()=>document.body.innerText);return {img:sha(png),txt:sha(txt),png};}
const results={};const queue=[];
if(mode==='record')queue.push([]);else for(const k of (()=>{const j=JSON.parse(fs.readFileSync(pathsFile));return Array.isArray(j)?j:Object.keys(j)})())queue.push(k.split(',').filter(x=>x!=='').map(Number));
const shotDir=outFile+'.shots';fs.mkdirSync(shotDir,{recursive:true});
let active=0;
async function worker(){
  const {ctx,p}=await fresh();let cur=[];
  const reset=async()=>{await p.evaluate(()=>{localStorage.clear();sessionStorage.clear()});await p.reload();await p.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'});await p.waitForTimeout(100);cur=[];};
  while(queue.length||active){
    const path=queue.shift();if(!path){await new Promise(r=>setTimeout(r,50));continue;}
    active++;
    try{
      await reset();
      const ok=await walk(p,path);const key=path.join(',');
      if(!ok){results[key]={fail:true};active--;continue;}
      const s=await snap(p);const tg=await p.evaluate(targetsFn);
      results[key]={img:s.img,txt:s.txt,n:tg.length,labels:tg};
      fs.writeFileSync(`${shotDir}/${key||'root'}.png`,s.png);
      if(mode==='record'&&path.length<MAXD){const cap=CAP[path.length+1];let c=0;
        for(let i=0;i<tg.length&&c<cap;i++){if(SKIP.test(tg[i]))continue;c++;queue.push([...path,i]);}}
    }catch(e){results[path.join(',')]={err:String(e).slice(0,100)};}
    active--;
  }
  await ctx.close();
}
await Promise.all(Array.from({length:+(process.env.W||5)},worker));
fs.writeFileSync(outFile,JSON.stringify(results));
console.log('states',Object.keys(results).length);
await b.close();
