import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type ProceduralModelOptions = {
  wireframe?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  textureSize?: number;
  textureAnisotropy?: number;
  qualityPriority?: 'reference-fidelity' | 'balanced';
};

export type ProceduralModelRuntime = {
  nodes: Record<string, THREE.Object3D>;
  meshes: Record<string, THREE.Mesh>;
  sockets: Record<string, THREE.Object3D>;
  colliders: Record<string, unknown>;
  destructionGroups: Record<string, THREE.Object3D[]>;
};

type SculptMaterialSpec = Record<string, any>;

type ProudRingStack = { rings: [number, number, number, number][] };

// Signed distance to a stack of ellipse rings. Negative inside, positive outside.
//
// The sign is exact; the magnitude is the first-order estimate f / |grad f|, which UNDERSTATES how
// clear an outside point is and OVERSTATES how deep an inside point is. Both errors make the march
// below push slightly further than strictly necessary, which is the safe direction: the failure
// being prevented is a component sinking into the one beneath it and rendering as a bare patch.
function ringStackDistance(stack: ProudRingStack, x: number, y: number, z: number): number {
  const rings = stack.rings;
  const yMin = rings[0][0];
  const yMax = rings[rings.length - 1][0];
  let rx = rings[0][1];
  let rz = rings[0][2];
  let zc = rings[0][3];
  if (y >= yMax) {
    const last = rings[rings.length - 1];
    rx = last[1]; rz = last[2]; zc = last[3];
  } else if (y > yMin) {
    for (let i = 0; i + 1 < rings.length; i += 1) {
      const lo = rings[i];
      const hi = rings[i + 1];
      if (y >= lo[0] && y <= hi[0]) {
        const span = hi[0] - lo[0];
        const t = span > 1e-9 ? (y - lo[0]) / span : 0;
        rx = lo[1] + (hi[1] - lo[1]) * t;
        rz = lo[2] + (hi[2] - lo[2]) * t;
        zc = lo[3] + (hi[3] - lo[3]) * t;
        break;
      }
    }
  }
  const dx = x / rx;
  const dz = (z - zc) / rz;
  const f = dx * dx + dz * dz - 1;
  const gx = (2 * x) / (rx * rx);
  const gz = (2 * (z - zc)) / (rz * rz);
  const grad = Math.hypot(gx, gz);
  const radial = grad < 1e-12 ? -Math.min(rx, rz) : f / grad;
  const axial = Math.max(yMin - y, y - yMax);
  return Math.hypot(Math.max(radial, 0), Math.max(axial, 0)) + Math.min(Math.max(radial, axial), 0);
}

// Push every vertex outward until it stands `clearance` clear of the target's surface.
//
// WHY THE AUTHORED NUMBERS ARE ONLY A LOWER BOUND. A ring is an ELLIPSE, and the surface it has to
// clear generally is not. Any single ellipse that clears the widest point is loose at the narrowest
// and vice versa, so hand-widening moves the error rather than shrinking it -- measured on hair,
// where widening the side masses took closure from 42.2% to 40.9%, worse on all six views, with
// dark coverage DOWN because the widened mass had slid off the skull. Here the authored width is a
// floor and the real radius is MEASURED per vertex.
//
// Each vertex travels along its OWN radial spoke rather than along the field's gradient, so the
// ring keeps its vertex order and its seam positions and only its radius changes. `maxPush` is
// required, not a safeguard: an uncapped march walks inner vertices straight through the target and
// out the far side, closing the very gap the component exists to leave.
function applyStandProud(
  geometry: THREE.BufferGeometry,
  marcher: THREE.Object3D,
  target: THREE.Object3D,
  stack: ProudRingStack,
  clearance: number,
  maxPush: number,
): void {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  marcher.updateWorldMatrix(true, false);
  target.updateWorldMatrix(true, false);
  const toTarget = new THREE.Matrix4().copy(target.matrixWorld).invert().multiply(marcher.matrixWorld);
  const fromTarget = new THREE.Matrix4().copy(toTarget).invert();
  const p = new THREE.Vector3();
  // A vertex can exhaust `maxPush` and still be inside the target. That is the cap doing its job --
  // an uncapped march walks vertices out the far side -- but it means the clearance this function
  // promises was NOT achieved, and saying nothing there hides exactly the defect the caller asked
  // to be protected from. Measured on the shipped fixture: 2 of 8 sampled hair vertices sat 0.059
  // inside a skull against a 0.04 cap and could never have reached clear.
  let unresolved = 0;

  for (let i = 0; i < position.count; i += 1) {
    p.fromBufferAttribute(position, i).applyMatrix4(toTarget);
    // The spoke is the vertex's own radial direction in the target's frame; marching along it keeps
    // each ring a ring, since every vertex holds its own angle and only its radius changes.
    //
    // A vertex on the axis has no radial direction at all -- and that is precisely the crown, the
    // one place a bald patch is most visible. Skipping it leaves the exact failure this function
    // exists to prevent. So a degenerate spoke marches axially instead, out through whichever cap
    // it is nearer, which is the direction the field itself measures there.
    const spokeLength = Math.hypot(p.x, p.z);
    const onAxis = spokeLength < 1e-9;
    const midHeight = (stack.rings[0][0] + stack.rings[stack.rings.length - 1][0]) / 2;
    const sx = onAxis ? 0 : p.x / spokeLength;
    const sz = onAxis ? 0 : p.z / spokeLength;
    const sy = onAxis ? (p.y >= midHeight ? 1 : -1) : 0;

    let travelled = 0;
    for (let step = 0; step < 24; step += 1) {
      const gap = ringStackDistance(stack, p.x, p.y, p.z);
      if (gap >= clearance) break;
      const move = Math.min(Math.max(0.002, clearance - gap), maxPush - travelled);
      if (move <= 0) break;
      p.x += sx * move;
      p.y += sy * move;
      p.z += sz * move;
      travelled += move;
    }

    if (ringStackDistance(stack, p.x, p.y, p.z) < clearance) unresolved += 1;

    p.applyMatrix4(fromTarget);
    position.setXYZ(i, p.x, p.y, p.z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  geometry.userData.standProud = { clearance, maxPush, unresolved, total: position.count };
  if (unresolved > 0) {
    console.warn(
      `standProud: ${unresolved}/${position.count} vertices could not reach ${clearance} within ` +
      `maxPush ${maxPush}. They are still inside the target and will render as bare patches. ` +
      `Raise maxPush, or move the component out so it does not start that deep.`,
    );
  }
}

type SdfVector = readonly [number, number, number];
type SdfTransform = { position?: SdfVector; translation?: SdfVector; rotation?: SdfVector; scale?: SdfVector };
type SdfPrimitive = {
  readonly id: string;
  readonly type: 'sphere' | 'capsule' | 'box' | 'cone' | 'ellipsoid';
  readonly center?: SdfVector;
  readonly radius?: number | SdfVector;
  readonly height?: number;
  readonly size?: SdfVector;
  readonly dimensions?: SdfVector;
  readonly radii?: SdfVector;
  readonly transform?: SdfTransform;
};
type SdfOperation = {
  readonly id?: string;
  readonly output?: string;
  readonly type: 'smooth-union' | 'subtract' | 'intersect';
  readonly left: string;
  readonly right: string;
  readonly radius?: number;
};
type SdfDescriptor = {
  readonly primitives: readonly SdfPrimitive[];
  readonly operations?: readonly SdfOperation[];
  readonly resolution: number;
  readonly bounds?: { readonly min: SdfVector; readonly max: SdfVector };
};
type SdfFunction = (point: THREE.Vector3) => number;

function sdfSphere(point: THREE.Vector3, radius: number): number {
  return point.length() - radius;
}

function sdfCapsule(point: THREE.Vector3, radius: number, height: number): number {
  const halfHeight = height * 0.5;
  const y = Math.max(-halfHeight, Math.min(halfHeight, point.y));
  return point.distanceTo(new THREE.Vector3(0, y, 0)) - radius;
}

function sdfBox(point: THREE.Vector3, size: SdfVector): number {
  const q = new THREE.Vector3(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z))
    .sub(new THREE.Vector3(size[0] * 0.5, size[1] * 0.5, size[2] * 0.5));
  return q.clone().max(new THREE.Vector3()).length() + Math.min(Math.max(q.x, q.y, q.z), 0);
}

function sdfCone(point: THREE.Vector3, radius: number, height: number): number {
  const halfHeight = height * 0.5;
  const taper = radius * (1 - (point.y + halfHeight) / height);
  return Math.max(Math.hypot(point.x, point.z) - Math.max(0, taper), Math.abs(point.y) - halfHeight);
}

function sdfEllipsoid(point: THREE.Vector3, radii: SdfVector): number {
  const scaled = new THREE.Vector3(point.x / radii[0], point.y / radii[1], point.z / radii[2]);
  return (scaled.length() - 1) * Math.min(radii[0], radii[1], radii[2]);
}

function sdfRadii(primitive: SdfPrimitive): SdfVector {
  const radius = primitive.radius;
  if (primitive.radii) return primitive.radii;
  if (typeof radius === 'number') return [radius, radius, radius];
  return radius ?? [0.5, 0.5, 0.5];
}

function smin(left: number, right: number, radius: number): number {
  const blend = Math.max(radius - Math.abs(left - right), 0) / radius;
  return Math.min(left, right) - blend * blend * radius * 0.25;
}

function sdfLocalPoint(point: THREE.Vector3, primitive: SdfPrimitive): { point: THREE.Vector3; scale: number } {
  const transform = primitive.transform;
  const translation = transform?.position ?? transform?.translation ?? primitive.center ?? [0, 0, 0];
  const rotation = transform?.rotation ?? [0, 0, 0];
  const scale = transform?.scale ?? [1, 1, 1];
  const local = point.clone().sub(new THREE.Vector3(translation[0], translation[1], translation[2]));
  const inverseRotation = new THREE.Quaternion()
    .setFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2]))
    .invert();
  local.applyQuaternion(inverseRotation);
  local.set(local.x / scale[0], local.y / scale[1], local.z / scale[2]);
  return { point: local, scale: Math.min(scale[0], scale[1], scale[2]) };
}

function sdfPrimitive(point: THREE.Vector3, primitive: SdfPrimitive): number {
  const local = sdfLocalPoint(point, primitive);
  let distance: number;
  switch (primitive.type) {
    case 'sphere':
      distance = sdfSphere(local.point, typeof primitive.radius === 'number' ? primitive.radius : 0.5);
      break;
    case 'capsule':
      distance = sdfCapsule(local.point, typeof primitive.radius === 'number' ? primitive.radius : 0.25, primitive.height ?? 1);
      break;
    case 'box':
      distance = sdfBox(local.point, primitive.size ?? primitive.dimensions ?? [1, 1, 1]);
      break;
    case 'cone':
      distance = sdfCone(local.point, typeof primitive.radius === 'number' ? primitive.radius : 0.5, primitive.height ?? 1);
      break;
    case 'ellipsoid':
      distance = sdfEllipsoid(local.point, sdfRadii(primitive));
      break;
  }
  return distance * local.scale;
}

function sdfSample(descriptor: SdfDescriptor): SdfFunction {
  const nodes = new Map<string, SdfFunction>();
  for (const primitive of descriptor.primitives) nodes.set(primitive.id, (point) => sdfPrimitive(point, primitive));
  let result = descriptor.primitives.length > 0 ? nodes.get(descriptor.primitives[0].id) : undefined;
  for (let index = 0; index < (descriptor.operations?.length ?? 0); index += 1) {
    const operation = descriptor.operations?.[index];
    if (!operation) continue;
    const left = nodes.get(operation.left);
    const right = nodes.get(operation.right);
    if (!left || !right) continue;
    let combined: SdfFunction;
    switch (operation.type) {
      case 'smooth-union':
        combined = (point) => smin(left(point), right(point), operation.radius ?? 0.1);
        break;
      case 'subtract':
        combined = (point) => Math.max(left(point), -right(point));
        break;
      case 'intersect':
        combined = (point) => Math.max(left(point), right(point));
        break;
    }
    nodes.set(operation.id ?? operation.output ?? `operation-${index}`, combined);
    result = combined;
  }
  return result ?? (() => Infinity);
}

function polygonizeSdf(descriptor: SdfDescriptor): THREE.BufferGeometry {
  // SURFACE NETS, not a voxel shell.
  //
  // This used to emit one axis-aligned quad per exposed voxel face, which is a Minecraft surface:
  // every face is axis-aligned, every edge is a 90-degree step, and the result is stair-stepped at
  // exactly the scale of the sampling grid. For a subject whose whole identity is smooth blended
  // organic form -- which is the only kind of subject anyone reaches for an implicit surface to
  // build -- that is worse than the assembled primitives it was meant to replace.
  //
  // Naive surface nets places ONE vertex per sign-changing cell, at the average of the linearly
  // interpolated crossings on that cell's edges, and joins the four cells around each crossing
  // edge into a quad. It is compact, manifold, and smooth, and it is a natural fit for a field
  // that can be sampled anywhere rather than only at corners.
  //
  // Normals come from the field GRADIENT, not from face averaging: the gradient is the exact
  // surface normal of the implicit surface, so shading no longer carries the grid's imprint.
  const resolution = Math.max(4, Math.min(64, Math.floor(descriptor.resolution)));
  const defaultBounds: { readonly min: SdfVector; readonly max: SdfVector } = { min: [-2, -2, -2], max: [2, 2, 2] };
  const bounds = descriptor.bounds ?? defaultBounds;
  const min = new THREE.Vector3(bounds.min[0], bounds.min[1], bounds.min[2]);
  const step = new THREE.Vector3(
    (bounds.max[0] - bounds.min[0]) / resolution,
    (bounds.max[1] - bounds.min[1]) / resolution,
    (bounds.max[2] - bounds.min[2]) / resolution,
  );
  const sample = sdfSample(descriptor);
  const scratch = new THREE.Vector3();

  // Corner grid: one more corner than cells on each axis.
  const side = resolution + 1;
  const field = new Float32Array(side * side * side);
  const cornerAt = (x: number, y: number, z: number): number => (z * side + y) * side + x;
  for (let z = 0; z < side; z += 1) {
    for (let y = 0; y < side; y += 1) {
      for (let x = 0; x < side; x += 1) {
        scratch.set(min.x + x * step.x, min.y + y * step.y, min.z + z * step.z);
        field[cornerAt(x, y, z)] = sample(scratch);
      }
    }
  }

  // The 12 cell edges as corner-offset pairs.
  const CUBE_EDGES: readonly (readonly [number, number, number, number, number, number])[] = [
    [0, 0, 0, 1, 0, 0], [1, 0, 0, 1, 1, 0], [0, 1, 0, 1, 1, 0], [0, 0, 0, 0, 1, 0],
    [0, 0, 1, 1, 0, 1], [1, 0, 1, 1, 1, 1], [0, 1, 1, 1, 1, 1], [0, 0, 1, 0, 1, 1],
    [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [1, 1, 0, 1, 1, 1], [0, 1, 0, 0, 1, 1],
  ];

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const cellVertex = new Int32Array(resolution * resolution * resolution).fill(-1);
  const cellAt = (x: number, y: number, z: number): number => (z * resolution + y) * resolution + x;

  // Central-difference gradient, stepped at a fraction of a cell so it follows the field rather
  // than the grid.
  const epsilon = Math.min(step.x, step.y, step.z) * 0.25;
  const gradient = (point: THREE.Vector3): THREE.Vector3 => {
    const gx = sample(scratch.set(point.x + epsilon, point.y, point.z))
      - sample(scratch.set(point.x - epsilon, point.y, point.z));
    const gy = sample(scratch.set(point.x, point.y + epsilon, point.z))
      - sample(scratch.set(point.x, point.y - epsilon, point.z));
    const gz = sample(scratch.set(point.x, point.y, point.z + epsilon))
      - sample(scratch.set(point.x, point.y, point.z - epsilon));
    const normal = new THREE.Vector3(gx, gy, gz);
    // A point where the field is flat has no defined normal; +Y is arbitrary but finite, and
    // leaving a zero vector would poison every lighting calculation downstream.
    return normal.lengthSq() < 1e-20 ? new THREE.Vector3(0, 1, 0) : normal.normalize();
  };

  for (let z = 0; z < resolution; z += 1) {
    for (let y = 0; y < resolution; y += 1) {
      for (let x = 0; x < resolution; x += 1) {
        let crossings = 0;
        let sumX = 0;
        let sumY = 0;
        let sumZ = 0;
        for (const [ax, ay, az, bx, by, bz] of CUBE_EDGES) {
          const a = field[cornerAt(x + ax, y + ay, z + az)];
          const b = field[cornerAt(x + bx, y + by, z + bz)];
          if ((a <= 0) === (b <= 0)) continue;
          const t = a / (a - b);
          sumX += (ax + (bx - ax) * t);
          sumY += (ay + (by - ay) * t);
          sumZ += (az + (bz - az) * t);
          crossings += 1;
        }
        if (crossings === 0) continue;
        const px = min.x + (x + sumX / crossings) * step.x;
        const py = min.y + (y + sumY / crossings) * step.y;
        const pz = min.z + (z + sumZ / crossings) * step.z;
        cellVertex[cellAt(x, y, z)] = positions.length / 3;
        positions.push(px, py, pz);
        const normal = gradient(new THREE.Vector3(px, py, pz));
        normals.push(normal.x, normal.y, normal.z);
      }
    }
  }

  // One quad per sign-changing grid edge, joining the four cells that share it.
  //
  // Winding, worked out rather than guessed. For the +x edge from corner (x,y,z), the four cells
  // around it are (x, y-1, z-1), (x, y, z-1), (x, y, z), (x, y-1, z); in the (y,z) plane that
  // traversal is +y, +z, -y, whose cross product is +x. So when the corner is INSIDE and its
  // neighbour is outside, the unflipped order already faces out, and the flip belongs on the
  // opposite case. Getting this backwards is invisible in the normals -- those come from the
  // gradient and stay correct -- and shows only as back-face culling removing the front surface,
  // i.e. the model rendering as a hollow shell with its interior visible.
  const quad = (a: number, b: number, c: number, d: number, flip: boolean): void => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) indices.push(a, c, b, a, d, c);
    else indices.push(a, b, c, a, c, d);
  };
  // Each quad joins the FOUR cells sharing one grid edge, so every one of those cells must exist.
  // Bounding only the edge axis and the lower end of the other two let y/z reach `resolution`, which
  // is a corner index, not a cell index: `cellAt` then strides into an unrelated slot (with
  // resolution 8, `cellAt(3, 8, 1)` is 131 -- the slot for cell (3, 0, 2)) or past the end of the
  // array, where a typed-array read yields `undefined`. `undefined < 0` is false, so the guard in
  // `quad` passed it through to `setIndex`, which coerces it to 0. Measured on a sphere reaching its
  // own bounds at resolution 8: 60 out-of-range reads and 108 aliased reads. A surface that touches
  // the sampling box is therefore left OPEN at that face rather than closed with wrong triangles --
  // pad `bounds` past the surface to get a closed mesh.
  for (let z = 0; z < side; z += 1) {
    for (let y = 0; y < side; y += 1) {
      for (let x = 0; x < side; x += 1) {
        const here = field[cornerAt(x, y, z)] <= 0;
        if (x + 1 < side && y > 0 && z > 0 && y < side - 1 && z < side - 1
          && here !== (field[cornerAt(x + 1, y, z)] <= 0)) {
          quad(
            cellVertex[cellAt(x, y - 1, z - 1)], cellVertex[cellAt(x, y, z - 1)],
            cellVertex[cellAt(x, y, z)], cellVertex[cellAt(x, y - 1, z)], !here,
          );
        }
        if (y + 1 < side && x > 0 && z > 0 && x < side - 1 && z < side - 1
          && here !== (field[cornerAt(x, y + 1, z)] <= 0)) {
          quad(
            cellVertex[cellAt(x - 1, y, z - 1)], cellVertex[cellAt(x - 1, y, z)],
            cellVertex[cellAt(x, y, z)], cellVertex[cellAt(x, y, z - 1)], !here,
          );
        }
        if (z + 1 < side && x > 0 && y > 0 && x < side - 1 && y < side - 1
          && here !== (field[cornerAt(x, y, z + 1)] <= 0)) {
          quad(
            cellVertex[cellAt(x - 1, y - 1, z)], cellVertex[cellAt(x, y - 1, z)],
            cellVertex[cellAt(x, y, z)], cellVertex[cellAt(x - 1, y, z)], !here,
          );
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

// THREE.CapsuleGeometry duplicates every UV-seam vertex (measured: 194 boundary
// edges on the default radius/segments below) -- same benign pattern as box/
// cylinder/sphere/torus, all of which weld cleanly to 0 given a CORRECT weld.
// (A naive vertex-only mergeVertices() reports 64 'non-manifold' edges here, but
// that is a counting artifact, not a real defect: it double-counts a handful of
// near-pole triangles that become degenerate once two of their three corners
// coincide -- confirmed by replicating subdivideCatmullClark's own degenerate-
// triangle-aware vertex identity, which finds a perfectly ordinary 2-manifold.)
// A capsule is the primary shape for skinned limbs/torso (PLAN_1.5), and skinning
// weight computation is O(vertices x bones), so fewer, guaranteed-simple vertices
// is worth having regardless -- authored as a deterministic, closed-by-
// construction mesh instead: shared pole vertices, and
// the radial index taken `% radialSegments` so the seam is never a duplicate
// vertex in the first place, rather than something to weld away afterward.
// Adapted from forge/stage5_rig/emit_rig.py's buildWatertightCapsule (verified
// there: 0 boundary edges, 0 non-manifold edges, deterministic across repeated
// runs) -- ported here rather than imported because this factory and the rig
// emitter are separate generated-output surfaces with no shared runtime module;
// see forge/tests/test_primitive_watertightness.py for the measured proof, and
// coordinate with the rig owner before changing either copy independently.
function buildWatertightCapsule(
  radius: number,
  cylLength: number,
  capSegments: number,
  radialSegments: number,
  heightSegments: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  const halfCyl = cylLength / 2;
  const totalSpan = 2 * (Math.PI / 2 * radius) + Math.max(0, cylLength);
  const vOf = (fromBottom: number) => (totalSpan > 0 ? fromBottom / totalSpan : 0);

  const bottomPoleIndex = positions.length / 3;
  positions.push(0, -halfCyl - radius, 0);
  uvs.push(0.5, vOf(0));

  const ringStarts: number[] = [];
  const ringV: number[] = [];
  for (let ring = 1; ring <= capSegments; ring += 1) {
    const phi = (Math.PI / 2) * (ring / capSegments);
    const y = -halfCyl - radius * Math.cos(phi);
    const r = radius * Math.sin(phi);
    const start = positions.length / 3;
    ringStarts.push(start);
    ringV.push(vOf(radius * phi));
    for (let radial = 0; radial < radialSegments; radial += 1) {
      const theta = (radial / radialSegments) * Math.PI * 2;
      positions.push(r * Math.cos(theta), y, r * Math.sin(theta));
      uvs.push(radial / radialSegments, vOf(radius * phi));
    }
  }

  const cylinderRingStarts: number[] = [];
  if (cylLength > 0) {
    for (let step = 1; step <= heightSegments; step += 1) {
      const y = -halfCyl + (cylLength * step) / heightSegments;
      const start = positions.length / 3;
      cylinderRingStarts.push(start);
      const v = vOf(radius * (Math.PI / 2) + halfCyl + y);
      for (let radial = 0; radial < radialSegments; radial += 1) {
        const theta = (radial / radialSegments) * Math.PI * 2;
        positions.push(radius * Math.cos(theta), y, radius * Math.sin(theta));
        uvs.push(radial / radialSegments, v);
      }
    }
  }

  const topRingStarts: number[] = [];
  for (let ring = capSegments - 1; ring >= 1; ring -= 1) {
    const phi = (Math.PI / 2) * (ring / capSegments);
    const y = halfCyl + radius * Math.cos(phi);
    const r = radius * Math.sin(phi);
    const start = positions.length / 3;
    topRingStarts.push(start);
    const v = vOf(radius * (Math.PI / 2) + Math.max(0, cylLength) + radius * (Math.PI / 2 - phi));
    for (let radial = 0; radial < radialSegments; radial += 1) {
      const theta = (radial / radialSegments) * Math.PI * 2;
      positions.push(r * Math.cos(theta), y, r * Math.sin(theta));
      uvs.push(radial / radialSegments, v);
    }
  }

  const topPoleIndex = positions.length / 3;
  positions.push(0, halfCyl + radius, 0);
  uvs.push(0.5, vOf(totalSpan));

  const firstBottomRing = ringStarts[0];
  for (let radial = 0; radial < radialSegments; radial += 1) {
    const next = (radial + 1) % radialSegments;
    indices.push(bottomPoleIndex, firstBottomRing + radial, firstBottomRing + next);
  }

  const allRings = [...ringStarts, ...cylinderRingStarts, ...topRingStarts];
  for (let i = 0; i < allRings.length - 1; i += 1) {
    const a = allRings[i];
    const b = allRings[i + 1];
    for (let radial = 0; radial < radialSegments; radial += 1) {
      const next = (radial + 1) % radialSegments;
      indices.push(a + radial, a + next, b + next);
      indices.push(a + radial, b + next, b + radial);
    }
  }

  const lastRing = allRings[allRings.length - 1];
  for (let radial = 0; radial < radialSegments; radial += 1) {
    const next = (radial + 1) % radialSegments;
    indices.push(topPoleIndex, lastRing + next, lastRing + radial);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function readLayerNumber(value: unknown, keys: string[], fallback: number): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      if (typeof record[key] === 'number') return record[key] as number;
    }
  }
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{3}$/i.test(hex)
    ? '#' + hex.slice(1).split('').map((part) => part + part).join('')
    : hex;
  const value = /^#[0-9a-f]{6}$/i.test(normalized) ? Number.parseInt(normalized.slice(1), 16) : 0x8a7a5f;
  return [clampAlbedoChannel((value >> 16) & 255), clampAlbedoChannel((value >> 8) & 255), clampAlbedoChannel(value & 255)];
}

function materialPalette(spec: SculptMaterialSpec): string[] {
  const palette = spec.colorVariation?.palette;
  if (Array.isArray(palette) && palette.length > 0) return palette.filter((value) => typeof value === 'string');
  const secondary = spec.albedo?.secondary;
  const colors = [spec.baseColor ?? spec.color ?? spec.albedo?.dominant, ...(Array.isArray(secondary) ? secondary : [])];
  return colors.filter((value): value is string => typeof value === 'string' && value.startsWith('#'));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampAlbedoChannel(value: number): number {
  return Math.max(30, Math.min(240, Math.round(value)));
}

function clampPbrF0(value: number): number {
  return Math.max(0.02, Math.min(1, value));
}

function clampPbrIor(value: number): number {
  return Math.max(1, Math.min(2.5, value));
}

function clampPbrMetalness(value: number): number {
  return value >= 0.5 ? 1 : 0;
}

function clampedAlbedoColor(spec: SculptMaterialSpec): THREE.Color {
  const source = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  // setStyle with an explicit SRGBColorSpace, NOT the numeric constructor.
  //
  // `new THREE.Color(r, g, b)` treats its arguments as LINEAR working-space components,
  // while an authored `baseColor` hex is sRGB. Feeding one to the other skipped the
  // transfer function and lifted every dark albedo: #2e2a28, authored as a near-black
  // vinyl, rendered at roughly sRGB 0.46 — a mid grey. The error is largest exactly where
  // it matters most, because the transfer curve is steepest near black.
  return new THREE.Color().setStyle(source, THREE.SRGBColorSpace);
}

function smoothCurve(value: number): number {
  return value * value * (3 - 2 * value);
}

function periodicHash(x: number, y: number, seed: number, periodX: number, periodY: number): number {
  const wrappedX = ((x % periodX) + periodX) % periodX;
  const wrappedY = ((y % periodY) + periodY) % periodY;
  let value = Math.imul(wrappedX + seed * 17, 374761393) ^ Math.imul(wrappedY + seed * 31, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function periodicValueNoise(u: number, v: number, seed: number, periodX: number, periodY: number): number {
  const x = u * periodX;
  const y = v * periodY;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothCurve(x - x0);
  const ty = smoothCurve(y - y0);
  const a = periodicHash(x0, y0, seed, periodX, periodY);
  const b = periodicHash(x0 + 1, y0, seed, periodX, periodY);
  const c = periodicHash(x0, y0 + 1, seed, periodX, periodY);
  const d = periodicHash(x0 + 1, y0 + 1, seed, periodX, periodY);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), ty);
}

type SurfaceBand = {
  frequency: number;
  amplitude: number;
  stretchX: number;
  stretchY: number;
  ridge: boolean;
};

function surfaceBands(spec: SculptMaterialSpec): SurfaceBand[] {
  const source = Array.isArray(spec.surfaceFrequencyBands) ? spec.surfaceFrequencyBands : [];
  const parsed = source.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const band = item as Record<string, unknown>;
    const frequency = typeof band.frequency === 'number' ? band.frequency : 0;
    const amplitude = typeof band.amplitude === 'number' ? band.amplitude : 0;
    if (frequency <= 0 || amplitude <= 0) return [];
    const stretch = Array.isArray(band.stretch) ? band.stretch : [1, 1];
    const description = `${String(band.pattern ?? '')} ${String(band.role ?? '')}`.toLowerCase();
    return [{
      frequency,
      amplitude,
      stretchX: typeof stretch[0] === 'number' ? Math.max(0.1, stretch[0]) : 1,
      stretchY: typeof stretch[1] === 'number' ? Math.max(0.1, stretch[1]) : 1,
      ridge: /(ridge|groove|grain|fiber|striated|crack)/.test(description),
    }];
  });
  return parsed.length > 0 ? parsed : [
    { frequency: 2, amplitude: 0.42, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 12, amplitude: 0.22, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 56, amplitude: 0.08, stretchX: 1, stretchY: 1, ridge: false },
  ];
}

function sampleSurface(u: number, v: number, bands: SurfaceBand[], seed: number): number {
  let value = 0;
  let weight = 0;
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    const periodX = Math.max(1, Math.round(band.frequency * band.stretchX));
    const periodY = Math.max(1, Math.round(band.frequency * band.stretchY));
    let sample = periodicValueNoise(u, v, seed + index * 1013, periodX, periodY);
    if (band.ridge) sample = 1 - Math.abs(sample * 2 - 1);
    value += sample * band.amplitude;
    weight += band.amplitude;
  }
  return weight > 0 ? clamp01(value / weight) : 0.5;
}

function mixPalette(colors: [number, number, number][], value: number): [number, number, number] {
  if (colors.length === 1) return colors[0];
  const scaled = clamp01(value) * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const mix = scaled - index;
  const a = colors[index];
  const b = colors[index + 1];
  return [
    Math.round(THREE.MathUtils.lerp(a[0], b[0], mix)),
    Math.round(THREE.MathUtils.lerp(a[1], b[1], mix)),
    Math.round(THREE.MathUtils.lerp(a[2], b[2], mix)),
  ];
}

type ColorGradientStop = { offset: number; color: string };
type ColorGradientSpec = {
  type: 'linear' | 'radial';
  axis: [number, number];
  stops: ColorGradientStop[];
};

function parseRgba(value: string): [number, number, number] {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (!match) return [138, 122, 95];
  return [clampAlbedoChannel(Number(match[1])), clampAlbedoChannel(Number(match[2])), clampAlbedoChannel(Number(match[3]))];
}

// Analytical per-pixel gradient sample. The extraction schema's colorGradient carries
// exact rgba(...) stop colors (see extract_part_color_recipe.py), so this samples the
// same trend directly in JS math rather than round-tripping through a Canvas 2D
// createLinearGradient/createRadialGradient object — same visual result, and it composes
// directly with the existing noise/height-correlated colorVariation blend below.
function sampleColorGradient(gradient: ColorGradientSpec, u: number, v: number): [number, number, number] {
  const stops = gradient.stops.length >= 2 ? gradient.stops : [{ offset: 0, color: 'rgba(138,122,95,1)' }, { offset: 1, color: 'rgba(138,122,95,1)' }];
  let t: number;
  if (gradient.type === 'radial') {
    const [cx, cy] = gradient.axis;
    const dx = u - cx;
    const dy = v - cy;
    const maxRadius = Math.max(0.001, Math.hypot(Math.max(cx, 1 - cx), Math.max(cy, 1 - cy)));
    t = clamp01(Math.hypot(dx, dy) / maxRadius);
  } else {
    const [ax, ay] = gradient.axis;
    const projection = (u - 0.5) * ax + (v - 0.5) * ay;
    const maxProjection = 0.5 * (Math.abs(ax) + Math.abs(ay)) || 0.5;
    t = clamp01(projection / maxProjection + 0.5);
  }
  const scaled = t * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.max(0, Math.floor(scaled)));
  const mix = scaled - index;
  const a = parseRgba(stops[index].color);
  const b = parseRgba(stops[index + 1].color);
  return [
    THREE.MathUtils.lerp(a[0], b[0], mix),
    THREE.MathUtils.lerp(a[1], b[1], mix),
    THREE.MathUtils.lerp(a[2], b[2], mix),
  ];
}

function writePixel(data: Uint8ClampedArray, offset: number, red: number, green: number, blue: number): void {
  data[offset] = Math.max(0, Math.min(255, Math.round(red)));
  data[offset + 1] = Math.max(0, Math.min(255, Math.round(green)));
  data[offset + 2] = Math.max(0, Math.min(255, Math.round(blue)));
  data[offset + 3] = 255;
}

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function createMapTexture(
  canvas: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [2, 2];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 2,
    typeof repeat[1] === 'number' ? repeat[1] : 2,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

type ProceduralTextureSet = {
  albedo: THREE.Texture;
  roughness: THREE.Texture;
  height: THREE.Texture;
  normal: THREE.Texture;
  ao: THREE.Texture;
  source: 'reference-pixel-extraction' | 'procedural';
};

function referenceMapUrl(spec: SculptMaterialSpec, channel: string): string | null {
  const reference = spec.referencePbr;
  if (!reference || typeof reference !== 'object') return null;
  if (reference.usable === false) return null;
  const confidence = typeof reference.confidence === 'number'
    ? reference.confidence
    : (typeof reference.estimatedFidelity === 'number' ? reference.estimatedFidelity : 0);
  const threshold = typeof reference.targetThreshold === 'number' ? reference.targetThreshold : 0.7;
  if (confidence < threshold) return null;
  const maps = reference.maps;
  if (!maps || typeof maps !== 'object') return null;
  const map = (maps as Record<string, unknown>)[channel];
  if (!map || typeof map !== 'object') return null;
  const record = map as Record<string, unknown>;
  const url = typeof record.url === 'string' && record.url.trim() ? record.url : record.path;
  return typeof url === 'string' && url.trim() ? url : null;
}

function createLoadedMapTexture(
  url: string,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.Texture {
  const texture = new THREE.TextureLoader().load(url);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [1, 1];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 1,
    typeof repeat[1] === 'number' ? repeat[1] : 1,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

function makeReferenceTextureSet(spec: SculptMaterialSpec, options: ProceduralModelOptions): ProceduralTextureSet | null {
  const albedo = referenceMapUrl(spec, 'albedo');
  const roughness = referenceMapUrl(spec, 'roughness');
  const height = referenceMapUrl(spec, 'height');
  const normal = referenceMapUrl(spec, 'normal');
  const ao = referenceMapUrl(spec, 'ao');
  if (!albedo || !roughness || !height || !normal || !ao) return null;
  return {
    albedo: createLoadedMapTexture(albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createLoadedMapTexture(roughness, THREE.NoColorSpace, spec, options),
    height: createLoadedMapTexture(height, THREE.NoColorSpace, spec, options),
    normal: createLoadedMapTexture(normal, THREE.NoColorSpace, spec, options),
    ao: createLoadedMapTexture(ao, THREE.NoColorSpace, spec, options),
    source: 'reference-pixel-extraction',
  };
}

function makeProceduralTextureSet(
  id: string,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): ProceduralTextureSet | null {
  if (typeof document === 'undefined') return null;
  const qualityFirst = (options.qualityPriority ?? 'reference-fidelity') === 'reference-fidelity';
  const requested = options.textureSize ?? spec.textureResolution;
  const requestedSize = typeof requested === 'number' && Number.isFinite(requested)
    ? requested
    : (qualityFirst ? 1024 : 512);
  const size = Math.max(256, Math.min(2048, 2 ** Math.round(Math.log2(requestedSize))));
  const canvases = {
    albedo: makeCanvas(size),
    roughness: makeCanvas(size),
    height: makeCanvas(size),
    normal: makeCanvas(size),
    ao: makeCanvas(size),
  };
  const contexts = {
    albedo: canvases.albedo.getContext('2d'),
    roughness: canvases.roughness.getContext('2d'),
    height: canvases.height.getContext('2d'),
    normal: canvases.normal.getContext('2d'),
    ao: canvases.ao.getContext('2d'),
  };
  if (!contexts.albedo || !contexts.roughness || !contexts.height || !contexts.normal || !contexts.ao) return null;
  const images = {
    albedo: contexts.albedo.createImageData(size, size),
    roughness: contexts.roughness.createImageData(size, size),
    height: contexts.height.createImageData(size, size),
    normal: contexts.normal.createImageData(size, size),
    ao: contexts.ao.createImageData(size, size),
  };
  const seed = hashString(id);
  const bands = surfaceBands(spec);
  const heightField = new Float32Array(size * size);
  const roughnessField = new Float32Array(size * size);
  const palette = materialPalette(spec);
  const fallback = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  const colors = (palette.length >= 2 ? palette : [fallback, '#6E614B', '#A08F70']).map(hexToRgb);
  const baseRoughness = clamp01(readLayerNumber(spec.roughness, ['base'], 0.76));
  const roughnessVariation = clamp01(readLayerNumber(spec.roughness, ['variation'], 0.18));
  const colorAmplitude = clamp01(readLayerNumber(spec.colorVariation, ['amplitude', 'variation'], 0.18));
  const heightCorrelation = clamp01(readLayerNumber(spec.colorVariation, ['heightCorrelation'], 0.3));
  const colorGradient: ColorGradientSpec | undefined = spec.colorGradient;
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const index = y * size + x;
      const height = sampleSurface(u, v, bands, seed + 101);
      const roughNoise = sampleSurface(u, v, bands, seed + 7001);
      const colorNoise = sampleSurface(u, v, bands, seed + 15013);
      heightField[index] = height;
      roughnessField[index] = clamp01(baseRoughness + (roughNoise - 0.5) * roughnessVariation * 2);
      let color: [number, number, number];
      if (colorGradient) {
        // Evidence-derived spatial gradient (Plan 1.3 Workstream C) takes priority
        // over the noise-based palette blend below — it is a measured trend, not a guess.
        color = sampleColorGradient(colorGradient, u, v);
      } else {
        const paletteValue = clamp01(
          0.5 + (colorNoise - 0.5) * colorAmplitude * 2 + (height - 0.5) * heightCorrelation
        );
        color = mixPalette(colors, paletteValue);
      }
      writePixel(images.albedo.data, index * 4, color[0], color[1], color[2]);
    }
  }
  const normalStrength = Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35));
  const aoStrength = clamp01(readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35));
  for (let y = 0; y < size; y += 1) {
    const up = ((y - 1 + size) % size) * size;
    const down = ((y + 1) % size) * size;
    for (let x = 0; x < size; x += 1) {
      const left = (x - 1 + size) % size;
      const right = (x + 1) % size;
      const index = y * size + x;
      const center = heightField[index];
      const dx = (heightField[y * size + right] - heightField[y * size + left]) * normalStrength * 6;
      const dy = (heightField[down + x] - heightField[up + x]) * normalStrength * 6;
      const inverseLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const normalX = -dx * inverseLength;
      const normalY = -dy * inverseLength;
      const normalZ = inverseLength;
      const neighborAverage = (
        heightField[y * size + left] + heightField[y * size + right]
        + heightField[up + x] + heightField[down + x]
      ) * 0.25;
      const cavity = Math.max(0, neighborAverage - center);
      const ao = clamp01(1 - aoStrength * (cavity * 12 + (1 - center) * 0.16));
      const offset = index * 4;
      const heightByte = center * 255;
      const roughnessByte = roughnessField[index] * 255;
      writePixel(images.height.data, offset, heightByte, heightByte, heightByte);
      writePixel(images.roughness.data, offset, roughnessByte, roughnessByte, roughnessByte);
      writePixel(
        images.normal.data, offset,
        (normalX * 0.5 + 0.5) * 255,
        (normalY * 0.5 + 0.5) * 255,
        (normalZ * 0.5 + 0.5) * 255,
      );
      writePixel(images.ao.data, offset, ao * 255, ao * 255, ao * 255);
    }
  }
  contexts.albedo.putImageData(images.albedo, 0, 0);
  contexts.roughness.putImageData(images.roughness, 0, 0);
  contexts.height.putImageData(images.height, 0, 0);
  contexts.normal.putImageData(images.normal, 0, 0);
  contexts.ao.putImageData(images.ao, 0, 0);
  return {
    albedo: createMapTexture(canvases.albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createMapTexture(canvases.roughness, THREE.NoColorSpace, spec, options),
    height: createMapTexture(canvases.height, THREE.NoColorSpace, spec, options),
    normal: createMapTexture(canvases.normal, THREE.NoColorSpace, spec, options),
    ao: createMapTexture(canvases.ao, THREE.NoColorSpace, spec, options),
    source: 'procedural',
  };
}

function createSculptMaterial(id: string, spec: SculptMaterialSpec, options: ProceduralModelOptions, denseComponent = false): THREE.MeshPhysicalMaterial {
  // A material that declares -- with evidence -- that its subject carries no texture
  // detail gets NO texture set. Synthesising one anyway is not a harmless default: the
  // branch below then forces color to white and roughness to 1 and reads both from the
  // generated maps, so the authored albedo and the reference-derived roughness are both
  // discarded, and the model gains mottling the reference does not have. Measured on the
  // tuxedo cat, whose black fur rendered as speckled grey-and-white from a palette that
  // only ever described two flat regions.
  const textureless = (spec.textureless as { declared?: boolean } | undefined)?.declared === true;
  const textures = textureless
    ? null
    : makeReferenceTextureSet(spec, options) ?? makeProceduralTextureSet(id, spec, options);
  const material = new THREE.MeshPhysicalMaterial({
    color: textures ? 0xffffff : clampedAlbedoColor(spec),
    roughness: textures ? 1 : clamp01(readLayerNumber(spec.roughness, ['base'], 0.76)),
    metalness: clampPbrMetalness(readLayerNumber(spec.metalness, ['base'], 0.0)),
    clearcoat: clamp01(readLayerNumber(spec.clearcoat, ['base', 'amount'], 0)),
    clearcoatRoughness: clamp01(readLayerNumber(spec.clearcoatRoughness, ['base'], 0.25)),
    transmission: clamp01(readLayerNumber(spec.transmission, ['base', 'amount'], 0)),
    ior: clampPbrIor(readLayerNumber(spec.ior, ['base', 'value'], 1.5)),
    thickness: Math.max(0, readLayerNumber(spec.thickness, ['base', 'amount'], 0)),
    attenuationDistance: Math.max(0.001, readLayerNumber(spec.attenuationDistance, ['base', 'value'], Infinity)),
    attenuationColor: new THREE.Color(typeof spec.attenuationColor === 'string' ? spec.attenuationColor : '#ffffff'),
    sheen: clamp01(readLayerNumber(spec.sheen, ['base', 'amount'], 0)),
    sheenColor: new THREE.Color(typeof spec.sheenColor === 'string' ? spec.sheenColor : '#ffffff'),
    sheenRoughness: clamp01(readLayerNumber(spec.sheenRoughness, ['base'], 1.0)),
    iridescence: clamp01(readLayerNumber(spec.iridescence, ['base', 'amount'], 0)),
    iridescenceIOR: clampPbrIor(readLayerNumber(spec.iridescenceIOR, ['base', 'value'], 1.3)),
    anisotropy: clamp01(readLayerNumber(spec.anisotropy, ['base', 'amount'], 0)),
    anisotropyRotation: readLayerNumber(spec.anisotropy, ['rotation'], 0),
    specularIntensity: clampPbrF0(readLayerNumber(spec.specularF0 ?? spec.f0 ?? spec.specularIntensity, ['base', 'value'], 1.0)),
    specularColor: new THREE.Color(typeof spec.specularColor === 'string' ? spec.specularColor : '#ffffff'),
    emissive: new THREE.Color(typeof spec.emissive === 'string' ? spec.emissive : '#000000'),
    emissiveIntensity: Math.max(0, readLayerNumber(spec.emissiveIntensity, ['base'], 1.0)),
    opacity: clamp01(readLayerNumber(spec.opacity, ['base'], 1)),
    transparent: readLayerNumber(spec.transmission, ['base', 'amount'], 0) > 0 || readLayerNumber(spec.opacity, ['base'], 1) < 1,
    alphaTest: Math.max(0, readLayerNumber(spec.alpha, ['cutoff', 'alphaTest'], 0)),
    wireframe: options.wireframe ?? false,
    side: spec.doubleSided === true ? THREE.DoubleSide : THREE.FrontSide,
    flatShading: spec.flatShading === true,
  });
  if (textures) {
    material.map = textures.albedo;
    material.roughnessMap = textures.roughness;
    material.normalMap = textures.normal;
    material.normalScale.setScalar(Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35)));
    material.aoMap = textures.ao;
    material.aoMap.channel = 0;
    material.aoMapIntensity = readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35);
    const denseMesh = denseComponent || spec.denseMesh === true || spec.geometryDensity === 'dense' || spec.topologyClass === 'dense';
    const bumpScale = Math.max(0, readLayerNumber(spec.bump, ['amplitude', 'strength'], 0));
    const effectiveBumpScale = denseMesh ? Math.max(0.05, bumpScale) : bumpScale;
    if (effectiveBumpScale > 0) {
      material.bumpMap = textures.height;
      material.bumpScale = effectiveBumpScale;
    }
    const displacementScale = Math.max(0, readLayerNumber(spec.displacement, ['amplitude', 'strength'], 0));
    const effectiveDisplacementScale = denseMesh ? Math.max(0.005, displacementScale) : displacementScale;
    if (effectiveDisplacementScale > 0) {
      material.displacementMap = textures.height;
      material.displacementScale = effectiveDisplacementScale;
      material.displacementBias = -effectiveDisplacementScale * 0.5;
    }
  }
  material.envMapIntensity = readLayerNumber(spec, ['envMapIntensity'], 0.8);
  material.userData.sculptMaterial = spec;
  material.userData.proceduralMapsIndependent = true;
  material.userData.pbrConstraints = { albedoRange: [30, 240], binaryMetalness: true, f0Range: [0.02, 1], iorRange: [1, 2.5] };
  material.userData.pbrTextureSource = textures?.source ?? 'flat-fallback';
  material.userData.referencePbr = spec.referencePbr ?? null;
  material.userData.referenceMaterialId = spec.referenceMaterialId ?? spec.materialReference?.profileId ?? null;
  material.userData.materialEvidence = spec.materialEvidence ?? null;
  material.userData.validationViews = spec.materialReference?.validationViews ?? [];
  material.needsUpdate = true;
  return material;
}

type AttachmentEndpoint = {
  start: THREE.Vector3;
  midpoint: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
  baseRadius: number;
  endRadius: number;
};

function readVector3(value: unknown, fallback: [number, number, number]): THREE.Vector3 {
  if (Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number')) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }
  return new THREE.Vector3(fallback[0], fallback[1], fallback[2]);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function makeAttachmentEndpoint(attachment: unknown): AttachmentEndpoint | null {
  if (!attachment || typeof attachment !== 'object') return null;
  const record = attachment as Record<string, unknown>;
  const start = readVector3(record.localStart, [0, 0, 0]);
  const end = readVector3(record.localEnd, [0, 1, 0]);
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length <= 0.0001) return null;
  const direction = delta.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  const baseRadius = Math.max(0.005, readNumber(record.baseRadius, 0.06));
  const endRadius = Math.max(0.003, readNumber(record.endRadius, baseRadius * 0.55));
  return {
    start,
    midpoint: delta.multiplyScalar(0.5),
    quaternion,
    length,
    baseRadius,
    endRadius,
  };
}

// Generated from ObjectSculptSpec target: Naga Loka Devotee Warrior
// Sculpt build pass: blockout
// This factory is intentionally pass-gated. Finish browser screenshot review before unlocking deeper passes.
export function createNagaLokaDevoteeWarriorModel(options: ProceduralModelOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = "Naga Loka Devotee Warrior";
  root.userData.reconstructionEvidence = {"itemFamily": null, "subtype": null, "componentAdapter": null, "route": null, "exactnessTier": null, "referenceCamera": {"solved": false, "fovDegrees": 40.0, "aspect": 1.0, "orientation": {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}, "positionHint": [0.0, 0.0, 3.0], "note": "For likeness work, solve the reference camera (forge/stage1_intake/solve_camera_pose.py) so the review render aligns with the photo and the reference can be projected. Confirm by overlay review."}, "approximationNotes": []};
  root.userData.materialPipeline = {};
  root.userData.materialReferenceRegistry = null;

  const materialMap: Record<string, THREE.Material> = {};
  materialMap["skin"] = createSculptMaterial(
    "skin",
    {"id": "skin", "name": "Bare skin", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#c47948", "color": "#c47948", "albedo": {"dominant": "#7D453B", "secondary": ["#A66B58", "#93584A", "#BB7F69"], "samplingNotes": "Reference-derived from foreground pixels; de-lit to reduce baked shadows/highlights."}, "colorVariation": {"palette": ["#7D453B", "#A66B58", "#93584A", "#BB7F69", "#36100D"], "pattern": "reference-derived pixel palette", "amplitude": 0.13, "heightCorrelation": 0.42}, "roughness": {"base": 0.62, "variation": 0.06}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.38, "contactShadowBias": 0.35, "map": {"path": "D:\\GAMES\\warrior_run\\.img2threejs\\material-evidence\\skin\\skin_ao.png", "url": "skin_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}, "notes": "Reference-derived cavity estimate from local height minima; verify against grazing-light screenshot."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}, {"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}, {"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there.", "Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps.", "Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps.", "Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps."], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo. Subsurface-ish satin. clearcoat 0: skin is not lacquered.", "finishClass": "matte-organic", "texturePalette": ["#874F43", "#A36855", "#B27660", "#BC8068", "#B77E66"], "proceduralTexture": "flat-clearcoat", "clearcoat": {"base": 0.0, "variation": 0.0}, "clearcoatRoughness": {"base": 0.05, "variation": 0.0}, "transmission": {"base": 0.0, "variation": 0.0}, "ior": {"base": 1.5, "value": 1.5}, "envMapIntensity": 1.0, "materialClass": "skin", "finishClassOverride": {"was": "painted-metal", "now": "matte-organic", "reason": "analyze_texture.py is tuned for CS2 weapon finishes and returned 'painted-metal' for this crop. Subsurface-ish satin. clearcoat 0: skin is not lacquered."}, "evidenceLimit": "Crop is the neck on the head-studies panel (86% skin, 4% panel grey), not the torso. The flatter torso crop is the more representative sample but scored 0.676 - under the 0.7 bar - because this extractor scores how much surface signal there is to measure, not whether the crop is the right material. The neck carries more form variation and scores 0.713. Same material either way; do not read the higher number as better evidence. Albedo, metalness, roughness and clearcoat are set from the doc-grounded skin recipe, not from the CS2 finish classifier, which called this crop painted-metal.", "textureless": {"declared": true, "evidence": ["Reference is a flat cel render: the torso crop (375,950)-(440,1040) has stddev [20,19,14] over 65x90px, and what variation there is tracks limb form, not surface detail. No pores, no grain. The extractor itself warned \"low value range weakens height/roughness inference\".", "suitability.md routed this reference as flat cel colour, which the rubric rule of thumb (\"solid albedo for flat paint, real reference crop for patterned finishes\") sends to procedural material, not projection."], "measurementRef": ".img2threejs/material-evidence/skin/ (extraction kept on disk as the measurement behind this claim; its de-lit palette corroborates the flat albedo, and its maps are deliberately NOT wired in because they bake the reference's own lighting into albedo)", "extractionConfidence": 0.713}},
    options
  );
  materialMap["hair"] = createSculptMaterial(
    "hair",
    {"id": "hair", "name": "Hair and topknot", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#241a1e", "color": "#241a1e", "albedo": {"dominant": "#282026", "secondary": ["#1E1619", "#110607", "#4B2B27"], "samplingNotes": "Reference-derived from foreground pixels; de-lit to reduce baked shadows/highlights."}, "colorVariation": {"palette": ["#282026", "#1E1619", "#110607", "#4B2B27", "#684642"], "pattern": "reference-derived pixel palette", "amplitude": 0.099, "heightCorrelation": 0.42}, "roughness": {"base": 0.38, "variation": 0.06}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.38, "contactShadowBias": 0.35, "map": {"path": "D:\\GAMES\\warrior_run\\.img2threejs\\material-evidence\\hair\\hair_ao.png", "url": "hair_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}, "notes": "Reference-derived cavity estimate from local height minima; verify against grazing-light screenshot."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there.", "Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps."], "notes": "Near-black with a banded satin highlight. Banded satin highlight comes from the normal, not from a coat.", "finishClass": "matte-organic", "texturePalette": ["#2F1D1F", "#36292C", "#383338", "#484448", "#5A5859"], "proceduralTexture": "flat-clearcoat", "clearcoat": {"base": 0.0, "variation": 0.0}, "clearcoatRoughness": {"base": 0.05, "variation": 0.0}, "transmission": {"base": 0.0, "variation": 0.0}, "ior": {"base": 1.5, "value": 1.5}, "envMapIntensity": 1.0, "materialClass": "skin", "finishClassOverride": {"was": "painted-metal", "now": "matte-organic", "reason": "analyze_texture.py is tuned for CS2 weapon finishes and returned 'painted-metal' for this crop. Banded satin highlight comes from the normal, not from a coat."}, "textureless": {"declared": true, "evidence": ["Hair reads as a solid black mass with a single banded specular sweep; no strand or fibre detail is drawn anywhere on the sheet, including the 8 enlarged head studies.", "suitability.md routed this reference as flat cel colour, which the rubric rule of thumb (\"solid albedo for flat paint, real reference crop for patterned finishes\") sends to procedural material, not projection."], "measurementRef": ".img2threejs/material-evidence/hair/ (extraction kept on disk as the measurement behind this claim; its de-lit palette corroborates the flat albedo, and its maps are deliberately NOT wired in because they bake the reference's own lighting into albedo)", "extractionConfidence": 0.829}},
    options
  );
  materialMap["dhoti"] = createSculptMaterial(
    "dhoti",
    {"id": "dhoti", "name": "Saffron dhoti cloth", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#e8951c", "color": "#e8951c", "albedo": {"dominant": "#B85C1C", "secondary": ["#C36720", "#CE7426", "#AE5217"], "samplingNotes": "Reference-derived from foreground pixels; de-lit to reduce baked shadows/highlights."}, "colorVariation": {"palette": ["#B85C1C", "#C36720", "#CE7426", "#AE5217", "#DA842D"], "pattern": "reference-derived pixel palette", "amplitude": 0.084, "heightCorrelation": 0.42}, "roughness": {"base": 0.86, "variation": 0.06}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.38, "contactShadowBias": 0.35, "map": {"path": "D:\\GAMES\\warrior_run\\.img2threejs\\material-evidence\\dhoti\\dhoti_ao.png", "url": "dhoti_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}, "notes": "Reference-derived cavity estimate from local height minima; verify against grazing-light screenshot."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there.", "Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps."], "notes": "Matte woven cotton; sheen only at fold crests. Fold ramp crest #f5a92e -> mid #e8951c -> trough #b96a08. Matte woven cotton.", "finishClass": "matte-organic", "texturePalette": ["#D57B27", "#BD621E", "#C66E24", "#C26821", "#BE601F"], "proceduralTexture": "flat-clearcoat", "clearcoat": {"base": 0.0, "variation": 0.0}, "clearcoatRoughness": {"base": 0.05, "variation": 0.0}, "transmission": {"base": 0.0, "variation": 0.0}, "ior": {"base": 1.5, "value": 1.5}, "envMapIntensity": 1.0, "materialClass": "fabric", "finishClassOverride": {"was": "painted-metal", "now": "matte-organic", "reason": "analyze_texture.py is tuned for CS2 weapon finishes and returned 'painted-metal' for this crop. Matte woven cotton."}, "textureless": {"declared": true, "evidence": ["The fabric swatch does carry a faint damask motif and a gold hem border, but both sit at roughly 2px at model scale and the extracted crop bakes the swatch's own drape shading into albedo as horizontal banding. Fold form is carried by the dhoti-fold-ridges repetition system instead. The omission is deliberate, not an oversight.", "suitability.md routed this reference as flat cel colour, which the rubric rule of thumb (\"solid albedo for flat paint, real reference crop for patterned finishes\") sends to procedural material, not projection."], "measurementRef": ".img2threejs/material-evidence/dhoti/ (extraction kept on disk as the measurement behind this claim; its de-lit palette corroborates the flat albedo, and its maps are deliberately NOT wired in because they bake the reference's own lighting into albedo)", "extractionConfidence": 0.759}},
    options
  );
  materialMap["dhoti-sash"] = createSculptMaterial(
    "dhoti-sash",
    {"id": "dhoti-sash", "name": "Waist sash", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#d4820f", "color": "#d4820f", "albedo": {"dominant": "#CB6F25", "secondary": ["#B25C20", "#9D470F", "#D77E37"], "samplingNotes": "Reference-derived from foreground pixels; de-lit to reduce baked shadows/highlights."}, "colorVariation": {"palette": ["#CB6F25", "#B25C20", "#9D470F", "#D77E37", "#752A06"], "pattern": "reference-derived pixel palette", "amplitude": 0.136, "heightCorrelation": 0.42}, "roughness": {"base": 0.83, "variation": 0.06}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.38, "contactShadowBias": 0.35, "map": {"path": "D:\\GAMES\\warrior_run\\.img2threejs\\material-evidence\\dhoti-sash\\dhoti-sash_ao.png", "url": "dhoti-sash_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}, "notes": "Reference-derived cavity estimate from local height minima; verify against grazing-light screenshot."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there.", "Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps."], "notes": "Same cloth, read one step darker where it rolls over itself. Same cotton, compressed where it rolls.", "finishClass": "matte-organic", "texturePalette": ["#95553D", "#C0631B", "#B65D1B", "#B65D1D", "#97491A"], "proceduralTexture": "flat-clearcoat", "clearcoat": {"base": 0.0, "variation": 0.0}, "clearcoatRoughness": {"base": 0.05, "variation": 0.0}, "transmission": {"base": 0.0, "variation": 0.0}, "ior": {"base": 1.5, "value": 1.5}, "envMapIntensity": 1.0, "materialClass": "fabric", "finishClassOverride": {"was": "painted-metal", "now": "matte-organic", "reason": "analyze_texture.py is tuned for CS2 weapon finishes and returned 'painted-metal' for this crop. Same cotton, compressed where it rolls."}, "textureless": {"declared": true, "evidence": ["Same cloth as dhoti; the sash is drawn as flat colour with fold shading only.", "suitability.md routed this reference as flat cel colour, which the rubric rule of thumb (\"solid albedo for flat paint, real reference crop for patterned finishes\") sends to procedural material, not projection."], "measurementRef": ".img2threejs/material-evidence/dhoti-sash/ (extraction kept on disk as the measurement behind this claim; its de-lit palette corroborates the flat albedo, and its maps are deliberately NOT wired in because they bake the reference's own lighting into albedo)", "extractionConfidence": 0.745}},
    options
  );
  materialMap["janeu-cord"] = createSculptMaterial(
    "janeu-cord",
    {"id": "janeu-cord", "name": "Janeu chest sash", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#eacbbf", "color": "#eacbbf", "albedo": {"dominant": "#eacbbf", "secondary": ["#BD7F66", "#D29B7F", "#D8A992"], "samplingNotes": "Reference-derived from foreground pixels; de-lit to reduce baked shadows/highlights."}, "colorVariation": {"palette": ["#C88C70", "#BD7F66", "#D29B7F", "#D8A992", "#603024"], "pattern": "reference-derived pixel palette", "amplitude": 0.155, "heightCorrelation": 0.42}, "roughness": {"base": 0.8, "variation": 0.06}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.38, "contactShadowBias": 0.35, "map": {"path": "D:\\GAMES\\warrior_run\\.img2threejs\\material-evidence\\janeu-cord\\janeu-cord_ao.png", "url": "janeu-cord_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}, "notes": "Reference-derived cavity estimate from local height minima; verify against grazing-light screenshot."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there.", "Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps."], "notes": "Cream cotton sash worn over one shoulder. Broad flat band, not a cord. Cream twisted cotton, thin round cross-section. Twisted cotton cord.", "clearcoat": {"base": 0.0, "variation": 0.0}, "materialClass": "fabric", "finishClassOverride": {"was": null, "now": "matte-organic", "reason": "analyze_texture.py is tuned for CS2 weapon finishes and returned None for this crop. Twisted cotton cord."}, "finishClass": "matte-organic", "evidenceLimit": "Albedo is from the brightest core pixels of the band on the turnaround, where it is only a few px wide; the dedicated \"Chest Sash\" swatch confirms the width and the flat cream colour.", "textureless": {"declared": true, "evidence": ["The cord is ~4px wide on the sheet - below any resolution at which texture could be observed, let alone extracted.", "suitability.md routed this reference as flat cel colour, which the rubric rule of thumb (\"solid albedo for flat paint, real reference crop for patterned finishes\") sends to procedural material, not projection."], "measurementRef": ".img2threejs/material-evidence/janeu-cord/ (extraction kept on disk as the measurement behind this claim; its de-lit palette corroborates the flat albedo, and its maps are deliberately NOT wired in because they bake the reference's own lighting into albedo)", "extractionConfidence": 0.76}},
    options
  );
  materialMap["rudraksha"] = createSculptMaterial(
    "rudraksha",
    {"id": "rudraksha", "name": "Rudraksha bead", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#6a3210", "color": "#6a3210", "albedo": {"dominant": "#55241A", "secondary": ["#3B1009", "#6F3D32", "#915E50"], "samplingNotes": "Reference-derived from foreground pixels; de-lit to reduce baked shadows/highlights."}, "colorVariation": {"palette": ["#55241A", "#3B1009", "#6F3D32", "#915E50", "#BE8770"], "pattern": "reference-derived pixel palette", "amplitude": 0.225, "heightCorrelation": 0.42}, "roughness": {"base": 0.84, "variation": 0.06}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.38, "contactShadowBias": 0.35, "map": {"path": "D:\\GAMES\\warrior_run\\.img2threejs\\material-evidence\\rudraksha\\rudraksha_ao.png", "url": "rudraksha_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}, "notes": "Reference-derived cavity estimate from local height minima; verify against grazing-light screenshot."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there.", "Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps."], "notes": "Warm brown seed with a strongly furrowed surface; the furrows are material-scale, below geometry scale. A dried seed. metalness 0.35 / roughness 0.18 would have read as polished candy plastic.", "finishClass": "matte-organic", "texturePalette": ["#A97662", "#612D23", "#5C332C", "#602E24", "#B1806C"], "proceduralTexture": "gradient-smoke", "clearcoat": {"base": 0.0, "variation": 0.0}, "clearcoatRoughness": {"base": 0.15, "variation": 0.0}, "transmission": {"base": 0.0, "variation": 0.0}, "ior": {"base": 1.5, "value": 1.5}, "envMapIntensity": 0.7, "materialClass": "wood", "finishClassOverride": {"was": "candy-coat", "now": "matte-organic", "reason": "analyze_texture.py is tuned for CS2 weapon finishes and returned 'candy-coat' for this crop. A dried seed. metalness 0.35 / roughness 0.18 would have read as polished candy plastic."}, "textureless": {"declared": true, "evidence": ["The bead furrows ARE the surface, but they are drawn per-bead at ~14px and are carried as instanced bead geometry by the rudraksha-bead-loop repetition system, not as a tiled texture.", "suitability.md routed this reference as flat cel colour, which the rubric rule of thumb (\"solid albedo for flat paint, real reference crop for patterned finishes\") sends to procedural material, not projection."], "measurementRef": ".img2threejs/material-evidence/rudraksha/ (extraction kept on disk as the measurement behind this claim; its de-lit palette corroborates the flat albedo, and its maps are deliberately NOT wired in because they bake the reference's own lighting into albedo)", "extractionConfidence": 0.829}},
    options
  );
  materialMap["tilak"] = createSculptMaterial(
    "tilak",
    {"id": "tilak", "name": "Tilak pigment", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#783121", "color": "#783121", "albedo": {"dominant": "#783121", "secondary": ["#E4A084", "#F0AD93", "#914433"], "samplingNotes": "Reference-derived from foreground pixels; de-lit to reduce baked shadows/highlights."}, "colorVariation": {"palette": ["#E5AC8F", "#E4A084", "#F0AD93", "#914433", "#BF745F"], "pattern": "reference-derived pixel palette", "amplitude": 0.18, "heightCorrelation": 0.42}, "roughness": {"base": 0.72, "variation": 0.06}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.38, "contactShadowBias": 0.35, "map": {"path": "D:\\GAMES\\warrior_run\\.img2threejs\\material-evidence\\tilak\\tilak_ao.png", "url": "tilak_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}, "notes": "Reference-derived cavity estimate from local height minima; verify against grazing-light screenshot."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there.", "Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps."], "notes": "Red vermilion paste. Dry vermilion paste.", "clearcoat": {"base": 0.0, "variation": 0.0}, "materialClass": "ceramic", "finishClassOverride": {"was": null, "now": "chalk", "reason": "analyze_texture.py is tuned for CS2 weapon finishes and returned None for this crop. Dry vermilion paste."}, "finishClass": "chalk", "evidenceLimit": "The mark is about 3px wide. Albedo is from its most saturated core pixels; the rest is doc-grounded.", "textureless": {"declared": true, "evidence": ["A ~3px flat red mark.", "suitability.md routed this reference as flat cel colour, which the rubric rule of thumb (\"solid albedo for flat paint, real reference crop for patterned finishes\") sends to procedural material, not projection."], "measurementRef": ".img2threejs/material-evidence/tilak/ (extraction kept on disk as the measurement behind this claim; its de-lit palette corroborates the flat albedo, and its maps are deliberately NOT wired in because they bake the reference's own lighting into albedo)", "extractionConfidence": 0.723}},
    options
  );
  materialMap["eye"] = createSculptMaterial(
    "eye",
    {"id": "eye", "name": "Eye", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#482a25", "color": "#482a25", "albedo": {"dominant": "#482a25", "secondary": ["#C1846B", "#955D4E", "#41241F"], "samplingNotes": "Reference-derived from foreground pixels; de-lit to reduce baked shadows/highlights."}, "colorVariation": {"palette": ["#DDA284", "#C1846B", "#955D4E", "#41241F", "#F5E9E6"], "pattern": "reference-derived pixel palette", "amplitude": 0.202, "heightCorrelation": 0.42}, "roughness": {"base": 0.28, "variation": 0.06}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.38, "contactShadowBias": 0.35, "map": {"path": "D:\\GAMES\\warrior_run\\.img2threejs\\material-evidence\\eye\\eye_ao.png", "url": "eye_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}, "notes": "Reference-derived cavity estimate from local height minima; verify against grazing-light screenshot."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there.", "Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps."], "notes": "Dark iris mass; face detail is below gameplay-visible scale. Wet cornea is the one genuinely glossy surface.", "clearcoat": {"base": 0.0, "variation": 0.0}, "materialClass": "skin", "finishClassOverride": {"was": null, "now": "matte-organic", "reason": "analyze_texture.py is tuned for CS2 weapon finishes and returned None for this crop. Wet cornea is the one genuinely glossy surface."}, "finishClass": "matte-organic", "evidenceLimit": "Below gameplay-visible scale; massing and albedo only.", "textureless": {"declared": true, "evidence": ["Drawn as flat colour regions with a single specular dot.", "suitability.md routed this reference as flat cel colour, which the rubric rule of thumb (\"solid albedo for flat paint, real reference crop for patterned finishes\") sends to procedural material, not projection."], "measurementRef": ".img2threejs/material-evidence/eye/ (extraction kept on disk as the measurement behind this claim; its de-lit palette corroborates the flat albedo, and its maps are deliberately NOT wired in because they bake the reference's own lighting into albedo)", "extractionConfidence": 0.732}},
    options
  );
  materialMap["lips"] = createSculptMaterial(
    "lips",
    {"id": "lips", "name": "Lips", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#9a5c4a", "color": "#9a5c4a", "albedo": {"dominant": "#9a5c4a", "secondary": ["#C4876E", "#D3987E", "#975746"], "samplingNotes": "Reference-derived from foreground pixels; de-lit to reduce baked shadows/highlights."}, "colorVariation": {"palette": ["#B57862", "#C4876E", "#D3987E", "#975746", "#692A1D"], "pattern": "reference-derived pixel palette", "amplitude": 0.164, "heightCorrelation": 0.42}, "roughness": {"base": 0.6, "variation": 0.06}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.38, "contactShadowBias": 0.35, "map": {"path": "D:\\GAMES\\warrior_run\\.img2threejs\\material-evidence\\lips\\lips_ao.png", "url": "lips_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}, "notes": "Reference-derived cavity estimate from local height minima; verify against grazing-light screenshot."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there.", "Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps."], "notes": "Slightly cooler and darker than the surrounding skin. Marginally glossier than surrounding skin.", "clearcoat": {"base": 0.0, "variation": 0.0}, "materialClass": "skin", "finishClassOverride": {"was": null, "now": "matte-organic", "reason": "analyze_texture.py is tuned for CS2 weapon finishes and returned None for this crop. Marginally glossier than surrounding skin."}, "finishClass": "matte-organic", "evidenceLimit": "Below gameplay-visible scale; massing and albedo only.", "textureless": {"declared": true, "evidence": ["Flat colour with a soft edge; no lip texture is drawn.", "suitability.md routed this reference as flat cel colour, which the rubric rule of thumb (\"solid albedo for flat paint, real reference crop for patterned finishes\") sends to procedural material, not projection."], "measurementRef": ".img2threejs/material-evidence/lips/ (extraction kept on disk as the measurement behind this claim; its de-lit palette corroborates the flat albedo, and its maps are deliberately NOT wired in because they bake the reference's own lighting into albedo)", "extractionConfidence": 0.705}},
    options
  );

  const nodes: Record<string, THREE.Object3D> = { root };
  const meshes: Record<string, THREE.Mesh> = {};
  const sockets: Record<string, THREE.Object3D> = {};
  const colliders: Record<string, unknown> = {};
  const destructionGroups: Record<string, THREE.Object3D[]> = {};

  const endpoint_pelvis_0 = makeAttachmentEndpoint(null);
  const node_pelvis_0 = new THREE.Group();
  node_pelvis_0.name = "Pelvis__pivot";
  node_pelvis_0.scale.set(1, 1, 1);
  if (endpoint_pelvis_0) {
    node_pelvis_0.position.copy(endpoint_pelvis_0.start);
    node_pelvis_0.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_pelvis_0.position.set(0.0, 1.05, 0.0);
    node_pelvis_0.rotation.set(0.0, 0.0, 0.0);
  }
  node_pelvis_0.userData.sculptComponent = {"id": "pelvis", "name": "Pelvis", "level": "macro", "role": "body", "importance": 0.9, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Pelvis is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": null, "attachment": null, "dimensions": {"width": 0.37033, "height": 0.2, "depth": 0.235, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, 1.05, 0], "rotation": [0.0, 0.0, 0.0], "scale": [0.37033, 0.2, 0.235]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_pelvis_0.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["root"] ?? root).add(node_pelvis_0);
  nodes["pelvis"] = node_pelvis_0;
  const mesh_pelvis_0Geometry = endpoint_pelvis_0
    ? new THREE.CylinderGeometry(endpoint_pelvis_0.endRadius, endpoint_pelvis_0.baseRadius, endpoint_pelvis_0.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_pelvis_0) {
    mesh_pelvis_0Geometry.scale(0.37033, 0.2, 0.235);
  }
  const mesh_pelvis_0 = new THREE.Mesh(
    mesh_pelvis_0Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_pelvis_0.name = "Pelvis";
  if (endpoint_pelvis_0) {
    mesh_pelvis_0.position.copy(endpoint_pelvis_0.midpoint);
    mesh_pelvis_0.quaternion.copy(endpoint_pelvis_0.quaternion);
  }
  mesh_pelvis_0.castShadow = options.castShadow ?? true;
  mesh_pelvis_0.receiveShadow = options.receiveShadow ?? true;
  mesh_pelvis_0.userData.sculptComponent = {"id": "pelvis", "name": "Pelvis", "level": "macro", "role": "body", "importance": 0.9, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Pelvis is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": null, "attachment": null, "dimensions": {"width": 0.37033, "height": 0.2, "depth": 0.235, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, 1.05, 0], "rotation": [0.0, 0.0, 0.0], "scale": [0.37033, 0.2, 0.235]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_pelvis_0.add(mesh_pelvis_0);
  meshes["pelvis"] = mesh_pelvis_0;
  colliders["pelvis"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_pelvis_0);

  const attachment_dhoti_sash_1 = {"parentSocket": "pelvis-cloth-socket", "localStart": [0, 0.13527, 0], "localEnd": [0, 0.21327, 0], "contactType": "wrap-overlap", "baseRadius": 0.208, "endRadius": 0.208, "overlap": 0.018, "embedDepth": 0.0, "gapTolerance": 0.006, "evidenceRefs": ["full-object"], "notes": "The sash is a band that rides the pelvis; it wraps rather than hangs. Offset outside the skin so the cloth never shares vertices with the limb it covers."};
  const endpoint_dhoti_sash_1 = makeAttachmentEndpoint(attachment_dhoti_sash_1);
  const node_dhoti_sash_1 = new THREE.Group();
  node_dhoti_sash_1.name = "Waist sash__pivot";
  node_dhoti_sash_1.scale.set(1, 1, 1);
  if (endpoint_dhoti_sash_1) {
    node_dhoti_sash_1.position.copy(endpoint_dhoti_sash_1.start);
    node_dhoti_sash_1.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_dhoti_sash_1.position.set(0.0, 0.17427, 0.0);
    node_dhoti_sash_1.rotation.set(0.0, 0.0, 0.0);
  }
  node_dhoti_sash_1.userData.sculptComponent = {"id": "dhoti-sash", "name": "Waist sash", "level": "meso", "role": "garment", "importance": 0.75, "confidence": 0.75, "primitive": "cylinder", "topologyClass": "conforming-shell", "topologyRationale": "Garment layer offset outside the skin surface; it follows the body it covers rather than being part of that body.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "pelvis", "attachment": {"parentSocket": "pelvis-cloth-socket", "localStart": [0, 0.13527, 0], "localEnd": [0, 0.21327, 0], "contactType": "wrap-overlap", "baseRadius": 0.208, "endRadius": 0.208, "overlap": 0.018, "embedDepth": 0.0, "gapTolerance": 0.006, "evidenceRefs": ["full-object"], "notes": "The sash is a band that rides the pelvis; it wraps rather than hangs. Offset outside the skin so the cloth never shares vertices with the limb it covers."}, "dimensions": {"width": 0.415, "height": 0.078, "depth": 0.278, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, 0.17427, 0], "rotation": [0.0, 0.0, 0.0], "scale": [0.415, 0.078, 0.278]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dhoti-sash", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dhoti-sash"}}, "material": "dhoti-sash", "materialLayers": ["dhoti-sash"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "dhoti-sash-read", "description": "Rolled waistband above the wrap, at the measured sash line y=1.165.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(212, 130, 15, 1.0)", "secondaryAlbedo": "rgba(232, 149, 28, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(232, 149, 28, 1.0)"}, {"position": 0.5, "color": "rgba(212, 130, 15, 1.0)"}, {"position": 1.0, "color": "rgba(168, 92, 6, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Same cloth, read one step darker where it rolls over itself."}};
  node_dhoti_sash_1.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dhoti-sash", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dhoti-sash"}};
  (nodes["pelvis"] ?? root).add(node_dhoti_sash_1);
  nodes["dhoti-sash"] = node_dhoti_sash_1;
  const mesh_dhoti_sash_1Geometry = endpoint_dhoti_sash_1
    ? new THREE.CylinderGeometry(endpoint_dhoti_sash_1.endRadius, endpoint_dhoti_sash_1.baseRadius, endpoint_dhoti_sash_1.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_dhoti_sash_1) {
    mesh_dhoti_sash_1Geometry.scale(0.415, 0.078, 0.278);
  }
  const mesh_dhoti_sash_1 = new THREE.Mesh(
    mesh_dhoti_sash_1Geometry,
    materialMap["dhoti-sash"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_dhoti_sash_1.name = "Waist sash";
  if (endpoint_dhoti_sash_1) {
    mesh_dhoti_sash_1.position.copy(endpoint_dhoti_sash_1.midpoint);
    mesh_dhoti_sash_1.quaternion.copy(endpoint_dhoti_sash_1.quaternion);
  }
  mesh_dhoti_sash_1.castShadow = options.castShadow ?? true;
  mesh_dhoti_sash_1.receiveShadow = options.receiveShadow ?? true;
  mesh_dhoti_sash_1.userData.sculptComponent = {"id": "dhoti-sash", "name": "Waist sash", "level": "meso", "role": "garment", "importance": 0.75, "confidence": 0.75, "primitive": "cylinder", "topologyClass": "conforming-shell", "topologyRationale": "Garment layer offset outside the skin surface; it follows the body it covers rather than being part of that body.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "pelvis", "attachment": {"parentSocket": "pelvis-cloth-socket", "localStart": [0, 0.13527, 0], "localEnd": [0, 0.21327, 0], "contactType": "wrap-overlap", "baseRadius": 0.208, "endRadius": 0.208, "overlap": 0.018, "embedDepth": 0.0, "gapTolerance": 0.006, "evidenceRefs": ["full-object"], "notes": "The sash is a band that rides the pelvis; it wraps rather than hangs. Offset outside the skin so the cloth never shares vertices with the limb it covers."}, "dimensions": {"width": 0.415, "height": 0.078, "depth": 0.278, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, 0.17427, 0], "rotation": [0.0, 0.0, 0.0], "scale": [0.415, 0.078, 0.278]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dhoti-sash", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dhoti-sash"}}, "material": "dhoti-sash", "materialLayers": ["dhoti-sash"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "dhoti-sash-read", "description": "Rolled waistband above the wrap, at the measured sash line y=1.165.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(212, 130, 15, 1.0)", "secondaryAlbedo": "rgba(232, 149, 28, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(232, 149, 28, 1.0)"}, {"position": 0.5, "color": "rgba(212, 130, 15, 1.0)"}, {"position": 1.0, "color": "rgba(168, 92, 6, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Same cloth, read one step darker where it rolls over itself."}};
  node_dhoti_sash_1.add(mesh_dhoti_sash_1);
  meshes["dhoti-sash"] = mesh_dhoti_sash_1;
  colliders["dhoti-sash"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["dhoti-sash"] ??= [];
  destructionGroups["dhoti-sash"].push(node_dhoti_sash_1);

  const endpoint_dhoti_wrap_2 = makeAttachmentEndpoint(null);
  const node_dhoti_wrap_2 = new THREE.Group();
  node_dhoti_wrap_2.name = "Dhoti hip wrap__pivot";
  node_dhoti_wrap_2.scale.set(1, 1, 1);
  if (endpoint_dhoti_wrap_2) {
    node_dhoti_wrap_2.position.copy(endpoint_dhoti_wrap_2.start);
    node_dhoti_wrap_2.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_dhoti_wrap_2.position.set(0.0, -0.045, 0.004);
    node_dhoti_wrap_2.rotation.set(0.0, 0.0, 0.0);
  }
  node_dhoti_wrap_2.userData.sculptComponent = {"id": "dhoti-wrap", "name": "Dhoti hip wrap", "level": "macro", "role": "garment", "importance": 0.9, "confidence": 0.75, "primitive": "ellipsoid", "topologyClass": "conforming-shell", "topologyRationale": "Garment layer offset outside the skin surface; it follows the body it covers rather than being part of that body.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "pelvis", "attachment": null, "dimensions": {"width": 0.425, "height": 0.265, "depth": 0.262, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, -0.045, 0.004], "rotation": [0.0, 0.0, 0.0], "scale": [0.425, 0.265, 0.262]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dhoti-wrap", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dhoti"}}, "material": "dhoti", "materialLayers": ["dhoti"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "dhoti-wrap-read", "description": "Cloth volume over the pelvis, offset outside the hip so it follows the body without coincident vertices. Depth pulled in from 0.290 to 0.252 after the first turntable showed it reading as a bustle rather than a wrap.", "scale": "macro", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(232, 149, 28, 1.0)", "secondaryAlbedo": "rgba(245, 169, 46, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(245, 169, 46, 1.0)"}, {"position": 0.5, "color": "rgba(232, 149, 28, 1.0)"}, {"position": 1.0, "color": "rgba(185, 106, 8, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Matte woven cotton; sheen only at fold crests. Fold ramp crest #f5a92e -> mid #e8951c -> trough #b96a08."}};
  node_dhoti_wrap_2.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dhoti-wrap", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dhoti"}};
  (nodes["pelvis"] ?? root).add(node_dhoti_wrap_2);
  nodes["dhoti-wrap"] = node_dhoti_wrap_2;
  const mesh_dhoti_wrap_2Geometry = endpoint_dhoti_wrap_2
    ? new THREE.CylinderGeometry(endpoint_dhoti_wrap_2.endRadius, endpoint_dhoti_wrap_2.baseRadius, endpoint_dhoti_wrap_2.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_dhoti_wrap_2) {
    mesh_dhoti_wrap_2Geometry.scale(0.425, 0.265, 0.262);
  }
  const mesh_dhoti_wrap_2 = new THREE.Mesh(
    mesh_dhoti_wrap_2Geometry,
    materialMap["dhoti"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_dhoti_wrap_2.name = "Dhoti hip wrap";
  if (endpoint_dhoti_wrap_2) {
    mesh_dhoti_wrap_2.position.copy(endpoint_dhoti_wrap_2.midpoint);
    mesh_dhoti_wrap_2.quaternion.copy(endpoint_dhoti_wrap_2.quaternion);
  }
  mesh_dhoti_wrap_2.castShadow = options.castShadow ?? true;
  mesh_dhoti_wrap_2.receiveShadow = options.receiveShadow ?? true;
  mesh_dhoti_wrap_2.userData.sculptComponent = {"id": "dhoti-wrap", "name": "Dhoti hip wrap", "level": "macro", "role": "garment", "importance": 0.9, "confidence": 0.75, "primitive": "ellipsoid", "topologyClass": "conforming-shell", "topologyRationale": "Garment layer offset outside the skin surface; it follows the body it covers rather than being part of that body.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "pelvis", "attachment": null, "dimensions": {"width": 0.425, "height": 0.265, "depth": 0.262, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, -0.045, 0.004], "rotation": [0.0, 0.0, 0.0], "scale": [0.425, 0.265, 0.262]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dhoti-wrap", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dhoti"}}, "material": "dhoti", "materialLayers": ["dhoti"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "dhoti-wrap-read", "description": "Cloth volume over the pelvis, offset outside the hip so it follows the body without coincident vertices. Depth pulled in from 0.290 to 0.252 after the first turntable showed it reading as a bustle rather than a wrap.", "scale": "macro", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(232, 149, 28, 1.0)", "secondaryAlbedo": "rgba(245, 169, 46, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(245, 169, 46, 1.0)"}, {"position": 0.5, "color": "rgba(232, 149, 28, 1.0)"}, {"position": 1.0, "color": "rgba(185, 106, 8, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Matte woven cotton; sheen only at fold crests. Fold ramp crest #f5a92e -> mid #e8951c -> trough #b96a08."}};
  node_dhoti_wrap_2.add(mesh_dhoti_wrap_2);
  meshes["dhoti-wrap"] = mesh_dhoti_wrap_2;
  colliders["dhoti-wrap"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["dhoti-wrap"] ??= [];
  destructionGroups["dhoti-wrap"].push(node_dhoti_wrap_2);

  const endpoint_dhoti_pleat_3 = makeAttachmentEndpoint(null);
  const node_dhoti_pleat_3 = new THREE.Group();
  node_dhoti_pleat_3.name = "Front pleat panel__pivot";
  node_dhoti_pleat_3.scale.set(1, 1, 1);
  if (endpoint_dhoti_pleat_3) {
    node_dhoti_pleat_3.position.copy(endpoint_dhoti_pleat_3.start);
    node_dhoti_pleat_3.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_dhoti_pleat_3.position.set(0.0, -0.105, 0.112);
    node_dhoti_pleat_3.rotation.set(0.0, 0.0, 0.0);
  }
  node_dhoti_pleat_3.userData.sculptComponent = {"id": "dhoti-pleat", "name": "Front pleat panel", "level": "meso", "role": "garment", "importance": 0.65, "confidence": 0.75, "primitive": "box", "topologyClass": "conforming-shell", "topologyRationale": "Garment layer offset outside the skin surface; it follows the body it covers rather than being part of that body.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "pelvis", "attachment": null, "dimensions": {"width": 0.145, "height": 0.4, "depth": 0.028, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, -0.105, 0.112], "rotation": [0.0, 0.0, 0.0], "scale": [0.145, 0.4, 0.028]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dhoti-pleat", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dhoti"}}, "material": "dhoti", "materialLayers": ["dhoti"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "dhoti-pleat-read", "description": "Flat pleated fan hanging down the front centre line. Pulled in from z 0.132 to 0.112 and narrowed after it read as a detached flap.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(232, 149, 28, 1.0)", "secondaryAlbedo": "rgba(245, 169, 46, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(245, 169, 46, 1.0)"}, {"position": 0.5, "color": "rgba(232, 149, 28, 1.0)"}, {"position": 1.0, "color": "rgba(185, 106, 8, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Matte woven cotton; sheen only at fold crests. Fold ramp crest #f5a92e -> mid #e8951c -> trough #b96a08."}};
  node_dhoti_pleat_3.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dhoti-pleat", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dhoti"}};
  (nodes["pelvis"] ?? root).add(node_dhoti_pleat_3);
  nodes["dhoti-pleat"] = node_dhoti_pleat_3;
  const mesh_dhoti_pleat_3Geometry = endpoint_dhoti_pleat_3
    ? new THREE.CylinderGeometry(endpoint_dhoti_pleat_3.endRadius, endpoint_dhoti_pleat_3.baseRadius, endpoint_dhoti_pleat_3.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_dhoti_pleat_3) {
    mesh_dhoti_pleat_3Geometry.scale(0.145, 0.4, 0.028);
  }
  const mesh_dhoti_pleat_3 = new THREE.Mesh(
    mesh_dhoti_pleat_3Geometry,
    materialMap["dhoti"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_dhoti_pleat_3.name = "Front pleat panel";
  if (endpoint_dhoti_pleat_3) {
    mesh_dhoti_pleat_3.position.copy(endpoint_dhoti_pleat_3.midpoint);
    mesh_dhoti_pleat_3.quaternion.copy(endpoint_dhoti_pleat_3.quaternion);
  }
  mesh_dhoti_pleat_3.castShadow = options.castShadow ?? true;
  mesh_dhoti_pleat_3.receiveShadow = options.receiveShadow ?? true;
  mesh_dhoti_pleat_3.userData.sculptComponent = {"id": "dhoti-pleat", "name": "Front pleat panel", "level": "meso", "role": "garment", "importance": 0.65, "confidence": 0.75, "primitive": "box", "topologyClass": "conforming-shell", "topologyRationale": "Garment layer offset outside the skin surface; it follows the body it covers rather than being part of that body.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "pelvis", "attachment": null, "dimensions": {"width": 0.145, "height": 0.4, "depth": 0.028, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, -0.105, 0.112], "rotation": [0.0, 0.0, 0.0], "scale": [0.145, 0.4, 0.028]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dhoti-pleat", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dhoti"}}, "material": "dhoti", "materialLayers": ["dhoti"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "dhoti-pleat-read", "description": "Flat pleated fan hanging down the front centre line. Pulled in from z 0.132 to 0.112 and narrowed after it read as a detached flap.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(232, 149, 28, 1.0)", "secondaryAlbedo": "rgba(245, 169, 46, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(245, 169, 46, 1.0)"}, {"position": 0.5, "color": "rgba(232, 149, 28, 1.0)"}, {"position": 1.0, "color": "rgba(185, 106, 8, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Matte woven cotton; sheen only at fold crests. Fold ramp crest #f5a92e -> mid #e8951c -> trough #b96a08."}};
  node_dhoti_pleat_3.add(mesh_dhoti_pleat_3);
  meshes["dhoti-pleat"] = mesh_dhoti_pleat_3;
  colliders["dhoti-pleat"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["dhoti-pleat"] ??= [];
  destructionGroups["dhoti-pleat"].push(node_dhoti_pleat_3);

  const endpoint_dhoti_tail_4 = makeAttachmentEndpoint(null);
  const node_dhoti_tail_4 = new THREE.Group();
  node_dhoti_tail_4.name = "Side tail__pivot";
  node_dhoti_tail_4.scale.set(1, 1, 1);
  if (endpoint_dhoti_tail_4) {
    node_dhoti_tail_4.position.copy(endpoint_dhoti_tail_4.start);
    node_dhoti_tail_4.rotation.set(0.0, 0.0, -0.069813);
  } else {
    node_dhoti_tail_4.position.set(0.158, -0.235, 0.048);
    node_dhoti_tail_4.rotation.set(0.0, 0.0, -0.069813);
  }
  node_dhoti_tail_4.userData.sculptComponent = {"id": "dhoti-tail", "name": "Side tail", "level": "meso", "role": "garment", "importance": 0.6, "confidence": 0.75, "primitive": "box", "topologyClass": "conforming-shell", "topologyRationale": "Garment layer offset outside the skin surface; it follows the body it covers rather than being part of that body.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "pelvis", "attachment": {"parentSocket": "pelvis-cloth-socket", "localStart": [0.17, 0.035, 0.06], "localEnd": [0.17, -0.505, 0.06], "contactType": "wrap-overlap", "baseRadius": 0.052, "endRadius": 0.04, "overlap": 0.018, "embedDepth": 0.0, "gapTolerance": 0.006, "evidenceRefs": ["full-object"], "notes": "Hangs from the waist knot on one side only. Offset outside the skin so the cloth never shares vertices with the limb it covers."}, "dimensions": {"width": 0.086, "height": 0.52, "depth": 0.03, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0.158, -0.235, 0.048], "rotation": [0.0, 0.0, -0.069813], "scale": [0.086, 0.52, 0.03]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dhoti-tail", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dhoti"}}, "material": "dhoti", "materialLayers": ["dhoti"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "dhoti-tail-read", "description": "Hangs on ONE side only - the asymmetry the analysis flagged as identity-defining. Thinned and brought inboard; it was reading as a flat slab.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(232, 149, 28, 1.0)", "secondaryAlbedo": "rgba(245, 169, 46, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(245, 169, 46, 1.0)"}, {"position": 0.5, "color": "rgba(232, 149, 28, 1.0)"}, {"position": 1.0, "color": "rgba(185, 106, 8, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Matte woven cotton; sheen only at fold crests. Fold ramp crest #f5a92e -> mid #e8951c -> trough #b96a08."}};
  node_dhoti_tail_4.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dhoti-tail", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dhoti"}};
  (nodes["pelvis"] ?? root).add(node_dhoti_tail_4);
  nodes["dhoti-tail"] = node_dhoti_tail_4;
  const mesh_dhoti_tail_4Geometry = endpoint_dhoti_tail_4
    ? new THREE.CylinderGeometry(endpoint_dhoti_tail_4.endRadius, endpoint_dhoti_tail_4.baseRadius, endpoint_dhoti_tail_4.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_dhoti_tail_4) {
    mesh_dhoti_tail_4Geometry.scale(0.086, 0.52, 0.03);
  }
  const mesh_dhoti_tail_4 = new THREE.Mesh(
    mesh_dhoti_tail_4Geometry,
    materialMap["dhoti"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_dhoti_tail_4.name = "Side tail";
  if (endpoint_dhoti_tail_4) {
    mesh_dhoti_tail_4.position.copy(endpoint_dhoti_tail_4.midpoint);
    mesh_dhoti_tail_4.quaternion.copy(endpoint_dhoti_tail_4.quaternion);
  }
  mesh_dhoti_tail_4.castShadow = options.castShadow ?? true;
  mesh_dhoti_tail_4.receiveShadow = options.receiveShadow ?? true;
  mesh_dhoti_tail_4.userData.sculptComponent = {"id": "dhoti-tail", "name": "Side tail", "level": "meso", "role": "garment", "importance": 0.6, "confidence": 0.75, "primitive": "box", "topologyClass": "conforming-shell", "topologyRationale": "Garment layer offset outside the skin surface; it follows the body it covers rather than being part of that body.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "pelvis", "attachment": {"parentSocket": "pelvis-cloth-socket", "localStart": [0.17, 0.035, 0.06], "localEnd": [0.17, -0.505, 0.06], "contactType": "wrap-overlap", "baseRadius": 0.052, "endRadius": 0.04, "overlap": 0.018, "embedDepth": 0.0, "gapTolerance": 0.006, "evidenceRefs": ["full-object"], "notes": "Hangs from the waist knot on one side only. Offset outside the skin so the cloth never shares vertices with the limb it covers."}, "dimensions": {"width": 0.086, "height": 0.52, "depth": 0.03, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0.158, -0.235, 0.048], "rotation": [0.0, 0.0, -0.069813], "scale": [0.086, 0.52, 0.03]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dhoti-tail", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dhoti"}}, "material": "dhoti", "materialLayers": ["dhoti"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "dhoti-tail-read", "description": "Hangs on ONE side only - the asymmetry the analysis flagged as identity-defining. Thinned and brought inboard; it was reading as a flat slab.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(232, 149, 28, 1.0)", "secondaryAlbedo": "rgba(245, 169, 46, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(245, 169, 46, 1.0)"}, {"position": 0.5, "color": "rgba(232, 149, 28, 1.0)"}, {"position": 1.0, "color": "rgba(185, 106, 8, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Matte woven cotton; sheen only at fold crests. Fold ramp crest #f5a92e -> mid #e8951c -> trough #b96a08."}};
  node_dhoti_tail_4.add(mesh_dhoti_tail_4);
  meshes["dhoti-tail"] = mesh_dhoti_tail_4;
  colliders["dhoti-tail"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["dhoti-tail"] ??= [];
  destructionGroups["dhoti-tail"].push(node_dhoti_tail_4);

  const attachment_abdomen_5 = {"parentSocket": "pelvis-waist", "localStart": [0, 0.06, 0], "localEnd": [0, 0.39, 0.004], "contactType": "rigid-weld", "baseRadius": 0.172, "endRadius": 0.152, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]};
  const endpoint_abdomen_5 = makeAttachmentEndpoint(attachment_abdomen_5);
  const node_abdomen_5 = new THREE.Group();
  node_abdomen_5.name = "Abdomen__pivot";
  node_abdomen_5.scale.set(1, 1, 1);
  if (endpoint_abdomen_5) {
    node_abdomen_5.position.copy(endpoint_abdomen_5.start);
    node_abdomen_5.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_abdomen_5.position.set(0.0, 0.06, 0.0);
    node_abdomen_5.rotation.set(0.0, 0.0, 0.0);
  }
  node_abdomen_5.userData.sculptComponent = {"id": "abdomen", "name": "Abdomen", "level": "macro", "role": "shell", "importance": 0.95, "confidence": 0.8, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Abdomen is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "pelvis", "attachment": {"parentSocket": "pelvis-waist", "localStart": [0, 0.06, 0], "localEnd": [0, 0.39, 0.004], "contactType": "rigid-weld", "baseRadius": 0.172, "endRadius": 0.152, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.345, "height": 0.33, "depth": 0.22, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, 0.06, 0], "rotation": [0.0, 0.0, 0.0], "scale": [0.345, 0.33, 0.22]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "abdomen", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_abdomen_5.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "abdomen", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["pelvis"] ?? root).add(node_abdomen_5);
  nodes["abdomen"] = node_abdomen_5;
  const mesh_abdomen_5Geometry = endpoint_abdomen_5
    ? new THREE.CylinderGeometry(endpoint_abdomen_5.endRadius, endpoint_abdomen_5.baseRadius, endpoint_abdomen_5.length, 16, 6)
    : buildWatertightCapsule(0.35, 0.7, 8, 16, 1);
  if (!endpoint_abdomen_5) {
    mesh_abdomen_5Geometry.scale(0.345, 0.33, 0.22);
  }
  const mesh_abdomen_5 = new THREE.Mesh(
    mesh_abdomen_5Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_abdomen_5.name = "Abdomen";
  if (endpoint_abdomen_5) {
    mesh_abdomen_5.position.copy(endpoint_abdomen_5.midpoint);
    mesh_abdomen_5.quaternion.copy(endpoint_abdomen_5.quaternion);
  }
  mesh_abdomen_5.castShadow = options.castShadow ?? true;
  mesh_abdomen_5.receiveShadow = options.receiveShadow ?? true;
  mesh_abdomen_5.userData.sculptComponent = {"id": "abdomen", "name": "Abdomen", "level": "macro", "role": "shell", "importance": 0.95, "confidence": 0.8, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Abdomen is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "pelvis", "attachment": {"parentSocket": "pelvis-waist", "localStart": [0, 0.06, 0], "localEnd": [0, 0.39, 0.004], "contactType": "rigid-weld", "baseRadius": 0.172, "endRadius": 0.152, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.345, "height": 0.33, "depth": 0.22, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, 0.06, 0], "rotation": [0.0, 0.0, 0.0], "scale": [0.345, 0.33, 0.22]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "abdomen", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_abdomen_5.add(mesh_abdomen_5);
  meshes["abdomen"] = mesh_abdomen_5;
  colliders["abdomen"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["abdomen"] ??= [];
  destructionGroups["abdomen"].push(node_abdomen_5);

  const attachment_chest_6 = {"parentSocket": "abdomen-chest", "localStart": [0, 0.33, 0.004], "localEnd": [0, 0.63, 0.008], "contactType": "rigid-weld", "baseRadius": 0.152, "endRadius": 0.19, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]};
  const endpoint_chest_6 = makeAttachmentEndpoint(attachment_chest_6);
  const node_chest_6 = new THREE.Group();
  node_chest_6.name = "Chest__pivot";
  node_chest_6.scale.set(1, 1, 1);
  if (endpoint_chest_6) {
    node_chest_6.position.copy(endpoint_chest_6.start);
    node_chest_6.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_chest_6.position.set(0.0, 0.33, 0.004);
    node_chest_6.rotation.set(0.0, 0.0, 0.0);
  }
  node_chest_6.userData.sculptComponent = {"id": "chest", "name": "Chest", "level": "macro", "role": "shell", "importance": 1.0, "confidence": 0.8, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Chest is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "abdomen", "attachment": {"parentSocket": "abdomen-chest", "localStart": [0, 0.33, 0.004], "localEnd": [0, 0.63, 0.008], "contactType": "rigid-weld", "baseRadius": 0.152, "endRadius": 0.19, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.465, "height": 0.3, "depth": 0.25, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, 0.33, 0.004], "rotation": [0.0, 0.0, 0.0], "scale": [0.465, 0.3, 0.25]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "chest", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_chest_6.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "chest", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["abdomen"] ?? root).add(node_chest_6);
  nodes["chest"] = node_chest_6;
  const mesh_chest_6Geometry = endpoint_chest_6
    ? new THREE.CylinderGeometry(endpoint_chest_6.endRadius, endpoint_chest_6.baseRadius, endpoint_chest_6.length, 16, 6)
    : buildWatertightCapsule(0.35, 0.7, 8, 16, 1);
  if (!endpoint_chest_6) {
    mesh_chest_6Geometry.scale(0.465, 0.3, 0.25);
  }
  const mesh_chest_6 = new THREE.Mesh(
    mesh_chest_6Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_chest_6.name = "Chest";
  if (endpoint_chest_6) {
    mesh_chest_6.position.copy(endpoint_chest_6.midpoint);
    mesh_chest_6.quaternion.copy(endpoint_chest_6.quaternion);
  }
  mesh_chest_6.castShadow = options.castShadow ?? true;
  mesh_chest_6.receiveShadow = options.receiveShadow ?? true;
  mesh_chest_6.userData.sculptComponent = {"id": "chest", "name": "Chest", "level": "macro", "role": "shell", "importance": 1.0, "confidence": 0.8, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Chest is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "abdomen", "attachment": {"parentSocket": "abdomen-chest", "localStart": [0, 0.33, 0.004], "localEnd": [0, 0.63, 0.008], "contactType": "rigid-weld", "baseRadius": 0.152, "endRadius": 0.19, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.465, "height": 0.3, "depth": 0.25, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, 0.33, 0.004], "rotation": [0.0, 0.0, 0.0], "scale": [0.465, 0.3, 0.25]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "chest", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_chest_6.add(mesh_chest_6);
  meshes["chest"] = mesh_chest_6;
  colliders["chest"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["chest"] ??= [];
  destructionGroups["chest"].push(node_chest_6);

  const endpoint_janeu_7 = makeAttachmentEndpoint(null);
  const node_janeu_7 = new THREE.Group();
  node_janeu_7.name = "Janeu sacred thread__pivot";
  node_janeu_7.scale.set(1, 1, 1);
  if (endpoint_janeu_7) {
    node_janeu_7.position.copy(endpoint_janeu_7.start);
    node_janeu_7.rotation.set(1.570796, 1.047198, 0.0);
  } else {
    node_janeu_7.position.set(0.0, 0.1, 0.01);
    node_janeu_7.rotation.set(1.570796, 1.047198, 0.0);
  }
  node_janeu_7.userData.sculptComponent = {"id": "janeu", "name": "Janeu sacred thread", "level": "meso", "role": "accessory", "importance": 0.9, "confidence": 0.75, "primitive": "torus", "topologyClass": "fiber-strand", "topologyRationale": "A cord whose cross-section is tiny against its length; swept along a path, not massed as a volume.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "chest", "attachment": null, "dimensions": {"width": 0.48, "height": 0.245, "depth": 0.075, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, 0.1, 0.01], "rotation": [1.570796, 1.047198, 0.0], "scale": [0.48, 0.245, 0.075]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "janeu", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "janeu-cord"}}, "material": "janeu-cord", "materialLayers": ["janeu-cord"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "janeu-read", "description": "Single cream sash, left shoulder to right hip, crossing front AND back. Euler [90,60,0] puts the ring axis on (0.866,-0.5,0). The ring is elliptical (0.480 x 0.245 local), solved from three measured builds: world depth tracks local Y at ~1.06x and world height tracks local X at ~0.93x. A circular ring stood 0.09 proud of a torso only 0.250 deep and read as a free-floating hoop from the side and rear review angles.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(239, 230, 213, 1.0)", "secondaryAlbedo": "rgba(255, 250, 240, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(255, 250, 240, 1.0)"}, {"position": 0.5, "color": "rgba(239, 230, 213, 1.0)"}, {"position": 1.0, "color": "rgba(214, 201, 176, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Cream twisted cotton, thin round cross-section."}, "standProud": {"againstComponentId": "chest", "clearance": 0.012, "maxPush": 0.035, "notes": "Pulling the ellipse in until it stopped reading as a free-floating hoop buried it in the chest instead. standProud marches it just clear of the torso surface, which is the whole point of the mechanism: a sash lies ON the body, not inside it and not orbiting it."}};
  node_janeu_7.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "janeu", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "janeu-cord"}};
  (nodes["chest"] ?? root).add(node_janeu_7);
  nodes["janeu"] = node_janeu_7;
  const mesh_janeu_7Geometry = endpoint_janeu_7
    ? new THREE.CylinderGeometry(endpoint_janeu_7.endRadius, endpoint_janeu_7.baseRadius, endpoint_janeu_7.length, 16, 6)
    : new THREE.TorusGeometry(0.45, 0.08, 12, 48);
  if (!endpoint_janeu_7) {
    mesh_janeu_7Geometry.scale(0.48, 0.245, 0.075);
  }
  const mesh_janeu_7 = new THREE.Mesh(
    mesh_janeu_7Geometry,
    materialMap["janeu-cord"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_janeu_7.name = "Janeu sacred thread";
  if (endpoint_janeu_7) {
    mesh_janeu_7.position.copy(endpoint_janeu_7.midpoint);
    mesh_janeu_7.quaternion.copy(endpoint_janeu_7.quaternion);
  }
  mesh_janeu_7.castShadow = options.castShadow ?? true;
  mesh_janeu_7.receiveShadow = options.receiveShadow ?? true;
  mesh_janeu_7.userData.sculptComponent = {"id": "janeu", "name": "Janeu sacred thread", "level": "meso", "role": "accessory", "importance": 0.9, "confidence": 0.75, "primitive": "torus", "topologyClass": "fiber-strand", "topologyRationale": "A cord whose cross-section is tiny against its length; swept along a path, not massed as a volume.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "chest", "attachment": null, "dimensions": {"width": 0.48, "height": 0.245, "depth": 0.075, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, 0.1, 0.01], "rotation": [1.570796, 1.047198, 0.0], "scale": [0.48, 0.245, 0.075]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "janeu", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "janeu-cord"}}, "material": "janeu-cord", "materialLayers": ["janeu-cord"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "janeu-read", "description": "Single cream sash, left shoulder to right hip, crossing front AND back. Euler [90,60,0] puts the ring axis on (0.866,-0.5,0). The ring is elliptical (0.480 x 0.245 local), solved from three measured builds: world depth tracks local Y at ~1.06x and world height tracks local X at ~0.93x. A circular ring stood 0.09 proud of a torso only 0.250 deep and read as a free-floating hoop from the side and rear review angles.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(239, 230, 213, 1.0)", "secondaryAlbedo": "rgba(255, 250, 240, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(255, 250, 240, 1.0)"}, {"position": 0.5, "color": "rgba(239, 230, 213, 1.0)"}, {"position": 1.0, "color": "rgba(214, 201, 176, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Cream twisted cotton, thin round cross-section."}, "standProud": {"againstComponentId": "chest", "clearance": 0.012, "maxPush": 0.035, "notes": "Pulling the ellipse in until it stopped reading as a free-floating hoop buried it in the chest instead. standProud marches it just clear of the torso surface, which is the whole point of the mechanism: a sash lies ON the body, not inside it and not orbiting it."}};
  node_janeu_7.add(mesh_janeu_7);
  meshes["janeu"] = mesh_janeu_7;
  colliders["janeu"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["janeu"] ??= [];
  destructionGroups["janeu"].push(node_janeu_7);

  const endpoint_lat_l_8 = makeAttachmentEndpoint(null);
  const node_lat_l_8 = new THREE.Group();
  node_lat_l_8.name = "Latissimus L__pivot";
  node_lat_l_8.scale.set(1, 1, 1);
  if (endpoint_lat_l_8) {
    node_lat_l_8.position.copy(endpoint_lat_l_8.start);
    node_lat_l_8.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_lat_l_8.position.set(0.12, 0.095, -0.03);
    node_lat_l_8.rotation.set(0.0, 0.0, 0.0);
  }
  node_lat_l_8.userData.sculptComponent = {"id": "lat-l", "name": "Latissimus L", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.75, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "chest", "attachment": null, "dimensions": {"width": 0.085, "height": 0.215, "depth": 0.15, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0.12, 0.095, -0.03], "rotation": [0.0, 0.0, 0.0], "scale": [0.085, 0.215, 0.15]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "lat-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "lat-l-read", "description": "Back V-taper mass. The gameplay camera sits behind the runner, so the lats carry the read.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_lat_l_8.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "lat-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["chest"] ?? root).add(node_lat_l_8);
  nodes["lat-l"] = node_lat_l_8;
  const mesh_lat_l_8Geometry = endpoint_lat_l_8
    ? new THREE.CylinderGeometry(endpoint_lat_l_8.endRadius, endpoint_lat_l_8.baseRadius, endpoint_lat_l_8.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_lat_l_8) {
    mesh_lat_l_8Geometry.scale(0.085, 0.215, 0.15);
  }
  const mesh_lat_l_8 = new THREE.Mesh(
    mesh_lat_l_8Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_lat_l_8.name = "Latissimus L";
  if (endpoint_lat_l_8) {
    mesh_lat_l_8.position.copy(endpoint_lat_l_8.midpoint);
    mesh_lat_l_8.quaternion.copy(endpoint_lat_l_8.quaternion);
  }
  mesh_lat_l_8.castShadow = options.castShadow ?? true;
  mesh_lat_l_8.receiveShadow = options.receiveShadow ?? true;
  mesh_lat_l_8.userData.sculptComponent = {"id": "lat-l", "name": "Latissimus L", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.75, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "chest", "attachment": null, "dimensions": {"width": 0.085, "height": 0.215, "depth": 0.15, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0.12, 0.095, -0.03], "rotation": [0.0, 0.0, 0.0], "scale": [0.085, 0.215, 0.15]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "lat-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "lat-l-read", "description": "Back V-taper mass. The gameplay camera sits behind the runner, so the lats carry the read.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_lat_l_8.add(mesh_lat_l_8);
  meshes["lat-l"] = mesh_lat_l_8;
  colliders["lat-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["lat-l"] ??= [];
  destructionGroups["lat-l"].push(node_lat_l_8);

  const endpoint_lat_r_9 = makeAttachmentEndpoint(null);
  const node_lat_r_9 = new THREE.Group();
  node_lat_r_9.name = "Latissimus R__pivot";
  node_lat_r_9.scale.set(1, 1, 1);
  if (endpoint_lat_r_9) {
    node_lat_r_9.position.copy(endpoint_lat_r_9.start);
    node_lat_r_9.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_lat_r_9.position.set(-0.12, 0.095, -0.03);
    node_lat_r_9.rotation.set(0.0, 0.0, 0.0);
  }
  node_lat_r_9.userData.sculptComponent = {"id": "lat-r", "name": "Latissimus R", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.75, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "chest", "attachment": null, "dimensions": {"width": 0.085, "height": 0.215, "depth": 0.15, "units": "world-units", "confidence": 0.75}, "transform": {"position": [-0.12, 0.095, -0.03], "rotation": [0.0, 0.0, 0.0], "scale": [0.085, 0.215, 0.15]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "lat-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "lat-r-read", "description": "Mirror of lat-l.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_lat_r_9.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "lat-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["chest"] ?? root).add(node_lat_r_9);
  nodes["lat-r"] = node_lat_r_9;
  const mesh_lat_r_9Geometry = endpoint_lat_r_9
    ? new THREE.CylinderGeometry(endpoint_lat_r_9.endRadius, endpoint_lat_r_9.baseRadius, endpoint_lat_r_9.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_lat_r_9) {
    mesh_lat_r_9Geometry.scale(0.085, 0.215, 0.15);
  }
  const mesh_lat_r_9 = new THREE.Mesh(
    mesh_lat_r_9Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_lat_r_9.name = "Latissimus R";
  if (endpoint_lat_r_9) {
    mesh_lat_r_9.position.copy(endpoint_lat_r_9.midpoint);
    mesh_lat_r_9.quaternion.copy(endpoint_lat_r_9.quaternion);
  }
  mesh_lat_r_9.castShadow = options.castShadow ?? true;
  mesh_lat_r_9.receiveShadow = options.receiveShadow ?? true;
  mesh_lat_r_9.userData.sculptComponent = {"id": "lat-r", "name": "Latissimus R", "level": "meso", "role": "body", "importance": 0.7, "confidence": 0.75, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "chest", "attachment": null, "dimensions": {"width": 0.085, "height": 0.215, "depth": 0.15, "units": "world-units", "confidence": 0.75}, "transform": {"position": [-0.12, 0.095, -0.03], "rotation": [0.0, 0.0, 0.0], "scale": [0.085, 0.215, 0.15]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "lat-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "lat-r-read", "description": "Mirror of lat-l.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_lat_r_9.add(mesh_lat_r_9);
  meshes["lat-r"] = mesh_lat_r_9;
  colliders["lat-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["lat-r"] ??= [];
  destructionGroups["lat-r"].push(node_lat_r_9);

  const endpoint_pec_l_10 = makeAttachmentEndpoint(null);
  const node_pec_l_10 = new THREE.Group();
  node_pec_l_10.name = "Pectoral L__pivot";
  node_pec_l_10.scale.set(1, 1, 1);
  if (endpoint_pec_l_10) {
    node_pec_l_10.position.copy(endpoint_pec_l_10.start);
    node_pec_l_10.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_pec_l_10.position.set(0.078, 0.185, 0.098);
    node_pec_l_10.rotation.set(0.0, 0.0, 0.0);
  }
  node_pec_l_10.userData.sculptComponent = {"id": "pec-l", "name": "Pectoral L", "level": "meso", "role": "body", "importance": 0.55, "confidence": 0.75, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "chest", "attachment": null, "dimensions": {"width": 0.155, "height": 0.105, "depth": 0.07, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0.078, 0.185, 0.098], "rotation": [0.0, 0.0, 0.0], "scale": [0.155, 0.105, 0.07]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pec-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "pec-l-read", "description": "Chest plane the janeu crosses; bare-chested, so it is skin not garment.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_pec_l_10.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pec-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["chest"] ?? root).add(node_pec_l_10);
  nodes["pec-l"] = node_pec_l_10;
  const mesh_pec_l_10Geometry = endpoint_pec_l_10
    ? new THREE.CylinderGeometry(endpoint_pec_l_10.endRadius, endpoint_pec_l_10.baseRadius, endpoint_pec_l_10.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_pec_l_10) {
    mesh_pec_l_10Geometry.scale(0.155, 0.105, 0.07);
  }
  const mesh_pec_l_10 = new THREE.Mesh(
    mesh_pec_l_10Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_pec_l_10.name = "Pectoral L";
  if (endpoint_pec_l_10) {
    mesh_pec_l_10.position.copy(endpoint_pec_l_10.midpoint);
    mesh_pec_l_10.quaternion.copy(endpoint_pec_l_10.quaternion);
  }
  mesh_pec_l_10.castShadow = options.castShadow ?? true;
  mesh_pec_l_10.receiveShadow = options.receiveShadow ?? true;
  mesh_pec_l_10.userData.sculptComponent = {"id": "pec-l", "name": "Pectoral L", "level": "meso", "role": "body", "importance": 0.55, "confidence": 0.75, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "chest", "attachment": null, "dimensions": {"width": 0.155, "height": 0.105, "depth": 0.07, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0.078, 0.185, 0.098], "rotation": [0.0, 0.0, 0.0], "scale": [0.155, 0.105, 0.07]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pec-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "pec-l-read", "description": "Chest plane the janeu crosses; bare-chested, so it is skin not garment.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_pec_l_10.add(mesh_pec_l_10);
  meshes["pec-l"] = mesh_pec_l_10;
  colliders["pec-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pec-l"] ??= [];
  destructionGroups["pec-l"].push(node_pec_l_10);

  const endpoint_pec_r_11 = makeAttachmentEndpoint(null);
  const node_pec_r_11 = new THREE.Group();
  node_pec_r_11.name = "Pectoral R__pivot";
  node_pec_r_11.scale.set(1, 1, 1);
  if (endpoint_pec_r_11) {
    node_pec_r_11.position.copy(endpoint_pec_r_11.start);
    node_pec_r_11.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_pec_r_11.position.set(-0.078, 0.185, 0.098);
    node_pec_r_11.rotation.set(0.0, 0.0, 0.0);
  }
  node_pec_r_11.userData.sculptComponent = {"id": "pec-r", "name": "Pectoral R", "level": "meso", "role": "body", "importance": 0.55, "confidence": 0.75, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "chest", "attachment": null, "dimensions": {"width": 0.155, "height": 0.105, "depth": 0.07, "units": "world-units", "confidence": 0.75}, "transform": {"position": [-0.078, 0.185, 0.098], "rotation": [0.0, 0.0, 0.0], "scale": [0.155, 0.105, 0.07]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pec-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "pec-r-read", "description": "Mirror of pec-l.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_pec_r_11.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pec-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["chest"] ?? root).add(node_pec_r_11);
  nodes["pec-r"] = node_pec_r_11;
  const mesh_pec_r_11Geometry = endpoint_pec_r_11
    ? new THREE.CylinderGeometry(endpoint_pec_r_11.endRadius, endpoint_pec_r_11.baseRadius, endpoint_pec_r_11.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_pec_r_11) {
    mesh_pec_r_11Geometry.scale(0.155, 0.105, 0.07);
  }
  const mesh_pec_r_11 = new THREE.Mesh(
    mesh_pec_r_11Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_pec_r_11.name = "Pectoral R";
  if (endpoint_pec_r_11) {
    mesh_pec_r_11.position.copy(endpoint_pec_r_11.midpoint);
    mesh_pec_r_11.quaternion.copy(endpoint_pec_r_11.quaternion);
  }
  mesh_pec_r_11.castShadow = options.castShadow ?? true;
  mesh_pec_r_11.receiveShadow = options.receiveShadow ?? true;
  mesh_pec_r_11.userData.sculptComponent = {"id": "pec-r", "name": "Pectoral R", "level": "meso", "role": "body", "importance": 0.55, "confidence": 0.75, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "chest", "attachment": null, "dimensions": {"width": 0.155, "height": 0.105, "depth": 0.07, "units": "world-units", "confidence": 0.75}, "transform": {"position": [-0.078, 0.185, 0.098], "rotation": [0.0, 0.0, 0.0], "scale": [0.155, 0.105, 0.07]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pec-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "pec-r-read", "description": "Mirror of pec-l.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_pec_r_11.add(mesh_pec_r_11);
  meshes["pec-r"] = mesh_pec_r_11;
  colliders["pec-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pec-r"] ??= [];
  destructionGroups["pec-r"].push(node_pec_r_11);

  const attachment_neck_12 = {"parentSocket": "chest-neck-base", "localStart": [0, 0.255, 0.004], "localEnd": [0, 0.39423, 0.004], "contactType": "rigid-weld", "baseRadius": 0.064, "endRadius": 0.054, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]};
  const endpoint_neck_12 = makeAttachmentEndpoint(attachment_neck_12);
  const node_neck_12 = new THREE.Group();
  node_neck_12.name = "Neck__pivot";
  node_neck_12.scale.set(1, 1, 1);
  if (endpoint_neck_12) {
    node_neck_12.position.copy(endpoint_neck_12.start);
    node_neck_12.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_neck_12.position.set(0.0, 0.255, 0.004);
    node_neck_12.rotation.set(0.0, 0.0, 0.0);
  }
  node_neck_12.userData.sculptComponent = {"id": "neck", "name": "Neck", "level": "meso", "role": "support", "importance": 0.6, "confidence": 0.8, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Neck is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "chest", "attachment": {"parentSocket": "chest-neck-base", "localStart": [0, 0.255, 0.004], "localEnd": [0, 0.39423, 0.004], "contactType": "rigid-weld", "baseRadius": 0.064, "endRadius": 0.054, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.118, "height": 0.13923, "depth": 0.118, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, 0.255, 0.004], "rotation": [0.0, 0.0, 0.0], "scale": [0.118, 0.13923, 0.118]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "neck", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_neck_12.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "neck", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["chest"] ?? root).add(node_neck_12);
  nodes["neck"] = node_neck_12;
  const mesh_neck_12Geometry = endpoint_neck_12
    ? new THREE.CylinderGeometry(endpoint_neck_12.endRadius, endpoint_neck_12.baseRadius, endpoint_neck_12.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_neck_12) {
    mesh_neck_12Geometry.scale(0.118, 0.13923, 0.118);
  }
  const mesh_neck_12 = new THREE.Mesh(
    mesh_neck_12Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_neck_12.name = "Neck";
  if (endpoint_neck_12) {
    mesh_neck_12.position.copy(endpoint_neck_12.midpoint);
    mesh_neck_12.quaternion.copy(endpoint_neck_12.quaternion);
  }
  mesh_neck_12.castShadow = options.castShadow ?? true;
  mesh_neck_12.receiveShadow = options.receiveShadow ?? true;
  mesh_neck_12.userData.sculptComponent = {"id": "neck", "name": "Neck", "level": "meso", "role": "support", "importance": 0.6, "confidence": 0.8, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Neck is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "chest", "attachment": {"parentSocket": "chest-neck-base", "localStart": [0, 0.255, 0.004], "localEnd": [0, 0.39423, 0.004], "contactType": "rigid-weld", "baseRadius": 0.064, "endRadius": 0.054, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.118, "height": 0.13923, "depth": 0.118, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, 0.255, 0.004], "rotation": [0.0, 0.0, 0.0], "scale": [0.118, 0.13923, 0.118]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "neck", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_neck_12.add(mesh_neck_12);
  meshes["neck"] = mesh_neck_12;
  colliders["neck"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["neck"] ??= [];
  destructionGroups["neck"].push(node_neck_12);

  const endpoint_necklace_13 = makeAttachmentEndpoint(null);
  const node_necklace_13 = new THREE.Group();
  node_necklace_13.name = "Rudraksha necklace__pivot";
  node_necklace_13.scale.set(1, 1, 1);
  if (endpoint_necklace_13) {
    node_necklace_13.position.copy(endpoint_necklace_13.start);
    node_necklace_13.rotation.set(1.570796, 0.0, 0.0);
  } else {
    node_necklace_13.position.set(0.0, 0.02, 0.006);
    node_necklace_13.rotation.set(1.570796, 0.0, 0.0);
  }
  node_necklace_13.userData.sculptComponent = {"id": "necklace", "name": "Rudraksha necklace", "level": "meso", "role": "accessory", "importance": 0.7, "confidence": 0.75, "primitive": "torus", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "neck", "attachment": null, "dimensions": {"width": 0.165, "height": 0.042, "depth": 0.165, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, 0.02, 0.006], "rotation": [1.570796, 0.0, 0.0], "scale": [0.165, 0.042, 0.165]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "necklace", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "rudraksha"}}, "material": "rudraksha", "materialLayers": ["rudraksha"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "necklace-read", "description": "Bead loop resting on the clavicles at the throat.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(106, 50, 16, 1.0)", "secondaryAlbedo": "rgba(122, 58, 16, 1.0)", "materialClass": "wood", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(122, 58, 16, 1.0)"}, {"position": 0.5, "color": "rgba(106, 50, 16, 1.0)"}, {"position": 1.0, "color": "rgba(92, 43, 12, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm brown seed with a strongly furrowed surface; the furrows are material-scale, below geometry scale."}, "standProud": {"againstComponentId": "neck", "clearance": 0.01, "maxPush": 0.03, "notes": "Bead loop rests on the surface it encircles."}};
  node_necklace_13.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "necklace", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "rudraksha"}};
  (nodes["neck"] ?? root).add(node_necklace_13);
  nodes["necklace"] = node_necklace_13;
  const mesh_necklace_13Geometry = endpoint_necklace_13
    ? new THREE.CylinderGeometry(endpoint_necklace_13.endRadius, endpoint_necklace_13.baseRadius, endpoint_necklace_13.length, 16, 6)
    : new THREE.TorusGeometry(0.45, 0.08, 12, 48);
  if (!endpoint_necklace_13) {
    mesh_necklace_13Geometry.scale(0.165, 0.042, 0.165);
  }
  const mesh_necklace_13 = new THREE.Mesh(
    mesh_necklace_13Geometry,
    materialMap["rudraksha"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_necklace_13.name = "Rudraksha necklace";
  if (endpoint_necklace_13) {
    mesh_necklace_13.position.copy(endpoint_necklace_13.midpoint);
    mesh_necklace_13.quaternion.copy(endpoint_necklace_13.quaternion);
  }
  mesh_necklace_13.castShadow = options.castShadow ?? true;
  mesh_necklace_13.receiveShadow = options.receiveShadow ?? true;
  mesh_necklace_13.userData.sculptComponent = {"id": "necklace", "name": "Rudraksha necklace", "level": "meso", "role": "accessory", "importance": 0.7, "confidence": 0.75, "primitive": "torus", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "neck", "attachment": null, "dimensions": {"width": 0.165, "height": 0.042, "depth": 0.165, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, 0.02, 0.006], "rotation": [1.570796, 0.0, 0.0], "scale": [0.165, 0.042, 0.165]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "necklace", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "rudraksha"}}, "material": "rudraksha", "materialLayers": ["rudraksha"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "necklace-read", "description": "Bead loop resting on the clavicles at the throat.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(106, 50, 16, 1.0)", "secondaryAlbedo": "rgba(122, 58, 16, 1.0)", "materialClass": "wood", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(122, 58, 16, 1.0)"}, {"position": 0.5, "color": "rgba(106, 50, 16, 1.0)"}, {"position": 1.0, "color": "rgba(92, 43, 12, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm brown seed with a strongly furrowed surface; the furrows are material-scale, below geometry scale."}, "standProud": {"againstComponentId": "neck", "clearance": 0.01, "maxPush": 0.03, "notes": "Bead loop rests on the surface it encircles."}};
  node_necklace_13.add(mesh_necklace_13);
  meshes["necklace"] = mesh_necklace_13;
  colliders["necklace"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["necklace"] ??= [];
  destructionGroups["necklace"].push(node_necklace_13);

  const endpoint_necklace_lower_14 = makeAttachmentEndpoint(null);
  const node_necklace_lower_14 = new THREE.Group();
  node_necklace_lower_14.name = "Rudraksha necklace (lower loop)__pivot";
  node_necklace_lower_14.scale.set(1, 1, 1);
  if (endpoint_necklace_lower_14) {
    node_necklace_lower_14.position.copy(endpoint_necklace_lower_14.start);
    node_necklace_lower_14.rotation.set(1.570796, 0.0, 0.0);
  } else {
    node_necklace_lower_14.position.set(0.0, 0.235, 0.082);
    node_necklace_lower_14.rotation.set(1.570796, 0.0, 0.0);
  }
  node_necklace_lower_14.userData.sculptComponent = {"id": "necklace-lower", "name": "Rudraksha necklace (lower loop)", "level": "meso", "role": "accessory", "importance": 0.7, "confidence": 0.75, "primitive": "torus", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "chest", "attachment": null, "dimensions": {"width": 0.2, "height": 0.04, "depth": 0.2, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, 0.235, 0.082], "rotation": [1.570796, 0.0, 0.0], "scale": [0.2, 0.04, 0.2]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "necklace-lower", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "rudraksha"}}, "material": "rudraksha", "materialLayers": ["rudraksha"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "necklace-lower-read", "description": "Second, longer bead loop resting on the pectorals. The head-studies and front turnaround both show two distinct loops; the first build had only the choker.", "scale": "micro", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(106, 50, 16, 1.0)", "secondaryAlbedo": "rgba(122, 58, 16, 1.0)", "materialClass": "wood", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(122, 58, 16, 1.0)"}, {"position": 0.5, "color": "rgba(106, 50, 16, 1.0)"}, {"position": 1.0, "color": "rgba(92, 43, 12, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm brown seed with a strongly furrowed surface; the furrows are material-scale, below geometry scale."}, "standProud": {"againstComponentId": "chest", "clearance": 0.01, "maxPush": 0.03, "notes": "Bead loop rests on the surface it encircles."}};
  node_necklace_lower_14.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "necklace-lower", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "rudraksha"}};
  (nodes["chest"] ?? root).add(node_necklace_lower_14);
  nodes["necklace-lower"] = node_necklace_lower_14;
  const mesh_necklace_lower_14Geometry = endpoint_necklace_lower_14
    ? new THREE.CylinderGeometry(endpoint_necklace_lower_14.endRadius, endpoint_necklace_lower_14.baseRadius, endpoint_necklace_lower_14.length, 16, 6)
    : new THREE.TorusGeometry(0.45, 0.08, 12, 48);
  if (!endpoint_necklace_lower_14) {
    mesh_necklace_lower_14Geometry.scale(0.2, 0.04, 0.2);
  }
  const mesh_necklace_lower_14 = new THREE.Mesh(
    mesh_necklace_lower_14Geometry,
    materialMap["rudraksha"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_necklace_lower_14.name = "Rudraksha necklace (lower loop)";
  if (endpoint_necklace_lower_14) {
    mesh_necklace_lower_14.position.copy(endpoint_necklace_lower_14.midpoint);
    mesh_necklace_lower_14.quaternion.copy(endpoint_necklace_lower_14.quaternion);
  }
  mesh_necklace_lower_14.castShadow = options.castShadow ?? true;
  mesh_necklace_lower_14.receiveShadow = options.receiveShadow ?? true;
  mesh_necklace_lower_14.userData.sculptComponent = {"id": "necklace-lower", "name": "Rudraksha necklace (lower loop)", "level": "meso", "role": "accessory", "importance": 0.7, "confidence": 0.75, "primitive": "torus", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "chest", "attachment": null, "dimensions": {"width": 0.2, "height": 0.04, "depth": 0.2, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, 0.235, 0.082], "rotation": [1.570796, 0.0, 0.0], "scale": [0.2, 0.04, 0.2]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "necklace-lower", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "rudraksha"}}, "material": "rudraksha", "materialLayers": ["rudraksha"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "necklace-lower-read", "description": "Second, longer bead loop resting on the pectorals. The head-studies and front turnaround both show two distinct loops; the first build had only the choker.", "scale": "micro", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(106, 50, 16, 1.0)", "secondaryAlbedo": "rgba(122, 58, 16, 1.0)", "materialClass": "wood", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(122, 58, 16, 1.0)"}, {"position": 0.5, "color": "rgba(106, 50, 16, 1.0)"}, {"position": 1.0, "color": "rgba(92, 43, 12, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm brown seed with a strongly furrowed surface; the furrows are material-scale, below geometry scale."}, "standProud": {"againstComponentId": "chest", "clearance": 0.01, "maxPush": 0.03, "notes": "Bead loop rests on the surface it encircles."}};
  node_necklace_lower_14.add(mesh_necklace_lower_14);
  meshes["necklace-lower"] = mesh_necklace_lower_14;
  colliders["necklace-lower"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["necklace-lower"] ??= [];
  destructionGroups["necklace-lower"].push(node_necklace_lower_14);

  const endpoint_head_15 = makeAttachmentEndpoint(null);
  const node_head_15 = new THREE.Group();
  node_head_15.name = "Head__pivot";
  node_head_15.scale.set(1, 1, 1);
  if (endpoint_head_15) {
    node_head_15.position.copy(endpoint_head_15.start);
    node_head_15.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_head_15.position.set(0.0, 0.27211, 0.004);
    node_head_15.rotation.set(0.0, 0.0, 0.0);
  }
  node_head_15.userData.sculptComponent = {"id": "head", "name": "Head", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Head is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "neck", "attachment": null, "dimensions": {"width": 0.23091, "height": 0.26577, "depth": 0.26141, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, 0.27211, 0.004], "rotation": [0.0, 0.0, 0.0], "scale": [0.23091, 0.26577, 0.26141]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "head", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_head_15.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "head", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["neck"] ?? root).add(node_head_15);
  nodes["head"] = node_head_15;
  const mesh_head_15Geometry = endpoint_head_15
    ? new THREE.CylinderGeometry(endpoint_head_15.endRadius, endpoint_head_15.baseRadius, endpoint_head_15.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_head_15) {
    mesh_head_15Geometry.scale(0.23091, 0.26577, 0.26141);
  }
  const mesh_head_15 = new THREE.Mesh(
    mesh_head_15Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_head_15.name = "Head";
  if (endpoint_head_15) {
    mesh_head_15.position.copy(endpoint_head_15.midpoint);
    mesh_head_15.quaternion.copy(endpoint_head_15.quaternion);
  }
  mesh_head_15.castShadow = options.castShadow ?? true;
  mesh_head_15.receiveShadow = options.receiveShadow ?? true;
  mesh_head_15.userData.sculptComponent = {"id": "head", "name": "Head", "level": "macro", "role": "body", "importance": 1.0, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Head is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "neck", "attachment": null, "dimensions": {"width": 0.23091, "height": 0.26577, "depth": 0.26141, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, 0.27211, 0.004], "rotation": [0.0, 0.0, 0.0], "scale": [0.23091, 0.26577, 0.26141]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "head", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_head_15.add(mesh_head_15);
  meshes["head"] = mesh_head_15;
  colliders["head"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["head"] ??= [];
  destructionGroups["head"].push(node_head_15);

  const endpoint_bun_16 = makeAttachmentEndpoint(null);
  const node_bun_16 = new THREE.Group();
  node_bun_16.name = "Topknot bun__pivot";
  node_bun_16.scale.set(1, 1, 1);
  if (endpoint_bun_16) {
    node_bun_16.position.copy(endpoint_bun_16.start);
    node_bun_16.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_bun_16.position.set(0.0, 0.1363, -0.055);
    node_bun_16.rotation.set(0.0, 0.0, 0.0);
  }
  node_bun_16.userData.sculptComponent = {"id": "bun", "name": "Topknot bun", "level": "meso", "role": "body", "importance": 0.85, "confidence": 0.75, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "head", "attachment": null, "dimensions": {"width": 0.15, "height": 0.15, "depth": 0.15, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, 0.1363, -0.055], "rotation": [0.0, 0.0, 0.0], "scale": [0.15, 0.15, 0.15]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "bun", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hair"}}, "material": "hair", "materialLayers": ["hair"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "bun-read", "description": "Spherical hair mass above and behind the crown; its top sets the silhouette apex at y=2.177.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(36, 26, 30, 1.0)", "secondaryAlbedo": "rgba(26, 18, 22, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(26, 18, 22, 1.0)"}, {"position": 0.5, "color": "rgba(36, 26, 30, 1.0)"}, {"position": 1.0, "color": "rgba(44, 24, 16, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Near-black with a banded satin highlight."}, "standProud": {"againstComponentId": "head", "clearance": 0.01, "notes": "The topknot sits on top of the hair cap, not inside the skull. maxPush caps the outward march at 0.016 so a vertex cannot walk clean through the skull.", "maxPush": 0.016}};
  node_bun_16.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "bun", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hair"}};
  (nodes["head"] ?? root).add(node_bun_16);
  nodes["bun"] = node_bun_16;
  const mesh_bun_16Geometry = endpoint_bun_16
    ? new THREE.CylinderGeometry(endpoint_bun_16.endRadius, endpoint_bun_16.baseRadius, endpoint_bun_16.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_bun_16) {
    mesh_bun_16Geometry.scale(0.15, 0.15, 0.15);
  }
  const mesh_bun_16 = new THREE.Mesh(
    mesh_bun_16Geometry,
    materialMap["hair"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_bun_16.name = "Topknot bun";
  if (endpoint_bun_16) {
    mesh_bun_16.position.copy(endpoint_bun_16.midpoint);
    mesh_bun_16.quaternion.copy(endpoint_bun_16.quaternion);
  }
  mesh_bun_16.castShadow = options.castShadow ?? true;
  mesh_bun_16.receiveShadow = options.receiveShadow ?? true;
  mesh_bun_16.userData.sculptComponent = {"id": "bun", "name": "Topknot bun", "level": "meso", "role": "body", "importance": 0.85, "confidence": 0.75, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "head", "attachment": null, "dimensions": {"width": 0.15, "height": 0.15, "depth": 0.15, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, 0.1363, -0.055], "rotation": [0.0, 0.0, 0.0], "scale": [0.15, 0.15, 0.15]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "bun", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hair"}}, "material": "hair", "materialLayers": ["hair"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "bun-read", "description": "Spherical hair mass above and behind the crown; its top sets the silhouette apex at y=2.177.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(36, 26, 30, 1.0)", "secondaryAlbedo": "rgba(26, 18, 22, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(26, 18, 22, 1.0)"}, {"position": 0.5, "color": "rgba(36, 26, 30, 1.0)"}, {"position": 1.0, "color": "rgba(44, 24, 16, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Near-black with a banded satin highlight."}, "standProud": {"againstComponentId": "head", "clearance": 0.01, "notes": "The topknot sits on top of the hair cap, not inside the skull. maxPush caps the outward march at 0.016 so a vertex cannot walk clean through the skull.", "maxPush": 0.016}};
  node_bun_16.add(mesh_bun_16);
  meshes["bun"] = mesh_bun_16;
  colliders["bun"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["bun"] ??= [];
  destructionGroups["bun"].push(node_bun_16);

  const endpoint_bun_wrap_17 = makeAttachmentEndpoint(null);
  const node_bun_wrap_17 = new THREE.Group();
  node_bun_wrap_17.name = "Rudraksha wrap at bun base__pivot";
  node_bun_wrap_17.scale.set(1, 1, 1);
  if (endpoint_bun_wrap_17) {
    node_bun_wrap_17.position.copy(endpoint_bun_wrap_17.start);
    node_bun_wrap_17.rotation.set(1.570796, 0.0, 0.0);
  } else {
    node_bun_wrap_17.position.set(0.0, 0.0613, -0.052);
    node_bun_wrap_17.rotation.set(1.570796, 0.0, 0.0);
  }
  node_bun_wrap_17.userData.sculptComponent = {"id": "bun-wrap", "name": "Rudraksha wrap at bun base", "level": "micro", "role": "accessory", "importance": 0.55, "confidence": 0.75, "primitive": "torus", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "head", "attachment": null, "dimensions": {"width": 0.14, "height": 0.042, "depth": 0.14, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, 0.0613, -0.052], "rotation": [1.570796, 0.0, 0.0], "scale": [0.14, 0.042, 0.14]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "bun-wrap", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "rudraksha"}}, "material": "rudraksha", "materialLayers": ["rudraksha"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "bun-wrap-read", "description": "Bead cord binding the topknot, called out in the head-studies panel.", "scale": "micro", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(106, 50, 16, 1.0)", "secondaryAlbedo": "rgba(122, 58, 16, 1.0)", "materialClass": "wood", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(122, 58, 16, 1.0)"}, {"position": 0.5, "color": "rgba(106, 50, 16, 1.0)"}, {"position": 1.0, "color": "rgba(92, 43, 12, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm brown seed with a strongly furrowed surface; the furrows are material-scale, below geometry scale."}};
  node_bun_wrap_17.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "bun-wrap", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "rudraksha"}};
  (nodes["head"] ?? root).add(node_bun_wrap_17);
  nodes["bun-wrap"] = node_bun_wrap_17;
  const mesh_bun_wrap_17Geometry = endpoint_bun_wrap_17
    ? new THREE.CylinderGeometry(endpoint_bun_wrap_17.endRadius, endpoint_bun_wrap_17.baseRadius, endpoint_bun_wrap_17.length, 16, 6)
    : new THREE.TorusGeometry(0.45, 0.08, 12, 48);
  if (!endpoint_bun_wrap_17) {
    mesh_bun_wrap_17Geometry.scale(0.14, 0.042, 0.14);
  }
  const mesh_bun_wrap_17 = new THREE.Mesh(
    mesh_bun_wrap_17Geometry,
    materialMap["rudraksha"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_bun_wrap_17.name = "Rudraksha wrap at bun base";
  if (endpoint_bun_wrap_17) {
    mesh_bun_wrap_17.position.copy(endpoint_bun_wrap_17.midpoint);
    mesh_bun_wrap_17.quaternion.copy(endpoint_bun_wrap_17.quaternion);
  }
  mesh_bun_wrap_17.castShadow = options.castShadow ?? true;
  mesh_bun_wrap_17.receiveShadow = options.receiveShadow ?? true;
  mesh_bun_wrap_17.userData.sculptComponent = {"id": "bun-wrap", "name": "Rudraksha wrap at bun base", "level": "micro", "role": "accessory", "importance": 0.55, "confidence": 0.75, "primitive": "torus", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "head", "attachment": null, "dimensions": {"width": 0.14, "height": 0.042, "depth": 0.14, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, 0.0613, -0.052], "rotation": [1.570796, 0.0, 0.0], "scale": [0.14, 0.042, 0.14]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "bun-wrap", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "rudraksha"}}, "material": "rudraksha", "materialLayers": ["rudraksha"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "bun-wrap-read", "description": "Bead cord binding the topknot, called out in the head-studies panel.", "scale": "micro", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(106, 50, 16, 1.0)", "secondaryAlbedo": "rgba(122, 58, 16, 1.0)", "materialClass": "wood", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(122, 58, 16, 1.0)"}, {"position": 0.5, "color": "rgba(106, 50, 16, 1.0)"}, {"position": 1.0, "color": "rgba(92, 43, 12, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm brown seed with a strongly furrowed surface; the furrows are material-scale, below geometry scale."}};
  node_bun_wrap_17.add(mesh_bun_wrap_17);
  meshes["bun-wrap"] = mesh_bun_wrap_17;
  colliders["bun-wrap"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["bun-wrap"] ??= [];
  destructionGroups["bun-wrap"].push(node_bun_wrap_17);

  const endpoint_tilak_18 = makeAttachmentEndpoint(null);
  const node_tilak_18 = new THREE.Group();
  node_tilak_18.name = "Forehead tilak__pivot";
  node_tilak_18.scale.set(1, 1, 1);
  if (endpoint_tilak_18) {
    node_tilak_18.position.copy(endpoint_tilak_18.start);
    node_tilak_18.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_tilak_18.position.set(0.0, 0.03346, 0.1207);
    node_tilak_18.rotation.set(0.0, 0.0, 0.0);
  }
  node_tilak_18.userData.sculptComponent = {"id": "tilak", "name": "Forehead tilak", "level": "micro", "role": "accessory", "importance": 0.6, "confidence": 0.75, "primitive": "box", "topologyClass": "surface-relief", "topologyRationale": "Colour and shallow relief on a host surface; it does not change the silhouette.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "head", "attachment": null, "dimensions": {"width": 0.013, "height": 0.058, "depth": 0.01, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, 0.03346, 0.1207], "rotation": [0.0, 0.0, 0.0], "scale": [0.013, 0.058, 0.01]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "tilak", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "tilak"}}, "material": "tilak", "materialLayers": ["tilak"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "tilak-read", "description": "Short vertical red mark between the brows; relief, not silhouette.", "scale": "micro", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(179, 35, 31, 1.0)", "secondaryAlbedo": "rgba(201, 58, 46, 1.0)", "materialClass": "ceramic", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(201, 58, 46, 1.0)"}, {"position": 0.5, "color": "rgba(179, 35, 31, 1.0)"}, {"position": 1.0, "color": "rgba(142, 26, 22, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Red vermilion paste."}};
  node_tilak_18.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "tilak", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "tilak"}};
  (nodes["head"] ?? root).add(node_tilak_18);
  nodes["tilak"] = node_tilak_18;
  const mesh_tilak_18Geometry = endpoint_tilak_18
    ? new THREE.CylinderGeometry(endpoint_tilak_18.endRadius, endpoint_tilak_18.baseRadius, endpoint_tilak_18.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_tilak_18) {
    mesh_tilak_18Geometry.scale(0.013, 0.058, 0.01);
  }
  const mesh_tilak_18 = new THREE.Mesh(
    mesh_tilak_18Geometry,
    materialMap["tilak"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_tilak_18.name = "Forehead tilak";
  if (endpoint_tilak_18) {
    mesh_tilak_18.position.copy(endpoint_tilak_18.midpoint);
    mesh_tilak_18.quaternion.copy(endpoint_tilak_18.quaternion);
  }
  mesh_tilak_18.castShadow = options.castShadow ?? true;
  mesh_tilak_18.receiveShadow = options.receiveShadow ?? true;
  mesh_tilak_18.userData.sculptComponent = {"id": "tilak", "name": "Forehead tilak", "level": "micro", "role": "accessory", "importance": 0.6, "confidence": 0.75, "primitive": "box", "topologyClass": "surface-relief", "topologyRationale": "Colour and shallow relief on a host surface; it does not change the silhouette.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "head", "attachment": null, "dimensions": {"width": 0.013, "height": 0.058, "depth": 0.01, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, 0.03346, 0.1207], "rotation": [0.0, 0.0, 0.0], "scale": [0.013, 0.058, 0.01]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "tilak", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "tilak"}}, "material": "tilak", "materialLayers": ["tilak"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "tilak-read", "description": "Short vertical red mark between the brows; relief, not silhouette.", "scale": "micro", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(179, 35, 31, 1.0)", "secondaryAlbedo": "rgba(201, 58, 46, 1.0)", "materialClass": "ceramic", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(201, 58, 46, 1.0)"}, {"position": 0.5, "color": "rgba(179, 35, 31, 1.0)"}, {"position": 1.0, "color": "rgba(142, 26, 22, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Red vermilion paste."}};
  node_tilak_18.add(mesh_tilak_18);
  meshes["tilak"] = mesh_tilak_18;
  colliders["tilak"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["tilak"] ??= [];
  destructionGroups["tilak"].push(node_tilak_18);

  const endpoint_hair_19 = makeAttachmentEndpoint(null);
  const node_hair_19 = new THREE.Group();
  node_hair_19.name = "Hair__pivot";
  node_hair_19.scale.set(1, 1, 1);
  if (endpoint_hair_19) {
    node_hair_19.position.copy(endpoint_hair_19.start);
    node_hair_19.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_hair_19.position.set(0.0, 0.048, -0.012);
    node_hair_19.rotation.set(0.0, 0.0, 0.0);
  }
  node_hair_19.userData.sculptComponent = {"id": "hair", "name": "Hair", "level": "meso", "role": "hair", "importance": 0.8, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Hair is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "head", "attachment": null, "dimensions": {"width": 0.24691, "height": 0.208, "depth": 0.27541, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, 0.048, -0.012], "rotation": [0.0, 0.0, 0.0], "scale": [0.24691, 0.208, 0.27541]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "hair", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hair"}}, "material": "hair", "materialLayers": ["hair"], "deformations": [], "joints": [], "seams": [], "localFeatures": ["short, neutral stylized hairstyle"], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(36, 26, 30, 1.0)", "secondaryAlbedo": "rgba(26, 18, 22, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(26, 18, 22, 1.0)"}, {"position": 0.5, "color": "rgba(36, 26, 30, 1.0)"}, {"position": 1.0, "color": "rgba(44, 24, 16, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Near-black with a banded satin highlight."}, "standProud": {"againstComponentId": "head", "clearance": 0.014, "notes": "The hair cap is an offset shell over the cranium. Without a positive clearance the ellipsoid interpenetrates the skull and renders as a bald patch wherever the two surfaces cross. maxPush caps the outward march at 0.020 so a vertex cannot walk clean through the skull.", "maxPush": 0.02}};
  node_hair_19.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "hair", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hair"}};
  (nodes["head"] ?? root).add(node_hair_19);
  nodes["hair"] = node_hair_19;
  const mesh_hair_19Geometry = endpoint_hair_19
    ? new THREE.CylinderGeometry(endpoint_hair_19.endRadius, endpoint_hair_19.baseRadius, endpoint_hair_19.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_hair_19) {
    mesh_hair_19Geometry.scale(0.24691, 0.208, 0.27541);
  }
  const mesh_hair_19 = new THREE.Mesh(
    mesh_hair_19Geometry,
    materialMap["hair"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_hair_19.name = "Hair";
  if (endpoint_hair_19) {
    mesh_hair_19.position.copy(endpoint_hair_19.midpoint);
    mesh_hair_19.quaternion.copy(endpoint_hair_19.quaternion);
  }
  mesh_hair_19.castShadow = options.castShadow ?? true;
  mesh_hair_19.receiveShadow = options.receiveShadow ?? true;
  mesh_hair_19.userData.sculptComponent = {"id": "hair", "name": "Hair", "level": "meso", "role": "hair", "importance": 0.8, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Hair is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "head", "attachment": null, "dimensions": {"width": 0.24691, "height": 0.208, "depth": 0.27541, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, 0.048, -0.012], "rotation": [0.0, 0.0, 0.0], "scale": [0.24691, 0.208, 0.27541]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "hair", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hair"}}, "material": "hair", "materialLayers": ["hair"], "deformations": [], "joints": [], "seams": [], "localFeatures": ["short, neutral stylized hairstyle"], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(36, 26, 30, 1.0)", "secondaryAlbedo": "rgba(26, 18, 22, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(26, 18, 22, 1.0)"}, {"position": 0.5, "color": "rgba(36, 26, 30, 1.0)"}, {"position": 1.0, "color": "rgba(44, 24, 16, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Near-black with a banded satin highlight."}, "standProud": {"againstComponentId": "head", "clearance": 0.014, "notes": "The hair cap is an offset shell over the cranium. Without a positive clearance the ellipsoid interpenetrates the skull and renders as a bald patch wherever the two surfaces cross. maxPush caps the outward march at 0.020 so a vertex cannot walk clean through the skull.", "maxPush": 0.02}};
  node_hair_19.add(mesh_hair_19);
  meshes["hair"] = mesh_hair_19;
  colliders["hair"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["hair"] ??= [];
  destructionGroups["hair"].push(node_hair_19);

  const endpoint_brow_l_20 = makeAttachmentEndpoint(null);
  const node_brow_l_20 = new THREE.Group();
  node_brow_l_20.name = "Eyebrow L__pivot";
  node_brow_l_20.scale.set(1, 1, 1);
  if (endpoint_brow_l_20) {
    node_brow_l_20.position.copy(endpoint_brow_l_20.start);
    node_brow_l_20.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_brow_l_20.position.set(0.0502, 0.02848, 0.1227);
    node_brow_l_20.rotation.set(0.0, 0.0, 0.0);
  }
  node_brow_l_20.userData.sculptComponent = {"id": "brow-l", "name": "Eyebrow L", "level": "micro", "role": "detail", "importance": 0.4, "confidence": 0.8, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Eyebrow L is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "head", "attachment": null, "dimensions": {"width": 0.05522, "height": 0.00949, "depth": 0.016, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.0502, 0.02848, 0.1227], "rotation": [0.0, 0.0, 0.0], "scale": [0.05522, 0.00949, 0.016]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "brow-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hair"}}, "material": "hair", "materialLayers": ["hair"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(36, 26, 30, 1.0)", "secondaryAlbedo": "rgba(26, 18, 22, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(26, 18, 22, 1.0)"}, {"position": 0.5, "color": "rgba(36, 26, 30, 1.0)"}, {"position": 1.0, "color": "rgba(44, 24, 16, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Near-black with a banded satin highlight."}};
  node_brow_l_20.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "brow-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hair"}};
  (nodes["head"] ?? root).add(node_brow_l_20);
  nodes["brow-l"] = node_brow_l_20;
  const mesh_brow_l_20Geometry = endpoint_brow_l_20
    ? new THREE.CylinderGeometry(endpoint_brow_l_20.endRadius, endpoint_brow_l_20.baseRadius, endpoint_brow_l_20.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_brow_l_20) {
    mesh_brow_l_20Geometry.scale(0.05522, 0.00949, 0.016);
  }
  const mesh_brow_l_20 = new THREE.Mesh(
    mesh_brow_l_20Geometry,
    materialMap["hair"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_brow_l_20.name = "Eyebrow L";
  if (endpoint_brow_l_20) {
    mesh_brow_l_20.position.copy(endpoint_brow_l_20.midpoint);
    mesh_brow_l_20.quaternion.copy(endpoint_brow_l_20.quaternion);
  }
  mesh_brow_l_20.castShadow = options.castShadow ?? true;
  mesh_brow_l_20.receiveShadow = options.receiveShadow ?? true;
  mesh_brow_l_20.userData.sculptComponent = {"id": "brow-l", "name": "Eyebrow L", "level": "micro", "role": "detail", "importance": 0.4, "confidence": 0.8, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Eyebrow L is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "head", "attachment": null, "dimensions": {"width": 0.05522, "height": 0.00949, "depth": 0.016, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.0502, 0.02848, 0.1227], "rotation": [0.0, 0.0, 0.0], "scale": [0.05522, 0.00949, 0.016]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "brow-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hair"}}, "material": "hair", "materialLayers": ["hair"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(36, 26, 30, 1.0)", "secondaryAlbedo": "rgba(26, 18, 22, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(26, 18, 22, 1.0)"}, {"position": 0.5, "color": "rgba(36, 26, 30, 1.0)"}, {"position": 1.0, "color": "rgba(44, 24, 16, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Near-black with a banded satin highlight."}};
  node_brow_l_20.add(mesh_brow_l_20);
  meshes["brow-l"] = mesh_brow_l_20;
  colliders["brow-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["brow-l"] ??= [];
  destructionGroups["brow-l"].push(node_brow_l_20);

  const endpoint_brow_r_21 = makeAttachmentEndpoint(null);
  const node_brow_r_21 = new THREE.Group();
  node_brow_r_21.name = "Eyebrow R__pivot";
  node_brow_r_21.scale.set(1, 1, 1);
  if (endpoint_brow_r_21) {
    node_brow_r_21.position.copy(endpoint_brow_r_21.start);
    node_brow_r_21.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_brow_r_21.position.set(-0.0502, 0.02848, 0.1227);
    node_brow_r_21.rotation.set(0.0, 0.0, 0.0);
  }
  node_brow_r_21.userData.sculptComponent = {"id": "brow-r", "name": "Eyebrow R", "level": "micro", "role": "detail", "importance": 0.4, "confidence": 0.8, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Eyebrow R is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "head", "attachment": null, "dimensions": {"width": 0.05522, "height": 0.00949, "depth": 0.016, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.0502, 0.02848, 0.1227], "rotation": [0.0, 0.0, 0.0], "scale": [0.05522, 0.00949, 0.016]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "brow-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hair"}}, "material": "hair", "materialLayers": ["hair"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(36, 26, 30, 1.0)", "secondaryAlbedo": "rgba(26, 18, 22, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(26, 18, 22, 1.0)"}, {"position": 0.5, "color": "rgba(36, 26, 30, 1.0)"}, {"position": 1.0, "color": "rgba(44, 24, 16, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Near-black with a banded satin highlight."}};
  node_brow_r_21.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "brow-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hair"}};
  (nodes["head"] ?? root).add(node_brow_r_21);
  nodes["brow-r"] = node_brow_r_21;
  const mesh_brow_r_21Geometry = endpoint_brow_r_21
    ? new THREE.CylinderGeometry(endpoint_brow_r_21.endRadius, endpoint_brow_r_21.baseRadius, endpoint_brow_r_21.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_brow_r_21) {
    mesh_brow_r_21Geometry.scale(0.05522, 0.00949, 0.016);
  }
  const mesh_brow_r_21 = new THREE.Mesh(
    mesh_brow_r_21Geometry,
    materialMap["hair"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_brow_r_21.name = "Eyebrow R";
  if (endpoint_brow_r_21) {
    mesh_brow_r_21.position.copy(endpoint_brow_r_21.midpoint);
    mesh_brow_r_21.quaternion.copy(endpoint_brow_r_21.quaternion);
  }
  mesh_brow_r_21.castShadow = options.castShadow ?? true;
  mesh_brow_r_21.receiveShadow = options.receiveShadow ?? true;
  mesh_brow_r_21.userData.sculptComponent = {"id": "brow-r", "name": "Eyebrow R", "level": "micro", "role": "detail", "importance": 0.4, "confidence": 0.8, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Eyebrow R is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "head", "attachment": null, "dimensions": {"width": 0.05522, "height": 0.00949, "depth": 0.016, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.0502, 0.02848, 0.1227], "rotation": [0.0, 0.0, 0.0], "scale": [0.05522, 0.00949, 0.016]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "brow-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "hair"}}, "material": "hair", "materialLayers": ["hair"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(36, 26, 30, 1.0)", "secondaryAlbedo": "rgba(26, 18, 22, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(26, 18, 22, 1.0)"}, {"position": 0.5, "color": "rgba(36, 26, 30, 1.0)"}, {"position": 1.0, "color": "rgba(44, 24, 16, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Near-black with a banded satin highlight."}};
  node_brow_r_21.add(mesh_brow_r_21);
  meshes["brow-r"] = mesh_brow_r_21;
  colliders["brow-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["brow-r"] ??= [];
  destructionGroups["brow-r"].push(node_brow_r_21);

  const endpoint_ear_l_22 = makeAttachmentEndpoint(null);
  const node_ear_l_22 = new THREE.Group();
  node_ear_l_22.name = "Ear L__pivot";
  node_ear_l_22.scale.set(1, 1, 1);
  if (endpoint_ear_l_22) {
    node_ear_l_22.position.copy(endpoint_ear_l_22.start);
    node_ear_l_22.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_ear_l_22.position.set(0.10793, 0.00475, -0.00533);
    node_ear_l_22.rotation.set(0.0, 0.0, 0.0);
  }
  node_ear_l_22.userData.sculptComponent = {"id": "ear-l", "name": "Ear L", "level": "micro", "role": "detail", "importance": 0.45, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Ear L is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "head", "attachment": null, "dimensions": {"width": 0.02259, "height": 0.0617, "depth": 0.04535, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.10793, 0.00475, -0.00533], "rotation": [0.0, 0.0, 0.0], "scale": [0.02259, 0.0617, 0.04535]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "ear-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": ["outer helix reads as a flattened shell against the skull, not a disc"], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_ear_l_22.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "ear-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["head"] ?? root).add(node_ear_l_22);
  nodes["ear-l"] = node_ear_l_22;
  const mesh_ear_l_22Geometry = endpoint_ear_l_22
    ? new THREE.CylinderGeometry(endpoint_ear_l_22.endRadius, endpoint_ear_l_22.baseRadius, endpoint_ear_l_22.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_ear_l_22) {
    mesh_ear_l_22Geometry.scale(0.02259, 0.0617, 0.04535);
  }
  const mesh_ear_l_22 = new THREE.Mesh(
    mesh_ear_l_22Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_ear_l_22.name = "Ear L";
  if (endpoint_ear_l_22) {
    mesh_ear_l_22.position.copy(endpoint_ear_l_22.midpoint);
    mesh_ear_l_22.quaternion.copy(endpoint_ear_l_22.quaternion);
  }
  mesh_ear_l_22.castShadow = options.castShadow ?? true;
  mesh_ear_l_22.receiveShadow = options.receiveShadow ?? true;
  mesh_ear_l_22.userData.sculptComponent = {"id": "ear-l", "name": "Ear L", "level": "micro", "role": "detail", "importance": 0.45, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Ear L is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "head", "attachment": null, "dimensions": {"width": 0.02259, "height": 0.0617, "depth": 0.04535, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.10793, 0.00475, -0.00533], "rotation": [0.0, 0.0, 0.0], "scale": [0.02259, 0.0617, 0.04535]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "ear-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": ["outer helix reads as a flattened shell against the skull, not a disc"], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_ear_l_22.add(mesh_ear_l_22);
  meshes["ear-l"] = mesh_ear_l_22;
  colliders["ear-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["ear-l"] ??= [];
  destructionGroups["ear-l"].push(node_ear_l_22);

  const endpoint_ear_r_23 = makeAttachmentEndpoint(null);
  const node_ear_r_23 = new THREE.Group();
  node_ear_r_23.name = "Ear R__pivot";
  node_ear_r_23.scale.set(1, 1, 1);
  if (endpoint_ear_r_23) {
    node_ear_r_23.position.copy(endpoint_ear_r_23.start);
    node_ear_r_23.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_ear_r_23.position.set(-0.10793, 0.00475, -0.00533);
    node_ear_r_23.rotation.set(0.0, 0.0, 0.0);
  }
  node_ear_r_23.userData.sculptComponent = {"id": "ear-r", "name": "Ear R", "level": "micro", "role": "detail", "importance": 0.45, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Ear R is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "head", "attachment": null, "dimensions": {"width": 0.02259, "height": 0.0617, "depth": 0.04535, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.10793, 0.00475, -0.00533], "rotation": [0.0, 0.0, 0.0], "scale": [0.02259, 0.0617, 0.04535]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "ear-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": ["outer helix reads as a flattened shell against the skull, not a disc"], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_ear_r_23.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "ear-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["head"] ?? root).add(node_ear_r_23);
  nodes["ear-r"] = node_ear_r_23;
  const mesh_ear_r_23Geometry = endpoint_ear_r_23
    ? new THREE.CylinderGeometry(endpoint_ear_r_23.endRadius, endpoint_ear_r_23.baseRadius, endpoint_ear_r_23.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_ear_r_23) {
    mesh_ear_r_23Geometry.scale(0.02259, 0.0617, 0.04535);
  }
  const mesh_ear_r_23 = new THREE.Mesh(
    mesh_ear_r_23Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_ear_r_23.name = "Ear R";
  if (endpoint_ear_r_23) {
    mesh_ear_r_23.position.copy(endpoint_ear_r_23.midpoint);
    mesh_ear_r_23.quaternion.copy(endpoint_ear_r_23.quaternion);
  }
  mesh_ear_r_23.castShadow = options.castShadow ?? true;
  mesh_ear_r_23.receiveShadow = options.receiveShadow ?? true;
  mesh_ear_r_23.userData.sculptComponent = {"id": "ear-r", "name": "Ear R", "level": "micro", "role": "detail", "importance": 0.45, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Ear R is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "head", "attachment": null, "dimensions": {"width": 0.02259, "height": 0.0617, "depth": 0.04535, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.10793, 0.00475, -0.00533], "rotation": [0.0, 0.0, 0.0], "scale": [0.02259, 0.0617, 0.04535]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "ear-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": ["outer helix reads as a flattened shell against the skull, not a disc"], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_ear_r_23.add(mesh_ear_r_23);
  meshes["ear-r"] = mesh_ear_r_23;
  colliders["ear-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["ear-r"] ??= [];
  destructionGroups["ear-r"].push(node_ear_r_23);

  const endpoint_nose_24 = makeAttachmentEndpoint(null);
  const node_nose_24 = new THREE.Group();
  node_nose_24.name = "Nose__pivot";
  node_nose_24.scale.set(1, 1, 1);
  if (endpoint_nose_24) {
    node_nose_24.position.copy(endpoint_nose_24.start);
    node_nose_24.rotation.set(0.024435, 0.0, 0.0);
  } else {
    node_nose_24.position.set(0.0, -0.00949, 0.13337);
    node_nose_24.rotation.set(0.024435, 0.0, 0.0);
  }
  node_nose_24.userData.sculptComponent = {"id": "nose", "name": "Nose", "level": "micro", "role": "detail", "importance": 0.4, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Nose is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "head", "attachment": null, "dimensions": {"width": 0.03514, "height": 0.06644, "depth": 0.04801, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.0, -0.00949, 0.13337], "rotation": [0.024435, 0.0, 0.0], "scale": [0.03514, 0.06644, 0.04801]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "nose", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_nose_24.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "nose", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["head"] ?? root).add(node_nose_24);
  nodes["nose"] = node_nose_24;
  const mesh_nose_24Geometry = endpoint_nose_24
    ? new THREE.CylinderGeometry(endpoint_nose_24.endRadius, endpoint_nose_24.baseRadius, endpoint_nose_24.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_nose_24) {
    mesh_nose_24Geometry.scale(0.03514, 0.06644, 0.04801);
  }
  const mesh_nose_24 = new THREE.Mesh(
    mesh_nose_24Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_nose_24.name = "Nose";
  if (endpoint_nose_24) {
    mesh_nose_24.position.copy(endpoint_nose_24.midpoint);
    mesh_nose_24.quaternion.copy(endpoint_nose_24.quaternion);
  }
  mesh_nose_24.castShadow = options.castShadow ?? true;
  mesh_nose_24.receiveShadow = options.receiveShadow ?? true;
  mesh_nose_24.userData.sculptComponent = {"id": "nose", "name": "Nose", "level": "micro", "role": "detail", "importance": 0.4, "confidence": 0.8, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Nose is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "head", "attachment": null, "dimensions": {"width": 0.03514, "height": 0.06644, "depth": 0.04801, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.0, -0.00949, 0.13337], "rotation": [0.024435, 0.0, 0.0], "scale": [0.03514, 0.06644, 0.04801]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "nose", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_nose_24.add(mesh_nose_24);
  meshes["nose"] = mesh_nose_24;
  colliders["nose"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["nose"] ??= [];
  destructionGroups["nose"].push(node_nose_24);

  const endpoint_mouth_25 = makeAttachmentEndpoint(null);
  const node_mouth_25 = new THREE.Group();
  node_mouth_25.name = "Mouth__pivot";
  node_mouth_25.scale.set(1, 1, 1);
  if (endpoint_mouth_25) {
    node_mouth_25.position.copy(endpoint_mouth_25.start);
    node_mouth_25.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_mouth_25.position.set(0.0, -0.08068, 0.1227);
    node_mouth_25.rotation.set(0.0, 0.0, 0.0);
  }
  node_mouth_25.userData.sculptComponent = {"id": "mouth", "name": "Mouth", "level": "micro", "role": "detail", "importance": 0.4, "confidence": 0.8, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Mouth is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "head", "attachment": null, "dimensions": {"width": 0.06024, "height": 0.00949, "depth": 0.01334, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.0, -0.08068, 0.1227], "rotation": [0.0, 0.0, 0.0], "scale": [0.06024, 0.00949, 0.01334]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "mouth", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "lips"}}, "material": "lips", "materialLayers": ["lips"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(156, 90, 68, 1.0)", "secondaryAlbedo": "rgba(176, 107, 82, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(176, 107, 82, 1.0)"}, {"position": 0.5, "color": "rgba(156, 90, 68, 1.0)"}, {"position": 1.0, "color": "rgba(176, 107, 82, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Slightly cooler and darker than the surrounding skin."}};
  node_mouth_25.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "mouth", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "lips"}};
  (nodes["head"] ?? root).add(node_mouth_25);
  nodes["mouth"] = node_mouth_25;
  const mesh_mouth_25Geometry = endpoint_mouth_25
    ? new THREE.CylinderGeometry(endpoint_mouth_25.endRadius, endpoint_mouth_25.baseRadius, endpoint_mouth_25.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_mouth_25) {
    mesh_mouth_25Geometry.scale(0.06024, 0.00949, 0.01334);
  }
  const mesh_mouth_25 = new THREE.Mesh(
    mesh_mouth_25Geometry,
    materialMap["lips"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_mouth_25.name = "Mouth";
  if (endpoint_mouth_25) {
    mesh_mouth_25.position.copy(endpoint_mouth_25.midpoint);
    mesh_mouth_25.quaternion.copy(endpoint_mouth_25.quaternion);
  }
  mesh_mouth_25.castShadow = options.castShadow ?? true;
  mesh_mouth_25.receiveShadow = options.receiveShadow ?? true;
  mesh_mouth_25.userData.sculptComponent = {"id": "mouth", "name": "Mouth", "level": "micro", "role": "detail", "importance": 0.4, "confidence": 0.8, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Mouth is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "head", "attachment": null, "dimensions": {"width": 0.06024, "height": 0.00949, "depth": 0.01334, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.0, -0.08068, 0.1227], "rotation": [0.0, 0.0, 0.0], "scale": [0.06024, 0.00949, 0.01334]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "mouth", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "lips"}}, "material": "lips", "materialLayers": ["lips"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(156, 90, 68, 1.0)", "secondaryAlbedo": "rgba(176, 107, 82, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(176, 107, 82, 1.0)"}, {"position": 0.5, "color": "rgba(156, 90, 68, 1.0)"}, {"position": 1.0, "color": "rgba(176, 107, 82, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Slightly cooler and darker than the surrounding skin."}};
  node_mouth_25.add(mesh_mouth_25);
  meshes["mouth"] = mesh_mouth_25;
  colliders["mouth"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["mouth"] ??= [];
  destructionGroups["mouth"].push(node_mouth_25);

  const endpoint_eye_l_26 = makeAttachmentEndpoint(null);
  const node_eye_l_26 = new THREE.Group();
  node_eye_l_26.name = "Eye L__pivot";
  node_eye_l_26.scale.set(1, 1, 1);
  if (endpoint_eye_l_26) {
    node_eye_l_26.position.copy(endpoint_eye_l_26.start);
    node_eye_l_26.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_eye_l_26.position.set(0.04769, 0.00712, 0.1067);
    node_eye_l_26.rotation.set(0.0, 0.0, 0.0);
  }
  node_eye_l_26.userData.sculptComponent = {"id": "eye-l", "name": "Eye L", "level": "micro", "role": "detail", "importance": 0.5, "confidence": 0.8, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "Eye L is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "head", "attachment": null, "dimensions": {"width": 0.02761, "height": 0.0261, "depth": 0.02934, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.04769, 0.00712, 0.1067], "rotation": [0.0, 0.0, 0.0], "scale": [0.02761, 0.0261, 0.02934]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "eye-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "eye"}}, "material": "eye", "materialLayers": ["eye"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(32, 26, 24, 1.0)", "secondaryAlbedo": "rgba(58, 47, 42, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(58, 47, 42, 1.0)"}, {"position": 0.5, "color": "rgba(32, 26, 24, 1.0)"}, {"position": 1.0, "color": "rgba(58, 47, 42, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Dark iris mass; face detail is below gameplay-visible scale."}};
  node_eye_l_26.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "eye-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "eye"}};
  (nodes["head"] ?? root).add(node_eye_l_26);
  nodes["eye-l"] = node_eye_l_26;
  const mesh_eye_l_26Geometry = endpoint_eye_l_26
    ? new THREE.CylinderGeometry(endpoint_eye_l_26.endRadius, endpoint_eye_l_26.baseRadius, endpoint_eye_l_26.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_eye_l_26) {
    mesh_eye_l_26Geometry.scale(0.02761, 0.0261, 0.02934);
  }
  const mesh_eye_l_26 = new THREE.Mesh(
    mesh_eye_l_26Geometry,
    materialMap["eye"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_eye_l_26.name = "Eye L";
  if (endpoint_eye_l_26) {
    mesh_eye_l_26.position.copy(endpoint_eye_l_26.midpoint);
    mesh_eye_l_26.quaternion.copy(endpoint_eye_l_26.quaternion);
  }
  mesh_eye_l_26.castShadow = options.castShadow ?? true;
  mesh_eye_l_26.receiveShadow = options.receiveShadow ?? true;
  mesh_eye_l_26.userData.sculptComponent = {"id": "eye-l", "name": "Eye L", "level": "micro", "role": "detail", "importance": 0.5, "confidence": 0.8, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "Eye L is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "head", "attachment": null, "dimensions": {"width": 0.02761, "height": 0.0261, "depth": 0.02934, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.04769, 0.00712, 0.1067], "rotation": [0.0, 0.0, 0.0], "scale": [0.02761, 0.0261, 0.02934]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "eye-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "eye"}}, "material": "eye", "materialLayers": ["eye"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(32, 26, 24, 1.0)", "secondaryAlbedo": "rgba(58, 47, 42, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(58, 47, 42, 1.0)"}, {"position": 0.5, "color": "rgba(32, 26, 24, 1.0)"}, {"position": 1.0, "color": "rgba(58, 47, 42, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Dark iris mass; face detail is below gameplay-visible scale."}};
  node_eye_l_26.add(mesh_eye_l_26);
  meshes["eye-l"] = mesh_eye_l_26;
  colliders["eye-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["eye-l"] ??= [];
  destructionGroups["eye-l"].push(node_eye_l_26);

  const endpoint_eye_cavity_l_27 = makeAttachmentEndpoint(null);
  const node_eye_cavity_l_27 = new THREE.Group();
  node_eye_cavity_l_27.name = "Eye cavity L__pivot";
  node_eye_cavity_l_27.scale.set(1, 1, 1);
  if (endpoint_eye_cavity_l_27) {
    node_eye_cavity_l_27.position.copy(endpoint_eye_cavity_l_27.start);
    node_eye_cavity_l_27.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_eye_cavity_l_27.position.set(0.04769, 0.00712, 0.1147);
    node_eye_cavity_l_27.rotation.set(0.0, 0.0, 0.0);
  }
  node_eye_cavity_l_27.userData.sculptComponent = {"id": "eye-cavity-l", "name": "Eye cavity L", "level": "micro", "role": "cavity", "importance": 0.4, "confidence": 0.8, "primitive": "sphere", "topologyClass": "implicit", "topologyRationale": "The eye reads as a recessed concave cavity carved out of the head volume with a boolean subtraction (US-004), not a flat decal or shaded patch.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "sdf": {"primitives": [{"id": "shell", "type": "sphere", "center": [0.0, 0.0, 0.0], "radius": 0.0252}, {"id": "carve", "type": "sphere", "center": [0.0, 0.0, 0.0154], "radius": 0.021}], "operations": [{"id": "socket", "type": "subtract", "left": "shell", "right": "carve"}], "bounds": {"min": [-0.0455, -0.0455, -0.0455], "max": [0.0455, 0.0455, 0.0455]}, "resolution": 24}}, "parent": "head", "attachment": null, "dimensions": {"width": 0.04518, "height": 0.04271, "depth": 0.04801, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.04769, 0.00712, 0.1147], "rotation": [0.0, 0.0, 0.0], "scale": [0.04518, 0.04271, 0.04801]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "eye-cavity-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "eye", "materialLayers": ["eye"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(0, 0, 0, 1.0)", "secondaryAlbedo": "rgba(0, 0, 0, 1.0)", "materialClass": "unknown", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(0, 0, 0, 1.0)"}, {"position": 0.5, "color": "rgba(0, 0, 0, 1.0)"}, {"position": 1.0, "color": "rgba(0, 0, 0, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Never rendered; subtractive/cavity slots only."}};
  node_eye_cavity_l_27.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "eye-cavity-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["head"] ?? root).add(node_eye_cavity_l_27);
  nodes["eye-cavity-l"] = node_eye_cavity_l_27;
  const mesh_eye_cavity_l_27Geometry = polygonizeSdf({"primitives": [{"id": "shell", "type": "sphere", "center": [0.0, 0.0, 0.0], "radius": 0.0252}, {"id": "carve", "type": "sphere", "center": [0.0, 0.0, 0.0154], "radius": 0.021}], "operations": [{"id": "socket", "type": "subtract", "left": "shell", "right": "carve"}], "bounds": {"min": [-0.0455, -0.0455, -0.0455], "max": [0.0455, 0.0455, 0.0455]}, "resolution": 24});
  if (!endpoint_eye_cavity_l_27) {
    mesh_eye_cavity_l_27Geometry.scale(0.04518, 0.04271, 0.04801);
  }
  const mesh_eye_cavity_l_27 = new THREE.Mesh(
    mesh_eye_cavity_l_27Geometry,
    createSculptMaterial("eye", {"id": "eye", "name": "Eye", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#482a25", "color": "#482a25", "albedo": {"dominant": "#482a25", "secondary": ["#C1846B", "#955D4E", "#41241F"], "samplingNotes": "Reference-derived from foreground pixels; de-lit to reduce baked shadows/highlights."}, "colorVariation": {"palette": ["#DDA284", "#C1846B", "#955D4E", "#41241F", "#F5E9E6"], "pattern": "reference-derived pixel palette", "amplitude": 0.202, "heightCorrelation": 0.42}, "roughness": {"base": 0.28, "variation": 0.06}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.38, "contactShadowBias": 0.35, "map": {"path": "D:\\GAMES\\warrior_run\\.img2threejs\\material-evidence\\eye\\eye_ao.png", "url": "eye_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}, "notes": "Reference-derived cavity estimate from local height minima; verify against grazing-light screenshot."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there.", "Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps."], "notes": "Dark iris mass; face detail is below gameplay-visible scale. Wet cornea is the one genuinely glossy surface.", "clearcoat": {"base": 0.0, "variation": 0.0}, "materialClass": "skin", "finishClassOverride": {"was": null, "now": "matte-organic", "reason": "analyze_texture.py is tuned for CS2 weapon finishes and returned None for this crop. Wet cornea is the one genuinely glossy surface."}, "finishClass": "matte-organic", "evidenceLimit": "Below gameplay-visible scale; massing and albedo only.", "textureless": {"declared": true, "evidence": ["Drawn as flat colour regions with a single specular dot.", "suitability.md routed this reference as flat cel colour, which the rubric rule of thumb (\"solid albedo for flat paint, real reference crop for patterned finishes\") sends to procedural material, not projection."], "measurementRef": ".img2threejs/material-evidence/eye/ (extraction kept on disk as the measurement behind this claim; its de-lit palette corroborates the flat albedo, and its maps are deliberately NOT wired in because they bake the reference's own lighting into albedo)", "extractionConfidence": 0.732}}, options, true)
  );
  mesh_eye_cavity_l_27.name = "Eye cavity L";
  if (endpoint_eye_cavity_l_27) {
    mesh_eye_cavity_l_27.position.copy(endpoint_eye_cavity_l_27.midpoint);
    mesh_eye_cavity_l_27.quaternion.copy(endpoint_eye_cavity_l_27.quaternion);
  }
  mesh_eye_cavity_l_27.castShadow = options.castShadow ?? true;
  mesh_eye_cavity_l_27.receiveShadow = options.receiveShadow ?? true;
  mesh_eye_cavity_l_27.userData.sculptComponent = {"id": "eye-cavity-l", "name": "Eye cavity L", "level": "micro", "role": "cavity", "importance": 0.4, "confidence": 0.8, "primitive": "sphere", "topologyClass": "implicit", "topologyRationale": "The eye reads as a recessed concave cavity carved out of the head volume with a boolean subtraction (US-004), not a flat decal or shaded patch.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "sdf": {"primitives": [{"id": "shell", "type": "sphere", "center": [0.0, 0.0, 0.0], "radius": 0.0252}, {"id": "carve", "type": "sphere", "center": [0.0, 0.0, 0.0154], "radius": 0.021}], "operations": [{"id": "socket", "type": "subtract", "left": "shell", "right": "carve"}], "bounds": {"min": [-0.0455, -0.0455, -0.0455], "max": [0.0455, 0.0455, 0.0455]}, "resolution": 24}}, "parent": "head", "attachment": null, "dimensions": {"width": 0.04518, "height": 0.04271, "depth": 0.04801, "units": "relative", "confidence": 0.8}, "transform": {"position": [0.04769, 0.00712, 0.1147], "rotation": [0.0, 0.0, 0.0], "scale": [0.04518, 0.04271, 0.04801]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "eye-cavity-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "eye", "materialLayers": ["eye"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(0, 0, 0, 1.0)", "secondaryAlbedo": "rgba(0, 0, 0, 1.0)", "materialClass": "unknown", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(0, 0, 0, 1.0)"}, {"position": 0.5, "color": "rgba(0, 0, 0, 1.0)"}, {"position": 1.0, "color": "rgba(0, 0, 0, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Never rendered; subtractive/cavity slots only."}};
  node_eye_cavity_l_27.add(mesh_eye_cavity_l_27);
  meshes["eye-cavity-l"] = mesh_eye_cavity_l_27;
  colliders["eye-cavity-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["eye-cavity-l"] ??= [];
  destructionGroups["eye-cavity-l"].push(node_eye_cavity_l_27);

  const endpoint_eye_r_28 = makeAttachmentEndpoint(null);
  const node_eye_r_28 = new THREE.Group();
  node_eye_r_28.name = "Eye R__pivot";
  node_eye_r_28.scale.set(1, 1, 1);
  if (endpoint_eye_r_28) {
    node_eye_r_28.position.copy(endpoint_eye_r_28.start);
    node_eye_r_28.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_eye_r_28.position.set(-0.04769, 0.00712, 0.1067);
    node_eye_r_28.rotation.set(0.0, 0.0, 0.0);
  }
  node_eye_r_28.userData.sculptComponent = {"id": "eye-r", "name": "Eye R", "level": "micro", "role": "detail", "importance": 0.5, "confidence": 0.8, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "Eye R is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "head", "attachment": null, "dimensions": {"width": 0.02761, "height": 0.0261, "depth": 0.02934, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.04769, 0.00712, 0.1067], "rotation": [0.0, 0.0, 0.0], "scale": [0.02761, 0.0261, 0.02934]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "eye-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "eye"}}, "material": "eye", "materialLayers": ["eye"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(32, 26, 24, 1.0)", "secondaryAlbedo": "rgba(58, 47, 42, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(58, 47, 42, 1.0)"}, {"position": 0.5, "color": "rgba(32, 26, 24, 1.0)"}, {"position": 1.0, "color": "rgba(58, 47, 42, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Dark iris mass; face detail is below gameplay-visible scale."}};
  node_eye_r_28.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "eye-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "eye"}};
  (nodes["head"] ?? root).add(node_eye_r_28);
  nodes["eye-r"] = node_eye_r_28;
  const mesh_eye_r_28Geometry = endpoint_eye_r_28
    ? new THREE.CylinderGeometry(endpoint_eye_r_28.endRadius, endpoint_eye_r_28.baseRadius, endpoint_eye_r_28.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_eye_r_28) {
    mesh_eye_r_28Geometry.scale(0.02761, 0.0261, 0.02934);
  }
  const mesh_eye_r_28 = new THREE.Mesh(
    mesh_eye_r_28Geometry,
    materialMap["eye"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_eye_r_28.name = "Eye R";
  if (endpoint_eye_r_28) {
    mesh_eye_r_28.position.copy(endpoint_eye_r_28.midpoint);
    mesh_eye_r_28.quaternion.copy(endpoint_eye_r_28.quaternion);
  }
  mesh_eye_r_28.castShadow = options.castShadow ?? true;
  mesh_eye_r_28.receiveShadow = options.receiveShadow ?? true;
  mesh_eye_r_28.userData.sculptComponent = {"id": "eye-r", "name": "Eye R", "level": "micro", "role": "detail", "importance": 0.5, "confidence": 0.8, "primitive": "sphere", "topologyClass": "assembled-solid", "topologyRationale": "Eye R is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "head", "attachment": null, "dimensions": {"width": 0.02761, "height": 0.0261, "depth": 0.02934, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.04769, 0.00712, 0.1067], "rotation": [0.0, 0.0, 0.0], "scale": [0.02761, 0.0261, 0.02934]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "eye-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "eye"}}, "material": "eye", "materialLayers": ["eye"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(32, 26, 24, 1.0)", "secondaryAlbedo": "rgba(58, 47, 42, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(58, 47, 42, 1.0)"}, {"position": 0.5, "color": "rgba(32, 26, 24, 1.0)"}, {"position": 1.0, "color": "rgba(58, 47, 42, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Dark iris mass; face detail is below gameplay-visible scale."}};
  node_eye_r_28.add(mesh_eye_r_28);
  meshes["eye-r"] = mesh_eye_r_28;
  colliders["eye-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["eye-r"] ??= [];
  destructionGroups["eye-r"].push(node_eye_r_28);

  const endpoint_eye_cavity_r_29 = makeAttachmentEndpoint(null);
  const node_eye_cavity_r_29 = new THREE.Group();
  node_eye_cavity_r_29.name = "Eye cavity R__pivot";
  node_eye_cavity_r_29.scale.set(1, 1, 1);
  if (endpoint_eye_cavity_r_29) {
    node_eye_cavity_r_29.position.copy(endpoint_eye_cavity_r_29.start);
    node_eye_cavity_r_29.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_eye_cavity_r_29.position.set(-0.04769, 0.00712, 0.1147);
    node_eye_cavity_r_29.rotation.set(0.0, 0.0, 0.0);
  }
  node_eye_cavity_r_29.userData.sculptComponent = {"id": "eye-cavity-r", "name": "Eye cavity R", "level": "micro", "role": "cavity", "importance": 0.4, "confidence": 0.8, "primitive": "sphere", "topologyClass": "implicit", "topologyRationale": "The eye reads as a recessed concave cavity carved out of the head volume with a boolean subtraction (US-004), not a flat decal or shaded patch.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "sdf": {"primitives": [{"id": "shell", "type": "sphere", "center": [0.0, 0.0, 0.0], "radius": 0.0252}, {"id": "carve", "type": "sphere", "center": [0.0, 0.0, 0.0154], "radius": 0.021}], "operations": [{"id": "socket", "type": "subtract", "left": "shell", "right": "carve"}], "bounds": {"min": [-0.0455, -0.0455, -0.0455], "max": [0.0455, 0.0455, 0.0455]}, "resolution": 24}}, "parent": "head", "attachment": null, "dimensions": {"width": 0.04518, "height": 0.04271, "depth": 0.04801, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.04769, 0.00712, 0.1147], "rotation": [0.0, 0.0, 0.0], "scale": [0.04518, 0.04271, 0.04801]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "eye-cavity-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "eye", "materialLayers": ["eye"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(0, 0, 0, 1.0)", "secondaryAlbedo": "rgba(0, 0, 0, 1.0)", "materialClass": "unknown", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(0, 0, 0, 1.0)"}, {"position": 0.5, "color": "rgba(0, 0, 0, 1.0)"}, {"position": 1.0, "color": "rgba(0, 0, 0, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Never rendered; subtractive/cavity slots only."}};
  node_eye_cavity_r_29.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "eye-cavity-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["head"] ?? root).add(node_eye_cavity_r_29);
  nodes["eye-cavity-r"] = node_eye_cavity_r_29;
  const mesh_eye_cavity_r_29Geometry = polygonizeSdf({"primitives": [{"id": "shell", "type": "sphere", "center": [0.0, 0.0, 0.0], "radius": 0.0252}, {"id": "carve", "type": "sphere", "center": [0.0, 0.0, 0.0154], "radius": 0.021}], "operations": [{"id": "socket", "type": "subtract", "left": "shell", "right": "carve"}], "bounds": {"min": [-0.0455, -0.0455, -0.0455], "max": [0.0455, 0.0455, 0.0455]}, "resolution": 24});
  if (!endpoint_eye_cavity_r_29) {
    mesh_eye_cavity_r_29Geometry.scale(0.04518, 0.04271, 0.04801);
  }
  const mesh_eye_cavity_r_29 = new THREE.Mesh(
    mesh_eye_cavity_r_29Geometry,
    createSculptMaterial("eye", {"id": "eye", "name": "Eye", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#482a25", "color": "#482a25", "albedo": {"dominant": "#482a25", "secondary": ["#C1846B", "#955D4E", "#41241F"], "samplingNotes": "Reference-derived from foreground pixels; de-lit to reduce baked shadows/highlights."}, "colorVariation": {"palette": ["#DDA284", "#C1846B", "#955D4E", "#41241F", "#F5E9E6"], "pattern": "reference-derived pixel palette", "amplitude": 0.202, "heightCorrelation": 0.42}, "roughness": {"base": 0.28, "variation": 0.06}, "metalness": {"base": 0.0, "variation": 0.0}, "ambientOcclusion": {"cavityStrength": 0.38, "contactShadowBias": 0.35, "map": {"path": "D:\\GAMES\\warrior_run\\.img2threejs\\material-evidence\\eye\\eye_ao.png", "url": "eye_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}, "notes": "Reference-derived cavity estimate from local height minima; verify against grazing-light screenshot."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there.", "Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps."], "notes": "Dark iris mass; face detail is below gameplay-visible scale. Wet cornea is the one genuinely glossy surface.", "clearcoat": {"base": 0.0, "variation": 0.0}, "materialClass": "skin", "finishClassOverride": {"was": null, "now": "matte-organic", "reason": "analyze_texture.py is tuned for CS2 weapon finishes and returned None for this crop. Wet cornea is the one genuinely glossy surface."}, "finishClass": "matte-organic", "evidenceLimit": "Below gameplay-visible scale; massing and albedo only.", "textureless": {"declared": true, "evidence": ["Drawn as flat colour regions with a single specular dot.", "suitability.md routed this reference as flat cel colour, which the rubric rule of thumb (\"solid albedo for flat paint, real reference crop for patterned finishes\") sends to procedural material, not projection."], "measurementRef": ".img2threejs/material-evidence/eye/ (extraction kept on disk as the measurement behind this claim; its de-lit palette corroborates the flat albedo, and its maps are deliberately NOT wired in because they bake the reference's own lighting into albedo)", "extractionConfidence": 0.732}}, options, true)
  );
  mesh_eye_cavity_r_29.name = "Eye cavity R";
  if (endpoint_eye_cavity_r_29) {
    mesh_eye_cavity_r_29.position.copy(endpoint_eye_cavity_r_29.midpoint);
    mesh_eye_cavity_r_29.quaternion.copy(endpoint_eye_cavity_r_29.quaternion);
  }
  mesh_eye_cavity_r_29.castShadow = options.castShadow ?? true;
  mesh_eye_cavity_r_29.receiveShadow = options.receiveShadow ?? true;
  mesh_eye_cavity_r_29.userData.sculptComponent = {"id": "eye-cavity-r", "name": "Eye cavity R", "level": "micro", "role": "cavity", "importance": 0.4, "confidence": 0.8, "primitive": "sphere", "topologyClass": "implicit", "topologyRationale": "The eye reads as a recessed concave cavity carved out of the head volume with a boolean subtraction (US-004), not a flat decal or shaded patch.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "sdf": {"primitives": [{"id": "shell", "type": "sphere", "center": [0.0, 0.0, 0.0], "radius": 0.0252}, {"id": "carve", "type": "sphere", "center": [0.0, 0.0, 0.0154], "radius": 0.021}], "operations": [{"id": "socket", "type": "subtract", "left": "shell", "right": "carve"}], "bounds": {"min": [-0.0455, -0.0455, -0.0455], "max": [0.0455, 0.0455, 0.0455]}, "resolution": 24}}, "parent": "head", "attachment": null, "dimensions": {"width": 0.04518, "height": 0.04271, "depth": 0.04801, "units": "relative", "confidence": 0.8}, "transform": {"position": [-0.04769, 0.00712, 0.1147], "rotation": [0.0, 0.0, 0.0], "scale": [0.04518, 0.04271, 0.04801]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "eye-cavity-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "eye", "materialLayers": ["eye"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(0, 0, 0, 1.0)", "secondaryAlbedo": "rgba(0, 0, 0, 1.0)", "materialClass": "unknown", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(0, 0, 0, 1.0)"}, {"position": 0.5, "color": "rgba(0, 0, 0, 1.0)"}, {"position": 1.0, "color": "rgba(0, 0, 0, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Never rendered; subtractive/cavity slots only."}};
  node_eye_cavity_r_29.add(mesh_eye_cavity_r_29);
  meshes["eye-cavity-r"] = mesh_eye_cavity_r_29;
  colliders["eye-cavity-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["eye-cavity-r"] ??= [];
  destructionGroups["eye-cavity-r"].push(node_eye_cavity_r_29);

  const attachment_clavicle_l_30 = {"parentSocket": "chest-clavicle-l", "localStart": [0.04, 0.29402, 0.006], "localEnd": [0.19502, 0.29402, 0.012], "contactType": "rigid-weld", "baseRadius": 0.033, "endRadius": 0.05, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]};
  const endpoint_clavicle_l_30 = makeAttachmentEndpoint(attachment_clavicle_l_30);
  const node_clavicle_l_30 = new THREE.Group();
  node_clavicle_l_30.name = "Clavicle L__pivot";
  node_clavicle_l_30.scale.set(1, 1, 1);
  if (endpoint_clavicle_l_30) {
    node_clavicle_l_30.position.copy(endpoint_clavicle_l_30.start);
    node_clavicle_l_30.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_clavicle_l_30.position.set(0.04, 0.29402, 0.006);
    node_clavicle_l_30.rotation.set(0.0, 0.0, 0.0);
  }
  node_clavicle_l_30.userData.sculptComponent = {"id": "clavicle-l", "name": "Clavicle L", "level": "meso", "role": "support", "importance": 0.6, "confidence": 0.8, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Clavicle L is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "chest", "attachment": {"parentSocket": "chest-clavicle-l", "localStart": [0.04, 0.29402, 0.006], "localEnd": [0.19502, 0.29402, 0.012], "contactType": "rigid-weld", "baseRadius": 0.033, "endRadius": 0.05, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.15502, "height": 0.095, "depth": 0.095, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0.04, 0.29402, 0.006], "rotation": [0.0, 0.0, 0.0], "scale": [0.15502, 0.095, 0.095]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "clavicle-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_clavicle_l_30.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "clavicle-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["chest"] ?? root).add(node_clavicle_l_30);
  nodes["clavicle-l"] = node_clavicle_l_30;
  const mesh_clavicle_l_30Geometry = endpoint_clavicle_l_30
    ? new THREE.CylinderGeometry(endpoint_clavicle_l_30.endRadius, endpoint_clavicle_l_30.baseRadius, endpoint_clavicle_l_30.length, 16, 6)
    : buildWatertightCapsule(0.35, 0.7, 8, 16, 1);
  if (!endpoint_clavicle_l_30) {
    mesh_clavicle_l_30Geometry.scale(0.15502, 0.095, 0.095);
  }
  const mesh_clavicle_l_30 = new THREE.Mesh(
    mesh_clavicle_l_30Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_clavicle_l_30.name = "Clavicle L";
  if (endpoint_clavicle_l_30) {
    mesh_clavicle_l_30.position.copy(endpoint_clavicle_l_30.midpoint);
    mesh_clavicle_l_30.quaternion.copy(endpoint_clavicle_l_30.quaternion);
  }
  mesh_clavicle_l_30.castShadow = options.castShadow ?? true;
  mesh_clavicle_l_30.receiveShadow = options.receiveShadow ?? true;
  mesh_clavicle_l_30.userData.sculptComponent = {"id": "clavicle-l", "name": "Clavicle L", "level": "meso", "role": "support", "importance": 0.6, "confidence": 0.8, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Clavicle L is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "chest", "attachment": {"parentSocket": "chest-clavicle-l", "localStart": [0.04, 0.29402, 0.006], "localEnd": [0.19502, 0.29402, 0.012], "contactType": "rigid-weld", "baseRadius": 0.033, "endRadius": 0.05, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.15502, "height": 0.095, "depth": 0.095, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0.04, 0.29402, 0.006], "rotation": [0.0, 0.0, 0.0], "scale": [0.15502, 0.095, 0.095]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "clavicle-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_clavicle_l_30.add(mesh_clavicle_l_30);
  meshes["clavicle-l"] = mesh_clavicle_l_30;
  colliders["clavicle-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["clavicle-l"] ??= [];
  destructionGroups["clavicle-l"].push(node_clavicle_l_30);

  const endpoint_deltoid_l_31 = makeAttachmentEndpoint(null);
  const node_deltoid_l_31 = new THREE.Group();
  node_deltoid_l_31.name = "Deltoid L__pivot";
  node_deltoid_l_31.scale.set(1, 1, 1);
  if (endpoint_deltoid_l_31) {
    node_deltoid_l_31.position.copy(endpoint_deltoid_l_31.start);
    node_deltoid_l_31.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_deltoid_l_31.position.set(0.15502, 0.0, 0.006);
    node_deltoid_l_31.rotation.set(0.0, 0.0, 0.0);
  }
  node_deltoid_l_31.userData.sculptComponent = {"id": "deltoid-l", "name": "Deltoid L", "level": "meso", "role": "body", "importance": 0.6, "confidence": 0.75, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "clavicle-l", "attachment": null, "dimensions": {"width": 0.142, "height": 0.148, "depth": 0.142, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0.15502, 0.0, 0.006], "rotation": [0.0, 0.0, 0.0], "scale": [0.142, 0.148, 0.142]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "deltoid-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "deltoid-l-read", "description": "Shoulder cap that rounds the joint between clavicle and upper arm.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_deltoid_l_31.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "deltoid-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["clavicle-l"] ?? root).add(node_deltoid_l_31);
  nodes["deltoid-l"] = node_deltoid_l_31;
  const mesh_deltoid_l_31Geometry = endpoint_deltoid_l_31
    ? new THREE.CylinderGeometry(endpoint_deltoid_l_31.endRadius, endpoint_deltoid_l_31.baseRadius, endpoint_deltoid_l_31.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_deltoid_l_31) {
    mesh_deltoid_l_31Geometry.scale(0.142, 0.148, 0.142);
  }
  const mesh_deltoid_l_31 = new THREE.Mesh(
    mesh_deltoid_l_31Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_deltoid_l_31.name = "Deltoid L";
  if (endpoint_deltoid_l_31) {
    mesh_deltoid_l_31.position.copy(endpoint_deltoid_l_31.midpoint);
    mesh_deltoid_l_31.quaternion.copy(endpoint_deltoid_l_31.quaternion);
  }
  mesh_deltoid_l_31.castShadow = options.castShadow ?? true;
  mesh_deltoid_l_31.receiveShadow = options.receiveShadow ?? true;
  mesh_deltoid_l_31.userData.sculptComponent = {"id": "deltoid-l", "name": "Deltoid L", "level": "meso", "role": "body", "importance": 0.6, "confidence": 0.75, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "clavicle-l", "attachment": null, "dimensions": {"width": 0.142, "height": 0.148, "depth": 0.142, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0.15502, 0.0, 0.006], "rotation": [0.0, 0.0, 0.0], "scale": [0.142, 0.148, 0.142]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "deltoid-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "deltoid-l-read", "description": "Shoulder cap that rounds the joint between clavicle and upper arm.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_deltoid_l_31.add(mesh_deltoid_l_31);
  meshes["deltoid-l"] = mesh_deltoid_l_31;
  colliders["deltoid-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["deltoid-l"] ??= [];
  destructionGroups["deltoid-l"].push(node_deltoid_l_31);

  const attachment_upper_arm_l_32 = {"parentSocket": "clavicle-shoulder-l", "localStart": [0.15502, 0.0, 0.006], "localEnd": [0.15502, -0.472, 0.006], "contactType": "socket-joint", "baseRadius": 0.067, "endRadius": 0.05494, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]};
  const endpoint_upper_arm_l_32 = makeAttachmentEndpoint(attachment_upper_arm_l_32);
  const node_upper_arm_l_32 = new THREE.Group();
  node_upper_arm_l_32.name = "Upper arm L__pivot";
  node_upper_arm_l_32.scale.set(1, 1, 1);
  if (endpoint_upper_arm_l_32) {
    node_upper_arm_l_32.position.copy(endpoint_upper_arm_l_32.start);
    node_upper_arm_l_32.rotation.set(0.0, 0.0, 0.733038);
  } else {
    node_upper_arm_l_32.position.set(0.15502, 0.0, 0.006);
    node_upper_arm_l_32.rotation.set(0.0, 0.0, 0.733038);
  }
  node_upper_arm_l_32.userData.sculptComponent = {"id": "upper-arm-l", "name": "Upper arm L", "level": "macro", "role": "arm", "importance": 0.7, "confidence": 0.8, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Upper arm L is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "clavicle-l", "attachment": {"parentSocket": "clavicle-shoulder-l", "localStart": [0.15502, 0.0, 0.006], "localEnd": [0.15502, -0.472, 0.006], "contactType": "socket-joint", "baseRadius": 0.067, "endRadius": 0.05494, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.134, "height": 0.472, "depth": 0.134, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0.15502, 0.0, 0.006], "rotation": [0, 0, 0.733038], "scale": [0.134, 0.472, 0.134]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "upper-arm-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_upper_arm_l_32.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "upper-arm-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["clavicle-l"] ?? root).add(node_upper_arm_l_32);
  nodes["upper-arm-l"] = node_upper_arm_l_32;
  const mesh_upper_arm_l_32Geometry = endpoint_upper_arm_l_32
    ? new THREE.CylinderGeometry(endpoint_upper_arm_l_32.endRadius, endpoint_upper_arm_l_32.baseRadius, endpoint_upper_arm_l_32.length, 16, 6)
    : buildWatertightCapsule(0.35, 0.7, 8, 16, 1);
  if (!endpoint_upper_arm_l_32) {
    mesh_upper_arm_l_32Geometry.scale(0.134, 0.472, 0.134);
  }
  const mesh_upper_arm_l_32 = new THREE.Mesh(
    mesh_upper_arm_l_32Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_upper_arm_l_32.name = "Upper arm L";
  if (endpoint_upper_arm_l_32) {
    mesh_upper_arm_l_32.position.copy(endpoint_upper_arm_l_32.midpoint);
    mesh_upper_arm_l_32.quaternion.copy(endpoint_upper_arm_l_32.quaternion);
  }
  mesh_upper_arm_l_32.castShadow = options.castShadow ?? true;
  mesh_upper_arm_l_32.receiveShadow = options.receiveShadow ?? true;
  mesh_upper_arm_l_32.userData.sculptComponent = {"id": "upper-arm-l", "name": "Upper arm L", "level": "macro", "role": "arm", "importance": 0.7, "confidence": 0.8, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Upper arm L is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "clavicle-l", "attachment": {"parentSocket": "clavicle-shoulder-l", "localStart": [0.15502, 0.0, 0.006], "localEnd": [0.15502, -0.472, 0.006], "contactType": "socket-joint", "baseRadius": 0.067, "endRadius": 0.05494, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.134, "height": 0.472, "depth": 0.134, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0.15502, 0.0, 0.006], "rotation": [0, 0, 0.733038], "scale": [0.134, 0.472, 0.134]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "upper-arm-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_upper_arm_l_32.add(mesh_upper_arm_l_32);
  meshes["upper-arm-l"] = mesh_upper_arm_l_32;
  colliders["upper-arm-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["upper-arm-l"] ??= [];
  destructionGroups["upper-arm-l"].push(node_upper_arm_l_32);

  const endpoint_armband_l_33 = makeAttachmentEndpoint(null);
  const node_armband_l_33 = new THREE.Group();
  node_armband_l_33.name = "Rudraksha armband L__pivot";
  node_armband_l_33.scale.set(1, 1, 1);
  if (endpoint_armband_l_33) {
    node_armband_l_33.position.copy(endpoint_armband_l_33.start);
    node_armband_l_33.rotation.set(1.570796, 0.0, 0.0);
  } else {
    node_armband_l_33.position.set(0.0, -0.2124, 0.0);
    node_armband_l_33.rotation.set(1.570796, 0.0, 0.0);
  }
  node_armband_l_33.userData.sculptComponent = {"id": "armband-l", "name": "Rudraksha armband L", "level": "micro", "role": "accessory", "importance": 0.6, "confidence": 0.75, "primitive": "torus", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "upper-arm-l", "attachment": null, "dimensions": {"width": 0.158, "height": 0.05, "depth": 0.158, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, -0.2124, 0], "rotation": [1.570796, 0.0, 0.0], "scale": [0.158, 0.05, 0.158]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "armband-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "rudraksha"}}, "material": "rudraksha", "materialLayers": ["rudraksha"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "armband-l-read", "description": "Mid-shaft bead band; the sheet labels it on BOTH arms.", "scale": "micro", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(106, 50, 16, 1.0)", "secondaryAlbedo": "rgba(122, 58, 16, 1.0)", "materialClass": "wood", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(122, 58, 16, 1.0)"}, {"position": 0.5, "color": "rgba(106, 50, 16, 1.0)"}, {"position": 1.0, "color": "rgba(92, 43, 12, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm brown seed with a strongly furrowed surface; the furrows are material-scale, below geometry scale."}};
  node_armband_l_33.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "armband-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "rudraksha"}};
  (nodes["upper-arm-l"] ?? root).add(node_armband_l_33);
  nodes["armband-l"] = node_armband_l_33;
  const mesh_armband_l_33Geometry = endpoint_armband_l_33
    ? new THREE.CylinderGeometry(endpoint_armband_l_33.endRadius, endpoint_armband_l_33.baseRadius, endpoint_armband_l_33.length, 16, 6)
    : new THREE.TorusGeometry(0.45, 0.08, 12, 48);
  if (!endpoint_armband_l_33) {
    mesh_armband_l_33Geometry.scale(0.158, 0.05, 0.158);
  }
  const mesh_armband_l_33 = new THREE.Mesh(
    mesh_armband_l_33Geometry,
    materialMap["rudraksha"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_armband_l_33.name = "Rudraksha armband L";
  if (endpoint_armband_l_33) {
    mesh_armband_l_33.position.copy(endpoint_armband_l_33.midpoint);
    mesh_armband_l_33.quaternion.copy(endpoint_armband_l_33.quaternion);
  }
  mesh_armband_l_33.castShadow = options.castShadow ?? true;
  mesh_armband_l_33.receiveShadow = options.receiveShadow ?? true;
  mesh_armband_l_33.userData.sculptComponent = {"id": "armband-l", "name": "Rudraksha armband L", "level": "micro", "role": "accessory", "importance": 0.6, "confidence": 0.75, "primitive": "torus", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "upper-arm-l", "attachment": null, "dimensions": {"width": 0.158, "height": 0.05, "depth": 0.158, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, -0.2124, 0], "rotation": [1.570796, 0.0, 0.0], "scale": [0.158, 0.05, 0.158]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "armband-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "rudraksha"}}, "material": "rudraksha", "materialLayers": ["rudraksha"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "armband-l-read", "description": "Mid-shaft bead band; the sheet labels it on BOTH arms.", "scale": "micro", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(106, 50, 16, 1.0)", "secondaryAlbedo": "rgba(122, 58, 16, 1.0)", "materialClass": "wood", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(122, 58, 16, 1.0)"}, {"position": 0.5, "color": "rgba(106, 50, 16, 1.0)"}, {"position": 1.0, "color": "rgba(92, 43, 12, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm brown seed with a strongly furrowed surface; the furrows are material-scale, below geometry scale."}};
  node_armband_l_33.add(mesh_armband_l_33);
  meshes["armband-l"] = mesh_armband_l_33;
  colliders["armband-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["armband-l"] ??= [];
  destructionGroups["armband-l"].push(node_armband_l_33);

  const attachment_forearm_l_34 = {"parentSocket": "upper-arm-elbow-l", "localStart": [0, -0.472, 0], "localEnd": [0, -0.858, 0], "contactType": "hinge-joint", "baseRadius": 0.056, "endRadius": 0.04032, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]};
  const endpoint_forearm_l_34 = makeAttachmentEndpoint(attachment_forearm_l_34);
  const node_forearm_l_34 = new THREE.Group();
  node_forearm_l_34.name = "Forearm L__pivot";
  node_forearm_l_34.scale.set(1, 1, 1);
  if (endpoint_forearm_l_34) {
    node_forearm_l_34.position.copy(endpoint_forearm_l_34.start);
    node_forearm_l_34.rotation.set(0.0, 0.0, 0.069813);
  } else {
    node_forearm_l_34.position.set(0.0, -0.472, 0.0);
    node_forearm_l_34.rotation.set(0.0, 0.0, 0.069813);
  }
  node_forearm_l_34.userData.sculptComponent = {"id": "forearm-l", "name": "Forearm L", "level": "meso", "role": "arm", "importance": 0.65, "confidence": 0.8, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Forearm L is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "upper-arm-l", "attachment": {"parentSocket": "upper-arm-elbow-l", "localStart": [0, -0.472, 0], "localEnd": [0, -0.858, 0], "contactType": "hinge-joint", "baseRadius": 0.056, "endRadius": 0.04032, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.112, "height": 0.386, "depth": 0.112, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, -0.472, 0], "rotation": [0, 0, 0.069813], "scale": [0.112, 0.386, 0.112]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "forearm-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_forearm_l_34.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "forearm-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["upper-arm-l"] ?? root).add(node_forearm_l_34);
  nodes["forearm-l"] = node_forearm_l_34;
  const mesh_forearm_l_34Geometry = endpoint_forearm_l_34
    ? new THREE.CylinderGeometry(endpoint_forearm_l_34.endRadius, endpoint_forearm_l_34.baseRadius, endpoint_forearm_l_34.length, 16, 6)
    : buildWatertightCapsule(0.35, 0.7, 8, 16, 1);
  if (!endpoint_forearm_l_34) {
    mesh_forearm_l_34Geometry.scale(0.112, 0.386, 0.112);
  }
  const mesh_forearm_l_34 = new THREE.Mesh(
    mesh_forearm_l_34Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_forearm_l_34.name = "Forearm L";
  if (endpoint_forearm_l_34) {
    mesh_forearm_l_34.position.copy(endpoint_forearm_l_34.midpoint);
    mesh_forearm_l_34.quaternion.copy(endpoint_forearm_l_34.quaternion);
  }
  mesh_forearm_l_34.castShadow = options.castShadow ?? true;
  mesh_forearm_l_34.receiveShadow = options.receiveShadow ?? true;
  mesh_forearm_l_34.userData.sculptComponent = {"id": "forearm-l", "name": "Forearm L", "level": "meso", "role": "arm", "importance": 0.65, "confidence": 0.8, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Forearm L is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "upper-arm-l", "attachment": {"parentSocket": "upper-arm-elbow-l", "localStart": [0, -0.472, 0], "localEnd": [0, -0.858, 0], "contactType": "hinge-joint", "baseRadius": 0.056, "endRadius": 0.04032, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.112, "height": 0.386, "depth": 0.112, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, -0.472, 0], "rotation": [0, 0, 0.069813], "scale": [0.112, 0.386, 0.112]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "forearm-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_forearm_l_34.add(mesh_forearm_l_34);
  meshes["forearm-l"] = mesh_forearm_l_34;
  colliders["forearm-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["forearm-l"] ??= [];
  destructionGroups["forearm-l"].push(node_forearm_l_34);

  const endpoint_wristband_l_35 = makeAttachmentEndpoint(null);
  const node_wristband_l_35 = new THREE.Group();
  node_wristband_l_35.name = "Rudraksha wristband L__pivot";
  node_wristband_l_35.scale.set(1, 1, 1);
  if (endpoint_wristband_l_35) {
    node_wristband_l_35.position.copy(endpoint_wristband_l_35.start);
    node_wristband_l_35.rotation.set(1.570796, 0.0, 0.0);
  } else {
    node_wristband_l_35.position.set(0.0, -0.3474, 0.0);
    node_wristband_l_35.rotation.set(1.570796, 0.0, 0.0);
  }
  node_wristband_l_35.userData.sculptComponent = {"id": "wristband-l", "name": "Rudraksha wristband L", "level": "micro", "role": "accessory", "importance": 0.55, "confidence": 0.75, "primitive": "torus", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "forearm-l", "attachment": null, "dimensions": {"width": 0.132, "height": 0.044, "depth": 0.132, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, -0.3474, 0], "rotation": [1.570796, 0.0, 0.0], "scale": [0.132, 0.044, 0.132]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "wristband-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "rudraksha"}}, "material": "rudraksha", "materialLayers": ["rudraksha"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "wristband-l-read", "description": "Distal forearm bead band, clear of the wrist joint so it stays rigid.", "scale": "micro", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(106, 50, 16, 1.0)", "secondaryAlbedo": "rgba(122, 58, 16, 1.0)", "materialClass": "wood", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(122, 58, 16, 1.0)"}, {"position": 0.5, "color": "rgba(106, 50, 16, 1.0)"}, {"position": 1.0, "color": "rgba(92, 43, 12, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm brown seed with a strongly furrowed surface; the furrows are material-scale, below geometry scale."}};
  node_wristband_l_35.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "wristband-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "rudraksha"}};
  (nodes["forearm-l"] ?? root).add(node_wristband_l_35);
  nodes["wristband-l"] = node_wristband_l_35;
  const mesh_wristband_l_35Geometry = endpoint_wristband_l_35
    ? new THREE.CylinderGeometry(endpoint_wristband_l_35.endRadius, endpoint_wristband_l_35.baseRadius, endpoint_wristband_l_35.length, 16, 6)
    : new THREE.TorusGeometry(0.45, 0.08, 12, 48);
  if (!endpoint_wristband_l_35) {
    mesh_wristband_l_35Geometry.scale(0.132, 0.044, 0.132);
  }
  const mesh_wristband_l_35 = new THREE.Mesh(
    mesh_wristband_l_35Geometry,
    materialMap["rudraksha"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_wristband_l_35.name = "Rudraksha wristband L";
  if (endpoint_wristband_l_35) {
    mesh_wristband_l_35.position.copy(endpoint_wristband_l_35.midpoint);
    mesh_wristband_l_35.quaternion.copy(endpoint_wristband_l_35.quaternion);
  }
  mesh_wristband_l_35.castShadow = options.castShadow ?? true;
  mesh_wristband_l_35.receiveShadow = options.receiveShadow ?? true;
  mesh_wristband_l_35.userData.sculptComponent = {"id": "wristband-l", "name": "Rudraksha wristband L", "level": "micro", "role": "accessory", "importance": 0.55, "confidence": 0.75, "primitive": "torus", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "forearm-l", "attachment": null, "dimensions": {"width": 0.132, "height": 0.044, "depth": 0.132, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, -0.3474, 0], "rotation": [1.570796, 0.0, 0.0], "scale": [0.132, 0.044, 0.132]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "wristband-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "rudraksha"}}, "material": "rudraksha", "materialLayers": ["rudraksha"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "wristband-l-read", "description": "Distal forearm bead band, clear of the wrist joint so it stays rigid.", "scale": "micro", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(106, 50, 16, 1.0)", "secondaryAlbedo": "rgba(122, 58, 16, 1.0)", "materialClass": "wood", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(122, 58, 16, 1.0)"}, {"position": 0.5, "color": "rgba(106, 50, 16, 1.0)"}, {"position": 1.0, "color": "rgba(92, 43, 12, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm brown seed with a strongly furrowed surface; the furrows are material-scale, below geometry scale."}};
  node_wristband_l_35.add(mesh_wristband_l_35);
  meshes["wristband-l"] = mesh_wristband_l_35;
  colliders["wristband-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["wristband-l"] ??= [];
  destructionGroups["wristband-l"].push(node_wristband_l_35);

  const endpoint_hand_l_36 = makeAttachmentEndpoint(null);
  const node_hand_l_36 = new THREE.Group();
  node_hand_l_36.name = "Hand L__pivot";
  node_hand_l_36.scale.set(1, 1, 1);
  if (endpoint_hand_l_36) {
    node_hand_l_36.position.copy(endpoint_hand_l_36.start);
    node_hand_l_36.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_hand_l_36.position.set(0.0, -0.4285, 0.0);
    node_hand_l_36.rotation.set(0.0, 0.0, 0.0);
  }
  node_hand_l_36.userData.sculptComponent = {"id": "hand-l", "name": "Hand L", "level": "meso", "role": "hand", "importance": 0.55, "confidence": 0.8, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Hand L is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "forearm-l", "attachment": null, "dimensions": {"width": 0.082, "height": 0.085, "depth": 0.054, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, -0.4285, 0], "rotation": [0.0, 0.0, 0.0], "scale": [0.082, 0.085, 0.054]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "hand-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_hand_l_36.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "hand-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["forearm-l"] ?? root).add(node_hand_l_36);
  nodes["hand-l"] = node_hand_l_36;
  const mesh_hand_l_36Geometry = endpoint_hand_l_36
    ? new THREE.CylinderGeometry(endpoint_hand_l_36.endRadius, endpoint_hand_l_36.baseRadius, endpoint_hand_l_36.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_hand_l_36) {
    mesh_hand_l_36Geometry.scale(0.082, 0.085, 0.054);
  }
  const mesh_hand_l_36 = new THREE.Mesh(
    mesh_hand_l_36Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_hand_l_36.name = "Hand L";
  if (endpoint_hand_l_36) {
    mesh_hand_l_36.position.copy(endpoint_hand_l_36.midpoint);
    mesh_hand_l_36.quaternion.copy(endpoint_hand_l_36.quaternion);
  }
  mesh_hand_l_36.castShadow = options.castShadow ?? true;
  mesh_hand_l_36.receiveShadow = options.receiveShadow ?? true;
  mesh_hand_l_36.userData.sculptComponent = {"id": "hand-l", "name": "Hand L", "level": "meso", "role": "hand", "importance": 0.55, "confidence": 0.8, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Hand L is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "forearm-l", "attachment": null, "dimensions": {"width": 0.082, "height": 0.085, "depth": 0.054, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, -0.4285, 0], "rotation": [0.0, 0.0, 0.0], "scale": [0.082, 0.085, 0.054]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "hand-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_hand_l_36.add(mesh_hand_l_36);
  meshes["hand-l"] = mesh_hand_l_36;
  colliders["hand-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["hand-l"] ??= [];
  destructionGroups["hand-l"].push(node_hand_l_36);

  const attachment_clavicle_r_37 = {"parentSocket": "chest-clavicle-r", "localStart": [-0.04, 0.29402, 0.006], "localEnd": [-0.19502, 0.29402, 0.012], "contactType": "rigid-weld", "baseRadius": 0.033, "endRadius": 0.05, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]};
  const endpoint_clavicle_r_37 = makeAttachmentEndpoint(attachment_clavicle_r_37);
  const node_clavicle_r_37 = new THREE.Group();
  node_clavicle_r_37.name = "Clavicle R__pivot";
  node_clavicle_r_37.scale.set(1, 1, 1);
  if (endpoint_clavicle_r_37) {
    node_clavicle_r_37.position.copy(endpoint_clavicle_r_37.start);
    node_clavicle_r_37.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_clavicle_r_37.position.set(-0.04, 0.29402, 0.006);
    node_clavicle_r_37.rotation.set(0.0, 0.0, 0.0);
  }
  node_clavicle_r_37.userData.sculptComponent = {"id": "clavicle-r", "name": "Clavicle R", "level": "meso", "role": "support", "importance": 0.6, "confidence": 0.8, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Clavicle R is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "chest", "attachment": {"parentSocket": "chest-clavicle-r", "localStart": [-0.04, 0.29402, 0.006], "localEnd": [-0.19502, 0.29402, 0.012], "contactType": "rigid-weld", "baseRadius": 0.033, "endRadius": 0.05, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.15502, "height": 0.095, "depth": 0.095, "units": "world-units", "confidence": 0.8}, "transform": {"position": [-0.04, 0.29402, 0.006], "rotation": [0.0, 0.0, 0.0], "scale": [0.15502, 0.095, 0.095]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "clavicle-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_clavicle_r_37.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "clavicle-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["chest"] ?? root).add(node_clavicle_r_37);
  nodes["clavicle-r"] = node_clavicle_r_37;
  const mesh_clavicle_r_37Geometry = endpoint_clavicle_r_37
    ? new THREE.CylinderGeometry(endpoint_clavicle_r_37.endRadius, endpoint_clavicle_r_37.baseRadius, endpoint_clavicle_r_37.length, 16, 6)
    : buildWatertightCapsule(0.35, 0.7, 8, 16, 1);
  if (!endpoint_clavicle_r_37) {
    mesh_clavicle_r_37Geometry.scale(0.15502, 0.095, 0.095);
  }
  const mesh_clavicle_r_37 = new THREE.Mesh(
    mesh_clavicle_r_37Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_clavicle_r_37.name = "Clavicle R";
  if (endpoint_clavicle_r_37) {
    mesh_clavicle_r_37.position.copy(endpoint_clavicle_r_37.midpoint);
    mesh_clavicle_r_37.quaternion.copy(endpoint_clavicle_r_37.quaternion);
  }
  mesh_clavicle_r_37.castShadow = options.castShadow ?? true;
  mesh_clavicle_r_37.receiveShadow = options.receiveShadow ?? true;
  mesh_clavicle_r_37.userData.sculptComponent = {"id": "clavicle-r", "name": "Clavicle R", "level": "meso", "role": "support", "importance": 0.6, "confidence": 0.8, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Clavicle R is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "chest", "attachment": {"parentSocket": "chest-clavicle-r", "localStart": [-0.04, 0.29402, 0.006], "localEnd": [-0.19502, 0.29402, 0.012], "contactType": "rigid-weld", "baseRadius": 0.033, "endRadius": 0.05, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.15502, "height": 0.095, "depth": 0.095, "units": "world-units", "confidence": 0.8}, "transform": {"position": [-0.04, 0.29402, 0.006], "rotation": [0.0, 0.0, 0.0], "scale": [0.15502, 0.095, 0.095]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "clavicle-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_clavicle_r_37.add(mesh_clavicle_r_37);
  meshes["clavicle-r"] = mesh_clavicle_r_37;
  colliders["clavicle-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["clavicle-r"] ??= [];
  destructionGroups["clavicle-r"].push(node_clavicle_r_37);

  const endpoint_deltoid_r_38 = makeAttachmentEndpoint(null);
  const node_deltoid_r_38 = new THREE.Group();
  node_deltoid_r_38.name = "Deltoid R__pivot";
  node_deltoid_r_38.scale.set(1, 1, 1);
  if (endpoint_deltoid_r_38) {
    node_deltoid_r_38.position.copy(endpoint_deltoid_r_38.start);
    node_deltoid_r_38.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_deltoid_r_38.position.set(-0.15502, 0.0, 0.006);
    node_deltoid_r_38.rotation.set(0.0, 0.0, 0.0);
  }
  node_deltoid_r_38.userData.sculptComponent = {"id": "deltoid-r", "name": "Deltoid R", "level": "meso", "role": "body", "importance": 0.6, "confidence": 0.75, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "clavicle-r", "attachment": null, "dimensions": {"width": 0.142, "height": 0.148, "depth": 0.142, "units": "world-units", "confidence": 0.75}, "transform": {"position": [-0.15502, 0.0, 0.006], "rotation": [0.0, 0.0, 0.0], "scale": [0.142, 0.148, 0.142]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "deltoid-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "deltoid-r-read", "description": "Mirror of deltoid-l.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_deltoid_r_38.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "deltoid-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["clavicle-r"] ?? root).add(node_deltoid_r_38);
  nodes["deltoid-r"] = node_deltoid_r_38;
  const mesh_deltoid_r_38Geometry = endpoint_deltoid_r_38
    ? new THREE.CylinderGeometry(endpoint_deltoid_r_38.endRadius, endpoint_deltoid_r_38.baseRadius, endpoint_deltoid_r_38.length, 16, 6)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_deltoid_r_38) {
    mesh_deltoid_r_38Geometry.scale(0.142, 0.148, 0.142);
  }
  const mesh_deltoid_r_38 = new THREE.Mesh(
    mesh_deltoid_r_38Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_deltoid_r_38.name = "Deltoid R";
  if (endpoint_deltoid_r_38) {
    mesh_deltoid_r_38.position.copy(endpoint_deltoid_r_38.midpoint);
    mesh_deltoid_r_38.quaternion.copy(endpoint_deltoid_r_38.quaternion);
  }
  mesh_deltoid_r_38.castShadow = options.castShadow ?? true;
  mesh_deltoid_r_38.receiveShadow = options.receiveShadow ?? true;
  mesh_deltoid_r_38.userData.sculptComponent = {"id": "deltoid-r", "name": "Deltoid R", "level": "meso", "role": "body", "importance": 0.6, "confidence": 0.75, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "clavicle-r", "attachment": null, "dimensions": {"width": 0.142, "height": 0.148, "depth": 0.142, "units": "world-units", "confidence": 0.75}, "transform": {"position": [-0.15502, 0.0, 0.006], "rotation": [0.0, 0.0, 0.0], "scale": [0.142, 0.148, 0.142]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "deltoid-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "deltoid-r-read", "description": "Mirror of deltoid-l.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_deltoid_r_38.add(mesh_deltoid_r_38);
  meshes["deltoid-r"] = mesh_deltoid_r_38;
  colliders["deltoid-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["deltoid-r"] ??= [];
  destructionGroups["deltoid-r"].push(node_deltoid_r_38);

  const attachment_upper_arm_r_39 = {"parentSocket": "clavicle-shoulder-r", "localStart": [-0.15502, 0.0, 0.006], "localEnd": [-0.15502, -0.472, 0.006], "contactType": "socket-joint", "baseRadius": 0.067, "endRadius": 0.05494, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]};
  const endpoint_upper_arm_r_39 = makeAttachmentEndpoint(attachment_upper_arm_r_39);
  const node_upper_arm_r_39 = new THREE.Group();
  node_upper_arm_r_39.name = "Upper arm R__pivot";
  node_upper_arm_r_39.scale.set(1, 1, 1);
  if (endpoint_upper_arm_r_39) {
    node_upper_arm_r_39.position.copy(endpoint_upper_arm_r_39.start);
    node_upper_arm_r_39.rotation.set(0.0, 0.0, -0.733038);
  } else {
    node_upper_arm_r_39.position.set(-0.15502, 0.0, 0.006);
    node_upper_arm_r_39.rotation.set(0.0, 0.0, -0.733038);
  }
  node_upper_arm_r_39.userData.sculptComponent = {"id": "upper-arm-r", "name": "Upper arm R", "level": "macro", "role": "arm", "importance": 0.7, "confidence": 0.8, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Upper arm R is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "clavicle-r", "attachment": {"parentSocket": "clavicle-shoulder-r", "localStart": [-0.15502, 0.0, 0.006], "localEnd": [-0.15502, -0.472, 0.006], "contactType": "socket-joint", "baseRadius": 0.067, "endRadius": 0.05494, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.134, "height": 0.472, "depth": 0.134, "units": "world-units", "confidence": 0.8}, "transform": {"position": [-0.15502, 0.0, 0.006], "rotation": [0, 0, -0.733038], "scale": [0.134, 0.472, 0.134]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "upper-arm-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_upper_arm_r_39.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "upper-arm-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["clavicle-r"] ?? root).add(node_upper_arm_r_39);
  nodes["upper-arm-r"] = node_upper_arm_r_39;
  const mesh_upper_arm_r_39Geometry = endpoint_upper_arm_r_39
    ? new THREE.CylinderGeometry(endpoint_upper_arm_r_39.endRadius, endpoint_upper_arm_r_39.baseRadius, endpoint_upper_arm_r_39.length, 16, 6)
    : buildWatertightCapsule(0.35, 0.7, 8, 16, 1);
  if (!endpoint_upper_arm_r_39) {
    mesh_upper_arm_r_39Geometry.scale(0.134, 0.472, 0.134);
  }
  const mesh_upper_arm_r_39 = new THREE.Mesh(
    mesh_upper_arm_r_39Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_upper_arm_r_39.name = "Upper arm R";
  if (endpoint_upper_arm_r_39) {
    mesh_upper_arm_r_39.position.copy(endpoint_upper_arm_r_39.midpoint);
    mesh_upper_arm_r_39.quaternion.copy(endpoint_upper_arm_r_39.quaternion);
  }
  mesh_upper_arm_r_39.castShadow = options.castShadow ?? true;
  mesh_upper_arm_r_39.receiveShadow = options.receiveShadow ?? true;
  mesh_upper_arm_r_39.userData.sculptComponent = {"id": "upper-arm-r", "name": "Upper arm R", "level": "macro", "role": "arm", "importance": 0.7, "confidence": 0.8, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Upper arm R is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "clavicle-r", "attachment": {"parentSocket": "clavicle-shoulder-r", "localStart": [-0.15502, 0.0, 0.006], "localEnd": [-0.15502, -0.472, 0.006], "contactType": "socket-joint", "baseRadius": 0.067, "endRadius": 0.05494, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.134, "height": 0.472, "depth": 0.134, "units": "world-units", "confidence": 0.8}, "transform": {"position": [-0.15502, 0.0, 0.006], "rotation": [0, 0, -0.733038], "scale": [0.134, 0.472, 0.134]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "upper-arm-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_upper_arm_r_39.add(mesh_upper_arm_r_39);
  meshes["upper-arm-r"] = mesh_upper_arm_r_39;
  colliders["upper-arm-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["upper-arm-r"] ??= [];
  destructionGroups["upper-arm-r"].push(node_upper_arm_r_39);

  const endpoint_armband_r_40 = makeAttachmentEndpoint(null);
  const node_armband_r_40 = new THREE.Group();
  node_armband_r_40.name = "Rudraksha armband R__pivot";
  node_armband_r_40.scale.set(1, 1, 1);
  if (endpoint_armband_r_40) {
    node_armband_r_40.position.copy(endpoint_armband_r_40.start);
    node_armband_r_40.rotation.set(1.570796, 0.0, 0.0);
  } else {
    node_armband_r_40.position.set(0.0, -0.2124, 0.0);
    node_armband_r_40.rotation.set(1.570796, 0.0, 0.0);
  }
  node_armband_r_40.userData.sculptComponent = {"id": "armband-r", "name": "Rudraksha armband R", "level": "micro", "role": "accessory", "importance": 0.6, "confidence": 0.75, "primitive": "torus", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "upper-arm-r", "attachment": null, "dimensions": {"width": 0.158, "height": 0.05, "depth": 0.158, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, -0.2124, 0], "rotation": [1.570796, 0.0, 0.0], "scale": [0.158, 0.05, 0.158]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "armband-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "rudraksha"}}, "material": "rudraksha", "materialLayers": ["rudraksha"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "armband-r-read", "description": "Mirror of armband-l.", "scale": "micro", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(106, 50, 16, 1.0)", "secondaryAlbedo": "rgba(122, 58, 16, 1.0)", "materialClass": "wood", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(122, 58, 16, 1.0)"}, {"position": 0.5, "color": "rgba(106, 50, 16, 1.0)"}, {"position": 1.0, "color": "rgba(92, 43, 12, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm brown seed with a strongly furrowed surface; the furrows are material-scale, below geometry scale."}};
  node_armband_r_40.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "armband-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "rudraksha"}};
  (nodes["upper-arm-r"] ?? root).add(node_armband_r_40);
  nodes["armband-r"] = node_armband_r_40;
  const mesh_armband_r_40Geometry = endpoint_armband_r_40
    ? new THREE.CylinderGeometry(endpoint_armband_r_40.endRadius, endpoint_armband_r_40.baseRadius, endpoint_armband_r_40.length, 16, 6)
    : new THREE.TorusGeometry(0.45, 0.08, 12, 48);
  if (!endpoint_armband_r_40) {
    mesh_armband_r_40Geometry.scale(0.158, 0.05, 0.158);
  }
  const mesh_armband_r_40 = new THREE.Mesh(
    mesh_armband_r_40Geometry,
    materialMap["rudraksha"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_armband_r_40.name = "Rudraksha armband R";
  if (endpoint_armband_r_40) {
    mesh_armband_r_40.position.copy(endpoint_armband_r_40.midpoint);
    mesh_armband_r_40.quaternion.copy(endpoint_armband_r_40.quaternion);
  }
  mesh_armband_r_40.castShadow = options.castShadow ?? true;
  mesh_armband_r_40.receiveShadow = options.receiveShadow ?? true;
  mesh_armband_r_40.userData.sculptComponent = {"id": "armband-r", "name": "Rudraksha armband R", "level": "micro", "role": "accessory", "importance": 0.6, "confidence": 0.75, "primitive": "torus", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "upper-arm-r", "attachment": null, "dimensions": {"width": 0.158, "height": 0.05, "depth": 0.158, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, -0.2124, 0], "rotation": [1.570796, 0.0, 0.0], "scale": [0.158, 0.05, 0.158]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "armband-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "rudraksha"}}, "material": "rudraksha", "materialLayers": ["rudraksha"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "armband-r-read", "description": "Mirror of armband-l.", "scale": "micro", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(106, 50, 16, 1.0)", "secondaryAlbedo": "rgba(122, 58, 16, 1.0)", "materialClass": "wood", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(122, 58, 16, 1.0)"}, {"position": 0.5, "color": "rgba(106, 50, 16, 1.0)"}, {"position": 1.0, "color": "rgba(92, 43, 12, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm brown seed with a strongly furrowed surface; the furrows are material-scale, below geometry scale."}};
  node_armband_r_40.add(mesh_armband_r_40);
  meshes["armband-r"] = mesh_armband_r_40;
  colliders["armband-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["armband-r"] ??= [];
  destructionGroups["armband-r"].push(node_armband_r_40);

  const attachment_forearm_r_41 = {"parentSocket": "upper-arm-elbow-r", "localStart": [0, -0.472, 0], "localEnd": [0, -0.858, 0], "contactType": "hinge-joint", "baseRadius": 0.056, "endRadius": 0.04032, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]};
  const endpoint_forearm_r_41 = makeAttachmentEndpoint(attachment_forearm_r_41);
  const node_forearm_r_41 = new THREE.Group();
  node_forearm_r_41.name = "Forearm R__pivot";
  node_forearm_r_41.scale.set(1, 1, 1);
  if (endpoint_forearm_r_41) {
    node_forearm_r_41.position.copy(endpoint_forearm_r_41.start);
    node_forearm_r_41.rotation.set(0.0, 0.0, -0.069813);
  } else {
    node_forearm_r_41.position.set(0.0, -0.472, 0.0);
    node_forearm_r_41.rotation.set(0.0, 0.0, -0.069813);
  }
  node_forearm_r_41.userData.sculptComponent = {"id": "forearm-r", "name": "Forearm R", "level": "meso", "role": "arm", "importance": 0.65, "confidence": 0.8, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Forearm R is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "upper-arm-r", "attachment": {"parentSocket": "upper-arm-elbow-r", "localStart": [0, -0.472, 0], "localEnd": [0, -0.858, 0], "contactType": "hinge-joint", "baseRadius": 0.056, "endRadius": 0.04032, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.112, "height": 0.386, "depth": 0.112, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, -0.472, 0], "rotation": [0, 0, -0.069813], "scale": [0.112, 0.386, 0.112]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "forearm-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_forearm_r_41.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "forearm-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["upper-arm-r"] ?? root).add(node_forearm_r_41);
  nodes["forearm-r"] = node_forearm_r_41;
  const mesh_forearm_r_41Geometry = endpoint_forearm_r_41
    ? new THREE.CylinderGeometry(endpoint_forearm_r_41.endRadius, endpoint_forearm_r_41.baseRadius, endpoint_forearm_r_41.length, 16, 6)
    : buildWatertightCapsule(0.35, 0.7, 8, 16, 1);
  if (!endpoint_forearm_r_41) {
    mesh_forearm_r_41Geometry.scale(0.112, 0.386, 0.112);
  }
  const mesh_forearm_r_41 = new THREE.Mesh(
    mesh_forearm_r_41Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_forearm_r_41.name = "Forearm R";
  if (endpoint_forearm_r_41) {
    mesh_forearm_r_41.position.copy(endpoint_forearm_r_41.midpoint);
    mesh_forearm_r_41.quaternion.copy(endpoint_forearm_r_41.quaternion);
  }
  mesh_forearm_r_41.castShadow = options.castShadow ?? true;
  mesh_forearm_r_41.receiveShadow = options.receiveShadow ?? true;
  mesh_forearm_r_41.userData.sculptComponent = {"id": "forearm-r", "name": "Forearm R", "level": "meso", "role": "arm", "importance": 0.65, "confidence": 0.8, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Forearm R is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "upper-arm-r", "attachment": {"parentSocket": "upper-arm-elbow-r", "localStart": [0, -0.472, 0], "localEnd": [0, -0.858, 0], "contactType": "hinge-joint", "baseRadius": 0.056, "endRadius": 0.04032, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.112, "height": 0.386, "depth": 0.112, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, -0.472, 0], "rotation": [0, 0, -0.069813], "scale": [0.112, 0.386, 0.112]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "forearm-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_forearm_r_41.add(mesh_forearm_r_41);
  meshes["forearm-r"] = mesh_forearm_r_41;
  colliders["forearm-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["forearm-r"] ??= [];
  destructionGroups["forearm-r"].push(node_forearm_r_41);

  const endpoint_wristband_r_42 = makeAttachmentEndpoint(null);
  const node_wristband_r_42 = new THREE.Group();
  node_wristband_r_42.name = "Rudraksha wristband R__pivot";
  node_wristband_r_42.scale.set(1, 1, 1);
  if (endpoint_wristband_r_42) {
    node_wristband_r_42.position.copy(endpoint_wristband_r_42.start);
    node_wristband_r_42.rotation.set(1.570796, 0.0, 0.0);
  } else {
    node_wristband_r_42.position.set(0.0, -0.3474, 0.0);
    node_wristband_r_42.rotation.set(1.570796, 0.0, 0.0);
  }
  node_wristband_r_42.userData.sculptComponent = {"id": "wristband-r", "name": "Rudraksha wristband R", "level": "micro", "role": "accessory", "importance": 0.55, "confidence": 0.75, "primitive": "torus", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "forearm-r", "attachment": null, "dimensions": {"width": 0.132, "height": 0.044, "depth": 0.132, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, -0.3474, 0], "rotation": [1.570796, 0.0, 0.0], "scale": [0.132, 0.044, 0.132]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "wristband-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "rudraksha"}}, "material": "rudraksha", "materialLayers": ["rudraksha"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "wristband-r-read", "description": "Mirror of wristband-l.", "scale": "micro", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(106, 50, 16, 1.0)", "secondaryAlbedo": "rgba(122, 58, 16, 1.0)", "materialClass": "wood", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(122, 58, 16, 1.0)"}, {"position": 0.5, "color": "rgba(106, 50, 16, 1.0)"}, {"position": 1.0, "color": "rgba(92, 43, 12, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm brown seed with a strongly furrowed surface; the furrows are material-scale, below geometry scale."}};
  node_wristband_r_42.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "wristband-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "rudraksha"}};
  (nodes["forearm-r"] ?? root).add(node_wristband_r_42);
  nodes["wristband-r"] = node_wristband_r_42;
  const mesh_wristband_r_42Geometry = endpoint_wristband_r_42
    ? new THREE.CylinderGeometry(endpoint_wristband_r_42.endRadius, endpoint_wristband_r_42.baseRadius, endpoint_wristband_r_42.length, 16, 6)
    : new THREE.TorusGeometry(0.45, 0.08, 12, 48);
  if (!endpoint_wristband_r_42) {
    mesh_wristband_r_42Geometry.scale(0.132, 0.044, 0.132);
  }
  const mesh_wristband_r_42 = new THREE.Mesh(
    mesh_wristband_r_42Geometry,
    materialMap["rudraksha"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_wristband_r_42.name = "Rudraksha wristband R";
  if (endpoint_wristband_r_42) {
    mesh_wristband_r_42.position.copy(endpoint_wristband_r_42.midpoint);
    mesh_wristband_r_42.quaternion.copy(endpoint_wristband_r_42.quaternion);
  }
  mesh_wristband_r_42.castShadow = options.castShadow ?? true;
  mesh_wristband_r_42.receiveShadow = options.receiveShadow ?? true;
  mesh_wristband_r_42.userData.sculptComponent = {"id": "wristband-r", "name": "Rudraksha wristband R", "level": "micro", "role": "accessory", "importance": 0.55, "confidence": 0.75, "primitive": "torus", "topologyClass": "assembled-solid", "topologyRationale": "Discrete closed volume attached to the rig; it reads as its own part, not as a continuous sculpt or an offset shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "forearm-r", "attachment": null, "dimensions": {"width": 0.132, "height": 0.044, "depth": 0.132, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, -0.3474, 0], "rotation": [1.570796, 0.0, 0.0], "scale": [0.132, 0.044, 0.132]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "wristband-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "rudraksha"}}, "material": "rudraksha", "materialLayers": ["rudraksha"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "wristband-r-read", "description": "Mirror of wristband-l.", "scale": "micro", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(106, 50, 16, 1.0)", "secondaryAlbedo": "rgba(122, 58, 16, 1.0)", "materialClass": "wood", "materialClassConfidence": 0.7, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(122, 58, 16, 1.0)"}, {"position": 0.5, "color": "rgba(106, 50, 16, 1.0)"}, {"position": 1.0, "color": "rgba(92, 43, 12, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm brown seed with a strongly furrowed surface; the furrows are material-scale, below geometry scale."}};
  node_wristband_r_42.add(mesh_wristband_r_42);
  meshes["wristband-r"] = mesh_wristband_r_42;
  colliders["wristband-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["wristband-r"] ??= [];
  destructionGroups["wristband-r"].push(node_wristband_r_42);

  const endpoint_hand_r_43 = makeAttachmentEndpoint(null);
  const node_hand_r_43 = new THREE.Group();
  node_hand_r_43.name = "Hand R__pivot";
  node_hand_r_43.scale.set(1, 1, 1);
  if (endpoint_hand_r_43) {
    node_hand_r_43.position.copy(endpoint_hand_r_43.start);
    node_hand_r_43.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_hand_r_43.position.set(0.0, -0.4285, 0.0);
    node_hand_r_43.rotation.set(0.0, 0.0, 0.0);
  }
  node_hand_r_43.userData.sculptComponent = {"id": "hand-r", "name": "Hand R", "level": "meso", "role": "hand", "importance": 0.55, "confidence": 0.8, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Hand R is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "forearm-r", "attachment": null, "dimensions": {"width": 0.082, "height": 0.085, "depth": 0.054, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, -0.4285, 0], "rotation": [0.0, 0.0, 0.0], "scale": [0.082, 0.085, 0.054]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "hand-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_hand_r_43.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "hand-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["forearm-r"] ?? root).add(node_hand_r_43);
  nodes["hand-r"] = node_hand_r_43;
  const mesh_hand_r_43Geometry = endpoint_hand_r_43
    ? new THREE.CylinderGeometry(endpoint_hand_r_43.endRadius, endpoint_hand_r_43.baseRadius, endpoint_hand_r_43.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_hand_r_43) {
    mesh_hand_r_43Geometry.scale(0.082, 0.085, 0.054);
  }
  const mesh_hand_r_43 = new THREE.Mesh(
    mesh_hand_r_43Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_hand_r_43.name = "Hand R";
  if (endpoint_hand_r_43) {
    mesh_hand_r_43.position.copy(endpoint_hand_r_43.midpoint);
    mesh_hand_r_43.quaternion.copy(endpoint_hand_r_43.quaternion);
  }
  mesh_hand_r_43.castShadow = options.castShadow ?? true;
  mesh_hand_r_43.receiveShadow = options.receiveShadow ?? true;
  mesh_hand_r_43.userData.sculptComponent = {"id": "hand-r", "name": "Hand R", "level": "meso", "role": "hand", "importance": 0.55, "confidence": 0.8, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Hand R is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "forearm-r", "attachment": null, "dimensions": {"width": 0.082, "height": 0.085, "depth": 0.054, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, -0.4285, 0], "rotation": [0.0, 0.0, 0.0], "scale": [0.082, 0.085, 0.054]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "hand-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_hand_r_43.add(mesh_hand_r_43);
  meshes["hand-r"] = mesh_hand_r_43;
  colliders["hand-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["hand-r"] ??= [];
  destructionGroups["hand-r"].push(node_hand_r_43);

  const attachment_thigh_l_44 = {"parentSocket": "pelvis-hip-l", "localStart": [0.095, 0.0, 0.006], "localEnd": [0.095, -0.4515, 0.006], "contactType": "socket-joint", "baseRadius": 0.095, "endRadius": 0.076, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]};
  const endpoint_thigh_l_44 = makeAttachmentEndpoint(attachment_thigh_l_44);
  const node_thigh_l_44 = new THREE.Group();
  node_thigh_l_44.name = "Thigh L__pivot";
  node_thigh_l_44.scale.set(1, 1, 1);
  if (endpoint_thigh_l_44) {
    node_thigh_l_44.position.copy(endpoint_thigh_l_44.start);
    node_thigh_l_44.rotation.set(0.0, 0.0, 0.05236);
  } else {
    node_thigh_l_44.position.set(0.095, 0.0, 0.006);
    node_thigh_l_44.rotation.set(0.0, 0.0, 0.05236);
  }
  node_thigh_l_44.userData.sculptComponent = {"id": "thigh-l", "name": "Thigh L", "level": "macro", "role": "leg", "importance": 0.75, "confidence": 0.8, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Thigh L is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "pelvis", "attachment": {"parentSocket": "pelvis-hip-l", "localStart": [0.095, 0.0, 0.006], "localEnd": [0.095, -0.4515, 0.006], "contactType": "socket-joint", "baseRadius": 0.095, "endRadius": 0.076, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.19, "height": 0.4515, "depth": 0.19, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0.095, 0.0, 0.006], "rotation": [0.0, 0.0, 0.05236], "scale": [0.19, 0.4515, 0.19]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "thigh-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_thigh_l_44.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "thigh-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["pelvis"] ?? root).add(node_thigh_l_44);
  nodes["thigh-l"] = node_thigh_l_44;
  const mesh_thigh_l_44Geometry = endpoint_thigh_l_44
    ? new THREE.CylinderGeometry(endpoint_thigh_l_44.endRadius, endpoint_thigh_l_44.baseRadius, endpoint_thigh_l_44.length, 16, 6)
    : buildWatertightCapsule(0.35, 0.7, 8, 16, 1);
  if (!endpoint_thigh_l_44) {
    mesh_thigh_l_44Geometry.scale(0.19, 0.4515, 0.19);
  }
  const mesh_thigh_l_44 = new THREE.Mesh(
    mesh_thigh_l_44Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_thigh_l_44.name = "Thigh L";
  if (endpoint_thigh_l_44) {
    mesh_thigh_l_44.position.copy(endpoint_thigh_l_44.midpoint);
    mesh_thigh_l_44.quaternion.copy(endpoint_thigh_l_44.quaternion);
  }
  mesh_thigh_l_44.castShadow = options.castShadow ?? true;
  mesh_thigh_l_44.receiveShadow = options.receiveShadow ?? true;
  mesh_thigh_l_44.userData.sculptComponent = {"id": "thigh-l", "name": "Thigh L", "level": "macro", "role": "leg", "importance": 0.75, "confidence": 0.8, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Thigh L is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "pelvis", "attachment": {"parentSocket": "pelvis-hip-l", "localStart": [0.095, 0.0, 0.006], "localEnd": [0.095, -0.4515, 0.006], "contactType": "socket-joint", "baseRadius": 0.095, "endRadius": 0.076, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.19, "height": 0.4515, "depth": 0.19, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0.095, 0.0, 0.006], "rotation": [0.0, 0.0, 0.05236], "scale": [0.19, 0.4515, 0.19]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "thigh-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_thigh_l_44.add(mesh_thigh_l_44);
  meshes["thigh-l"] = mesh_thigh_l_44;
  colliders["thigh-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["thigh-l"] ??= [];
  destructionGroups["thigh-l"].push(node_thigh_l_44);

  const attachment_dhoti_leg_l_45 = {"parentSocket": "thigh-l-cloth-socket", "localStart": [0, -0.1, 0.004], "localEnd": [0, -0.4515, 0.004], "contactType": "wrap-overlap", "baseRadius": 0.125, "endRadius": 0.118, "overlap": 0.018, "embedDepth": 0.0, "gapTolerance": 0.006, "evidenceRefs": ["full-object"], "notes": "Cloth column following the thigh from the wrap to the knee. Offset outside the skin so the cloth never shares vertices with the limb it covers."};
  const endpoint_dhoti_leg_l_45 = makeAttachmentEndpoint(attachment_dhoti_leg_l_45);
  const node_dhoti_leg_l_45 = new THREE.Group();
  node_dhoti_leg_l_45.name = "Dhoti thigh column L__pivot";
  node_dhoti_leg_l_45.scale.set(1, 1, 1);
  if (endpoint_dhoti_leg_l_45) {
    node_dhoti_leg_l_45.position.copy(endpoint_dhoti_leg_l_45.start);
    node_dhoti_leg_l_45.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_dhoti_leg_l_45.position.set(0.0, -0.27575, 0.004);
    node_dhoti_leg_l_45.rotation.set(0.0, 0.0, 0.0);
  }
  node_dhoti_leg_l_45.userData.sculptComponent = {"id": "dhoti-leg-l", "name": "Dhoti thigh column L", "level": "meso", "role": "garment", "importance": 0.8, "confidence": 0.75, "primitive": "cylinder", "topologyClass": "conforming-shell", "topologyRationale": "Garment layer offset outside the skin surface; it follows the body it covers rather than being part of that body.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "thigh-l", "attachment": {"parentSocket": "thigh-l-cloth-socket", "localStart": [0, -0.1, 0.004], "localEnd": [0, -0.4515, 0.004], "contactType": "wrap-overlap", "baseRadius": 0.125, "endRadius": 0.118, "overlap": 0.018, "embedDepth": 0.0, "gapTolerance": 0.006, "evidenceRefs": ["full-object"], "notes": "Cloth column following the thigh from the wrap to the knee. Offset outside the skin so the cloth never shares vertices with the limb it covers."}, "dimensions": {"width": 0.25, "height": 0.3515, "depth": 0.235, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, -0.27575, 0.004], "rotation": [0.0, 0.0, 0.0], "scale": [0.25, 0.3515, 0.235]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dhoti-leg-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dhoti"}}, "material": "dhoti", "materialLayers": ["dhoti"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "dhoti-leg-l-read", "description": "Kachcha leg column, thigh portion. Parented to the thigh so it swings with it.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(232, 149, 28, 1.0)", "secondaryAlbedo": "rgba(245, 169, 46, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(245, 169, 46, 1.0)"}, {"position": 0.5, "color": "rgba(232, 149, 28, 1.0)"}, {"position": 1.0, "color": "rgba(185, 106, 8, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Matte woven cotton; sheen only at fold crests. Fold ramp crest #f5a92e -> mid #e8951c -> trough #b96a08."}};
  node_dhoti_leg_l_45.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dhoti-leg-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dhoti"}};
  (nodes["thigh-l"] ?? root).add(node_dhoti_leg_l_45);
  nodes["dhoti-leg-l"] = node_dhoti_leg_l_45;
  const mesh_dhoti_leg_l_45Geometry = endpoint_dhoti_leg_l_45
    ? new THREE.CylinderGeometry(endpoint_dhoti_leg_l_45.endRadius, endpoint_dhoti_leg_l_45.baseRadius, endpoint_dhoti_leg_l_45.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_dhoti_leg_l_45) {
    mesh_dhoti_leg_l_45Geometry.scale(0.25, 0.3515, 0.235);
  }
  const mesh_dhoti_leg_l_45 = new THREE.Mesh(
    mesh_dhoti_leg_l_45Geometry,
    materialMap["dhoti"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_dhoti_leg_l_45.name = "Dhoti thigh column L";
  if (endpoint_dhoti_leg_l_45) {
    mesh_dhoti_leg_l_45.position.copy(endpoint_dhoti_leg_l_45.midpoint);
    mesh_dhoti_leg_l_45.quaternion.copy(endpoint_dhoti_leg_l_45.quaternion);
  }
  mesh_dhoti_leg_l_45.castShadow = options.castShadow ?? true;
  mesh_dhoti_leg_l_45.receiveShadow = options.receiveShadow ?? true;
  mesh_dhoti_leg_l_45.userData.sculptComponent = {"id": "dhoti-leg-l", "name": "Dhoti thigh column L", "level": "meso", "role": "garment", "importance": 0.8, "confidence": 0.75, "primitive": "cylinder", "topologyClass": "conforming-shell", "topologyRationale": "Garment layer offset outside the skin surface; it follows the body it covers rather than being part of that body.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "thigh-l", "attachment": {"parentSocket": "thigh-l-cloth-socket", "localStart": [0, -0.1, 0.004], "localEnd": [0, -0.4515, 0.004], "contactType": "wrap-overlap", "baseRadius": 0.125, "endRadius": 0.118, "overlap": 0.018, "embedDepth": 0.0, "gapTolerance": 0.006, "evidenceRefs": ["full-object"], "notes": "Cloth column following the thigh from the wrap to the knee. Offset outside the skin so the cloth never shares vertices with the limb it covers."}, "dimensions": {"width": 0.25, "height": 0.3515, "depth": 0.235, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, -0.27575, 0.004], "rotation": [0.0, 0.0, 0.0], "scale": [0.25, 0.3515, 0.235]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dhoti-leg-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dhoti"}}, "material": "dhoti", "materialLayers": ["dhoti"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "dhoti-leg-l-read", "description": "Kachcha leg column, thigh portion. Parented to the thigh so it swings with it.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(232, 149, 28, 1.0)", "secondaryAlbedo": "rgba(245, 169, 46, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(245, 169, 46, 1.0)"}, {"position": 0.5, "color": "rgba(232, 149, 28, 1.0)"}, {"position": 1.0, "color": "rgba(185, 106, 8, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Matte woven cotton; sheen only at fold crests. Fold ramp crest #f5a92e -> mid #e8951c -> trough #b96a08."}};
  node_dhoti_leg_l_45.add(mesh_dhoti_leg_l_45);
  meshes["dhoti-leg-l"] = mesh_dhoti_leg_l_45;
  colliders["dhoti-leg-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["dhoti-leg-l"] ??= [];
  destructionGroups["dhoti-leg-l"].push(node_dhoti_leg_l_45);

  const attachment_shin_l_46 = {"parentSocket": "thigh-knee-l", "localStart": [0, -0.4515, 0], "localEnd": [0, -0.93672, 0], "contactType": "hinge-joint", "baseRadius": 0.074, "endRadius": 0.052, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]};
  const endpoint_shin_l_46 = makeAttachmentEndpoint(attachment_shin_l_46);
  const node_shin_l_46 = new THREE.Group();
  node_shin_l_46.name = "Shin L__pivot";
  node_shin_l_46.scale.set(1, 1, 1);
  if (endpoint_shin_l_46) {
    node_shin_l_46.position.copy(endpoint_shin_l_46.start);
    node_shin_l_46.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_shin_l_46.position.set(0.0, -0.4515, 0.0);
    node_shin_l_46.rotation.set(0.0, 0.0, 0.0);
  }
  node_shin_l_46.userData.sculptComponent = {"id": "shin-l", "name": "Shin L", "level": "meso", "role": "leg", "importance": 0.7, "confidence": 0.8, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Shin L is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "thigh-l", "attachment": {"parentSocket": "thigh-knee-l", "localStart": [0, -0.4515, 0], "localEnd": [0, -0.93672, 0], "contactType": "hinge-joint", "baseRadius": 0.074, "endRadius": 0.052, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.148, "height": 0.48522, "depth": 0.148, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, -0.4515, 0], "rotation": [0.0, 0.0, 0.0], "scale": [0.148, 0.48522, 0.148]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "shin-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_shin_l_46.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "shin-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["thigh-l"] ?? root).add(node_shin_l_46);
  nodes["shin-l"] = node_shin_l_46;
  const mesh_shin_l_46Geometry = endpoint_shin_l_46
    ? new THREE.CylinderGeometry(endpoint_shin_l_46.endRadius, endpoint_shin_l_46.baseRadius, endpoint_shin_l_46.length, 16, 6)
    : buildWatertightCapsule(0.35, 0.7, 8, 16, 1);
  if (!endpoint_shin_l_46) {
    mesh_shin_l_46Geometry.scale(0.148, 0.48522, 0.148);
  }
  const mesh_shin_l_46 = new THREE.Mesh(
    mesh_shin_l_46Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_shin_l_46.name = "Shin L";
  if (endpoint_shin_l_46) {
    mesh_shin_l_46.position.copy(endpoint_shin_l_46.midpoint);
    mesh_shin_l_46.quaternion.copy(endpoint_shin_l_46.quaternion);
  }
  mesh_shin_l_46.castShadow = options.castShadow ?? true;
  mesh_shin_l_46.receiveShadow = options.receiveShadow ?? true;
  mesh_shin_l_46.userData.sculptComponent = {"id": "shin-l", "name": "Shin L", "level": "meso", "role": "leg", "importance": 0.7, "confidence": 0.8, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Shin L is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "thigh-l", "attachment": {"parentSocket": "thigh-knee-l", "localStart": [0, -0.4515, 0], "localEnd": [0, -0.93672, 0], "contactType": "hinge-joint", "baseRadius": 0.074, "endRadius": 0.052, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.148, "height": 0.48522, "depth": 0.148, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, -0.4515, 0], "rotation": [0.0, 0.0, 0.0], "scale": [0.148, 0.48522, 0.148]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "shin-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_shin_l_46.add(mesh_shin_l_46);
  meshes["shin-l"] = mesh_shin_l_46;
  colliders["shin-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["shin-l"] ??= [];
  destructionGroups["shin-l"].push(node_shin_l_46);

  const attachment_dhoti_shin_l_47 = {"parentSocket": "shin-l-cloth-socket", "localStart": [0, 0.0, 0.004], "localEnd": [0, -0.35452, 0.004], "contactType": "wrap-overlap", "baseRadius": 0.118, "endRadius": 0.104, "overlap": 0.018, "embedDepth": 0.0, "gapTolerance": 0.006, "evidenceRefs": ["full-object"], "notes": "Cloth column from the knee to the measured hem. Offset outside the skin so the cloth never shares vertices with the limb it covers."};
  const endpoint_dhoti_shin_l_47 = makeAttachmentEndpoint(attachment_dhoti_shin_l_47);
  const node_dhoti_shin_l_47 = new THREE.Group();
  node_dhoti_shin_l_47.name = "Dhoti shin column L__pivot";
  node_dhoti_shin_l_47.scale.set(1, 1, 1);
  if (endpoint_dhoti_shin_l_47) {
    node_dhoti_shin_l_47.position.copy(endpoint_dhoti_shin_l_47.start);
    node_dhoti_shin_l_47.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_dhoti_shin_l_47.position.set(0.0, -0.17726, 0.004);
    node_dhoti_shin_l_47.rotation.set(0.0, 0.0, 0.0);
  }
  node_dhoti_shin_l_47.userData.sculptComponent = {"id": "dhoti-shin-l", "name": "Dhoti shin column L", "level": "meso", "role": "garment", "importance": 0.8, "confidence": 0.75, "primitive": "cylinder", "topologyClass": "conforming-shell", "topologyRationale": "Garment layer offset outside the skin surface; it follows the body it covers rather than being part of that body.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "shin-l", "attachment": {"parentSocket": "shin-l-cloth-socket", "localStart": [0, 0.0, 0.004], "localEnd": [0, -0.35452, 0.004], "contactType": "wrap-overlap", "baseRadius": 0.118, "endRadius": 0.104, "overlap": 0.018, "embedDepth": 0.0, "gapTolerance": 0.006, "evidenceRefs": ["full-object"], "notes": "Cloth column from the knee to the measured hem. Offset outside the skin so the cloth never shares vertices with the limb it covers."}, "dimensions": {"width": 0.235, "height": 0.35452, "depth": 0.215, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, -0.17726, 0.004], "rotation": [0.0, 0.0, 0.0], "scale": [0.235, 0.35452, 0.215]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dhoti-shin-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dhoti"}}, "material": "dhoti", "materialLayers": ["dhoti"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "dhoti-shin-l-read", "description": "Lower half of the leg column, knee to hem y=0.205. Split from the thigh portion so the cloth bends at the knee instead of letting the shin punch through it during the run cycle.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(232, 149, 28, 1.0)", "secondaryAlbedo": "rgba(245, 169, 46, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(245, 169, 46, 1.0)"}, {"position": 0.5, "color": "rgba(232, 149, 28, 1.0)"}, {"position": 1.0, "color": "rgba(185, 106, 8, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Matte woven cotton; sheen only at fold crests. Fold ramp crest #f5a92e -> mid #e8951c -> trough #b96a08."}};
  node_dhoti_shin_l_47.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dhoti-shin-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dhoti"}};
  (nodes["shin-l"] ?? root).add(node_dhoti_shin_l_47);
  nodes["dhoti-shin-l"] = node_dhoti_shin_l_47;
  const mesh_dhoti_shin_l_47Geometry = endpoint_dhoti_shin_l_47
    ? new THREE.CylinderGeometry(endpoint_dhoti_shin_l_47.endRadius, endpoint_dhoti_shin_l_47.baseRadius, endpoint_dhoti_shin_l_47.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_dhoti_shin_l_47) {
    mesh_dhoti_shin_l_47Geometry.scale(0.235, 0.35452, 0.215);
  }
  const mesh_dhoti_shin_l_47 = new THREE.Mesh(
    mesh_dhoti_shin_l_47Geometry,
    materialMap["dhoti"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_dhoti_shin_l_47.name = "Dhoti shin column L";
  if (endpoint_dhoti_shin_l_47) {
    mesh_dhoti_shin_l_47.position.copy(endpoint_dhoti_shin_l_47.midpoint);
    mesh_dhoti_shin_l_47.quaternion.copy(endpoint_dhoti_shin_l_47.quaternion);
  }
  mesh_dhoti_shin_l_47.castShadow = options.castShadow ?? true;
  mesh_dhoti_shin_l_47.receiveShadow = options.receiveShadow ?? true;
  mesh_dhoti_shin_l_47.userData.sculptComponent = {"id": "dhoti-shin-l", "name": "Dhoti shin column L", "level": "meso", "role": "garment", "importance": 0.8, "confidence": 0.75, "primitive": "cylinder", "topologyClass": "conforming-shell", "topologyRationale": "Garment layer offset outside the skin surface; it follows the body it covers rather than being part of that body.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "shin-l", "attachment": {"parentSocket": "shin-l-cloth-socket", "localStart": [0, 0.0, 0.004], "localEnd": [0, -0.35452, 0.004], "contactType": "wrap-overlap", "baseRadius": 0.118, "endRadius": 0.104, "overlap": 0.018, "embedDepth": 0.0, "gapTolerance": 0.006, "evidenceRefs": ["full-object"], "notes": "Cloth column from the knee to the measured hem. Offset outside the skin so the cloth never shares vertices with the limb it covers."}, "dimensions": {"width": 0.235, "height": 0.35452, "depth": 0.215, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, -0.17726, 0.004], "rotation": [0.0, 0.0, 0.0], "scale": [0.235, 0.35452, 0.215]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dhoti-shin-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dhoti"}}, "material": "dhoti", "materialLayers": ["dhoti"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "dhoti-shin-l-read", "description": "Lower half of the leg column, knee to hem y=0.205. Split from the thigh portion so the cloth bends at the knee instead of letting the shin punch through it during the run cycle.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(232, 149, 28, 1.0)", "secondaryAlbedo": "rgba(245, 169, 46, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(245, 169, 46, 1.0)"}, {"position": 0.5, "color": "rgba(232, 149, 28, 1.0)"}, {"position": 1.0, "color": "rgba(185, 106, 8, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Matte woven cotton; sheen only at fold crests. Fold ramp crest #f5a92e -> mid #e8951c -> trough #b96a08."}};
  node_dhoti_shin_l_47.add(mesh_dhoti_shin_l_47);
  meshes["dhoti-shin-l"] = mesh_dhoti_shin_l_47;
  colliders["dhoti-shin-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["dhoti-shin-l"] ??= [];
  destructionGroups["dhoti-shin-l"].push(node_dhoti_shin_l_47);

  const endpoint_foot_l_48 = makeAttachmentEndpoint(null);
  const node_foot_l_48 = new THREE.Group();
  node_foot_l_48.name = "Foot L__pivot";
  node_foot_l_48.scale.set(1, 1, 1);
  if (endpoint_foot_l_48) {
    node_foot_l_48.position.copy(endpoint_foot_l_48.start);
    node_foot_l_48.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_foot_l_48.position.set(0.0, -0.54186, 0.055);
    node_foot_l_48.rotation.set(0.0, 0.0, 0.0);
  }
  node_foot_l_48.userData.sculptComponent = {"id": "foot-l", "name": "Foot L", "level": "meso", "role": "foot", "importance": 0.5, "confidence": 0.8, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Foot L is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "shin-l", "attachment": null, "dimensions": {"width": 0.115, "height": 0.11328, "depth": 0.25, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, -0.54186, 0.055], "rotation": [0.0, 0.0, 0.0], "scale": [0.115, 0.11328, 0.25]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "foot-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_foot_l_48.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "foot-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["shin-l"] ?? root).add(node_foot_l_48);
  nodes["foot-l"] = node_foot_l_48;
  const mesh_foot_l_48Geometry = endpoint_foot_l_48
    ? new THREE.CylinderGeometry(endpoint_foot_l_48.endRadius, endpoint_foot_l_48.baseRadius, endpoint_foot_l_48.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_foot_l_48) {
    mesh_foot_l_48Geometry.scale(0.115, 0.11328, 0.25);
  }
  const mesh_foot_l_48 = new THREE.Mesh(
    mesh_foot_l_48Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_foot_l_48.name = "Foot L";
  if (endpoint_foot_l_48) {
    mesh_foot_l_48.position.copy(endpoint_foot_l_48.midpoint);
    mesh_foot_l_48.quaternion.copy(endpoint_foot_l_48.quaternion);
  }
  mesh_foot_l_48.castShadow = options.castShadow ?? true;
  mesh_foot_l_48.receiveShadow = options.receiveShadow ?? true;
  mesh_foot_l_48.userData.sculptComponent = {"id": "foot-l", "name": "Foot L", "level": "meso", "role": "foot", "importance": 0.5, "confidence": 0.8, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Foot L is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "shin-l", "attachment": null, "dimensions": {"width": 0.115, "height": 0.11328, "depth": 0.25, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, -0.54186, 0.055], "rotation": [0.0, 0.0, 0.0], "scale": [0.115, 0.11328, 0.25]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "foot-l", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_foot_l_48.add(mesh_foot_l_48);
  meshes["foot-l"] = mesh_foot_l_48;
  colliders["foot-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["foot-l"] ??= [];
  destructionGroups["foot-l"].push(node_foot_l_48);

  const attachment_thigh_r_49 = {"parentSocket": "pelvis-hip-r", "localStart": [-0.095, 0.0, 0.006], "localEnd": [-0.095, -0.4515, 0.006], "contactType": "socket-joint", "baseRadius": 0.095, "endRadius": 0.076, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]};
  const endpoint_thigh_r_49 = makeAttachmentEndpoint(attachment_thigh_r_49);
  const node_thigh_r_49 = new THREE.Group();
  node_thigh_r_49.name = "Thigh R__pivot";
  node_thigh_r_49.scale.set(1, 1, 1);
  if (endpoint_thigh_r_49) {
    node_thigh_r_49.position.copy(endpoint_thigh_r_49.start);
    node_thigh_r_49.rotation.set(0.0, 0.0, -0.05236);
  } else {
    node_thigh_r_49.position.set(-0.095, 0.0, 0.006);
    node_thigh_r_49.rotation.set(0.0, 0.0, -0.05236);
  }
  node_thigh_r_49.userData.sculptComponent = {"id": "thigh-r", "name": "Thigh R", "level": "macro", "role": "leg", "importance": 0.75, "confidence": 0.8, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Thigh R is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "pelvis", "attachment": {"parentSocket": "pelvis-hip-r", "localStart": [-0.095, 0.0, 0.006], "localEnd": [-0.095, -0.4515, 0.006], "contactType": "socket-joint", "baseRadius": 0.095, "endRadius": 0.076, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.19, "height": 0.4515, "depth": 0.19, "units": "world-units", "confidence": 0.8}, "transform": {"position": [-0.095, 0.0, 0.006], "rotation": [0.0, 0.0, -0.05236], "scale": [0.19, 0.4515, 0.19]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "thigh-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_thigh_r_49.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "thigh-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["pelvis"] ?? root).add(node_thigh_r_49);
  nodes["thigh-r"] = node_thigh_r_49;
  const mesh_thigh_r_49Geometry = endpoint_thigh_r_49
    ? new THREE.CylinderGeometry(endpoint_thigh_r_49.endRadius, endpoint_thigh_r_49.baseRadius, endpoint_thigh_r_49.length, 16, 6)
    : buildWatertightCapsule(0.35, 0.7, 8, 16, 1);
  if (!endpoint_thigh_r_49) {
    mesh_thigh_r_49Geometry.scale(0.19, 0.4515, 0.19);
  }
  const mesh_thigh_r_49 = new THREE.Mesh(
    mesh_thigh_r_49Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_thigh_r_49.name = "Thigh R";
  if (endpoint_thigh_r_49) {
    mesh_thigh_r_49.position.copy(endpoint_thigh_r_49.midpoint);
    mesh_thigh_r_49.quaternion.copy(endpoint_thigh_r_49.quaternion);
  }
  mesh_thigh_r_49.castShadow = options.castShadow ?? true;
  mesh_thigh_r_49.receiveShadow = options.receiveShadow ?? true;
  mesh_thigh_r_49.userData.sculptComponent = {"id": "thigh-r", "name": "Thigh R", "level": "macro", "role": "leg", "importance": 0.75, "confidence": 0.8, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Thigh R is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "pelvis", "attachment": {"parentSocket": "pelvis-hip-r", "localStart": [-0.095, 0.0, 0.006], "localEnd": [-0.095, -0.4515, 0.006], "contactType": "socket-joint", "baseRadius": 0.095, "endRadius": 0.076, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.19, "height": 0.4515, "depth": 0.19, "units": "world-units", "confidence": 0.8}, "transform": {"position": [-0.095, 0.0, 0.006], "rotation": [0.0, 0.0, -0.05236], "scale": [0.19, 0.4515, 0.19]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "thigh-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_thigh_r_49.add(mesh_thigh_r_49);
  meshes["thigh-r"] = mesh_thigh_r_49;
  colliders["thigh-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["thigh-r"] ??= [];
  destructionGroups["thigh-r"].push(node_thigh_r_49);

  const attachment_dhoti_leg_r_50 = {"parentSocket": "thigh-r-cloth-socket", "localStart": [0, -0.1, 0.004], "localEnd": [0, -0.4515, 0.004], "contactType": "wrap-overlap", "baseRadius": 0.125, "endRadius": 0.118, "overlap": 0.018, "embedDepth": 0.0, "gapTolerance": 0.006, "evidenceRefs": ["full-object"], "notes": "Mirror. Offset outside the skin so the cloth never shares vertices with the limb it covers."};
  const endpoint_dhoti_leg_r_50 = makeAttachmentEndpoint(attachment_dhoti_leg_r_50);
  const node_dhoti_leg_r_50 = new THREE.Group();
  node_dhoti_leg_r_50.name = "Dhoti thigh column R__pivot";
  node_dhoti_leg_r_50.scale.set(1, 1, 1);
  if (endpoint_dhoti_leg_r_50) {
    node_dhoti_leg_r_50.position.copy(endpoint_dhoti_leg_r_50.start);
    node_dhoti_leg_r_50.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_dhoti_leg_r_50.position.set(0.0, -0.27575, 0.004);
    node_dhoti_leg_r_50.rotation.set(0.0, 0.0, 0.0);
  }
  node_dhoti_leg_r_50.userData.sculptComponent = {"id": "dhoti-leg-r", "name": "Dhoti thigh column R", "level": "meso", "role": "garment", "importance": 0.8, "confidence": 0.75, "primitive": "cylinder", "topologyClass": "conforming-shell", "topologyRationale": "Garment layer offset outside the skin surface; it follows the body it covers rather than being part of that body.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "thigh-r", "attachment": {"parentSocket": "thigh-r-cloth-socket", "localStart": [0, -0.1, 0.004], "localEnd": [0, -0.4515, 0.004], "contactType": "wrap-overlap", "baseRadius": 0.125, "endRadius": 0.118, "overlap": 0.018, "embedDepth": 0.0, "gapTolerance": 0.006, "evidenceRefs": ["full-object"], "notes": "Mirror. Offset outside the skin so the cloth never shares vertices with the limb it covers."}, "dimensions": {"width": 0.25, "height": 0.3515, "depth": 0.235, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, -0.27575, 0.004], "rotation": [0.0, 0.0, 0.0], "scale": [0.25, 0.3515, 0.235]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dhoti-leg-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dhoti"}}, "material": "dhoti", "materialLayers": ["dhoti"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "dhoti-leg-r-read", "description": "Mirror of dhoti-leg-l.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(232, 149, 28, 1.0)", "secondaryAlbedo": "rgba(245, 169, 46, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(245, 169, 46, 1.0)"}, {"position": 0.5, "color": "rgba(232, 149, 28, 1.0)"}, {"position": 1.0, "color": "rgba(185, 106, 8, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Matte woven cotton; sheen only at fold crests. Fold ramp crest #f5a92e -> mid #e8951c -> trough #b96a08."}};
  node_dhoti_leg_r_50.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dhoti-leg-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dhoti"}};
  (nodes["thigh-r"] ?? root).add(node_dhoti_leg_r_50);
  nodes["dhoti-leg-r"] = node_dhoti_leg_r_50;
  const mesh_dhoti_leg_r_50Geometry = endpoint_dhoti_leg_r_50
    ? new THREE.CylinderGeometry(endpoint_dhoti_leg_r_50.endRadius, endpoint_dhoti_leg_r_50.baseRadius, endpoint_dhoti_leg_r_50.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_dhoti_leg_r_50) {
    mesh_dhoti_leg_r_50Geometry.scale(0.25, 0.3515, 0.235);
  }
  const mesh_dhoti_leg_r_50 = new THREE.Mesh(
    mesh_dhoti_leg_r_50Geometry,
    materialMap["dhoti"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_dhoti_leg_r_50.name = "Dhoti thigh column R";
  if (endpoint_dhoti_leg_r_50) {
    mesh_dhoti_leg_r_50.position.copy(endpoint_dhoti_leg_r_50.midpoint);
    mesh_dhoti_leg_r_50.quaternion.copy(endpoint_dhoti_leg_r_50.quaternion);
  }
  mesh_dhoti_leg_r_50.castShadow = options.castShadow ?? true;
  mesh_dhoti_leg_r_50.receiveShadow = options.receiveShadow ?? true;
  mesh_dhoti_leg_r_50.userData.sculptComponent = {"id": "dhoti-leg-r", "name": "Dhoti thigh column R", "level": "meso", "role": "garment", "importance": 0.8, "confidence": 0.75, "primitive": "cylinder", "topologyClass": "conforming-shell", "topologyRationale": "Garment layer offset outside the skin surface; it follows the body it covers rather than being part of that body.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "thigh-r", "attachment": {"parentSocket": "thigh-r-cloth-socket", "localStart": [0, -0.1, 0.004], "localEnd": [0, -0.4515, 0.004], "contactType": "wrap-overlap", "baseRadius": 0.125, "endRadius": 0.118, "overlap": 0.018, "embedDepth": 0.0, "gapTolerance": 0.006, "evidenceRefs": ["full-object"], "notes": "Mirror. Offset outside the skin so the cloth never shares vertices with the limb it covers."}, "dimensions": {"width": 0.25, "height": 0.3515, "depth": 0.235, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, -0.27575, 0.004], "rotation": [0.0, 0.0, 0.0], "scale": [0.25, 0.3515, 0.235]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dhoti-leg-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dhoti"}}, "material": "dhoti", "materialLayers": ["dhoti"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "dhoti-leg-r-read", "description": "Mirror of dhoti-leg-l.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(232, 149, 28, 1.0)", "secondaryAlbedo": "rgba(245, 169, 46, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(245, 169, 46, 1.0)"}, {"position": 0.5, "color": "rgba(232, 149, 28, 1.0)"}, {"position": 1.0, "color": "rgba(185, 106, 8, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Matte woven cotton; sheen only at fold crests. Fold ramp crest #f5a92e -> mid #e8951c -> trough #b96a08."}};
  node_dhoti_leg_r_50.add(mesh_dhoti_leg_r_50);
  meshes["dhoti-leg-r"] = mesh_dhoti_leg_r_50;
  colliders["dhoti-leg-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["dhoti-leg-r"] ??= [];
  destructionGroups["dhoti-leg-r"].push(node_dhoti_leg_r_50);

  const attachment_shin_r_51 = {"parentSocket": "thigh-knee-r", "localStart": [0, -0.4515, 0], "localEnd": [0, -0.93672, 0], "contactType": "hinge-joint", "baseRadius": 0.074, "endRadius": 0.052, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]};
  const endpoint_shin_r_51 = makeAttachmentEndpoint(attachment_shin_r_51);
  const node_shin_r_51 = new THREE.Group();
  node_shin_r_51.name = "Shin R__pivot";
  node_shin_r_51.scale.set(1, 1, 1);
  if (endpoint_shin_r_51) {
    node_shin_r_51.position.copy(endpoint_shin_r_51.start);
    node_shin_r_51.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_shin_r_51.position.set(0.0, -0.4515, 0.0);
    node_shin_r_51.rotation.set(0.0, 0.0, 0.0);
  }
  node_shin_r_51.userData.sculptComponent = {"id": "shin-r", "name": "Shin R", "level": "meso", "role": "leg", "importance": 0.7, "confidence": 0.8, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Shin R is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "thigh-r", "attachment": {"parentSocket": "thigh-knee-r", "localStart": [0, -0.4515, 0], "localEnd": [0, -0.93672, 0], "contactType": "hinge-joint", "baseRadius": 0.074, "endRadius": 0.052, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.148, "height": 0.48522, "depth": 0.148, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, -0.4515, 0], "rotation": [0.0, 0.0, 0.0], "scale": [0.148, 0.48522, 0.148]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "shin-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_shin_r_51.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "shin-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["thigh-r"] ?? root).add(node_shin_r_51);
  nodes["shin-r"] = node_shin_r_51;
  const mesh_shin_r_51Geometry = endpoint_shin_r_51
    ? new THREE.CylinderGeometry(endpoint_shin_r_51.endRadius, endpoint_shin_r_51.baseRadius, endpoint_shin_r_51.length, 16, 6)
    : buildWatertightCapsule(0.35, 0.7, 8, 16, 1);
  if (!endpoint_shin_r_51) {
    mesh_shin_r_51Geometry.scale(0.148, 0.48522, 0.148);
  }
  const mesh_shin_r_51 = new THREE.Mesh(
    mesh_shin_r_51Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_shin_r_51.name = "Shin R";
  if (endpoint_shin_r_51) {
    mesh_shin_r_51.position.copy(endpoint_shin_r_51.midpoint);
    mesh_shin_r_51.quaternion.copy(endpoint_shin_r_51.quaternion);
  }
  mesh_shin_r_51.castShadow = options.castShadow ?? true;
  mesh_shin_r_51.receiveShadow = options.receiveShadow ?? true;
  mesh_shin_r_51.userData.sculptComponent = {"id": "shin-r", "name": "Shin R", "level": "meso", "role": "leg", "importance": 0.7, "confidence": 0.8, "primitive": "capsule", "topologyClass": "assembled-solid", "topologyRationale": "Shin R is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "thigh-r", "attachment": {"parentSocket": "thigh-knee-r", "localStart": [0, -0.4515, 0], "localEnd": [0, -0.93672, 0], "contactType": "hinge-joint", "baseRadius": 0.074, "endRadius": 0.052, "embedDepth": 0.03, "gapTolerance": 0.01, "evidenceRefs": ["full-object"]}, "dimensions": {"width": 0.148, "height": 0.48522, "depth": 0.148, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, -0.4515, 0], "rotation": [0.0, 0.0, 0.0], "scale": [0.148, 0.48522, 0.148]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "shin-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_shin_r_51.add(mesh_shin_r_51);
  meshes["shin-r"] = mesh_shin_r_51;
  colliders["shin-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["shin-r"] ??= [];
  destructionGroups["shin-r"].push(node_shin_r_51);

  const attachment_dhoti_shin_r_52 = {"parentSocket": "shin-r-cloth-socket", "localStart": [0, 0.0, 0.004], "localEnd": [0, -0.35452, 0.004], "contactType": "wrap-overlap", "baseRadius": 0.118, "endRadius": 0.104, "overlap": 0.018, "embedDepth": 0.0, "gapTolerance": 0.006, "evidenceRefs": ["full-object"], "notes": "Mirror. Offset outside the skin so the cloth never shares vertices with the limb it covers."};
  const endpoint_dhoti_shin_r_52 = makeAttachmentEndpoint(attachment_dhoti_shin_r_52);
  const node_dhoti_shin_r_52 = new THREE.Group();
  node_dhoti_shin_r_52.name = "Dhoti shin column R__pivot";
  node_dhoti_shin_r_52.scale.set(1, 1, 1);
  if (endpoint_dhoti_shin_r_52) {
    node_dhoti_shin_r_52.position.copy(endpoint_dhoti_shin_r_52.start);
    node_dhoti_shin_r_52.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_dhoti_shin_r_52.position.set(0.0, -0.17726, 0.004);
    node_dhoti_shin_r_52.rotation.set(0.0, 0.0, 0.0);
  }
  node_dhoti_shin_r_52.userData.sculptComponent = {"id": "dhoti-shin-r", "name": "Dhoti shin column R", "level": "meso", "role": "garment", "importance": 0.8, "confidence": 0.75, "primitive": "cylinder", "topologyClass": "conforming-shell", "topologyRationale": "Garment layer offset outside the skin surface; it follows the body it covers rather than being part of that body.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "shin-r", "attachment": {"parentSocket": "shin-r-cloth-socket", "localStart": [0, 0.0, 0.004], "localEnd": [0, -0.35452, 0.004], "contactType": "wrap-overlap", "baseRadius": 0.118, "endRadius": 0.104, "overlap": 0.018, "embedDepth": 0.0, "gapTolerance": 0.006, "evidenceRefs": ["full-object"], "notes": "Mirror. Offset outside the skin so the cloth never shares vertices with the limb it covers."}, "dimensions": {"width": 0.235, "height": 0.35452, "depth": 0.215, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, -0.17726, 0.004], "rotation": [0.0, 0.0, 0.0], "scale": [0.235, 0.35452, 0.215]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dhoti-shin-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dhoti"}}, "material": "dhoti", "materialLayers": ["dhoti"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "dhoti-shin-r-read", "description": "Mirror of dhoti-shin-l.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(232, 149, 28, 1.0)", "secondaryAlbedo": "rgba(245, 169, 46, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(245, 169, 46, 1.0)"}, {"position": 0.5, "color": "rgba(232, 149, 28, 1.0)"}, {"position": 1.0, "color": "rgba(185, 106, 8, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Matte woven cotton; sheen only at fold crests. Fold ramp crest #f5a92e -> mid #e8951c -> trough #b96a08."}};
  node_dhoti_shin_r_52.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dhoti-shin-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dhoti"}};
  (nodes["shin-r"] ?? root).add(node_dhoti_shin_r_52);
  nodes["dhoti-shin-r"] = node_dhoti_shin_r_52;
  const mesh_dhoti_shin_r_52Geometry = endpoint_dhoti_shin_r_52
    ? new THREE.CylinderGeometry(endpoint_dhoti_shin_r_52.endRadius, endpoint_dhoti_shin_r_52.baseRadius, endpoint_dhoti_shin_r_52.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_dhoti_shin_r_52) {
    mesh_dhoti_shin_r_52Geometry.scale(0.235, 0.35452, 0.215);
  }
  const mesh_dhoti_shin_r_52 = new THREE.Mesh(
    mesh_dhoti_shin_r_52Geometry,
    materialMap["dhoti"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_dhoti_shin_r_52.name = "Dhoti shin column R";
  if (endpoint_dhoti_shin_r_52) {
    mesh_dhoti_shin_r_52.position.copy(endpoint_dhoti_shin_r_52.midpoint);
    mesh_dhoti_shin_r_52.quaternion.copy(endpoint_dhoti_shin_r_52.quaternion);
  }
  mesh_dhoti_shin_r_52.castShadow = options.castShadow ?? true;
  mesh_dhoti_shin_r_52.receiveShadow = options.receiveShadow ?? true;
  mesh_dhoti_shin_r_52.userData.sculptComponent = {"id": "dhoti-shin-r", "name": "Dhoti shin column R", "level": "meso", "role": "garment", "importance": 0.8, "confidence": 0.75, "primitive": "cylinder", "topologyClass": "conforming-shell", "topologyRationale": "Garment layer offset outside the skin surface; it follows the body it covers rather than being part of that body.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "shin-r", "attachment": {"parentSocket": "shin-r-cloth-socket", "localStart": [0, 0.0, 0.004], "localEnd": [0, -0.35452, 0.004], "contactType": "wrap-overlap", "baseRadius": 0.118, "endRadius": 0.104, "overlap": 0.018, "embedDepth": 0.0, "gapTolerance": 0.006, "evidenceRefs": ["full-object"], "notes": "Mirror. Offset outside the skin so the cloth never shares vertices with the limb it covers."}, "dimensions": {"width": 0.235, "height": 0.35452, "depth": 0.215, "units": "world-units", "confidence": 0.75}, "transform": {"position": [0, -0.17726, 0.004], "rotation": [0.0, 0.0, 0.0], "scale": [0.235, 0.35452, 0.215]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "dhoti-shin-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "dhoti"}}, "material": "dhoti", "materialLayers": ["dhoti"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "dhoti-shin-r-read", "description": "Mirror of dhoti-shin-l.", "scale": "meso", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(232, 149, 28, 1.0)", "secondaryAlbedo": "rgba(245, 169, 46, 1.0)", "materialClass": "fabric", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(245, 169, 46, 1.0)"}, {"position": 0.5, "color": "rgba(232, 149, 28, 1.0)"}, {"position": 1.0, "color": "rgba(185, 106, 8, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Matte woven cotton; sheen only at fold crests. Fold ramp crest #f5a92e -> mid #e8951c -> trough #b96a08."}};
  node_dhoti_shin_r_52.add(mesh_dhoti_shin_r_52);
  meshes["dhoti-shin-r"] = mesh_dhoti_shin_r_52;
  colliders["dhoti-shin-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["dhoti-shin-r"] ??= [];
  destructionGroups["dhoti-shin-r"].push(node_dhoti_shin_r_52);

  const endpoint_foot_r_53 = makeAttachmentEndpoint(null);
  const node_foot_r_53 = new THREE.Group();
  node_foot_r_53.name = "Foot R__pivot";
  node_foot_r_53.scale.set(1, 1, 1);
  if (endpoint_foot_r_53) {
    node_foot_r_53.position.copy(endpoint_foot_r_53.start);
    node_foot_r_53.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_foot_r_53.position.set(0.0, -0.54186, 0.055);
    node_foot_r_53.rotation.set(0.0, 0.0, 0.0);
  }
  node_foot_r_53.userData.sculptComponent = {"id": "foot-r", "name": "Foot R", "level": "meso", "role": "foot", "importance": 0.5, "confidence": 0.8, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Foot R is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "shin-r", "attachment": null, "dimensions": {"width": 0.115, "height": 0.11328, "depth": 0.25, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, -0.54186, 0.055], "rotation": [0.0, 0.0, 0.0], "scale": [0.115, 0.11328, 0.25]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "foot-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_foot_r_53.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "foot-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}};
  (nodes["shin-r"] ?? root).add(node_foot_r_53);
  nodes["foot-r"] = node_foot_r_53;
  const mesh_foot_r_53Geometry = endpoint_foot_r_53
    ? new THREE.CylinderGeometry(endpoint_foot_r_53.endRadius, endpoint_foot_r_53.baseRadius, endpoint_foot_r_53.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_foot_r_53) {
    mesh_foot_r_53Geometry.scale(0.115, 0.11328, 0.25);
  }
  const mesh_foot_r_53 = new THREE.Mesh(
    mesh_foot_r_53Geometry,
    materialMap["skin"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_foot_r_53.name = "Foot R";
  if (endpoint_foot_r_53) {
    mesh_foot_r_53.position.copy(endpoint_foot_r_53.midpoint);
    mesh_foot_r_53.quaternion.copy(endpoint_foot_r_53.quaternion);
  }
  mesh_foot_r_53.castShadow = options.castShadow ?? true;
  mesh_foot_r_53.receiveShadow = options.receiveShadow ?? true;
  mesh_foot_r_53.userData.sculptComponent = {"id": "foot-r", "name": "Foot R", "level": "meso", "role": "foot", "importance": 0.5, "confidence": 0.8, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Foot R is a discrete primitive body part assembled onto the humanoid rig, not a continuous sculpt or shell.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "shin-r", "attachment": null, "dimensions": {"width": 0.115, "height": 0.11328, "depth": 0.25, "units": "world-units", "confidence": 0.8}, "transform": {"position": [0, -0.54186, 0.055], "rotation": [0.0, 0.0, 0.0], "scale": [0.115, 0.11328, 0.25]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "foot-r", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "skin"}}, "material": "skin", "materialLayers": ["skin"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0.0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(196, 121, 72, 1.0)", "secondaryAlbedo": "rgba(217, 154, 108, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.8, "colorGradient": {"type": "linear", "stops": [{"position": 0.0, "color": "rgba(217, 154, 108, 1.0)"}, {"position": 0.5, "color": "rgba(196, 121, 72, 1.0)"}, {"position": 1.0, "color": "rgba(169, 103, 60, 1.0)"}], "axis": "surface-normal-elevation"}, "evidenceRefs": ["full-object"], "notes": "Warm tan. The deltoid/spine highlight in the reference is a LIGHTING response and is deliberately not baked into albedo."}};
  node_foot_r_53.add(mesh_foot_r_53);
  meshes["foot-r"] = mesh_foot_r_53;
  colliders["foot-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["foot-r"] ??= [];
  destructionGroups["foot-r"].push(node_foot_r_53);

  // standProud: hold these components outside the surfaces they cover.
  // SKIPPED necklace: standProud target 'neck' (primitive 'cylinder') exposes no ring stack to stand proud of
  if (meshes["janeu"] && nodes["chest"]) {
    applyStandProud(
      meshes["janeu"].geometry,
      meshes["janeu"],
      nodes["chest"],
      {"rings": [[-0.15, 4.6500000000000005e-05, 2.5e-05, 0.0], [-0.1250001, 0.128519025, 0.06909625, 0.0], [-0.09999989999999999, 0.17329527, 0.0931695, 0.0], [-0.075, 0.201351045, 0.10825325, 0.0], [-0.0500001, 0.21920332500000003, 0.11785125, 0.0], [-0.024999900000000002, 0.229248255, 0.12325175, 0.0], [0.0, 0.2325, 0.125, 0.0], [0.024999900000000002, 0.229248255, 0.12325175, 0.0], [0.0500001, 0.21920332500000003, 0.11785125, 0.0], [0.075, 0.201351045, 0.10825325, 0.0], [0.09999989999999999, 0.17329527, 0.0931695, 0.0], [0.1250001, 0.128519025, 0.06909625, 0.0], [0.15, 4.6500000000000005e-05, 2.5e-05, 0.0]]},
      0.012,
      0.035,
    );
  }
  if (meshes["necklace-lower"] && nodes["chest"]) {
    applyStandProud(
      meshes["necklace-lower"].geometry,
      meshes["necklace-lower"],
      nodes["chest"],
      {"rings": [[-0.15, 4.6500000000000005e-05, 2.5e-05, 0.0], [-0.1250001, 0.128519025, 0.06909625, 0.0], [-0.09999989999999999, 0.17329527, 0.0931695, 0.0], [-0.075, 0.201351045, 0.10825325, 0.0], [-0.0500001, 0.21920332500000003, 0.11785125, 0.0], [-0.024999900000000002, 0.229248255, 0.12325175, 0.0], [0.0, 0.2325, 0.125, 0.0], [0.024999900000000002, 0.229248255, 0.12325175, 0.0], [0.0500001, 0.21920332500000003, 0.11785125, 0.0], [0.075, 0.201351045, 0.10825325, 0.0], [0.09999989999999999, 0.17329527, 0.0931695, 0.0], [0.1250001, 0.128519025, 0.06909625, 0.0], [0.15, 4.6500000000000005e-05, 2.5e-05, 0.0]]},
      0.01,
      0.03,
    );
  }
  if (meshes["bun"] && nodes["head"]) {
    applyStandProud(
      meshes["bun"].geometry,
      meshes["bun"],
      nodes["head"],
      {"rings": [[-0.132885, 2.3091000000000003e-05, 2.6141e-05, 0.0], [-0.11073758859, 0.06382006035, 0.07224980284999999, 0.0], [-0.08858991141, 0.08605507698, 0.09742175598, 0.0], [-0.0664425, 0.09998703183, 0.11319392832999998, 0.0], [-0.044295088590000004, 0.10885212855000001, 0.12322998104999999, 0.0], [-0.02214741141, 0.11384024637, 0.12887695986999997, 0.0], [0.0, 0.115455, 0.130705, 0.0], [0.02214741141, 0.11384024637, 0.12887695986999997, 0.0], [0.044295088590000004, 0.10885212855000001, 0.12322998104999999, 0.0], [0.0664425, 0.09998703183, 0.11319392832999998, 0.0], [0.08858991141, 0.08605507698, 0.09742175598, 0.0], [0.11073758859, 0.06382006035, 0.07224980284999999, 0.0], [0.132885, 2.3091000000000003e-05, 2.6141e-05, 0.0]]},
      0.01,
      0.016,
    );
  }
  if (meshes["hair"] && nodes["head"]) {
    applyStandProud(
      meshes["hair"].geometry,
      meshes["hair"],
      nodes["head"],
      {"rings": [[-0.132885, 2.3091000000000003e-05, 2.6141e-05, 0.0], [-0.11073758859, 0.06382006035, 0.07224980284999999, 0.0], [-0.08858991141, 0.08605507698, 0.09742175598, 0.0], [-0.0664425, 0.09998703183, 0.11319392832999998, 0.0], [-0.044295088590000004, 0.10885212855000001, 0.12322998104999999, 0.0], [-0.02214741141, 0.11384024637, 0.12887695986999997, 0.0], [0.0, 0.115455, 0.130705, 0.0], [0.02214741141, 0.11384024637, 0.12887695986999997, 0.0], [0.044295088590000004, 0.10885212855000001, 0.12322998104999999, 0.0], [0.0664425, 0.09998703183, 0.11319392832999998, 0.0], [0.08858991141, 0.08605507698, 0.09742175598, 0.0], [0.11073758859, 0.06382006035, 0.07224980284999999, 0.0], [0.132885, 2.3091000000000003e-05, 2.6141e-05, 0.0]]},
      0.014,
      0.02,
    );
  }

  root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups } satisfies ProceduralModelRuntime;
  root.userData.lookDevTargets = {"qualityPriority": "reference-fidelity", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry"}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  root.userData.actionReadiness = {
    note: 'Use root.userData.sculptRuntime.nodes for transforms, sockets for attachments, colliders for physics proxies, and destructionGroups for breakable sets.',
  };
  return root;
}

export function createNagaLokaDevoteeWarriorLookDevLights(
  mode: 'neutral' | 'grazing' | 'reference' = 'neutral',
): THREE.Group {
  const lights = new THREE.Group();
  lights.name = "Naga Loka Devotee Warrior look-dev lights";
  const hemi = new THREE.HemisphereLight(
    mode === 'reference' ? 0xfff0d6 : 0xf2f4ff,
    0x363b42,
    mode === 'grazing' ? 0.28 : mode === 'reference' ? 0.72 : 0.85,
  );
  lights.add(hemi);
  const key = new THREE.DirectionalLight(
    mode === 'reference' ? 0xffcf8a : 0xfff4e8,
    mode === 'grazing' ? 4.2 : mode === 'reference' ? 2.6 : 2.15,
  );
  if (mode === 'grazing') key.position.set(7.5, 1.1, 4.0);
  else if (mode === 'reference') key.position.set(-4.5, 7.5, 5.0);
  else key.position.set(-4.0, 6.0, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 7;
  key.shadow.blurSamples = 24;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = -2.6;
  key.shadow.camera.right = 2.6;
  key.shadow.camera.top = 2.6;
  key.shadow.camera.bottom = -2.6;
  key.shadow.camera.updateProjectionMatrix();
  lights.add(key);
  const fill = new THREE.DirectionalLight(0xa8c4ff, mode === 'grazing' ? 0.12 : 0.42);
  fill.position.set(4.0, 3.0, 3.5);
  lights.add(fill);
  const rim = new THREE.DirectionalLight(0xfff1c4, mode === 'grazing' ? 0.28 : 0.85);
  rim.position.set(0.5, 4.5, -6.0);
  lights.add(rim);
  lights.userData.reviewMode = mode;
  lights.userData.lightingFromPhoto = [{"id": "key", "role": "key", "type": "directional", "directionFromSubject": [-0.45, 0.78, 0.44], "color": "#fff3e0", "intensity": 1.0, "evidence": "Highlights sit on the upper-left of the deltoids, the left cheek and the left face of the dhoti folds; cast shadow falls down-right.", "confidence": 0.75}, {"id": "fill", "role": "fill", "type": "hemisphere", "directionFromSubject": [0.55, 0.3, 0.3], "color": "#9fb4c8", "intensity": 0.35, "evidence": "Shadow side of the torso stays readable and reads cool against the warm key, so the fill is a cool ambient rather than a second lamp.", "confidence": 0.7}, {"id": "rim", "role": "rim", "type": "directional", "directionFromSubject": [0.2, 0.35, -0.91], "color": "#ffd9a0", "intensity": 0.55, "evidence": "A warm separation edge runs down the outer arm and the hair mass in the back view, which is what lifts the figure off the flat grey panel.", "confidence": 0.65}, {"id": "environment", "role": "environment", "type": "flat-studio", "color": "#6a6a6a", "intensity": 0.25, "evidence": "Panel background is a flat neutral grey (106,106,106) with no visible environment reflection, so there is no HDRI content to recover.", "confidence": 0.9, "toneMapping": "ACES filmic, exposure 1.0. The sheet is a flat cel render with no blown highlights, so exposure is neutral and the tone curve only needs to keep the saffron from clipping.", "shadow": "Contact shadow / ambient occlusion under the arches of the feet, beneath the dhoti hem and in the neck-to-trapezius crease. The reference shows a soft ground shadow directly under the figure, not a hard cast, so a contact-hardening AO term reads closer than a shadow map at this scale."}];
  lights.userData.lookDevTargets = {"qualityPriority": "reference-fidelity", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry"}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  return lights;
}

// PBR materials (clearcoat/iridescence/transmission/anisotropy) need an environment
// map to visually behave as intended — call this once per renderer and assign the
// result to scene.environment before rendering. No external HDR asset required.
export function createNagaLokaDevoteeWarriorEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}

// Plan 1.3 §3.2 — auto-framing by bounding box. The Divine Eye can only compare a
// render to the reference if the object is FRAMED consistently (an object framed
// differently scores as wrong even when its shape is right). This positions the camera
// deterministically from the object's bounding box so it fills the frame at a stable
// margin, and sets near/far to the object scale. Call after adding the model to the
// scene, and again on resize (after updating camera.aspect).
export function frameNagaLokaDevoteeWarriorCamera(
  camera: THREE.PerspectiveCamera,
  object: THREE.Object3D,
  options: { margin?: number; azimuthDeg?: number; elevationDeg?: number } = {},
): void {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const margin = options.margin ?? 1.15;
  const maxDim = Math.max(size.x, size.y, size.z) * margin;
  const fov = (camera.fov * Math.PI) / 180;
  // distance so the largest object dimension fits vertically in the frame
  const distance = (maxDim / 2) / Math.tan(fov / 2);
  const az = ((options.azimuthDeg ?? 0) * Math.PI) / 180;
  const el = ((options.elevationDeg ?? 0) * Math.PI) / 180;
  const dir = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  );
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.near = Math.max(0.01, distance - maxDim);
  camera.far = distance + maxDim * 2;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

// Plan 1.3 §3.2c — PRESENTATION composer (DOF + bloom). CRITICAL (R-POSTFX): this is
// for the showcase/hero render ONLY. The Divine Eye's EVALUATION render MUST use a
// plain renderer with NO composer — bloom blows highlights and DOF blurs edges, which
// would corrupt the deterministic IoU/DCD/edge/blowout signals. Enable dof/bloom ONLY
// when the reference photo actually exhibits them (detect_reference_effects.py authorizes).
export function createNagaLokaDevoteeWarriorPresentationComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: { dof?: boolean; bloom?: boolean; bloomStrength?: number; dofFocus?: number; dofAperture?: number } = {},
): EffectComposer {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (options.dof) {
    composer.addPass(new BokehPass(scene, camera, {
      focus: options.dofFocus ?? 10.0,
      aperture: options.dofAperture ?? 0.0002,
      maxblur: 0.01,
    }));
  }
  if (options.bloom) {
    const size = new THREE.Vector2();
    renderer.getSize(size);
    composer.addPass(new UnrealBloomPass(size, options.bloomStrength ?? 0.4, 0.4, 0.85));
  }
  return composer;
}

export function configureNagaLokaDevoteeWarriorRenderer(renderer: THREE.WebGLRenderer): void {
  // Load-bearing for view-dependent finishes (anodized / Doppler): without ACES + sRGB
  // the environment reflection reads flat/washed instead of a believable metal response.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

export function createNagaLokaDevoteeWarriorInspectControls(
  camera: THREE.Camera,
  domElement: HTMLElement,
): OrbitControls {
  // View-dependent finishes only read correctly once the user orbits — their color
  // comes from the environment reflection, not albedo, so free rotation matters here.
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.minDistance = 1.0;
  controls.maxDistance = 8.0;
  controls.autoRotate = false;
  return controls;
}
