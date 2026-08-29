// Procedural character sculpting kit: signed-distance sculpts polygonised with
// marching cubes, welded, skinned and ambient-occluded - all at build time.
//
// WHY THIS EXISTS. Primitive-assembled characters read as robots because every
// limb is a separate closed surface: a seam at every joint, and no muscle
// flowing into muscle. Character pipelines solve this with ONE continuous
// surface bent by a skeleton. This module brings that structure to a code-only
// pipeline:
//
//   - the body is authored as blended SDF volumes, so muscles are modelled
//     rather than approximated with stacked capsules;
//   - marching cubes turns the field into a single seamless mesh;
//   - a purpose-built skinning pass weights it to bones. The naive approach
//     (pure spatial falloff) smears arms into ribcages - the fix here is
//     nearest-bone assignment with blending allowed ONLY between anatomically
//     adjacent bones, which is why an armpit deforms and a lat does not fly
//     off with the arm.
//
// Everything runs once, behind the splash screen. At runtime the result is an
// ordinary THREE.SkinnedMesh; the GPU does the bending for free.

import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* -------------------------------------------------------------- primitives */
// Each primitive carries an AABB (so field stamping only visits voxels it can
// affect) and a world-space distance function.

export function orb(x, y, z, r) {
  return {
    aabb: [x - r, y - r, z - r, x + r, y + r, z + r],
    dist(px, py, pz) {
      const dx = px - x, dy = py - y, dz = pz - z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
    },
  };
}

// Ellipsoid via the scaled-space approximation - exact enough for organic
// blobs that get blended into other volumes anyway.
export function blob(x, y, z, rx, ry, rz) {
  const m = Math.min(rx, ry, rz);
  return {
    aabb: [x - rx, y - ry, z - rz, x + rx, y + ry, z + rz],
    dist(px, py, pz) {
      const dx = (px - x) / rx, dy = (py - y) / ry, dz = (pz - z) / rz;
      return (Math.sqrt(dx * dx + dy * dy + dz * dz) - 1) * m;
    },
  };
}

// A limb segment: a capsule whose radius changes from one end to the other,
// so a thigh can be thick at the hip and narrow into the knee.
export function tube(ax, ay, az, bx, by, bz, ra, rb) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len2 = dx * dx + dy * dy + dz * dz || 1e-9;
  const rmax = Math.max(ra, rb);
  return {
    aabb: [
      Math.min(ax, bx) - rmax, Math.min(ay, by) - rmax, Math.min(az, bz) - rmax,
      Math.max(ax, bx) + rmax, Math.max(ay, by) + rmax, Math.max(az, bz) + rmax,
    ],
    dist(px, py, pz) {
      const wx = px - ax, wy = py - ay, wz = pz - az;
      let t = (wx * dx + wy * dy + wz * dz) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = wx - dx * t, cy = wy - dy * t, cz = wz - dz * t;
      return Math.sqrt(cx * cx + cy * cy + cz * cz) - (ra + (rb - ra) * t);
    },
  };
}

// Halfspaces, for trimming: used as a `cut`, slabAbove removes everything
// above y0 (a waistline), slabBelow removes everything below it (a hem).
export function slabAbove(y0) {
  return { aabb: [-1e9, y0 - 0.5, -1e9, 1e9, 1e9, 1e9], dist(px, py) { return y0 - py; } };
}
export function slabBelow(y0) {
  return { aabb: [-1e9, -1e9, -1e9, 1e9, y0 + 0.5, 1e9], dist(px, py) { return py - y0; } };
}

export function add(prim, k = 0.04) { return { prim, k, cut: false }; }
export function cut(prim, k = 0.04) { return { prim, k, cut: true }; }

/* ------------------------------------------------------------ field maths */

function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  let h = 0.5 + 0.5 * (b - a) / k;
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  return b + (a - b) * h - k * h * (1 - h);
}

/* ------------------------------------------------- marching cubes plumbing */

// The MC addon emits vertices in its own normalized space. Rather than trust a
// version-specific convention, calibrate it: bake an axis-aligned box with
// three DISTINCT half-extents (box faces land exactly on the iso-surface under
// linear interpolation), measure where its corners came out, and solve the
// affine map - including any axis permutation - from grid index to raw output.
const calibrationCache = new Map();

function extractRaw(mc) {
  const geom = mc.geometry;
  const posAttr = geom.getAttribute('position');
  let n = geom.drawRange ? geom.drawRange.count : Infinity;
  if (!isFinite(n) || n <= 0) {
    n = (typeof mc.count === 'number' && mc.count > 0) ? mc.count * 3 : 0;
  }
  n = Math.min(n, posAttr.count);
  if (n < 3) throw new Error('marching cubes produced no geometry');
  return posAttr.array.slice(0, n * 3);
}

function calibrate(mc, res) {
  if (calibrationCache.has(res)) return calibrationCache.get(res);

  const c = (res - 1) / 2;
  const half = [0.31 * (res - 1) * 0.5, 0.23 * (res - 1) * 0.5, 0.15 * (res - 1) * 0.5];
  const N2 = res * res;
  const field = mc.field;
  for (let z = 0; z < res; z++) {
    for (let y = 0; y < res; y++) {
      const rowBase = z * N2 + y * res;
      const dy = Math.abs(y - c) - half[1];
      const dz = Math.abs(z - c) - half[2];
      for (let x = 0; x < res; x++) {
        const d = Math.max(Math.abs(x - c) - half[0], dy, dz);
        field[rowBase + x] = -d;                 // positive inside
      }
    }
  }
  mc.update();
  const raw = extractRaw(mc);

  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < raw.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = raw[i + a];
      if (v < lo[a]) lo[a] = v;
      if (v > hi[a]) hi[a] = v;
    }
  }

  // Match each raw axis to the index axis whose extent it reproduces. The
  // three probe extents are deliberately different so the match is unambiguous.
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  let best = null, bestErr = Infinity;
  for (const p of perms) {
    const b = [0, 1, 2].map((a) => (hi[a] - lo[a]) / (2 * half[p[a]]));
    const mean = (b[0] + b[1] + b[2]) / 3;
    const err = Math.abs(b[0] - mean) + Math.abs(b[1] - mean) + Math.abs(b[2] - mean);
    if (err < bestErr) { bestErr = err; best = { perm: p, b }; }
  }
  const mapping = {
    perm: best.perm,
    b: best.b,
    a: [0, 1, 2].map((axis) => (lo[axis] + hi[axis]) / 2 - best.b[axis] * c),
  };
  calibrationCache.set(res, mapping);
  return mapping;
}

/* ------------------------------------------------------------------- bake */

// Turns an ordered op list into a welded, world-space, smooth-normal mesh.
// Also returns the analytic SDF (hard min/max - cheap) for the AO pass.
export function bakeMesh(ops, box, res, opts = {}) {
  const maxPoly = opts.maxPoly || 260000;
  const mc = new MarchingCubes(res, new THREE.MeshBasicMaterial(), false, false, maxPoly);
  mc.isolation = 0;

  const mapping = calibrate(mc, res);

  const min = box.min, max = box.max;
  const step = [(max[0] - min[0]) / (res - 1), (max[1] - min[1]) / (res - 1), (max[2] - min[2]) / (res - 1)];
  const N2 = res * res;

  // Distance field, stamped primitive by primitive over each one's own AABB.
  const dist = new Float32Array(res * res * res).fill(1e6);
  for (const op of ops) {
    const p = op.prim, k = op.k;
    const pad = k + 3 * Math.max(step[0], step[1], step[2]);
    const x0 = Math.max(0, Math.floor((p.aabb[0] - pad - min[0]) / step[0]));
    const y0 = Math.max(0, Math.floor((p.aabb[1] - pad - min[1]) / step[1]));
    const z0 = Math.max(0, Math.floor((p.aabb[2] - pad - min[2]) / step[2]));
    const x1 = Math.min(res - 1, Math.ceil((p.aabb[3] + pad - min[0]) / step[0]));
    const y1 = Math.min(res - 1, Math.ceil((p.aabb[4] + pad - min[1]) / step[1]));
    const z1 = Math.min(res - 1, Math.ceil((p.aabb[5] + pad - min[2]) / step[2]));
    for (let z = z0; z <= z1; z++) {
      const pz = min[2] + z * step[2];
      for (let y = y0; y <= y1; y++) {
        const py = min[1] + y * step[1];
        const rowBase = z * N2 + y * res;
        for (let x = x0; x <= x1; x++) {
          const px = min[0] + x * step[0];
          const d = p.dist(px, py, pz);
          const i = rowBase + x;
          dist[i] = op.cut
            ? -smin(-dist[i], d, op.k)         // smooth subtraction
            : smin(dist[i], d, op.k);          // smooth union
        }
      }
    }
  }

  const field = mc.field;
  for (let i = 0; i < dist.length; i++) field[i] = -dist[i];
  mc.update();
  const raw = extractRaw(mc);

  // Raw -> grid index -> world, using the calibrated affine map.
  const world = new Float32Array(raw.length);
  const { perm, a, b } = mapping;
  for (let i = 0; i < raw.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      const j = perm[axis];                                  // index axis this raw axis follows
      const idx = (raw[i + axis] - a[axis]) / b[axis];
      world[i + j] = min[j] + idx * step[j];
    }
  }

  mc.geometry.dispose();
  if (mc.material) mc.material.dispose();

  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(world, 3));
  geo = mergeVertices(geo, 1e-3);
  geo.computeVertexNormals();

  // Analytic SDF over the same ops (hard min/max): used by the AO bake.
  const adds = ops.filter((o) => !o.cut).map((o) => o.prim);
  const cuts = ops.filter((o) => o.cut).map((o) => o.prim);
  const sdf = (x, y, z) => {
    let d = 1e6;
    for (let i = 0; i < adds.length; i++) {
      const di = adds[i].dist(x, y, z);
      if (di < d) d = di;
    }
    for (let i = 0; i < cuts.length; i++) {
      const di = -cuts[i].dist(x, y, z);
      if (di > d) d = di;
    }
    return d;
  };

  return { geometry: geo, sdf };
}

/* --------------------------------------------------------------- skinning */

// Weights every vertex to its nearest bone, blending ONLY between bones the
// adjacency list declares as anatomically connected. `boneSegments[i].segs` is
// a list of {a, b, bias} line segments describing where bone i's flesh lives;
// bias enlarges a bone's claim without moving it (used to keep back muscle on
// the torso when an arm passes close by).
export function computeSkinAttributes(geometry, boneSegments, adjacency, band = 0.05) {
  const pos = geometry.getAttribute('position');
  const count = pos.count;
  const nBones = boneSegments.length;

  const adj = Array.from({ length: nBones }, () => []);
  for (const [i, j] of adjacency) { adj[i].push(j); adj[j].push(i); }

  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  const d = new Float32Array(nBones);

  for (let v = 0; v < count; v++) {
    const px = pos.getX(v), py = pos.getY(v), pz = pos.getZ(v);

    for (let bIdx = 0; bIdx < nBones; bIdx++) {
      let best = Infinity;
      for (const s of boneSegments[bIdx].segs) {
        const ax = s.a[0], ay = s.a[1], az = s.a[2];
        const dx = s.b[0] - ax, dy = s.b[1] - ay, dz = s.b[2] - az;
        const len2 = dx * dx + dy * dy + dz * dz || 1e-9;
        let t = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = px - ax - dx * t, cy = py - ay - dy * t, cz = pz - az - dz * t;
        const dd = Math.sqrt(cx * cx + cy * cy + cz * cz) - (s.bias || 0);
        if (dd < best) best = dd;
      }
      d[bIdx] = best;
    }

    let b1 = 0;
    for (let i = 1; i < nBones; i++) if (d[i] < d[b1]) b1 = i;
    let b2 = -1;
    for (const c of adj[b1]) if (b2 === -1 || d[c] < d[b2]) b2 = c;

    let w1 = 1;
    if (b2 !== -1) {
      let t = (d[b2] - d[b1]) / band;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ts = t * t * (3 - 2 * t);
      w1 = 0.5 + 0.5 * ts;
    }

    const o = v * 4;
    skinIndex[o] = b1;
    skinIndex[o + 1] = b2 === -1 ? 0 : b2;
    skinWeight[o] = w1;
    skinWeight[o + 1] = b2 === -1 ? 0 : 1 - w1;
  }

  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
}

/* --------------------------------------------------------------- shading */

// Bakes SDF ambient occlusion (and optionally a full albedo) into vertex
// colours. Sampling the field along the normal is what puts real darkness into
// the armpits, under the pecs and between the fingers of a fist - the depth
// cue flat materials never had.
const AO_EPS = [0.03, 0.06, 0.12, 0.2];
const AO_W = [0.35, 0.3, 0.2, 0.15];

export function bakeVertexColors(geometry, sdf, opts = {}) {
  const floor = opts.floor === undefined ? 0.55 : opts.floor;
  const albedo = opts.albedo || null;
  const pos = geometry.getAttribute('position');
  const nrm = geometry.getAttribute('normal');
  const colors = new Float32Array(pos.count * 3);
  const rgb = [1, 1, 1];

  for (let v = 0; v < pos.count; v++) {
    const px = pos.getX(v), py = pos.getY(v), pz = pos.getZ(v);
    const nx = nrm.getX(v), ny = nrm.getY(v), nz = nrm.getZ(v);

    let ao = 0;
    for (let s = 0; s < AO_EPS.length; s++) {
      const e = AO_EPS[s];
      let t = sdf(px + nx * e, py + ny * e, pz + nz * e) / e;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      ao += AO_W[s] * t;
    }
    let shade = floor + (1 - floor) * ao;
    shade *= 0.92 + 0.08 * (ny * 0.5 + 0.5);   // faint sky term

    if (albedo) albedo(px, py, pz, nx, ny, nz, rgb);
    else { rgb[0] = 1; rgb[1] = 1; rgb[2] = 1; }

    const o = v * 3;
    colors[o] = rgb[0] * shade;
    colors[o + 1] = rgb[1] * shade;
    colors[o + 2] = rgb[2] * shade;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/* --------------------------------------------------------------- skeleton */

// defs: [{ name, parent (name or null), pos: [world x,y,z] }]. Returns bones
// keyed by name plus the flat list whose order defines skinIndex numbering.
export function buildSkeleton(defs) {
  const byName = {};
  const list = [];
  const worldPos = {};
  const roots = [];
  for (const d of defs) {
    const bone = new THREE.Bone();
    bone.name = d.name;
    worldPos[d.name] = d.pos;
    if (d.parent) {
      const pp = worldPos[d.parent];
      bone.position.set(d.pos[0] - pp[0], d.pos[1] - pp[1], d.pos[2] - pp[2]);
      byName[d.parent].add(bone);
    } else {
      bone.position.set(d.pos[0], d.pos[1], d.pos[2]);
      roots.push(bone);
    }
    byName[d.name] = bone;
    list.push(bone);
  }
  return { byName, list, roots, worldPos };
}

/* ------------------------------------------------------------ accessories */

// A ring of beads (rudraksha) as a single merged geometry - one draw call per
// ring instead of one per bead.
export function beadRing(beadCount, ringRadius, beadRadius, jitter = 0.2) {
  const geos = [];
  for (let i = 0; i < beadCount; i++) {
    const angle = (i / beadCount) * Math.PI * 2;
    const wobble = 1 + jitter * Math.sin(i * 12.9898);
    const g = new THREE.SphereGeometry(beadRadius * wobble, 6, 5);
    g.translate(Math.cos(angle) * ringRadius, 0, Math.sin(angle) * ringRadius);
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  return merged;
}
