import * as THREE from './vendor/three.module.js';
import {drawStudyDiagram} from './book-diagrams.js?v=20261007-overnight1';

// Await the embedded font before exporting the synchronous measuring/painting
// API: Canvas pagination and printed pages must use the same glyph metrics.
const SERIF='"Memory Room Serif","Memory Room Math","Noto Serif SC","SimSun",serif';
let fontStatus='system-fallback';
if(typeof FontFace!=='undefined'&&typeof document!=='undefined'&&document.fonts){
 const fonts=[['Memory Room Serif','memory-room-serif.woff2','200 900'],['Memory Room Math','memory-room-math.woff2','100 900']];
 // A rejected font must not expose pagination while its sibling can still
 // register a new face and change Canvas glyph widths. Keep each 12s deadline.
 const results=await Promise.allSettled(fonts.map(async([family,file,weight])=>{
  const face=new FontFace(family,`url("${new URL('./assets/fonts/'+file,import.meta.url).href}")`,{weight,style:'normal',display:'block'});
  let timeout;try{await Promise.race([face.load(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Font loading timeout')),12000);})]);document.fonts.add(face);}finally{clearTimeout(timeout);}
 }));
 const loaded=fonts.filter((_,i)=>results[i].status==='fulfilled').map(([family])=>family);
 const failed=fonts.flatMap(([family],i)=>results[i].status==='rejected'?[{family,reason:String(results[i].reason?.message||results[i].reason)}]:[]);
 fontStatus=failed.length===0?'embedded-ready':loaded.length?'embedded-partial':'system-fallback';
 if(failed.length)console.warn(loaded.length?'Some embedded book fonts are unavailable; loaded faces remain in use and missing families use fallback.':'All embedded book fonts are unavailable; using system fallback.',{loaded,failed});
}
const W=1536,H=2176,PAPER='#f8f5ec',INK='#292d27',MUTED='#565b50',ACCENT='#756047';
const BODY={size:60,line:100,left:190,right:1346,top:282,bottom:1900,paragraphGap:29};
const NO_START=new Set(Array.from('，。！？；：、）》」』】〕〉〗〙〛’”％‰℃°…—,.!?;:%)]}'));
const NO_END=new Set(Array.from('（《「『【〔〈〖〘〚‘“([{'));
const font=(size,weight=400)=>`${weight} ${size}px ${SERIF}`;
const measure=(c,text)=>c.measureText(text).width;

// Pixel density is isotropic: one canvas pixel has the same physical width
// and height on the leaf. Width changes cause new line breaking, not scaling.
function pageLayout(aspect=null){
 if(aspect!==null&&(!Number.isFinite(aspect)||aspect<=0))throw new RangeError('Page aspect must be positive.');
 const width=aspect===null?W:Math.round(H*aspect);
 if(width<320||width>8192)throw new RangeError('Unsupported page canvas width: '+width);
 const left=Math.max(64,Math.round(width*160/W));
 return {width,height:H,left,right:width-left,aspect:width/H};
}
function memoirPage(page){return page.type?.startsWith('memoir-')||page.type==='chapter-opener';}
function fittedLine(c,draw,text,x,y,size,width,options={}){
 let actual=size;c.font=font(actual,options.weight||400);
 while(actual>18&&measure(c,String(text||''))>width){actual--;c.font=font(actual,options.weight||400);}
 return draw(text,x,y,actual,options);
}

// Strict Chinese line edges. Source text is only partitioned, never edited.
function breakLines(c,text,width,firstIndent=0,{keepMath=false}={}){
 const chars=Array.from(text),rows=[];let start=0;
 // Short inline expressions form one reading unit. Keep their source text
 // unchanged, and fall back to character wrapping if a whole unit is wider
 // than a full line. Memoir and other prose retain their original rule.
 const mathSpans=keepMath?[...text.matchAll(/[A-Za-z0-9Δθπ√²³⁴⁵⁶⁷⁸⁹⁰()+±−×÷=<>≤≥≠./:\-]+/gu)]
  .filter(m=>/[=<>≤≥≠+±−×÷/²³⁴⁵⁶⁷⁸⁹⁰Δθπ√]/u.test(m[0]))
  .map(m=>({start:Array.from(text.slice(0,m.index)).length,end:Array.from(text.slice(0,m.index+m[0].length)).length,text:m[0]})):[];
 while(start<chars.length){
  const indent=rows.length===0?firstIndent:0,available=width-indent;
  let end=start,line='';
  while(end<chars.length){const next=line+chars[end];if(line&&measure(c,next)>available)break;line=next;end++;}
  if(end<chars.length){
   let safe=end;
   while(safe>start+1&&(NO_START.has(chars[safe])||NO_END.has(chars[safe-1])||(chars[safe]===chars[safe-1]&&'—…'.includes(chars[safe]))))safe--;
   if(/[A-Za-z0-9]/.test(chars[safe]||'')&&/[A-Za-z0-9]/.test(chars[safe-1]||'')){
    let word=safe;while(word>start&&/[A-Za-z0-9.'’_\-]/.test(chars[word-1]))word--;if(word>start)safe=word;
   }
   if(keepMath){
    const expression=mathSpans.find(m=>m.start<safe&&safe<m.end);
    if(expression&&expression.start>start&&measure(c,expression.text)<=available){
     safe=expression.start;
     while(safe>start+1&&NO_END.has(chars[safe-1]))safe--;
    }
   }
   end=safe;
  }
  if(end<=start)end=start+1;
  rows.push({text:chars.slice(start,end).join(''),indent,last:end===chars.length});start=end;
 }
 return rows;
}
const wrap=(c,text,width)=>breakLines(c,String(text||''),width).map(row=>row.text);
const wrapStudyText=(c,text,width)=>breakLines(c,String(text||''),width,0,{keepMath:true}).map(row=>row.text);
function wrapStudyHeading(c,text,width){
 const rows=wrap(c,text,width);
 if(rows.length!==2||Array.from(rows[1]).length!==1)return rows;
 // Prefer the existing semantic separator over a solitary final character.
 const colon=String(text).indexOf('：');
 if(colon>=0){const a=text.slice(0,colon+1),b=text.slice(colon+1);if(b&&measure(c,a)<=width&&measure(c,b)<=width)return [a,b];}
 const previous=Array.from(rows[0]);
 if(previous.length>2){const tail=previous.pop()+rows[1];if(measure(c,tail)<=width)return [previous.join(''),tail];}
 return rows;
}

// Keep very short memoir paragraph tails as a readable phrase. Rebalance
// only the last two lines; page counts, type size and source text stay intact.
function memoirParagraphLines(c,text,width,firstIndent){
 const rows=breakLines(c,text,width,firstIndent);
 if(rows.length<2||measure(c,rows.at(-1).text)>=BODY.size*4.2||typeof Intl.Segmenter!=='function')return rows;
 const previous=rows.at(-2),tail=rows.at(-1),joined=previous.text+tail.text;
 const chars=Array.from(joined),oldCut=Array.from(previous.text).length,available=width-previous.indent;
 const boundaries=[...new Intl.Segmenter('zh',{granularity:'word'}).segment(joined)].map(s=>Array.from(joined.slice(0,s.index)).length);
 let best=null;
 for(const cut of boundaries){
  if(cut<=0||cut>=oldCut||NO_END.has(chars[cut-1])||NO_START.has(chars[cut])||chars[cut-1]===chars[cut])continue;
  const a=chars.slice(0,cut).join(''),b=chars.slice(cut).join(''),aw=measure(c,a),bw=measure(c,b);
  if(aw<available*.50||aw>available||bw<BODY.size*5||bw>width*.62)continue;
  const score=Math.abs(bw-BODY.size*6);
  if(!best||score<best.score)best={a,b,score};
 }
 if(best){previous.text=best.a;previous.ragged=true;tail.text=best.b;}
 return rows;
}

export function paginateMemoir(data){
 const c=document.createElement('canvas').getContext('2d');c.font=font(BODY.size,500);
 const chapter=data.chapters[0],title=data.title||'记忆房间';
 const paragraphs=chapter.sections.flatMap(section=>section.paragraphs.map(p=>typeof p==='string'?p:p.text));
 const epigraphCount=paragraphs.length>1&&/^——/.test(paragraphs[1])?2:0;
 const chapterName=chapter.title.replace(/^第[一二三四五六七八九十\d]+章[\s　]*/, '');
 const chapterLabel=chapter.title.match(/^第[一二三四五六七八九十\d]+章/)?.[0]||'';
 const pages=[
  {type:'memoir-title',title,subtitle:data.subtitle||'开源示例读本',sourceSpans:[]},
  {type:'memoir-blank',sourceSpans:[]},
  {type:'chapter-opener',title:chapterName,chapterLabel,epigraph:paragraphs.slice(0,epigraphCount),sourceSpans:paragraphs.slice(0,epigraphCount).map((text,paragraph)=>({paragraph,text}))},
 ];
 let rows=[],y=BODY.top,sourceSpans=[];
 const flush=()=>{if(rows.length){pages.push({type:'memoir-prose',heading:chapterName,rows,sourceSpans,folio:pages.length-1});rows=[];sourceSpans=[];y=BODY.top;}};
 for(let paragraph=epigraphCount;paragraph<paragraphs.length;paragraph++){
  const lines=memoirParagraphLines(c,paragraphs[paragraph],BODY.right-BODY.left,BODY.size*2);let offset=0;
  while(offset<lines.length){
   let capacity=Math.floor((BODY.bottom-y)/BODY.line)+1;
   if(capacity<=0||(offset===0&&lines.length>1&&capacity<2)){flush();capacity=Math.floor((BODY.bottom-y)/BODY.line)+1;}
   const remaining=lines.length-offset;let take=Math.min(capacity,remaining);
   if(remaining>take&&remaining-take===1&&take>2)take--;
   if(take===1&&remaining>1&&rows.length){flush();continue;}
   for(let j=0;j<take;j++){const row=lines[offset+j];rows.push({...row,y,paragraph});sourceSpans.push({paragraph,text:row.text});y+=BODY.line;}
   offset+=take;if(offset<lines.length)flush();
  }
  y+=BODY.paragraphGap;
 }
 flush();if(pages.length%2)pages.push({type:'memoir-end',sourceSpans:[]});
 return {pages,toc:[{label:'扉页',page:0},{label:chapter.title,page:2},{label:'正文',page:3}],chapter};
}

function painter(c,audit){
 return function draw(value,x,y,size=60,{weight=400,color=INK,align='left',tracking=0,justify=0,role='text'}={}){
  value=String(value??'');c.font=font(size,weight);c.fillStyle=color;c.textAlign='left';
  const tokens=value.match(/[A-Za-z0-9.'’_\-]+|./gu)||[],base=measure(c,value);
  const extra=justify&&tokens.length>1?Math.max(0,justify-base)/(tokens.length-1):tracking;
  const width=base+extra*Math.max(0,tokens.length-1),start=align==='center'?x-width/2:align==='right'?x-width:x;
  if(extra){let left=start;for(const token of tokens){c.fillText(token,left,y);left+=measure(c,token)+extra;}}else c.fillText(value,start,y);
  const m=c.measureText(value),top=y-(m.actualBoundingBoxAscent||size),bottom=y+(m.actualBoundingBoxDescent||size*.18);
  const t=c.getTransform?.()||{a:1,b:0,c:0,d:1,e:0,f:0},xy=(px,py)=>({x:t.a*px+t.c*py+t.e,y:t.b*px+t.d*py+t.f});
  const corners=[xy(start,top),xy(start+width,top),xy(start,bottom),xy(start+width,bottom)],basePoint=xy(start,y);
  audit.push({role,text:value,x:basePoint.x,y:basePoint.y,width:width*Math.hypot(t.a,t.b),size:size*Math.hypot(t.a,t.b),left:Math.min(...corners.map(p=>p.x)),right:Math.max(...corners.map(p=>p.x)),top:Math.min(...corners.map(p=>p.y)),bottom:Math.max(...corners.map(p=>p.y))});
  return width;
 };
}
function line(c,x1,y,x2,color='#c7baa5',width=1){c.beginPath();c.moveTo(x1,y);c.lineTo(x2,y);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function runningHead(draw,index,title,folio=index+1){
 draw(index%2===0?title:'记忆房间',index%2===0?BODY.right:BODY.left,139,29,{color:MUTED,align:index%2===0?'right':'left',role:'running-head'});
 draw(String(folio),W/2,2041,33,{color:MUTED,align:'center',role:'folio'});
}
function teachingLayout(c,page,size,width=BODY.right-BODY.left){
 const lineHeight=size*1.60,items=[];let y=560;
 for(const block of page.blocks||[]){
  items.push({kind:'label',text:block.label,y});y+=71;c.font=font(size);
  for(const text of wrap(c,block.text,width)){items.push({kind:'body',text,y});y+=lineHeight;}y+=62;
 }
 for(const [label,text,kind] of [['练习',page.exercise,'exercise'],['答案与思路',page.answer,'answer']]){
  if(!text)continue;items.push({kind:'rule',y:y-22});items.push({kind:'label',text:label,y:y+37,section:kind});y+=110;c.font=font(size);
  for(const row of wrap(c,text,width)){items.push({kind:'body',text:row,y,section:kind});y+=lineHeight;}y+=40;
 }
 return {items,bottom:y-40,size};
}
// Editorial study pages have a fixed, readable type size. Overflow continues
// onto a real next page instead of shrinking a whole chapter until it blurs.
const studyPaginationCache=new WeakMap();
export function paginateStudyBook(sourcePages,{aspect=null}={}){
 const layout=pageLayout(aspect),key=layout.width;
 let cache=studyPaginationCache.get(sourcePages);if(!cache){cache=new Map();studyPaginationCache.set(sourcePages,cache);}
 if(cache.has(key))return cache.get(key);
 const c=document.createElement('canvas').getContext('2d'),result=[];
 const size=60,leading=96,{left,right}=layout,top=485,bottom=1905;
 for(const [section,source]of sourcePages.entries()){
  c.font=font(73,600);const sectionTop=top+Math.max(0,wrapStudyHeading(c,source.heading||'',right-left).length-1)*80;
  c.font=font(52,600);const continuationTop=390+Math.max(0,wrapStudyHeading(c,source.heading||'',right-left).length-1)*60;
  let rows=[],y=sectionTop,part=0;
  const flush=()=>{if(!rows.length)return;result.push({type:'study',heading:source.heading,section,continued:part++>0,kicker:source.kicker||'学习页 · 重新编写',rows,layoutWidth:layout.width});rows=[];y=continuationTop;};
  const blocks=[...(source.blocks||[]).map(b=>({...b,role:'knowledge'})),...(source.exercise?[{label:'练习',text:source.exercise,role:'exercise'}]:[]),...(source.answer?[{label:'解析',text:source.answer,role:'answer'}]:[])];
  for(const block of blocks){
   c.font=font(size,500);const lines=wrapStudyText(c,block.text,right-left);
   if(y+70+Math.min(lines.length,2)*leading>bottom)flush();
   rows.push({role:'label',text:block.label,y:y+4,section:block.role});y+=71;
   for(let lineIndex=0;lineIndex<lines.length;lineIndex++){
    const remaining=lines.length-lineIndex,capacity=Math.floor((bottom-y)/leading)+1;
    // Keep the final two lines together instead of producing a one-line tail page.
    if(y>bottom||(remaining===2&&capacity===1)){flush();rows.push({role:'label',text:block.label+' · 续',y:y+4,section:block.role});y+=71;}
    rows.push({role:block.role,text:lines[lineIndex],y,size});y+=leading;
   }
   y+=47;
  }
  flush();
  if(source.diagram){
   const figureKicker=source.diagram.type==='tree'?'对应例题 · 不放回抽取（练习另改为放回）':source.diagram.type==='similar_triangles'?'对应例题 · 平行线与边长比':source.kicker||'学习页 · 重新编写';
   result.push({type:'study-diagram',heading:source.heading,section,kicker:figureKicker,diagram:source.diagram,layoutWidth:layout.width});
  }
 }
 cache.set(key,result);return result;
}
function drawStudy(c,draw,page,index,bookTitle,layout=pageLayout()){
 const {left,right}=layout;
 fittedLine(c,draw,bookTitle,left,133,27,right-left,{color:MUTED,role:'running-head'});
 line(c,left,172,right,'#526f7b',2);
 fittedLine(c,draw,page.kicker+(page.continued?' · 续页':''),left,244,29,right-left,{color:'#526f7b',role:'kicker'});
 const title=page.heading||'';
 const headingSize=page.continued?52:73,headingY=page.continued?330:371,headingStep=page.continued?60:80;
 c.font=font(headingSize,600);const titles=wrapStudyHeading(c,title,right-left);
 titles.forEach((text,i)=>draw(text,left,headingY+i*headingStep,headingSize,{weight:600,role:'heading'}));
 for(const row of page.rows){
  const y=row.y;
  if(row.role==='label')draw(row.text,left,y,40,{weight:650,color:row.section==='exercise'?'#855b46':'#405e70',role:'label'});
  else draw(row.text,left,y,row.size,{weight:500,role:row.role});
 }
 draw('开源示例读本 · 原创文字',left,2041,25,{color:MUTED,role:'source-note'});
 draw(String(index+1),right,2041,33,{color:MUTED,align:'right',role:'folio'});
}
function drawTeaching(c,draw,page,index,bookTitle,pageBox=pageLayout()){
 const left=Math.round(BODY.left*pageBox.width/W),right=pageBox.width-left;
 fittedLine(c,draw,bookTitle,left,139,28,right-left,{color:MUTED,role:'running-head'});
 fittedLine(c,draw,page.kicker||'原创精简版',left,277,29,right-left,{color:ACCENT,role:'kicker'});
 c.font=font(82,500);const headings=wrap(c,page.heading||'',right-left);
 headings.forEach((text,i)=>draw(text,left,409+i*100,82,{weight:500,role:'heading'}));
 let layout;for(let size=57;size>=43;size--){layout=teachingLayout(c,page,size,right-left);if(layout.bottom+(headings.length-1)*100<=1910)break;}
 const shift=(headings.length-1)*100;
 for(const item of layout.items){const y=item.y+shift;
  if(item.kind==='rule')line(c,left,y,right,'#d6cebd',1);
  else if(item.kind==='label')draw(item.text,left,y,35,{weight:600,color:item.section==='exercise'?'#89664b':'#506153',role:'label'});
  else draw(item.text,left,y,layout.size,{role:item.section||'knowledge'});
 }
 draw(String(index+1),pageBox.width/2,2041,33,{color:MUTED,align:'center',role:'folio'});
}

function drawContents(c,draw,page,bookTitle,layout){
 const {left,right,width}=layout,usable=right-left,top=662,bottom=1945;
 fittedLine(c,draw,bookTitle,left,139,28,usable,{color:MUTED,role:'running-head'});
 draw('目录',left,407,104,{weight:500,tracking:14,role:'title'});
 fittedLine(c,draw,page.label||'学习目录',left,505,31,usable,{color:ACCENT,role:'kicker'});
 let chosen=null;
 const maxColumns=Math.max(1,Math.min(3,Math.floor(usable/390)));
 for(let size=page.items.length>7?42:51;size>=18&&!chosen;size--){
  for(let columns=1;columns<=maxColumns&&!chosen;columns++){
   const gap=52,columnWidth=(usable-gap*(columns-1))/columns,indent=Math.max(54,size*1.8),step=Math.round(size*1.5),itemGap=Math.round(size*.64),items=[];
   let column=0,y=top;c.font=font(size);
   for(let i=0;i<page.items.length;i++){
    const rows=wrap(c,page.items[i],columnWidth-indent),height=(rows.length-1)*step+size*.25;
    if(y+height>bottom){column++;y=top;}
    if(column>=columns){items.length=0;break;}
    items.push({number:i+1,rows,x:left+column*(columnWidth+gap),y,indent});y+=rows.length*step+itemGap;
   }
   if(items.length===page.items.length)chosen={size,columns,step,items};
  }
 }
 if(!chosen)throw new Error('Contents exceed the available inside-cover area; provide a shorter displayed label or a separate contents page.');
 for(const item of chosen.items){
  draw(String(item.number).padStart(2,'0'),item.x,item.y,Math.min(31,chosen.size),{color:ACCENT,role:'contents-number'});
  item.rows.forEach((row,i)=>draw(row,item.x+item.indent,item.y+i*chosen.step,chosen.size,{role:'contents-item'}));
 }
 return {columns:chosen.columns,fontSize:chosen.size,itemCount:page.items.length};
}
function drawFittedDiagram(c,draw,page,layout){
 // Apply ONE uniform transform to strokes, vertices, type and labels. The
 // diagram is never stretched horizontally to fill a narrow textbook leaf.
 if(layout.width===W){drawStudyDiagram(c,draw,page.diagram,{wrap,font});return {scaleX:1,scaleY:1,translateX:0,translateY:0};}
 c.font=font(73,600);const titleRows=wrapStudyHeading(c,page.heading||'',layout.right-layout.left).length;
 const top=Math.max(550,470+(titleRows-1)*80),bottom=1995,source={left:160,top:550,right:1376,bottom:1995};
 const scale=Math.min((layout.right-layout.left)/(source.right-source.left),(bottom-top)/(source.bottom-source.top));
 const x=layout.left+((layout.right-layout.left)-(source.right-source.left)*scale)/2-source.left*scale,y=top-source.top*scale;
 // Keep geometric shapes uniformly scaled. Only these two verified simple
 // diagrams print their labels in page pixels, so narrow leaves do not shrink type.
 const readableLabels=['rhombus','timeline'].includes(page.diagram.type);
 const diagramDraw=readableLabels?(text,px,py,size,options={})=>{
  let targetX=x+px*scale,targetY=y+py*scale;
  if(page.diagram.type==='rhombus'){if(text==='D')targetX-=18;if(text==='C')targetY+=12;}
  const long=Array.from(String(text)).length>16;
  const targetSize=Math.max(size*scale,long?42:52);
  c.save();c.setTransform(1,0,0,1,0,0);c.font=font(targetSize,options.weight||400);
  const available=options.align==='center'?2*Math.min(targetX-layout.left,layout.right-targetX):layout.right-targetX;
  const rows=long?wrap(c,String(text),Math.max(80,available)):[String(text)];
  rows.forEach((row,i)=>draw(row,targetX,targetY+i*targetSize*1.4,targetSize,options));
  c.restore();
 }:draw;
 c.save();c.translate(x,y);c.scale(scale,scale);drawStudyDiagram(c,diagramDraw,page.diagram,{wrap,font});c.restore();
 return {scaleX:scale,scaleY:scale,translateX:x,translateY:y,sourceBounds:source};
}

export function pageTexture(page,index,bookTitle,anisotropy=8,aspect=null){
 const layout=pageLayout(memoirPage(page)?null:(aspect??(page.layoutWidth?page.layoutWidth/H:null))),W=layout.width;
 if(page.layoutWidth&&page.layoutWidth!==W)throw new Error(`Study page was paginated at ${page.layoutWidth}px but rendered at ${W}px; pass the same physical aspect to paginateStudyBook.`);
 const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
 const c=canvas.getContext('2d'),audit=[],draw=painter(c,audit);
 let diagramTransform=null,contentsLayout=null,imagePlacement=null;
 c.fillStyle=PAPER;c.fillRect(0,0,W,H);
 const edge=c.createLinearGradient(0,0,110,0);edge.addColorStop(0,'#81755410');edge.addColorStop(1,'#81755400');c.fillStyle=edge;c.fillRect(0,0,110,H);
 if(page.type==='archive-photo'){
  const image=page.image,angle=page.rotate||0,cos=Math.abs(Math.cos(angle)),sin=Math.abs(Math.sin(angle)),iw=image.width*cos+image.height*sin,ih=image.width*sin+image.height*cos,scale=Math.min((W-80)/iw,(H-150)/ih);
  c.save();c.translate(W/2,H/2-24);c.rotate(angle);c.drawImage(image,-image.width*scale/2,-image.height*scale/2,image.width*scale,image.height*scale);c.restore();
  imagePlacement={scaleX:scale,scaleY:scale,angle,left:(W-iw*scale)/2,right:(W+iw*scale)/2,top:H/2-24-ih*scale/2,bottom:H/2-24+ih*scale/2};
  draw(String(index+1),W/2,H-42,30,{align:'center',color:MUTED,role:'folio'});
 }else if(page.type==='study-diagram'){
  drawStudy(c,draw,{...page,rows:[]},index,bookTitle,layout);diagramTransform=drawFittedDiagram(c,draw,page,layout);
 }else if(page.type==='study'){
  drawStudy(c,draw,page,index,bookTitle,layout);
 }else if(page.type==='memoir-title'||page.type==='title'){
  draw(page.title||'记忆房间',W/2,800,142,{weight:500,align:'center',tracking:13,role:'title'});line(c,W/2-39,943,W/2+39,ACCENT,2);
  if(page.subtitle)draw(page.subtitle,W/2,1063,52,{weight:500,align:'center',tracking:6,color:MUTED,role:'subtitle'});
 }else if(page.type==='chapter-opener'){
  draw(page.chapterLabel,BODY.left,424,42,{color:ACCENT,tracking:7,role:'chapter-number'});
  draw(page.title,BODY.left,615,107,{weight:500,role:'chapter-title'});line(c,BODY.left,753,BODY.left+92,ACCENT,2);
  let y=1110;
  for(const paragraph of page.epigraph||[]){const attribution=/^——/.test(paragraph),size=attribution?36:45;c.font=font(size);
   for(const row of wrap(c,paragraph,920)){draw(row,attribution?BODY.right:BODY.left+80,y,size,{align:attribution?'right':'left',color:attribution?MUTED:INK,role:'epigraph'});y+=75;}y+=attribution?0:45;
  }
 }else if(page.type==='memoir-prose'){
  runningHead(draw,index,page.heading,page.folio);
  for(const row of page.rows){const available=BODY.right-BODY.left-row.indent;draw(row.text,BODY.left+row.indent,row.y,BODY.size,{weight:500,justify:row.last||row.ragged?0:available,role:'prose'});}
 }else if(page.type==='memoir-end'){
  line(c,W/2-35,1045,W/2+35,ACCENT,1.5);draw('第一章 · 完',W/2,1154,36,{align:'center',color:MUTED,tracking:3,role:'end'});
 }else if(page.type==='end'||page.type==='memoir-blank'){
  // Generic unmatched back pages stay blank, with no invented chapter label.
 }else if(page.type==='prose'){
  runningHead(draw,index,page.heading||bookTitle);page.lines.forEach((text,i)=>draw(text,BODY.left,BODY.top+i*84,56,{role:'prose'}));
 }else if(page.type==='contents'){
  contentsLayout=drawContents(c,draw,page,bookTitle,layout);
 }else drawTeaching(c,draw,page,index,bookTitle,layout);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=anisotropy;
 // Diagnostic information is never painted into the book itself.
 texture.userData.printLayout={width:W,height:H,aspect:W/H,requestedAspect:aspect,memoirLayoutPreserved:Boolean(memoirPage(page)),fontStatus,items:audit,type:page.type||'teaching',diagramTransform,contentsLayout,imagePlacement};
 return texture;
}

export function resolveReadingPageLayout({width,height,pageWidth=width-.016,pageHeight=height-.02,readingPageBounds=null}){
 const min=readingPageBounds?.min||[0,-pageHeight/2],max=readingPageBounds?.max||[pageWidth,pageHeight/2];
 if(min.length!==2||max.length!==2||[...min,...max].some(v=>!Number.isFinite(v))||min[0]<0||max[0]<=min[0]||max[1]<=min[1])throw new RangeError('Invalid book-local readingPageBounds');
 return {width:max[0]-min[0],height:max[1]-min[1],bindingInsetX:min[0],centerY:(min[1]+max[1])/2,aspect:(max[0]-min[0])/(max[1]-min[1]),bounds:{min:[...min],max:[...max]}};
}

export function createLeaves({object,width,height,pageData,title,baseZ,turnedZ,step=.00016,maxStackDepth=.012,anisotropy=8,pageWidth=width-.016,pageHeight=height-.02,readingPageBounds=null}){
 const layout=resolveReadingPageLayout({width,height,pageWidth,pageHeight,readingPageBounds});pageWidth=layout.width;pageHeight=layout.height;
 const leaves=[],count=Math.ceil(pageData.length/2);
 // The paper block carries the physical thickness. A long digital edition
 // must not become a stack of floating planes or allocate hundreds of maps.
 const layerStep=Math.min(step,maxStackDepth/Math.max(1,count));
 for(let i=0;i<count;i++){
  const geometry=new THREE.PlaneGeometry(pageWidth,pageHeight,52,12);geometry.translate(pageWidth/2+layout.bindingInsetX,layout.centerY,0);
  const group=new THREE.Group();object.add(group);
  for(const side of [THREE.FrontSide,THREE.BackSide]){
   const mesh=new THREE.Mesh(geometry,new THREE.MeshPhysicalMaterial({color:PAPER,roughness:.92,specularIntensity:.15,side,emissive:'#ffffff',emissiveIntensity:.12}));mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
   const pageNumber=i*2+(side===THREE.BackSide?1:0);
   if(pageData[pageNumber]?.type==='archive-photo'){
    mesh.userData.archivePage=pageNumber;
    // The transparent sleeve stays behind when its paper is extracted. It
    // shares the bending geometry, so it never floats away during a page turn.
    const film=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:'#d6e2e0',roughness:.18,metalness:.05,transparent:true,opacity:.065,side,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));
    film.userData.pickThrough=true;group.add(film);
   }
  }
  const z=baseZ+(count-i)*layerStep;group.position.z=z;
  leaves.push({group,geometry,original:Float32Array.from(geometry.attributes.position.array),t:0,bentT:0,index:i,baseZ:z,turnedZ:turnedZ+i*layerStep,width:pageWidth,height:pageHeight,bindingInsetX:layout.bindingInsetX,centerY:layout.centerY,readingPageBounds:layout.bounds,pageData,title,anisotropy,loaded:false});
 }
 syncLeafWindow(leaves,0);
 return leaves;
}
function releaseLeafMaps(p){
 if(!p.loaded)return;
 for(const mesh of p.group.children){const m=mesh.material;if(!m.map)continue;const map=m.map;m.map=null;m.emissiveMap=null;m.color.set(PAPER);m.needsUpdate=true;map.dispose();if(map.image?.getContext){map.image.width=1;map.image.height=1;}}
 p.loaded=false;
}
export function syncLeafWindow(leaves,index,{moving=[]}={}){
 // A reverse turn reveals the sheet BELOW the current left sheet. Manual
 // dragging has no pageTween yet, so also read the live left-sheet bend.
 const left=leaves[index-1],turningBack=index>0&&(moving.includes(index-1)||(left?.t>0&&left.t<1));
 const window=turningBack?[index-2,index-1,index]:[index-1,index,index+1];
 const wanted=new Set([...window,...moving].filter(i=>i>=0&&i<leaves.length));
 // Release the outgoing sheet before creating its replacement, including
 // reverse navigation where the new lower index is visited first.
 for(const p of leaves)if(!wanted.has(p.index))releaseLeafMaps(p);
 for(const p of leaves){
  p.group.visible=wanted.has(p.index);
  if(!p.group.visible){releaseLeafMaps(p);continue;}
  if(p.bentT!==p.t)bendPage(p,p.t);
  if(p.loaded)continue;
  for(const mesh of p.group.children){
   if(mesh.userData.pickThrough)continue;
   const back=mesh.material.side===THREE.BackSide,n=p.index*2+(back?1:0);
   const map=pageTexture(p.pageData[n]||{type:'end'},n,p.title,p.anisotropy,p.width/p.height);
   if(back){map.repeat.x=-1;map.offset.x=1;}
   mesh.material.map=map;mesh.material.emissiveMap=map;mesh.material.color.set('#ffffff');mesh.material.needsUpdate=true;
  }
  p.loaded=true;
 }
 return {leaves:wanted.size,pages:[...wanted].length*2};
}
export function disposeLeaves(leaves){
 for(const p of leaves){releaseLeafMaps(p);p.group.removeFromParent();p.geometry.dispose();for(const mesh of p.group.children)mesh.material.dispose();}
}

// Integrating an angle field preserves the sheet's horizontal arc length. The
// free edge lags the spine and the grabbed corner curls more than the other one.
export function bendPage(p,t,grabY=0){
 const pos=p.geometry.attributes.position,w=p.width||p.geometry.parameters.width,h=p.height||p.geometry.parameters.height;
 const segments=p.geometry.parameters.widthSegments,rows=p.geometry.parameters.heightSegments;
 const inset=p.bindingInsetX||0,totalArc=inset+w,hiddenSegments=inset>0?Math.max(1,Math.ceil(inset/(w/segments))):0;
 const flex=Math.sin(Math.PI*t),direction=t<.5?1:-1;
 for(let row=0;row<=rows;row++){
  const y=p.original[row*(segments+1)*3+1],v=(y-(p.centerY||0))/h;
  let x=0,z=0;
  // Integrate the hidden binding strip from the real spine axis; a fixed
  // translated pivot would leave the fully turned page asymmetrical.
  for(let k=0;k<hiddenSegments;k++){const ds=inset/hiddenSegments,s=(k+.5)*ds/totalArc,angle=-Math.PI*t+flex*(.72*Math.sin(Math.PI*s)+grabY*.32*v*Math.pow(s,1.7));x+=Math.cos(angle)*ds;z-=Math.sin(angle)*ds;}
  for(let column=0;column<=segments;column++){
   const i=row*(segments+1)+column,u=inset>0?(inset+column*w/segments)/totalArc:column/segments;
   if(column){const s=inset>0?(inset+(column-.5)*w/segments)/totalArc:(column-.5)/segments;const angle=-Math.PI*t+flex*(.72*Math.sin(Math.PI*s)+grabY*.32*v*Math.pow(s,1.7));x+=Math.cos(angle)*w/segments;z-=Math.sin(angle)*w/segments;}
   const cornerLift=flex*grabY*.008*v*u*u;
   pos.setXYZ(i,x,y+cornerLift,z+flex*.002*direction*Math.sin(Math.PI*u));
  }
 }
 p.t=t;p.bentT=t;pos.needsUpdate=true;p.geometry.computeVertexNormals();p.geometry.computeBoundingSphere();
 p.group.position.z=THREE.MathUtils.lerp(p.baseZ,p.turnedZ,t);
}
