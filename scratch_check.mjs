import { SAMPLE_SPEC_7 as S } from "./src/samplePaper7.js";
const n = 200;
const helpers = { n, dt: 1, T: 1, t: Array.from({length:n},(_,i)=>i),
  noise: Array.from({length:n},()=>0), clamp:(v,a,b)=>Math.max(a,Math.min(b,v)), step:()=>0 };
function runDemo(demo, label){
  if (!demo?.computeJs) return;
  const paramsDefaults = {};
  (demo.params||[]).forEach(p=>paramsDefaults[p.key]=p.def);
  try {
    const fn = new Function("params","helpers", demo.computeJs);
    const r = fn(paramsDefaults, helpers);
    if (!r || !r.series || !r.series.length) { console.log("FAIL(no series):", label); return; }
    for (const s of r.series){
      const d = s.data||[];
      const vary = new Set(d.map(v=>Math.round(v*1e6))).size;
      const bad = d.some(v=>!Number.isFinite(v));
      console.log((bad?"NaN!":vary<=1?"FLAT":"ok  "), label, "|", s.label, "| pts", d.length, "vary", vary, "range", d.length?Math.min(...d).toFixed(2)+".."+Math.max(...d).toFixed(2):"-");
    }
    // insight
    if (demo.insightJs){ const inf=new Function("params","result","helpers",demo.insightJs); const txt=inf(paramsDefaults,r,helpers); if(typeof txt!=="string") console.log("INSIGHT-FAIL:",label); }
  } catch(e){ console.log("ERROR:", label, "->", e.message); }
}
S.foundations.forEach((f,i)=>runDemo(f.demo,"foundation#"+i+" "+f.title));
S.explorables.forEach((x,i)=>runDemo(x.demo,"explorable#"+i+" "+x.title));
console.log("---sanity: figures/panels count---");
console.log("conceptFigures", S.conceptFigures.length, "resultFigures", S.resultFigures.length,
  "panels", S.resultFigures.map(f=>f.panels.length));
