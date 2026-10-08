import * as THREE from './vendor/three.module.js';

/** World units are metres in this room: 0.0001 = 0.1 mm. */
export const DEFAULT_EPSILON = 0.0001;
const UNIT_AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];

function finiteVector(v, label) {
  if (!v || ![v.x, v.y, v.z].every(Number.isFinite)) throw new TypeError(`${label} must be a finite Vector3`);
}
function unitQuaternion(q, label = 'quaternion') {
  if (!q || ![q.x, q.y, q.z, q.w].every(Number.isFinite) || q.lengthSq() < 1e-20) {
    throw new TypeError(`${label} must be a finite, nonzero Quaternion`);
  }
  return q.clone().normalize();
}
function nonnegative(value, label) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be finite and >= 0`);
  return value;
}
function checkedBounds(bounds) {
  finiteVector(bounds?.min, 'bounds.min'); finiteVector(bounds?.max, 'bounds.max');
  if (['x', 'y', 'z'].some(k => bounds.max[k] < bounds.min[k])) throw new RangeError('Local bounds must not be empty');
  return new THREE.Box3(bounds.min.clone(), bounds.max.clone());
}

/** Copies the supplied data; SAT/path functions never mutate their input OBBs. */
export function makeOBB(center, half, quaternion = new THREE.Quaternion(), id) {
  finiteVector(center, 'center'); finiteVector(half, 'half');
  if (Math.min(half.x, half.y, half.z) < 0) throw new RangeError('half extents must be >= 0');
  return { center: center.clone(), half: half.clone(), quaternion: unitQuaternion(quaternion), id };
}

function plainPose(pose) {
  finiteVector(pose?.position, 'pose.position');
  const scale = pose.scale?.clone() ?? new THREE.Vector3(1, 1, 1);
  finiteVector(scale, 'pose.scale');
  if (Math.min(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)) < 1e-12) throw new RangeError('Pose scale must be nonzero');
  return { position: pose.position.clone(), quaternion: unitQuaternion(pose.quaternion ?? new THREE.Quaternion()), scale };
}

/**
 * Local bounds + a world pose -> OBB. pose is Object3D, Matrix4, or
 * {position:Vector3, quaternion:Quaternion, scale?:Vector3}.
 * Bounds must be in the root's LOCAL coordinates, not Box3.setFromObject(world).
 * Orthogonal nonuniform/negative scales are supported; shear is rejected because
 * a sheared box is not an OBB and silently decomposing it gives false negatives.
 */
export function obbFromLocalBounds(localBounds, pose, { id, padding = 0, shearTolerance = 1e-6 } = {}) {
  const bounds = checkedBounds(localBounds);
  nonnegative(padding, 'padding'); nonnegative(shearTolerance, 'shearTolerance');
  let matrix;
  if (pose?.isObject3D) {
    pose.updateWorldMatrix(true, false);
    matrix = pose.matrixWorld;
    id ??= pose.name || pose.uuid;
  } else if (pose?.isMatrix4) matrix = pose;
  else {
    const p = plainPose(pose);
    matrix = new THREE.Matrix4().compose(p.position, p.quaternion, p.scale);
  }
  if (!matrix.elements.every(Number.isFinite)) throw new TypeError('Pose matrix must be finite');
  const e = matrix.elements;
  if (Math.abs(e[3]) + Math.abs(e[7]) + Math.abs(e[11]) > 1e-12 || Math.abs(e[15] - 1) > 1e-12) {
    throw new RangeError('Pose must be an affine matrix');
  }
  const axes = [0, 1, 2].map(i => new THREE.Vector3().setFromMatrixColumn(matrix, i));
  const lengths = axes.map(v => v.length());
  if (Math.min(...lengths) < 1e-12) throw new RangeError('Pose scale must be nonzero');
  axes.forEach((v, i) => v.divideScalar(lengths[i]));
  if (Math.max(Math.abs(axes[0].dot(axes[1])), Math.abs(axes[0].dot(axes[2])), Math.abs(axes[1].dot(axes[2]))) > shearTolerance) {
    throw new RangeError('Sheared world transform cannot be represented exactly by an OBB');
  }
  if (axes[0].clone().cross(axes[1]).dot(axes[2]) < 0) axes[0].negate();
  const rotation = new THREE.Matrix4().makeBasis(...axes);
  const center = bounds.getCenter(new THREE.Vector3()).applyMatrix4(matrix);
  const half = bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5)
    .multiply(new THREE.Vector3(...lengths)).addScalar(padding);
  return makeOBB(center, half, new THREE.Quaternion().setFromRotationMatrix(rotation), id);
}

function prepared(obb) {
  const copy = makeOBB(obb.center, obb.half, obb.quaternion, obb.id);
  return { ...copy, axes: UNIT_AXES.map(axis => axis.clone().applyQuaternion(copy.quaternion)) };
}
function projectRadius(box, axis) {
  return box.half.x * Math.abs(axis.dot(box.axes[0])) + box.half.y * Math.abs(axis.dot(box.axes[1])) + box.half.z * Math.abs(axis.dot(box.axes[2]));
}

/**
 * Exact box-vs-box SAT: 3 face axes from A, 3 from B, and 9 cross axes.
 * All non-degenerate axes are normalized, so epsilon/depth are world distances.
 * epsilon is CONTACT SLOP, not a dimensionless addition to rotation matrices.
 * normal points A -> B; mtv moves B out of A. To move A, negate mtv.
 * Touching (including <= epsilon overlap) is distinct from penetrating.
 * separation is the largest separating-axis gap, not Euclidean box distance.
 */
export function obbSAT(a, b, { epsilon = DEFAULT_EPSILON, parallelEpsilon = 1e-10 } = {}) {
  nonnegative(epsilon, 'epsilon'); nonnegative(parallelEpsilon, 'parallelEpsilon');
  const A = prepared(a), B = prepared(b), delta = B.center.clone().sub(A.center);
  const candidates = [
    ...A.axes.map((axis, i) => ({ axis: axis.clone(), label: `A${i}` })),
    ...B.axes.map((axis, i) => ({ axis: axis.clone(), label: `B${i}` })),
  ];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    candidates.push({ axis: A.axes[i].clone().cross(B.axes[j]), label: `A${i}xB${j}` });
  }
  let minimumOverlap = Infinity, bestAxis = null, axisLabel = '', axesTested = 0;
  for (const { axis, label } of candidates) {
    const length = axis.length();
    if (length <= parallelEpsilon) continue; // Parallel cross product has no separating direction.
    axis.divideScalar(length);
    const signedDistance = delta.dot(axis);
    const overlap = projectRadius(A, axis) + projectRadius(B, axis) - Math.abs(signedDistance);
    axesTested++;
    if (overlap < minimumOverlap) {
      minimumOverlap = overlap;
      bestAxis = axis.clone().multiplyScalar(signedDistance < 0 ? -1 : 1);
      axisLabel = label;
    }
  }
  const intersects = minimumOverlap >= -epsilon;
  const depth = intersects ? Math.max(0, minimumOverlap) : 0;
  return {
    intersects, touching: intersects && depth <= epsilon, penetrating: intersects && depth > epsilon,
    depth, minimumOverlap, separation: Math.max(0, -minimumOverlap),
    normal: bestAxis, mtv: bestAxis.clone().multiplyScalar(depth), axis: axisLabel,
    axesTested, candidateAxes: 15, aId: a.id, bId: b.id,
  };
}

export function intersectsOBB(a, b, options) { return obbSAT(a, b, options).intersects; }

/** Linear root translation/scale and shortest-arc quaternion rotation. */
export function interpolatePose(start, end, t) {
  if (!Number.isFinite(t) || t < 0 || t > 1) throw new RangeError('t must be in [0,1]');
  const a = plainPose(start), b = plainPose(end);
  for (const key of ['x', 'y', 'z']) if (a.scale[key] * b.scale[key] <= 0) throw new RangeError('Path scale may not pass through zero');
  return { position: a.position.lerp(b.position, t), quaternion: a.quaternion.slerp(b.quaternion, t).normalize(), scale: a.scale.lerp(b.scale, t) };
}

/**
 * Samples the ACTUAL root-pose path, rebuilding each OBB about its local spine
 * pivot. Does not incorrectly lerp the OBB center during a cover/book rotation.
 * Static obstacles are OBBs. Duplicate moving id is skipped if id is supplied.
 * Samples are bounded by corner travel as well as angular travel. This is
 * discrete path verification, NOT continuous collision detection: obstacles or
 * impacts thinner than the chosen sampling interval can still be missed.
 * Every waypoint/endpoint is tested. Budget overflow throws instead of silently
 * coarsening. By default contact is allowed; penetration > epsilon blocks.
 */
export function checkOBBPath(localBounds, poses, obstacles, {
  id, epsilon = DEFAULT_EPSILON, padding = 0,
  maxPointStep = 0.001, maxAngleStep = Math.PI / 180,
  maxSamples = 50000, blockTouching = false, ignoreIds = [],
} = {}) {
  const bounds = checkedBounds(localBounds);
  nonnegative(epsilon, 'epsilon'); nonnegative(padding, 'padding');
  if (!Array.isArray(poses) || poses.length === 0) throw new RangeError('At least one world pose is required');
  if (!(Number.isFinite(maxPointStep) && maxPointStep > 0 && Number.isFinite(maxAngleStep) && maxAngleStep > 0)) throw new RangeError('Sampling steps must be finite and > 0');
  if (!Number.isInteger(maxSamples) || maxSamples < 1) throw new RangeError('maxSamples must be a positive integer');
  const path = poses.map(plainPose);
  const ignored = new Set(ignoreIds);
  if (id !== undefined && id !== null) ignored.add(id);
  const fixed = obstacles.filter(o => !ignored.has(o.id)).map(prepared);
  const farCorner = new THREE.Vector3(
    Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)),
    Math.max(Math.abs(bounds.min.y), Math.abs(bounds.max.y)),
    Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)),
  );
  const steps = [];
  let totalPlannedSamples = 1;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    for (const key of ['x', 'y', 'z']) if (a.scale[key] * b.scale[key] <= 0) throw new RangeError('Path scale may not pass through zero');
    const maxScale = new THREE.Vector3(...['x', 'y', 'z'].map(k => Math.max(Math.abs(a.scale[k]), Math.abs(b.scale[k]))));
    const radius = farCorner.clone().multiply(maxScale).length() + Math.sqrt(3) * padding;
    const angle = a.quaternion.angleTo(b.quaternion);
    const scaleTravel = farCorner.clone().multiply(b.scale.clone().sub(a.scale)).length();
    const pointTravelBound = a.position.distanceTo(b.position) + radius * angle + scaleTravel;
    const count = Math.max(1, Math.ceil(pointTravelBound / maxPointStep), Math.ceil(angle / maxAngleStep));
    steps.push(count); totalPlannedSamples += count;
  }
  if (totalPlannedSamples > maxSamples) throw new RangeError(`Path requires ${totalPlannedSamples} samples; maxSamples=${maxSamples}. Split the path or explicitly choose a larger sampling step.`);
  let samplesTested = 0, contactTests = 0;
  const check = (pose, segmentIndex, t) => {
    samplesTested++;
    const moving = obbFromLocalBounds(bounds, pose, { id, padding });
    for (const obstacle of fixed) {
      const hit = obbSAT(moving, obstacle, { epsilon });
      if (hit.touching) contactTests++;
      if (hit.penetrating || (blockTouching && hit.intersects)) {
        return { segmentIndex, t, pose, obb: moving, obstacleId: obstacle.id, hit };
      }
    }
    return null;
  };
  let firstCollision = check(path[0], 0, 0);
  for (let segment = 0; segment < steps.length && !firstCollision; segment++) {
    for (let sample = 1; sample <= steps[segment]; sample++) {
      const t = sample / steps[segment];
      firstCollision = check(interpolatePose(path[segment], path[segment + 1], t), segment, t);
      if (firstCollision) break;
    }
  }
  return { clear: firstCollision === null, firstCollision, samplesTested, totalPlannedSamples, contactTests, maxPointStep, maxAngleStep, epsilon };
}
