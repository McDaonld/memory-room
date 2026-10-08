/**
 * A silent, self-contained Canvas2D desktop for the laptop ScreenDisplay.
 * Pointer coordinates use a top-left origin, both normalized.
 * The scene adapter sets texture orientation to match the ScreenDisplay UVs.
 * No DOM listeners, audio, automatic navigation or private system data are used.
 */
export const DEFAULT_DESKTOP_DATA = Object.freeze({
  owner: '', title: '', subtitle: '', introduction: '', homepageUrl: '',
  photos: Object.freeze([]), videos: Object.freeze([]), resume: null,
});

const W = 1600, H = 1000, TASK = 66;
const FONT = '"Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const inside = (x, y, r) => x >= r.x && y >= r.y && x <= r.x+r.w && y <= r.y+r.h;
const safeURL = (url) => { if (typeof url !== 'string' || !url.trim()) return ''; try { const u = new URL(url, document.baseURI); return ['https:','http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
const safeResumeURL=url=>{const value=safeURL(url);if(!value)return '';try{const u=new URL(value),root=new URL('./assets/resume/',document.baseURI);return u.origin===root.origin&&u.pathname.startsWith(root.pathname)&&/\.(png|webp|jpe?g)$/i.test(u.pathname)?u.href:'';}catch{return '';}};

export function createComputerDesktop({ THREE, onExternalLink = () => {}, onChange = () => {} } = {}) {
  if (!THREE?.CanvasTexture) throw new TypeError('createComputerDesktop requires THREE.CanvasTexture');
  const canvas = document.createElement('canvas'); canvas.width=W; canvas.height=H;
  const outputContext=canvas.getContext('2d', { alpha:false });
  const contentCanvas=document.createElement('canvas');contentCanvas.width=W;contentCanvas.height=H;
  const contentContext=contentCanvas.getContext('2d', { alpha:false });
  const wallpaperCanvas=document.createElement('canvas');wallpaperCanvas.width=W;wallpaperCanvas.height=H;
  let c=contentContext;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace; texture.flipY=true;
  texture.minFilter=THREE.LinearFilter; texture.magFilter=THREE.LinearFilter; texture.generateMipmaps=false;
  let data=structuredClone(DEFAULT_DESKTOP_DATA), windows=[], hit=[], active=false, dirty=true, disposed=false;
  let contentDirty=true, hitDirty=true, contentVersion=0, presentedVersion=-1, previousCursor=null, hoverId='';
  let externalCursor=false,imagePinch=null;
  let mouse={x:800,y:460,visible:false}, drag=null, scrollDrag=null, photoDrag=null, down=null, startOpen=false, selected=null;
  let lastUp={id:null,time:-Infinity},lastTitleToggle=-Infinity,lastPhotoToggle=-Infinity,lastPhotoTap={id:null,time:-Infinity};
  let serial=0, clockTime=Math.floor(Date.now()/60000), toast='', toastTime=0, changeQueued=false,flowTime=0;
  const images=new Map(), panelCache=new Map();
  const apps={photos:{title:'图库',color:'#497bbb'},videos:{title:'视频收藏',color:'#715e99'},home:{title:'示例主页',color:'#4a8175'}};

  function notify(reason,content=true,layout=content) { dirty=true;if(content)contentDirty=true;if(layout)hitDirty=true; if (!changeQueued) { changeQueued=true; queueMicrotask(()=>{changeQueued=false;if(!disposed)onChange({reason});}); } }
  const hovered=r=>active&&mouse.visible&&inside(mouse.x,mouse.y,r);
  function rr(x,y,w,h,r=12,fill=null,stroke=null) { c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();} }
  function text(s,x,y,size=20,color='#283544',weight=400,align='left') { c.fillStyle=color;c.font=`${weight} ${size}px ${FONT}`;c.textAlign=align;c.textBaseline='alphabetic';c.fillText(String(s),x,y); }
  function wrap(s,x,y,width,size=23,line=38,color='#4b5b68',max=20) { c.font=`400 ${size}px ${FONT}`;let row='',n=0;for(const ch of String(s)){if(ch==='\n'||c.measureText(row+ch).width>width){text(row,x,y+n*line,size,color);row=ch==='\n'?'':ch;n++;if(n>=max)return y+(n+1)*line;}else row+=ch;}if(row)text(row,x,y+n*line,size,color);return y+(n+1)*line; }
  function button(id,x,y,w,h,label,fn,{fill='#e7eef6',color='#30445b',disabled=false,win=null,clip=null}={}) {
    const hover=hovered({x,y,w,h});rr(x,y,w,h,8,disabled?'#e8eaed':hover?'#d7e5f3':fill);text(label,x+w/2,y+h/2+7,20,disabled?'#8c959f':color,500,'center');
    if(!disabled)hit.push({id,x,y,w,h,action:fn,win,clip,cursor:'pointer',hover:true});
  }
  function icon(kind,x,y,size=46) {
    c.save();c.translate(x,y);const s=size/48;c.scale(s,s);
    if(kind==='start'){for(let j=0;j<2;j++)for(let i=0;i<2;i++)rr(i*23,j*23,20,20,2,'#2787d7');}
    if(kind==='photos') { rr(0,3,48,40,8,'#dceafb');rr(4,7,40,32,5,'#7eace0');c.fillStyle='#3a779e';c.beginPath();c.moveTo(4,35);c.lineTo(17,19);c.lineTo(26,28);c.lineTo(33,21);c.lineTo(44,35);c.closePath();c.fill();c.fillStyle='#ffdc7a';c.beginPath();c.arc(34,14,4,0,Math.PI*2);c.fill(); }
    if(kind==='videos') { rr(0,3,48,40,10,'#7760a3');c.fillStyle='#fff';c.beginPath();c.moveTo(19,13);c.lineTo(34,23);c.lineTo(19,34);c.closePath();c.fill(); }
    if(kind==='home') { rr(0,2,48,42,9,'#4f897d');c.fillStyle='#d8eee3';c.beginPath();c.arc(24,16,7,0,Math.PI*2);c.fill();c.beginPath();c.ellipse(24,33,13,8,0,Math.PI,Math.PI*2);c.fill(); }
    c.restore();
  }
  function emptyState(kind,x,y,w,h,title,detail){
    const cy=y+Math.max(116,h*.44);rr(x+w/2-48,cy-60,96,96,24,'#e8eef3');
    icon(kind,x+w/2-27,cy-39,54);text(title,x+w/2,cy+79,27,'#4d6070',500,'center');
    if(detail)text(detail,x+w/2,cy+116,19,'#87949e',400,'center');
  }
  function panel(x,y,w,h,r,blur,offsetY,shadow,fill){
    const key=[w,h,r,blur,offsetY,shadow,fill].join('|');let entry=panelCache.get(key);
    if(!entry){
      const pad=Math.ceil(blur*2+Math.abs(offsetY)+2),layer=document.createElement('canvas');layer.width=w+pad*2;layer.height=h+pad*2;
      const ctx=layer.getContext('2d');ctx.shadowColor=shadow;ctx.shadowBlur=blur;ctx.shadowOffsetY=offsetY;ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(pad,pad,w,h,r);ctx.fill();
      entry={layer,pad};panelCache.set(key,entry);
    }
    c.drawImage(entry.layer,x-entry.pad,y-entry.pad);
  }
  function photoViewFrame(view){
    if(!view?.imageWidth||!view.imageHeight||!view.viewport)return null;
    const r=view.viewport,scale=Math.min(r.w/view.imageWidth,r.h/view.imageHeight)*view.zoom;
    const w=view.imageWidth*scale,h=view.imageHeight*scale,limitX=Math.max(0,(w-r.w)/2),limitY=Math.max(0,(h-r.h)/2);
    view.panX=clamp(view.panX,-limitX,limitX);view.panY=clamp(view.panY,-limitY,limitY);
    return {x:r.x+(r.w-w)/2+view.panX,y:r.y+(r.h-h)/2+view.panY,w,h,scale,limitX,limitY};
  }
  function zoomPhoto(view,zoom,x,y){
    const frame=photoViewFrame(view);if(!frame)return false;
    const next=clamp(zoom,1,8);if(Math.abs(next-view.zoom)<1e-8)return false;
    const r=view.viewport,ratio=next/view.zoom,dx=x-(r.x+r.w/2),dy=y-(r.y+r.h/2);
    view.panX=dx-(dx-view.panX)*ratio;view.panY=dy-(dy-view.panY)*ratio;view.zoom=next;photoViewFrame(view);
    notify('photo-zoom',true,false);return true;
  }
  function togglePhoto(view,x,y){return zoomPhoto(view,view.zoom>1.01?1:2,x,y);}
  function photo(url,x,y,w,h,fit='cover',view=null) {
    const key=safeURL(url); let obj=images.get(key);
    if(!obj&&key){const image=new Image();image.crossOrigin='anonymous';obj={image,status:'loading'};images.set(key,obj);image.onload=()=>{obj.status='ready';notify('image');};image.onerror=()=>{obj.status='error';notify('image-error');};image.src=key;}
    rr(x,y,w,h,10,'#dbe4e7');
    if(obj?.status==='ready') { const im=obj.image;const scale=fit==='contain'?Math.min(w/im.width,h/im.height):Math.max(w/im.width,h/im.height);
      if(view){view.imageWidth=im.width;view.imageHeight=im.height;
        // A document opens at reading width. Ordinary photos retain whole-image fit.
        if(view.openAtWidth){view.zoom=clamp(w/(im.width*scale),1,8);view.panX=0;view.panY=Math.max(0,(im.height*scale*view.zoom-h)/2);view.openAtWidth=false;}
      }
      const frame=view?photoViewFrame(view):{x:x+(w-im.width*scale)/2,y:y+(h-im.height*scale)/2,w:im.width*scale,h:im.height*scale};
      c.save();c.beginPath();c.roundRect(x,y,w,h,10);c.clip();if(view){c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';}c.drawImage(im,frame.x,frame.y,frame.w,frame.h);c.restore(); }
    else {icon('photos',x+w/2-24,y+h/2-36,48);text(obj?.status==='error'?'照片暂未载入':'正在载入照片',x+w/2,y+h/2+30,18,'#71828f',400,'center');}
  }
  function front(win){const changed=windows.at(-1)!==win||win.minimized||startOpen;windows=windows.filter(w=>w!==win);windows.push(win);win.minimized=false;startOpen=false;if(changed)notify('focus-window');}
  function open(app) { let win=windows.find(w=>w.app===app);if(win)front(win);else{const off=(serial++%3)*26;win={id:`window-${app}`,app,x:240+off,y:104+off,w:1120,h:748,minimized:false,maximized:false,photo:-1,scroll:0};windows.push(win);}notify('open-window');return win; }
  function close(win){windows=windows.filter(w=>w!==win);notify('close-window');}
  function external(url){const href=safeURL(url);if(href)onExternalLink(href);}
  function maximize(win){if(win.maximized){Object.assign(win,win.previous);win.maximized=false;}else{win.previous={x:win.x,y:win.y,w:win.w,h:win.h};Object.assign(win,{x:8,y:8,w:W-16,h:H-TASK-16,maximized:true});}notify('maximize-window');}
  function buildWallpaper(){
    c=wallpaperCanvas.getContext('2d', { alpha:false });
    const g=c.createLinearGradient(0,0,W,H);g.addColorStop(0,'#203f4d');g.addColorStop(.46,'#38697b');g.addColorStop(1,'#122f47');c.fillStyle=g;c.fillRect(0,0,W,H);
    c.save();c.translate(960,440);c.rotate(-.38);
    for(let k=6;k>=0;k--){const gg=c.createLinearGradient(-370,-170,360,170);gg.addColorStop(0,'rgba(107,186,202,.03)');gg.addColorStop(.35,`rgba(143,210,215,${.14+k*.009})`);gg.addColorStop(.6,'rgba(21,83,115,.70)');gg.addColorStop(1,'rgba(53,116,150,.05)');c.fillStyle=gg;c.beginPath();c.ellipse(k*28-80,k*34-80,340-k*13,160-k*7,k*.12,0,Math.PI*2);c.fill();}c.restore();
    c=contentContext;
  }
  function wallpaper(){
    c.drawImage(wallpaperCanvas,0,0);
    for(const [index,app] of ['photos','videos','home'].entries()){
      const x=30,y=26+index*132,r={x,y,w:112,h:112};if(selected===app||hovered(r))rr(x,y,112,112,8,'rgba(215,236,245,.14)','rgba(238,250,255,.12)');
      icon(app,x+32,y+11,48);c.shadowColor='rgba(0,0,0,.55)';c.shadowBlur=5;text(apps[app].title,x+56,y+89,20,'#fff',400,'center');c.shadowBlur=0;
      hit.push({...r,id:'desktop-'+app,action:()=>{selected=app;open(app);},cursor:'pointer',hover:true});
    }
    text(data.subtitle,40,H-TASK-34,20,'rgba(224,242,247,.70)');
  }
  function drawPhotos(win,x,y,w,h,list=data.photos||[],backLabel='所有图片'){
    if(!list.length){
      text('所有图片',x+36,y+56,34,'#273d50',600);text('0 张图片',x+36,y+89,19,'#738391');
      emptyState('photos',x,y+94,w,h-94,'此文件夹为空','尚未添加照片');
      win.maxScroll=0;return;
    }
    if(win.flow){
      c.fillStyle='#132c31';c.fillRect(x,y,w,h);
      const cw=(w-80)/3,ch=cw*1.35,gap=22,span=ch+70;
      c.save();c.beginPath();c.rect(x,y+78,w,h-78);c.clip();
      if(list.length)for(let column=0;column<3;column++){
        const phase=(column%2?-1:1)*flowTime*22/span,whole=Math.floor(phase),offset=phase-whole;
        // Recycle the next logical photograph when a card crosses the edge.
        // Indexing only visible rows would loop the same few items forever.
        for(let row=-1;row<=Math.ceil((h-78)/span);row++){
          const logical=(row-whole)*3+column,i=((logical%list.length)+list.length)%list.length,p=list[i];
          const py=y+78+(row+offset)*span,px=x+20+column*(cw+gap);
          photo(p.url,px,py,cw,ch);text(p.title,px+8,py+ch+28,18,'#d8e3df');
        }
      }
      c.restore();c.fillStyle='#132c31';c.fillRect(x,y,w,78);
      button('flow-exit',x+22,y+18,138,42,'‹  所有图片',()=>{win.flow=false;notify('flow-close');},{win});
      text(`${list.length} 张图片 · 循环流动`,x+w-26,y+46,18,'#e5ece9',400,'right');win.maxScroll=0;return;
    }
    if(win.photo>=0&&list[win.photo]){
      const p=list[win.photo];button(win.app==='home'?'resume-back':'photos-back',x+24,y+16,118,42,'‹  '+backLabel,()=>{win.photo=-1;notify('photo-grid');},{win});
      text(p.title,x+163,y+45,23,'#34465a',600);text(`${win.photo+1} / ${list.length}`,x+w-30,y+45,18,'#778492',400,'right');
      const key=win.photo+':'+safeURL(p.url);if(win.photoView?.key!==key)win.photoView={key,zoom:1,panX:0,panY:0,openAtWidth:win.app==='home'};
      const view=win.photoView;view.viewport={x:x+28,y:y+78,w:w-56,h:h-150};
      photo(p.url,view.viewport.x,view.viewport.y,view.viewport.w,view.viewport.h,'contain',view);
      hit.push({...view.viewport,id:(win.app==='home'?'resume-view-':'photo-view-')+win.photo,win,photoView:view,cursor:view.zoom>1?'grab':'zoom-in',action:()=>{}});
      text(p.note||'',x+92,y+h-35,18,'#6d7985');win.maxScroll=0;
      if(list.length>1){button('prev-photo',x+30,y+h-64,46,38,'‹',()=>{win.photo=(win.photo+list.length-1)%list.length;notify('photo');},{win});button('next-photo',x+w-76,y+h-64,46,38,'›',()=>{win.photo=(win.photo+1)%list.length;notify('photo');},{win});}
      return;
    }
    text('所有图片',x+36,y+56,34,'#273d50',600);text(`${list.length} 张图片 · 记忆存档`,x+36,y+89,19,'#738391');
    button('photo-flow',x+w-201,y+31,165,42,'流动照片墙',()=>{win.flow=true;notify('flow-open');},{win});
    const cw=(w-100)/2,ch=Math.min(392,h-195),top=y+122;
    win.listViewport={x,y:y+110,w,h:h-110};c.save();c.beginPath();c.rect(win.listViewport.x,win.listViewport.y,win.listViewport.w,win.listViewport.h);c.clip();
    for(let i=0;i<list.length;i++){const p=list[i],px=x+36+(i%2)*(cw+28),py=top+Math.floor(i/2)*(ch+91)-win.scroll;if(py>y+h||py+ch+70<y+100)continue;photo(p.url,px,py,cw,ch);text(p.title,px,py+ch+31,22,'#2f4354',600);text(p.note||'',px,py+ch+59,17,'#77828b');hit.push({id:'photo-'+i,x:px,y:py,w:cw,h:ch+66,win,clip:win.listViewport,cursor:'pointer',action:()=>{win.photo=i;notify('photo-open');}});}
    c.restore();win.maxScroll=Math.max(0,Math.ceil(list.length/2)*(ch+91)+122-h+20);
  }
  function drawVideos(win,x,y,w,h){
    text('视频收藏',x+36,y+56,34,'#2f3b53',600);text(data.videos.length?`${data.videos.length} 个收藏 · 点击后在浏览器打开原链接`:'0 个收藏',x+36,y+91,19,'#778392');
    if(!data.videos.length){emptyState('videos',x,y+94,w,h-94,'此文件夹为空','尚未添加视频收藏');win.maxScroll=0;return;}
    const top=y+120,cw=(w-98)/2,ch=162;
    win.listViewport={x,y:y+110,w,h:h-110};c.save();c.beginPath();c.rect(win.listViewport.x,win.listViewport.y,win.listViewport.w,win.listViewport.h);c.clip();
    data.videos.forEach((v,i)=>{const xx=x+36+(i%2)*(cw+26),yy=top+Math.floor(i/2)*(ch+22)-win.scroll;if(yy+ch<y+103||yy>y+h)return;rr(xx,yy,cw,ch,14,'#fff','#e0e5ed');rr(xx+18,yy+18,92,92,12,v.color||'#7b8194');c.fillStyle='rgba(255,255,255,.93)';c.beginPath();c.moveTo(xx+54,yy+42);c.lineTo(xx+83,yy+64);c.lineTo(xx+54,yy+85);c.closePath();c.fill();text(v.category||'收藏',xx+64,yy+138,16,'#818a93',400,'center');wrap(v.title,xx+128,yy+45,cw-145,23,31,'#304054',2);text(v.author||'',xx+128,yy+108,17,'#8892a0');button('video-'+i,xx+cw-149,yy+115,130,32,'打开原链接 ↗',()=>external(v.url),{win,clip:win.listViewport,fill:'#edf0f7'});});
    c.restore();win.maxScroll=Math.max(0,Math.ceil(data.videos.length/2)*(ch+22)+120-h+20);
  }
  function drawHome(win,x,y,w,h){
    if(data.resume&&win.photo===0){drawPhotos(win,x,y,w,h,[data.resume],'示例主页');return;}
    if(!data.owner&&!data.subtitle&&!data.introduction&&!data.title&&!data.homepageUrl){
      text('示例主页',x+36,y+56,34,'#344b41',600);
      if(data.resume)button('resume-open',x+36,y+116,240,46,'查看纸质简历',()=>{win.photo=0;win.photoView=null;notify('resume-open');},{win});
      else emptyState('home',x,y+66,w,h-66,'尚未添加个人资料','此页面暂无内容');
      win.maxScroll=0;return;
    }
    const top=y-win.scroll;rr(x+28,top+22,w-56,192,16,'#e3ede8');
    rr(x+58,top+55,116,116,58,'#537e70');if(data.owner)text(data.owner[0],x+116,top+133,55,'#f2f5ee',500,'center');else icon('home',x+86,top+83,60);
    text(data.owner,x+205,top+102,43,'#263f37',600);text(data.subtitle,x+208,top+144,24,'#587469');
    let yy=top+254;
    if(data.introduction){text('个人介绍',x+56,yy,20,'#73857a',500);yy=wrap(data.introduction,x+56,yy+43,w-112,23,39,'#667870',5)+15;}
    if(data.title){rr(x+55,yy+14,w-110,113,12,'#fff','#e0e6df');text('标题',x+78,yy+49,17,'#879188');text(`《${data.title}》`,x+78,yy+91,31,'#3d5147',600);yy+=151;}
    if(data.resume){button('resume-open',x+56,yy+14,240,46,'查看纸质简历',()=>{win.photo=0;win.photoView=null;notify('resume-open');},{win});yy+=84;}
    if(data.homepageUrl){button('home-link',x+56,yy+14,218,46,'访问个人网址 ↗',()=>external(data.homepageUrl),{win});yy+=84;}
    win.maxScroll=Math.max(0,yy-top+28-h);
  }
  function drawWindow(win){
    if(win.minimized)return;win.listViewport=null;
    const {x,y,w,h}=win, isFront=windows.filter(z=>!z.minimized).at(-1)===win;
    panel(x,y,w,h,14,30,14,'rgba(4,18,31,.30)','#f6f8fb');
    c.save();c.beginPath();c.roundRect(x,y,w,h,14);c.clip();
    rr(x,y,w,59,0,isFront?'#eaf0f5':'#e9edf1');icon(win.app,x+17,y+13,29);text(apps[win.app].title,x+60,y+36,19,'#3e4a58',500);
    hit.push({id:win.id+'-surface',x,y,w,h,win,action:()=>{},cursor:'default'});
    hit.push({id:win.id+'-drag',x,y,w:w-157,h:59,win,drag:true,cursor:'grab'});
    const buttons=[['min','−',()=>{win.minimized=true;notify('minimize-window');}],['max',win.maximized?'❐':'□',()=>maximize(win)],['close','×',()=>close(win)]];
    buttons.forEach(([id,label,fn],i)=>{const bx=x+w-156+i*52;const over=hovered({x:bx,y,w:52,h:59});if(over)rr(bx,y,52,59,0,id==='close'?'#c94b4b':'#d9e2eb');text(label,bx+26,y+37,id==='close'?30:25,over&&id==='close'?'#fff':'#53616d',400,'center');hit.push({id:win.id+'-'+id,x:bx,y,w:52,h:59,win,cursor:'pointer',hover:true,action:fn});});
    c.beginPath();c.rect(x,y+59,w,h-59);c.clip();
    if(win.app==='photos')drawPhotos(win,x,y+59,w,h-59);
    if(win.app==='videos')drawVideos(win,x,y+59,w,h-59);
    if(win.app==='home')drawHome(win,x,y+59,w,h-59);
    c.restore();
    rr(x,y,w,h,14,null,isFront?'rgba(236,248,255,.63)':'rgba(236,248,255,.25)');
    if(win.maxScroll>0){const track=h-180,thumb=Math.max(35,track/(1+win.maxScroll/(h-100)));rr(x+w-9,y+122+(track-thumb)*win.scroll/win.maxScroll,4,thumb,2,'#9daab6');}
  }
  function taskbar(){
    rr(0,H-TASK,W,TASK,0,'rgba(228,237,244,.97)');c.fillStyle='rgba(255,255,255,.65)';c.fillRect(0,H-TASK,W,1);
    text('记忆房间',25,H-26,19,'#596e7b',500);
    const items=['start','photos','videos','home'];items.forEach((app,i)=>{const x=W/2-128+i*65,y=H-TASK+7,win=windows.find(z=>z.app===app);if(hovered({x,y,w:56,h:52})||(app==='start'&&startOpen))rr(x,y,56,52,8,'#f7fbff');icon(app,x+10,y+8,35);if(win)rr(x+21,y+48,14,3,2,win.minimized?'#7c909c':'#3484c5');hit.push({id:'task-'+app,x,y,w:56,h:52,cursor:'pointer',hover:true,action:()=>{if(app==='start'){startOpen=!startOpen;notify('start');}else if(win&&!win.minimized&&windows.filter(w=>!w.minimized).at(-1)===win){win.minimized=true;notify('minimize-window');}else open(app);}});});
    const now=new Date();text(now.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}),W-28,H-37,20,'#384d5c',500,'right');text(now.toLocaleDateString('zh-CN'),W-28,H-14,15,'#6d7d87',400,'right');
    // Small network and speaker symbols convey a desktop without enabling audio.
    c.strokeStyle='#607481';c.lineWidth=2;for(let i=1;i<4;i++){c.beginPath();c.arc(W-171,H-27,i*5,Math.PI*1.15,Math.PI*1.85);c.stroke();}
    text('静音',W-145,H-24,15,'#607481');
  }
  function drawStart(){if(!startOpen)return;const x=490,y=H-TASK-482,w=620,h=466;panel(x,y,w,h,16,35,0,'rgba(4,20,40,.28)','#edf2f7');hit.push({id:'start-surface',x,y,w,h,cursor:'default',action:()=>{}});rr(x+28,y+25,w-56,50,8,'#fff','#d1dce6');text('应用、照片与记忆',x+47,y+58,20,'#8796a3');text('已固定',x+38,y+116,21,'#384b5c',600);
    ['photos','videos','home'].forEach((app,i)=>{const xx=x+36+i*184,yy=y+145;rr(xx,yy,174,126,10,hovered({x:xx,y:yy,w:174,h:126})?'#fff':'#e8eef5');icon(app,xx+62,yy+17,48);text(apps[app].title,xx+87,yy+100,21,'#394e60',400,'center');hit.push({id:'start-'+app,x:xx,y:yy,w:174,h:126,cursor:'pointer',hover:true,action:()=>open(app)});});
    const recent=[data.title?`《${data.title}》`:'',data.photos.length?`${data.photos.length} 张图片`:'',data.videos.length?`${data.videos.length} 个收藏`:''].filter(Boolean);
    text('最近项目',x+39,y+323,21,'#384b5c',600);text(recent.length?recent.join('  ·  '):'暂无最近项目',x+39,y+363,18,'#738593');rr(x,y+h-66,w,66,[0,0,16,16],'#e1e9f0');icon('home',x+33,y+h-49,33);text(data.owner,x+84,y+h-27,19,'#496070',500);text('记忆桌面',x+w-36,y+h-27,17,'#788c9b',400,'right');}
  function cursor(){if(externalCursor||!mouse.visible||!active)return;const {x,y}=mouse;const target=findHit(x,y);c.save();c.translate(x,y);c.shadowColor='rgba(0,0,0,.4)';c.shadowBlur=2;c.shadowOffsetY=1;c.fillStyle='#fff';c.strokeStyle='#1f2d34';c.lineWidth=1.7;c.beginPath();c.moveTo(0,0);c.lineTo(0,25);c.lineTo(6,19);c.lineTo(11,30);c.lineTo(16,28);c.lineTo(11,17);c.lineTo(21,17);c.closePath();c.fill();c.stroke();c.restore();return target;}
  function findHit(x,y){for(let i=hit.length-1;i>=0;i--){const t=hit[i];if(!inside(x,y,t)||(t.clip&&!inside(x,y,t.clip)))continue;if(t.win&&(y<t.win.y||y>t.win.y+t.win.h||x<t.win.x||x>t.win.x+t.win.w))continue;if(t.win&&!t.id.startsWith(t.win.id)&&y<t.win.y+59)continue;return t;}return null;}
  function hoverKey(target){return active&&mouse.visible&&target?.hover?target.id:'';}
  function paintContent(){
    c=contentContext;hit=[];wallpaper();windows.forEach(drawWindow);taskbar();drawStart();
    if(toastTime>0){rr(W/2-210,H-150,420,55,9,'rgba(20,39,53,.92)');text(toast,W/2,H-115,20,'#fff',400,'center');}
    contentDirty=false;hitDirty=false;contentVersion++;hoverId=hoverKey(findHit(mouse.x,mouse.y));
  }
  function cursorRect(){
    if(externalCursor||!active||!mouse.visible)return null;
    const x=Math.max(0,Math.floor(mouse.x)-8),y=Math.max(0,Math.floor(mouse.y)-8);
    const right=Math.min(W,Math.ceil(mouse.x)+32),bottom=Math.min(H,Math.ceil(mouse.y)+42);
    return right>x&&bottom>y?{x,y,w:right-x,h:bottom-y}:null;
  }
  function render(){
    if(disposed)return;
    if(contentDirty)paintContent();
    c=outputContext;
    if(presentedVersion!==contentVersion){c.drawImage(contentCanvas,0,0);presentedVersion=contentVersion;}
    else if(previousCursor){const r=previousCursor;c.drawImage(contentCanvas,r.x,r.y,r.w,r.h,r.x,r.y,r.w,r.h);}
    cursor();previousCursor=cursorRect();texture.needsUpdate=true;dirty=false;
  }

  function clearImagePointerState(){drag=null;scrollDrag=null;photoDrag=null;down=null;lastUp={id:null,time:-Infinity};lastPhotoTap={id:null,time:-Infinity};}
  function handleImagePinch(event){
    const type=event.type,points=event.points;
    const valid=Array.isArray(points)&&points.length===2&&points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1);
    const reply=()=>({handled:true,pinching:!!imagePinch,cursor:imagePinch?'grabbing':'default',dragging:false});
    if(type==='pinchend'||type==='pinchcancel'){imagePinch=null;clearImagePointerState();return reply();}
    if(hitDirty)paintContent();
    const p=valid?points.map(q=>({x:q.x*W,y:q.y*H})):null;
    if(type==='pinchstart'){
      // Both original contacts must hit one image; a title/button press cannot become an image gesture.
      const ownerView=photoDrag?.view,a=p&&findHit(p[0].x,p[0].y),b=p&&findHit(p[1].x,p[1].y),view=a?.photoView;
      const distance=p?Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y):0;
      imagePinch=null;clearImagePointerState();
      if(view&&ownerView===view&&b?.photoView===view&&view.imageWidth&&view.imageHeight&&distance>4)imagePinch={view,startZoom:view.zoom,startDistance:distance,startPanX:view.panX,startPanY:view.panY,startX:(p[0].x+p[1].x)/2,startY:(p[0].y+p[1].y)/2};
      return reply();
    }
    if(type==='pinchmove'&&imagePinch){
      const gesture=imagePinch;
      if(!valid||!hit.some(h=>h.photoView===gesture.view)){imagePinch=null;clearImagePointerState();return reply();}
      const distance=Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y),x=(p[0].x+p[1].x)/2,y=(p[0].y+p[1].y)/2;
      // Anchor to the initial image point, not the order in which two pointer events arrive.
      const view=gesture.view,oldZoom=view.zoom,oldX=view.panX,oldY=view.panY;
      const next=clamp(gesture.startZoom*distance/gesture.startDistance,1,8),ratio=next/gesture.startZoom,r=view.viewport,cx=r.x+r.w/2,cy=r.y+r.h/2;
      view.zoom=next;
      view.panX=x-cx-(gesture.startX-cx-gesture.startPanX)*ratio;
      view.panY=y-cy-(gesture.startY-cy-gesture.startPanY)*ratio;
      photoViewFrame(view);
      if(view.zoom!==oldZoom||view.panX!==oldX||view.panY!==oldY)notify('photo-pinch',true,false);
    }
    return reply();
  }
  function handlePointer(event={}) {
    if(disposed||!active)return {handled:false,cursor:'default',dragging:false};
    const type=String(event.type||'move').replace(/^pointer/,'');
    if(type.startsWith('pinch'))return handleImagePinch({...event,type});
    if(imagePinch&&type!=='cancel')return {handled:true,pinching:true,cursor:'grabbing',dragging:false};
    const oldX=mouse.x,oldY=mouse.y,oldVisible=mouse.visible;
    if(Number.isFinite(event.x))mouse.x=Math.round(clamp(event.x,-.25,1.25)*W);
    if(Number.isFinite(event.y))mouse.y=Math.round(clamp(event.y,-.25,1.25)*H);
    mouse.visible=type!=='leave'&&type!=='cancel';
    const pointerChanged=oldX!==mouse.x||oldY!==mouse.y||oldVisible!==mouse.visible;
    // Moving a cursor never paints content or uploads the texture. A click may
    // need a fresh hit map after an earlier action, even before the next update.
    if(hitDirty&&type!=='move'&&!(type==='up'&&drag))paintContent();
    let target=findHit(mouse.x,mouse.y);
    if(type==='down'){
      if(event.button===undefined||event.button===0){
        if(startOpen&&!inside(mouse.x,mouse.y,{x:490,y:H-TASK-482,w:620,h:466})&&target?.id!=='task-start'){
          startOpen=false;notify('start');paintContent();target=findHit(mouse.x,mouse.y);
        }
        if(!target?.photoView)lastPhotoTap={id:null,time:-Infinity};
        if(target?.win){front(target.win);if(target.drag){drag={win:target.win,dx:mouse.x-target.win.x,dy:mouse.y-target.win.y,grabFraction:clamp((mouse.x-target.win.x)/target.win.w,0,1),started:false};}}
        if(!drag&&target?.photoView)photoDrag={view:target.photoView,x:mouse.x,y:mouse.y,panX:target.photoView.panX,panY:target.photoView.panY,started:false};
        if(!drag&&event.pointerType==='touch'&&target?.win?.listViewport&&target.win.maxScroll>0&&inside(mouse.x,mouse.y,target.win.listViewport))scrollDrag={win:target.win,y:mouse.y,scroll:target.win.scroll,started:false};
        down={id:target?.id,x:mouse.x,y:mouse.y};
      }
    } else if(type==='move'&&drag){
      // A title click is not a drag. Restore a maximized window only after
      // deliberate travel, keeping the same part of its title under the hand.
      if(!drag.started&&down&&Math.hypot(mouse.x-down.x,mouse.y-down.y)>6){
        drag.started=true;lastUp={id:null,time:-Infinity};
        if(drag.win.maximized){maximize(drag.win);drag.dx=drag.win.w*drag.grabFraction;drag.dy=Math.min(drag.dy,48);}
      }
      if(drag.started){
        const x=clamp(mouse.x-drag.dx,-drag.win.w+180,W-180),y=clamp(mouse.y-drag.dy,0,H-TASK-60);
        if(x!==drag.win.x||y!==drag.win.y){drag.win.x=x;drag.win.y=y;notify('drag-window');}
      }
    }else if(type==='move'&&photoDrag){
      if(!photoDrag.started&&Math.hypot(mouse.x-photoDrag.x,mouse.y-photoDrag.y)>6){photoDrag.started=true;lastUp={id:null,time:-Infinity};}
      if(photoDrag.started){const view=photoDrag.view,oldX=view.panX,oldY=view.panY;view.panX=photoDrag.panX+mouse.x-photoDrag.x;view.panY=photoDrag.panY+mouse.y-photoDrag.y;photoViewFrame(view);if(oldX!==view.panX||oldY!==view.panY)notify('photo-pan',true,false);}
    }else if(type==='move'&&scrollDrag){
      if(!scrollDrag.started&&Math.abs(mouse.y-scrollDrag.y)>6){scrollDrag.started=true;lastUp={id:null,time:-Infinity};}
      if(scrollDrag.started){const scroll=clamp(scrollDrag.scroll+scrollDrag.y-mouse.y,0,scrollDrag.win.maxScroll||0);if(scroll!==scrollDrag.win.scroll){scrollDrag.win.scroll=scroll;notify('touch-scroll-window');}}
    }else if(type==='up'){
      if(photoDrag){
        const now=performance.now();
        const tap=!photoDrag.started&&down&&target?.id===down.id;
        if(tap&&lastPhotoTap.id===target.id&&now-lastPhotoTap.time<430){togglePhoto(photoDrag.view,mouse.x,mouse.y);lastPhotoToggle=now;lastPhotoTap={id:null,time:-Infinity};}
        else lastPhotoTap=tap?{id:target.id,time:now}:{id:null,time:-Infinity};
        lastUp={id:target?.id,time:now};
      }
      else if(scrollDrag?.started){lastUp={id:target?.id,time:performance.now()};}
      else if(drag&&!drag.started&&down&&target?.id===down.id){
        const now=performance.now();
        if(lastUp.id===target.id&&now-lastUp.time<430){maximize(drag.win);lastTitleToggle=now;lastUp={id:null,time:-Infinity};}
        else lastUp={id:target.id,time:now};
      }
      else if(!drag&&down&&target&&target.id===down.id&&Math.hypot(mouse.x-down.x,mouse.y-down.y)<12){target?.action?.();lastUp={id:target.id,time:performance.now()};}
      drag=null;scrollDrag=null;photoDrag=null;down=null;
    }else if(type==='click'){if(!down&&!(target?.id===lastUp.id&&performance.now()-lastUp.time<450))target?.action?.();}
    else if(type==='dblclick'){if(target?.photoView){if(performance.now()-lastPhotoToggle>=450){togglePhoto(target.photoView,mouse.x,mouse.y);lastPhotoToggle=performance.now();}}else if(target?.drag&&performance.now()-lastTitleToggle>=450)maximize(target.win);else if(target?.id?.startsWith('desktop-'))open(target.id.slice(8));}
    else if(type==='wheel'){
      const win=[...windows].reverse().find(z=>!z.minimized&&inside(mouse.x,mouse.y,z));
      if(win&&event.wheelY){lastPhotoTap={id:null,time:-Infinity};
        if((win.app==='photos'||win.app==='home'&&data.resume)&&win.photo>=0){if(target?.photoView&&!photoDrag)zoomPhoto(target.photoView,target.photoView.zoom*Math.exp(-clamp(event.wheelY,-300,300)*.0013),mouse.x,mouse.y);}
        else{const scroll=clamp(win.scroll+event.wheelY*.65,0,win.maxScroll||0);if(scroll!==win.scroll){win.scroll=scroll;notify('scroll-window');}}
      }
    }else if(type==='cancel'){imagePinch=null;clearImagePointerState();}
    const nextHover=hoverKey(target),hoverChanged=nextHover!==hoverId;
    if(hoverChanged)hoverId=nextHover;
    if((pointerChanged&&!externalCursor)||hoverChanged)notify('pointer',hoverChanged,false);
    return {handled:true,cursor:drag||scrollDrag?.started||photoDrag?.started?'grabbing':target?.cursor||'default',dragging:!!drag||!!scrollDrag?.started||!!photoDrag?.started};
  }
  function update(delta=0){
    if(disposed)return;
    const visibleFlow=windows.some((win,index)=>win.flow&&!win.minimized&&!windows.slice(index+1).some(cover=>!cover.minimized&&cover.x<=win.x&&cover.y<=win.y&&cover.x+cover.w>=win.x+win.w&&cover.y+cover.h>=win.y+win.h));
    if(active&&data.photos.length&&visibleFlow&&delta>0){flowTime+=delta;notify('photo-flow',true,false);}
    const stamp=Math.floor(Date.now()/60000);if(stamp!==clockTime){clockTime=stamp;notify('clock',true,false);}
    if(toastTime>0){toastTime=Math.max(0,toastTime-delta);notify('toast',true,false);}
    if(dirty)render();
  }
  function setActive(value){if(disposed||active===!!value)return;active=!!value;if(!active){imagePinch=null;clearImagePointerState();startOpen=false;mouse.visible=false;}notify('active');update(0);}
  // Optional scene integration: a separate small 3D cursor avoids uploading this
  // entire texture for movement alone. The scene must render that cursor itself.
  function setExternalCursor(value){if(disposed||externalCursor===!!value)return;externalCursor=!!value;notify('cursor-mode',false,false);update(0);}
  // Explicit full replacement. Missing fields stay empty; no merge, fetch, storage
  // restore or fallback can silently retain content from a previous data set.
  function setData(value={}){
    if(disposed)return;
    imagePinch=null;clearImagePointerState();
    lastPhotoTap={id:null,time:-Infinity};
    const source=value&&typeof value==='object'?value:{};
    const clean=v=>typeof v==='string'?v.trim():'';
    const items=(list,fields)=>Array.isArray(list)?list.filter(v=>v&&typeof v==='object').map(v=>Object.fromEntries(fields.map(k=>[k,k==='url'?safeURL(v[k]):clean(v[k])]))).filter(v=>v.url):[];
    const resumeURL=safeResumeURL(source.resume?.url);
    data={owner:clean(source.owner),title:clean(source.title),subtitle:clean(source.subtitle),introduction:clean(source.introduction),homepageUrl:safeURL(source.homepageUrl),photos:items(source.photos,['id','title','note','url']),videos:items(source.videos,['id','title','author','category','color','url']),resume:resumeURL?{title:clean(source.resume?.title)||'简历排版示例',url:resumeURL,note:''}:null};
    for(const {image} of images.values()){image.onload=null;image.onerror=null;}images.clear();
    for(const win of windows){win.scroll=0;win.maxScroll=0;if(win.app==='photos'||win.app==='home'){win.photo=-1;win.flow=false;win.photoView=null;}}
    notify('data');update(0);
  }
  function getState(){return {active,windows:windows.map(w=>({id:w.id,app:w.app,x:w.x,y:w.y,w:w.w,h:w.h,minimized:w.minimized,maximized:w.maximized,photo:w.photo,scroll:w.scroll,photoView:w.photoView?{zoom:w.photoView.zoom,panX:w.photoView.panX,panY:w.photoView.panY,viewport:{...w.photoView.viewport}}:null})),startOpen,photos:data.photos.length,videos:data.videos.length,dragging:!!drag};}
  function dispose(){if(disposed)return;disposed=true;imagePinch=null;clearImagePointerState();for(const {image} of images.values()){image.onload=null;image.onerror=null;}images.clear();windows=[];hit=[];texture.dispose();for(const layer of [canvas,contentCanvas,wallpaperCanvas,...[...panelCache.values()].map(v=>v.layer)]){layer.width=1;layer.height=1;}panelCache.clear();previousCursor=null;}
  buildWallpaper();render();
  return {texture,handlePointer,update,setActive,dispose,setData,getState,openApp:open,setExternalCursor};
}


