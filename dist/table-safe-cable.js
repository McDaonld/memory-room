// World-space cable support for a flat desk. No scene ownership or animation policy.
// Anchor points should already be above the desk; device localToWorld updates stay in the caller.
export function createTableSafeCableCurve(THREE,sourceCurve,{tableTop=1.155,radius=.0022,clearance=.00005}={}){
 if(!(radius>0)||clearance<0||!Number.isFinite(tableTop))throw new RangeError('Invalid cable/desk dimensions');
 const floor=tableTop+radius+clearance;
 class SupportedCableCurve extends THREE.Curve{
  constructor(){super();this.arcLengthDivisions=Math.max(200,sourceCurve.arcLengthDivisions||200);}
  getPoint(t,target=new THREE.Vector3()){
   sourceCurve.getPoint(t,target);target.y=Math.max(floor,target.y);return target;
  }
 }
 return new SupportedCableCurve();
}

export function createTableSafeCableGeometry(THREE,points,{tableTop=1.155,radius=.0022,clearance=.00005,tableContactIndices=[],tubularSegments=48,radialSegments=6}={}){
 if(!Array.isArray(points)||points.length<2)throw new TypeError('At least two cable anchors are required');
 const route=points.map(p=>p.clone()),floor=tableTop+radius+clearance;
 // Explicitly named interior control points lie on the tabletop; never silently settle a device anchor.
 for(const index of tableContactIndices){
  if(!Number.isInteger(index)||index<=0||index>=route.length-1)throw new RangeError('Table contact indices must be interior points');
  route[index].y=floor;
 }
 const source=new THREE.CatmullRomCurve3(route),curve=createTableSafeCableCurve(THREE,source,{tableTop,radius,clearance});
 const geometry=new THREE.TubeGeometry(curve,tubularSegments,radius,radialSegments,false);
 return {geometry,curve,route};
}

export function auditCableTableClearance(geometry,{tableTop=1.155,tolerance=1e-7}={}){
 const p=geometry.attributes.position;if(!p)throw new TypeError('Cable geometry has no positions');
 let minimumY=Infinity,minimumIndex=-1;
 for(let i=0;i<p.count;i++)if(p.getY(i)<minimumY){minimumY=p.getY(i);minimumIndex=i;}
 return {vertexCount:p.count,minimumY,minimumGap:minimumY-tableTop,passes:minimumY>=tableTop-tolerance,minimumPoint:[p.getX(minimumIndex),p.getY(minimumIndex),p.getZ(minimumIndex)]};
}
