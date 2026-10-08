// Neutral readable printing on the existing cover and spine meshes.
// Text comes from public example records; geometry and hinges stay intact.
const appliedBooks = new WeakMap();
const textureCache = new Map();
const FONT = '"Microsoft YaHei", "Noto Sans SC", "PingFang SC", sans-serif';

function canvas(width, height) {
  const element = document.createElement('canvas');
  element.width = width; element.height = height;
  const context = element.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas 2D is unavailable for book printing.');
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  context.textAlign = 'center'; context.textBaseline = 'middle';
  return { element, context };
}
function font(context, size, bold = true) {
  context.font = `${bold ? 800 : 500} ${Math.round(size)}px ${FONT}`;
}
function line(context, text, x, y, maxWidth, size, color, bold = true) {
  if (!text) return;
  font(context, size, bold);
  while (size > 14 && context.measureText(text).width > maxWidth) font(context, size *= .95, bold);
  context.fillStyle = color; context.fillText(text, x, y);
}
function column(context, text, x, top, bottom, maxSize, color, bold = true) {
  if (!text) return;
  // Chinese remains upright; only runs of Latin letters/digits turn clockwise.
  const tokens = String(text).match(/[A-Za-z0-9]+|[^A-Za-z0-9]/gu) || [];
  const units = tokens.map(s => /^[A-Za-z0-9]+$/.test(s) ? Math.max(1, s.length * .59) : /\s/.test(s) ? .40 : 1.12);
  const size = Math.min(maxSize, (bottom - top) / units.reduce((a, b) => a + b, 0));
  let y = top;
  tokens.forEach((s, i) => {
    const height = units[i] * size;
    font(context, size, bold); context.fillStyle = color;
    if (/^[A-Za-z0-9]+$/.test(s)) {
      context.save(); context.translate(x, y + height / 2); context.rotate(Math.PI / 2);
      context.fillText(s, 0, 0); context.restore();
    } else if (!/\s/.test(s)) context.fillText(s, x, y + height / 2);
    y += height;
  });
}
function allowedPrint(identity) {
  // The caller supplies the public example title and optional subtitle.
  const p = identity?.print || {};
  if (!identity || identity.status === 'unknown') return { visibleText: [] };
  return {
    brand: p.brand || '', title: p.title || '', subject: p.subject || '',
    edition: p.edition || '', year: p.year || '', region: p.region || '',
    visibleText: Array.isArray(p.visibleText) ? p.visibleText.filter(Boolean) : [],
  };
}
function drawSpine(context, width, height, identity, p, horizontal) {
  const appearance=identity?.appearance||{},ink=appearance.ink||'#26352e';
  context.fillStyle=appearance.base||'#e9e2ce';context.fillRect(0,0,width,height);
  context.fillStyle=appearance.accent||'#7c9896';
  const words=p.title||p.visibleText.join('　')||'示例读本';
  if(horizontal){
    context.fillRect(0,0,width*.035,height);
    line(context,words,width*.53,height*.5,width*.86,height*.62,ink);
  }else{
    context.fillRect(0,0,width,height*.035);
    context.fillRect(0,height*.965,width,height*.035);
    column(context,words,width*.5,height*.13,height*.87,width*.64,ink);
  }
}
function drawCover(context, width, height, identity, p) {
  const a = identity?.appearance || {}, ink = a.ink || '#23342d';
  const title = p.title || p.visibleText?.[0] || '';
  context.fillStyle = a.base || '#ece9d9'; context.fillRect(0, 0, width, height);
  // Plain typography and an accent strip make the cover reusable.
  const accent = a.accent || '#7c9896';
  context.fillStyle = accent; context.fillRect(0, 0, width * .035, height);
  if (p.brand) line(context, p.brand, width * .54, height * .11, width * .76, width * .079, ink);
  line(context, title, width * .54, height * .35, width * .80, width * .145, ink);
  if (p.subject && p.subject !== title) line(context, p.subject, width * .54, height * .56, width * .78, width * .139, accent);
  line(context, p.edition, width * .54, height * .72, width * .80, width * .052, ink, false);
  line(context, [p.year, p.region].filter(Boolean).join(' · '), width * .54, height * .84, width * .74, width * .071, ink, false);
}
function textureFor(THREE, kind, identity, print, horizontal, anisotropy, physicalAspect) {
  const longEdge=kind==='cover'?2048:3072;
  const ratio=Number.isFinite(physicalAspect)&&physicalAspect>0?physicalAspect:(kind==='cover'?2/3:horizontal?2048/192:256/3072);
  const width=ratio>=1?longEdge:Math.max(8,Math.round(longEdge*ratio));
  const height=ratio>=1?Math.max(8,Math.round(longEdge/ratio)):longEdge;
  const key = JSON.stringify({ kind, appearance: identity?.appearance, print, horizontal, width, height, grade:identity?.grade, term:identity?.term, edition:identity?.edition_label });
  let record = textureCache.get(key);
  if (!record) {
    const { element, context } = canvas(width, height);
    if (kind === 'cover') drawCover(context, width, height, identity, print);
    else drawSpine(context, width, height, identity, print, horizontal);
    const texture = new THREE.CanvasTexture(element);
    texture.name = `Readable ${kind}: ${identity?.root || 'unidentified'}`;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.userData.physicalPrint={kind,width,height,physicalAspect:ratio,pixelAspect:width/height,nonuniformTextTransform:false};
    // glTF UVs already use image-top-down V, including the horizontal spines.
    texture.flipY = false; texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping; texture.wrapT = THREE.ClampToEdgeWrapping;
    record = { texture, refs: 0 }; textureCache.set(key, record);
  }
  record.refs++; record.texture.anisotropy = Math.max(record.texture.anisotropy || 1, anisotropy);
  record.texture.needsUpdate = true;
  return { texture: record.texture, release() { if (--record.refs === 0) { record.texture.dispose(); textureCache.delete(key); } } };
}
function unitUV(geometry) {
  const uv = geometry.getAttribute('uv');
  if (!uv || !uv.count) return false;
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (let i = 0; i < uv.count; i++) {
    minU = Math.min(minU, uv.getX(i)); maxU = Math.max(maxU, uv.getX(i));
    minV = Math.min(minV, uv.getY(i)); maxV = Math.max(maxV, uv.getY(i));
  }
  if (maxU - minU < 1e-9 || maxV - minV < 1e-9) return false;
  for (let i = 0; i < uv.count; i++) uv.setXY(i,
    (uv.getX(i) - minU) / (maxU - minU), (uv.getY(i) - minV) / (maxV - minV));
  uv.needsUpdate = true; return true;
}

function physicalPrintAspect(THREE, mesh, root, kind, horizontal) {
  root.updateWorldMatrix(true,true);
  const inverse=root.matrixWorld.clone().invert(),box=new THREE.Box3(),position=mesh.geometry.attributes.position,v=new THREE.Vector3();
  for(let i=0;i<position.count;i++)box.expandByPoint(v.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse));
  const size=box.getSize(new THREE.Vector3());
  return kind==='cover'?size.x/size.y:horizontal?size.y/size.z:size.z/size.y;
}

export function applyReadableBookPrint(THREE, bookRoot, spec, identity, anisotropy = 8, verifiedSource = null) {
  if (!bookRoot?.traverse) return { applied: 0, reason: 'missing book root', dispose() {} };
  appliedBooks.get(bookRoot)?.dispose();
  const print = allowedPrint(identity), owned = [], releases = [];
  const horizontal = Boolean(spec?.spinePrintHorizontal);
  const textures = { cover: null, spine: null };
  const aniso = Math.max(1, Math.min(16, Number.isFinite(anisotropy) ? anisotropy : 8));
  bookRoot.traverse(mesh => {
    if (!mesh.isMesh) return;
    const name = mesh.name.replace(/[^a-z0-9]/gi, '');
    const kind = /(?:PrintedCover|PrintCover)$/i.test(name) ? 'cover'
      : /CurvedPrintedSpine$/i.test(name) ? 'spine' : null;
    if (!kind) return; // Never touch cover stock, inner page, page block or hinge.
    const originalGeometry = mesh.geometry, originalMaterial = mesh.material;
    const geometry = originalGeometry.clone();
    if (!unitUV(geometry)) { geometry.dispose(); return; }
    const source = Array.isArray(originalMaterial) ? originalMaterial[0] : originalMaterial;
    const material = source?.clone ? source.clone() : new THREE.MeshStandardMaterial();
    // Source atlas and surface-grain maps must not distort the new exact print.
    material.map = null; material.normalMap = null; material.roughnessMap = null;
    material.metalnessMap = null; material.aoMap = null; material.emissiveMap = null;
    material.bumpMap = null; material.alphaMap = null; material.transparent = false;
    material.opacity = 1; material.roughness = .82; material.metalness = 0;
    material.color.set('#ffffff');
    const hasWords = Boolean(print.title || print.brand || print.visibleText?.length);
    if (kind === 'spine' || hasWords) {
      const resource = textureFor(THREE, kind, identity, print, horizontal, aniso, physicalPrintAspect(THREE,mesh,bookRoot,kind,horizontal));
      material.map = resource.texture; textures[kind] = resource.texture; releases.push(resource.release);
    } else {
      // An unobserved, unlabelled cover needs no giant blank GPU texture.
      material.color.set(identity?.appearance?.base || '#ece9d9');
    }
    material.name = `Readable ${kind} | ${bookRoot.name}`; material.needsUpdate = true;
    mesh.geometry = geometry; mesh.material = material;
    owned.push({ mesh, originalGeometry, originalMaterial, geometry, material });
  });
  let disposed = false;
  const result = {
    applied: owned.length, textures, status: identity?.status || 'unknown',
    catalogLabel: identity?.catalogLabel || '示例读本',
    dispose() {
      if (disposed) return; disposed = true;
      for (const r of owned) {
        if (r.mesh.geometry === r.geometry) r.mesh.geometry = r.originalGeometry;
        if (r.mesh.material === r.material) r.mesh.material = r.originalMaterial;
        r.geometry.dispose(); r.material.dispose();
      }
      releases.forEach(release => release());
      if (appliedBooks.get(bookRoot) === result) appliedBooks.delete(bookRoot);
    },
  };
  appliedBooks.set(bookRoot, result); return result;
}
