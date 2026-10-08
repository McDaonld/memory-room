// A physical sheet in the existing room. Content is separately sourced;
// object movement, hit testing and return use the room's ordinary inspector.
export const RESUME_PAPER = Object.freeze({width:.42,height:.594,thickness:.00065,segmentsX:12,segmentsY:18});
export async function loadResumePaper(THREE,options={}){
 const manifestURL=new URL('./assets/resume-document.json',import.meta.url);
 const response=await fetch(manifestURL);if(!response.ok)throw Error('Cannot load résumé manifest');
 const source=await response.json();
 // The public edition uses a separately supplied, explicitly marked example page.
 if(!source.image)return null;
 const imageURL=new URL(source.image,manifestURL);
 if(imageURL.origin!==manifestURL.origin||!imageURL.pathname.startsWith(new URL('./resume/',manifestURL).pathname)||!/\.(png|webp|jpe?g)$/i.test(imageURL.pathname))throw Error('Résumé must use a reviewed local document image');
 const image=await new THREE.ImageLoader().loadAsync(imageURL.href);
 if(!(image.width>0&&image.height>0&&image.width<=8192&&image.height<=8192))throw Error('Invalid résumé page');
 return {...createResumePaper(THREE,image,options),title:source.title||'简历排版示例',document:{title:source.title||'简历排版示例',url:imageURL.href}};
}
const PAPER='#faf9f5';
// The page is loaded from a local document image; the public example contains no personal biography.
export function drawResumePage(image,{width=2400,createCanvas}={}) {
 if(!(image?.width>0&&image?.height>0))throw new TypeError('An existing reviewed résumé image is required.');
 const height=Math.round(width*RESUME_PAPER.height/RESUME_PAPER.width);
 const canvas=createCanvas?createCanvas(width,height):document.createElement('canvas');
 canvas.width=width;canvas.height=height;
 const context=canvas.getContext('2d',{alpha:false});context.fillStyle=PAPER;context.fillRect(0,0,width,height);
 const scale=Math.min(width/image.width,height/image.height),w=image.width*scale,h=image.height*scale;
 context.drawImage(image,(width-w)/2,(height-h)/2,w,h);return canvas;
}

function curl(x,y){
 // A small, localized lifted corner; most of the sheet really rests flat.
 const right=Math.max(0,(x/RESUME_PAPER.width+.5-.76)/.24);
 const top=Math.max(0,(y/RESUME_PAPER.height+.5-.77)/.23);
 return .0014*right*right*top*top;
}
function surfaceGeometry(THREE,z,back=false){
 const {width,height,segmentsX,segmentsY}=RESUME_PAPER;
 const geometry=new THREE.PlaneGeometry(width,height,segmentsX,segmentsY),p=geometry.attributes.position;
 for(let i=0;i<p.count;i++)p.setZ(i,z+curl(p.getX(i),p.getY(i)));
 if(back){const index=geometry.index;for(let i=0;i<index.count;i+=3){const a=index.getX(i);index.setX(i,index.getX(i+2));index.setX(i+2,a);}}
 geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
function edgeGeometry(THREE){
 const {width:w,height:h,thickness:t,segmentsX:nx,segmentsY:ny}=RESUME_PAPER;
 const perimeter=[];for(let i=0;i<nx;i++)perimeter.push([-w/2+w*i/nx,h/2]);
 for(let i=0;i<ny;i++)perimeter.push([w/2,h/2-h*i/ny]);
 for(let i=0;i<nx;i++)perimeter.push([w/2-w*i/nx,-h/2]);
 for(let i=0;i<ny;i++)perimeter.push([-w/2,-h/2+h*i/ny]);
 const vertices=[];
 for(let i=0;i<perimeter.length;i++){
  const a=perimeter[i],b=perimeter[(i+1)%perimeter.length],az=curl(...a),bz=curl(...b);
  vertices.push(a[0],a[1],az-t/2,b[0],b[1],bz-t/2,b[0],b[1],bz+t/2,a[0],a[1],az-t/2,b[0],b[1],bz+t/2,a[0],a[1],az+t/2);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();return geometry;
}
export function createResumePaper(THREE,image,{anisotropy=8,position=[-.378,1.155+RESUME_PAPER.thickness/2+.00015,.524]}={}) {
 const canvas=drawResumePage(image),map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
 map.anisotropy=Math.min(16,Math.max(1,anisotropy));map.name='Resume clear print';
 const root=new THREE.Group();root.name='ResumePaperRoot';root.position.fromArray(position);root.rotation.x=-Math.PI/2;
 const face=new THREE.Mesh(surfaceGeometry(THREE,RESUME_PAPER.thickness/2),new THREE.MeshPhysicalMaterial({map,roughness:.91,metalness:0,specularIntensity:.16}));
 face.name='ResumePrintedFace';face.castShadow=face.receiveShadow=true;root.add(face);
 const back=new THREE.Mesh(surfaceGeometry(THREE,-RESUME_PAPER.thickness/2,true),new THREE.MeshStandardMaterial({color:PAPER,roughness:.94}));
 back.name='ResumePaperBack';back.castShadow=back.receiveShadow=true;root.add(back);
 const edge=new THREE.Mesh(edgeGeometry(THREE),new THREE.MeshStandardMaterial({color:'#d8d7cc',roughness:.96,side:THREE.DoubleSide}));
 edge.name='ResumePaperEdge';edge.castShadow=edge.receiveShadow=true;root.add(edge);
 root.userData.paperDimensions={width:RESUME_PAPER.width,height:RESUME_PAPER.height,thickness:RESUME_PAPER.thickness};
 root.userData.printResolution=[canvas.width,canvas.height];
 root.updateMatrixWorld(true);
 return {root,canvas,dispose(){map.dispose();root.traverse(mesh=>{if(mesh.isMesh){mesh.geometry.dispose();mesh.material.dispose();}});root.removeFromParent();}};
}
