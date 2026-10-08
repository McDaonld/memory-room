// Original, resolution-independent figures. Coordinates and labels are drawn
// from the study-page data, not a blurry screenshot of a textbook.
export function drawStudyDiagram(c,draw,diagram,{wrap,font}){
 const blue='#3b6479',ink='#303e45',light='#d7e1e5',accent='#a6664d';
 const segment=(x1,y1,x2,y2,{color=blue,dash=false,width=4}={})=>{c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dash?[12,12]:[]);c.stroke();c.setLineDash([]);};
 const label=(t,x,y,size=39,options={})=>draw(t,x,y,size,{color:ink,role:'diagram-label',...options});
 function lines(text,x,y,width=280,size=35){c.font=font(size);for(const row of wrap(c,String(text),width)){label(row,x,y,size);y+=56;}return y;}
 const dot=(x,y,color=blue)=>{c.beginPath();c.arc(x,y,7,0,Math.PI*2);c.fillStyle=color;c.fill();};
 function polygon(points,{fill=false}={}){c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();c.strokeStyle=blue;c.lineWidth=5;c.stroke();if(fill){c.fillStyle='#d8e6ea88';c.fill();}}
 const d=diagram;
 if(d.type==='comparison'||d.type==='table'){
  const columns=d.columns,rows=d.rows,left=160,width=1216,cell=width/columns.length,top=680,rowHeight=165;
  c.fillStyle='#dde7e9';c.fillRect(left,top,width,rowHeight);
  [columns,...rows].forEach((row,i)=>{row.forEach((value,j)=>lines(value,left+j*cell+24,top+i*rowHeight+66,cell-48,columns.length>3?33:38));segment(left,top+(i+1)*rowHeight,left+width,top+(i+1)*rowHeight,{color:light,width:2});});
  for(let i=1;i<columns.length;i++)segment(left+i*cell,top,left+i*cell,top+(rows.length+1)*rowHeight,{color:light,width:2});
 }else if(d.type==='rhombus'||d.type==='similar_triangles'){
  const p=d.type==='rhombus'?d.points:{A:d.A,B:d.B,C:d.C,D:d.D,E:d.E};
  const factor=d.type==='rhombus'?115:125,cx=740,cy=d.type==='rhombus'?1100:720;
  const xy=v=>[cx+v[0]*factor,cy+(d.type==='rhombus'?-1:1)*v[1]*factor];
  polygon((d.type==='rhombus'?['A','B','C','D']:['A','B','C']).map(k=>xy(p[k])),{fill:true});
  if(d.type==='rhombus'){
   segment(...xy(p.A),...xy(p.C),{dash:true});segment(...xy(p.B),...xy(p.D),{dash:true});
   segment(cx,cy-30,cx+30,cy-30,{width:2});segment(cx+30,cy-30,cx+30,cy,{width:2});
  }else segment(...xy(p.D),...xy(p.E),{color:accent,width:5});
  const offsets=d.type==='rhombus'?{A:[0,-26],B:[29,13],C:[0,56],D:[-40,13],O:[24,56]}:{A:[0,-26],B:[-28,50],C:[28,50],D:[-40,10],E:[28,10]};
  for(const [key,value]of Object.entries(p)){const [x,y]=xy(value),[dx,dy]=offsets[key]||[20,-20];dot(x,y);label(key,x+dx,y+dy,41,{align:dx===0?'center':'left'});}
  (d.labels||[]).forEach((t,i)=>label(t,260+i*340,1610,43));
 }else if(d.type==='tree'){
  const xs=[360,768,1176];label('第一次取球',160,655,37);label('第二次取球',160,1460,37);dot(768,720);
  d.stage1.forEach((name,i)=>{const x=xs[i];segment(768,730,x,955);label(name,x,1015,45,{align:'center'});
   d.stage2[i].forEach((second,j)=>{const end=x+(j?95:-95);segment(x,1040,end,1285,{color:d.favourable.includes(name+'→'+second)?accent:blue});label(second,end,1365,43,{align:'center'});});
  });
  label('不放回抽取：共 6 条等可能路径',768,1580,42,{align:'center'});
  label('两次均为红球：2 / 6 = 1 / 3',768,1670,42,{align:'center',color:accent});
 }else if(d.type==='orthographic_box'){
  const {width:w,depth:z,height:h}=d.dimensions,scale=85;
  const views=[{x:250,y:880,a:w,b:h,name:'主视图'},{x:860,y:880,a:z,b:h,name:'左视图'},{x:250,y:1280,a:w,b:z,name:'俯视图'}];
  for(const v of views){c.lineWidth=4;c.strokeStyle=blue;c.strokeRect(v.x,v.y,v.a*scale,v.b*scale);label(v.name,v.x, v.y-65,42);label(String(v.a),v.x+v.a*scale/2,v.y+v.b*scale+60,39,{align:'center'});label(String(v.b),v.x-45,v.y+v.b*scale/2,39,{align:'center'});}
  label('同一实体：长 4，宽 3，高 2',768,1800,42,{align:'center'});
 }else if(d.type==='function'){
  const cx=768,cy=1110,scale=59,limit=8,convert=([x,y])=>[cx+x*scale,cy-y*scale];
  for(let k=-limit;k<=limit;k++){
   segment(...convert([k,-limit]),...convert([k,limit]),{color:light,width:1});segment(...convert([-limit,k]),...convert([limit,k]),{color:light,width:1});
  }
  segment(...convert([-limit,0]),...convert([limit+.4,0]),{color:ink,width:3});segment(...convert([0,-limit]),...convert([0,limit+.4]),{color:ink,width:3});
  label('x',1283,1100,39);label('y',794,601,39);label('0',739,1158,30);
  for(const k of [-8,-4,4,8]){label(String(k),cx+k*scale,cy+44,29,{align:'center'});label(String(k),cx-25,cy-k*scale+10,29,{align:'right'});}
  for(const [start,end]of d.domainSegments){c.beginPath();let first=true;for(let x=start;x<=end;x+=.02){const y=-8/x;if(y< -8||y>8)continue;const p=convert([x,y]);first?c.moveTo(...p):c.lineTo(...p);first=false;}c.strokeStyle=blue;c.lineWidth=6;c.stroke();}
  d.points.forEach(p=>{const [x,y]=convert(p);dot(x,y,accent);label(`(${p.join(', ')})`,x+(p[0]>0?20:-135),y+(p[0]>0?60:48),32,{color:accent});});
  label('y = −8 / x',768,1770,47,{align:'center'});
 }else if(d.type==='timeline'){
  const top=650,bottom=1660,x=340,step=(bottom-top)/Math.max(1,d.events.length-1);segment(x,top-40,x,bottom+55);
  d.events.forEach((event,i)=>{const y=top+i*step;dot(x,y);label(event.year<0?'公元前'+Math.abs(event.year)+'年':event.year+'年',x+55,y+13,43);if(!event.label.includes('年'))label(event.label,x+455,y+13,43);});
  label('按事件先后排列，间距不代表时间长度',160,1830,33,{color:'#687278'});
 }else if(d.type==='flow'){
  d.chains.forEach((chain,row)=>chain.forEach((text,i)=>{const x=170+i*420,y=760+row*450;c.fillStyle='#e2e9e9';c.fillRect(x,y,340,240);lines(text,x+27,y+83,285,38);if(i<chain.length-1){segment(x+354,y+120,x+402,y+120);segment(x+402,y+120,x+391,y+109);segment(x+402,y+120,x+391,y+131);}}));
 }
 if(d.note)lines(d.note,160,1935,1216,29);
}
