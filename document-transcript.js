// A legible transcription is labelled as such. Original seals and handwriting
// remain exclusively in the scanned facsimile; no seal or signature is forged.
export function documentTranscriptCanvas(document){
 const canvas=globalThis.document.createElement('canvas');canvas.width=2160;canvas.height=3056;
 const c=canvas.getContext('2d'),left=190,right=1970,width=right-left;
 const font=(size,bold=false)=>`${bold?700:500} ${size}px "Microsoft YaHei","PingFang SC",sans-serif`;
 const wrap=(text,size,w=width)=>{c.font=font(size);const lines=[];for(const paragraph of String(text||'').split('\n')){let line='';for(const letter of paragraph){if(line&&c.measureText(line+letter).width>w){lines.push(line);line='';}line+=letter;}lines.push(line);}return lines;};
 function layout(size,paint=false){let y=480;const line=size*1.72;
  const draw=(text,sz=size,bold=false,color='#111a16')=>{for(const row of wrap(text,sz)){if(paint){c.font=font(sz,bold);c.fillStyle=color;c.fillText(row,left,y);}y+=sz*1.72;}};
  for(const b of document.blocks||[]){
   if(b.type==='heading'){y+=size*.25;draw(b.text,size,true);}
   else if(b.type==='list'){for(const [i,item]of(b.items||[]).entries())draw(typeof item==='string'?item:item.text||JSON.stringify(item));}
   else if(b.type==='table'){
    const columns=b.columns||[],rows=[...(columns.length?[columns]:[]),...(b.rows||[])];
    const n=Math.max(1,columns.length,...rows.map(r=>Array.isArray(r)?r.length:1)),cw=width/n;
    for(let r=0;r<rows.length;r++){
     const cells=Array.isArray(rows[r])?rows[r]:Object.values(rows[r]),text=cells.map(v=>wrap(String(v??''),size*.78,cw-34)),height=Math.max(...text.map(t=>t.length),1)*size*1.30+28;
     if(paint){c.fillStyle=r===0?'#e9eee7':r%2?'#ffffff':'#f5f6f2';c.fillRect(left,y-size, width,height);c.strokeStyle='#bdc7bb';c.beginPath();c.moveTo(left,y-size+height);c.lineTo(right,y-size+height);c.stroke();c.fillStyle='#27352e';c.font=font(size*.78,r===0);text.forEach((lines,i)=>lines.forEach((t,j)=>c.fillText(t,left+i*cw+16,y+j*size*1.30)));}y+=height;
    }
   }else draw(b.text||'',b.type==='stamp'||b.type==='annotation'?size*.83:size,false,b.type==='stamp'||b.type==='annotation'?'#616e61':'#111a16');
   y+=size*.42;
  }return y;
 }
 let size=55;while(size>35&&layout(size)>2790)size-=1;
 c.fillStyle='#fcfbf6';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='#687567';c.font=font(31);c.fillText('记忆房间  /  示例资料',left,145);
 c.strokeStyle='#c1c8bb';c.lineWidth=2;c.beginPath();c.moveTo(left,192);c.lineTo(right,192);c.stroke();
 const titleSize=Math.min(90,1820/(String(document.title).length||1));c.font=font(titleSize,true);c.fillStyle='#24352b';c.textAlign='center';c.fillText(document.title,1080,337);c.textAlign='left';layout(size,true);
 c.font=font(29);c.fillStyle='#74806f';c.fillText('原创示例资料。切换「页面图像」查看完整排版。',left,2935);
 return canvas;
}
