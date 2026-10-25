import fs from 'fs';
const a=JSON.parse(fs.readFileSync(process.argv[2])),b=JSON.parse(fs.readFileSync(process.argv[3]));
let diff=[];for(const k of Object.keys(a)){const x=a[k],y=b[k];if(!y){diff.push([k,'missing']);continue}
 if(x.fail!==y.fail||x.err!==y.err){diff.push([k,'fail/err',JSON.stringify(y).slice(0,80)]);continue}
 if(x.img!==y.img||x.txt!==y.txt||x.n!==y.n)diff.push([k,x.img!==y.img?'img':'',x.txt!==y.txt?'txt':'',x.n!==y.n?'n':'']);}
console.log('total',Object.keys(a).length,'diff',diff.length);fs.writeFileSync('diff.json',JSON.stringify(diff));console.log(diff.slice(0,15).map(d=>d.join(' ')).join('\n'));
