// Visible only in the independent QA tab. GPU durations are asynchronous and
// separate from JS submission; no gl.finish(), sleeps, or misleading idle RAF fps.
export function createFrameProfiler(renderer,enabled=false){
 if(!enabled)return {begin(){},end(){},poll(){},input(){},resetContext(){}};
 let gl=renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'),suspended=false;const pending=[],samples=[];
 const panel=document.createElement('output');panel.id='render-check';panel.style.cssText='position:fixed;left:12px;bottom:12px;z-index:50;max-width:380px;color:#edf3ee;background:#122019dc;padding:8px 12px;font:12px/1.6 monospace;pointer-events:none;white-space:pre-line';document.body.append(panel);
 const reset=document.createElement('button');reset.id='render-check-reset';reset.textContent='重置测量';reset.style.cssText='position:fixed;left:12px;top:12px;z-index:50;min-height:30px;padding:4px 8px;font:12px monospace';document.body.append(reset);
 let query=null,start=0,eventTime=null,phase='',previous=null,interval=0,lastDisplay=0,drawCount=0;
 reset.addEventListener('click',()=>{samples.length=0;previous=null;eventTime=null;panel.textContent='已清除首次编译样本，请操作当前场景';});
 function resetContext(lost=false){
  // Query handles and extension objects belong to the old GL generation.
  // Do not read, end or delete them after context loss.
  pending.length=0;query=null;samples.length=0;previous=null;eventTime=null;interval=0;lastDisplay=0;start=0;drawCount=0;suspended=lost;
  if(lost){ext=null;panel.textContent='图形上下文暂时中断，测量已暂停';return;}
  gl=renderer.getContext();ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');panel.textContent='图形上下文已恢复，请重新操作测量';
 }
 function input(time){if(suspended)return;if(!eventTime&&Number.isFinite(time))eventTime=time;}
 function begin(mode){if(suspended)return;const now=performance.now();if(mode!==phase){samples.length=0;previous=null;phase=mode;}interval=previous?now-previous:0;previous=now;start=now;if(ext&&pending.length<8){query=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,query);}}
 function end(){if(suspended)return;const now=performance.now(),sample={cpu:now-start,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,input:eventTime?now-eventTime:null,interval};eventTime=null;drawCount++;
  samples.push(sample);if(samples.length>120)samples.shift();if(query){gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push({query,sample});query=null;}poll();}
 function poll(){if(suspended)return;while(pending.length&&gl.getQueryParameter(pending[0].query,gl.QUERY_RESULT_AVAILABLE)){const p=pending.shift();if(!gl.getParameter(ext.GPU_DISJOINT_EXT))p.sample.gpu=gl.getQueryParameter(p.query,gl.QUERY_RESULT)/1e6;gl.deleteQuery(p.query);}
  if(!samples.length||performance.now()-lastDisplay<200)return;lastDisplay=performance.now();
  const avg=key=>{const values=samples.map(s=>s[key]).filter(Number.isFinite);return values.length?(values.reduce((a,b)=>a+b,0)/values.length).toFixed(1):'—';};
  const percentile=(key,p)=>{const v=samples.map(s=>s[key]).filter(Number.isFinite).sort((a,b)=>a-b);return v.length?v[Math.min(v.length-1,Math.ceil(v.length*p)-1)].toFixed(1):'—';};
  panel.textContent=`检查视角：${phase} · ${samples.length} 帧\nCPU 提交 ${avg('cpu')} ms · GPU ${avg('gpu')} ms\nCPU P50 / P95：${percentile('cpu',.5)} / ${percentile('cpu',.95)} ms\nGPU P50 / P95：${percentile('gpu',.5)} / ${percentile('gpu',.95)} ms\n绘制 ${avg('calls')} 次 · 三角形 ${avg('triangles')}\n输入至提交 ${avg('input')} ms`;}
 return {begin,end,poll,input,resetContext};
}
