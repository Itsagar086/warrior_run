// Collapses a static prop's sub-meshes into one mesh per material.
//
// Every mesh in the scene is a draw call, and this game builds its props from
// dozens of primitives each: a temple pillar is eighteen meshes, a pedestal
// twenty-four, a ground segment thirty-one. Multiplied by the pools that recycle
// them, that was ~1200 visible meshes a frame. Merging by material cuts that by
// more than half with no visual change at all - the geometry is identical, it is
// just handed to the GPU in far fewer pieces.
//
// Only ever call this on props with no internally animated parts, or on the
// static subtree beneath an animated node.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 'color' is load-bearing: the devotee's form comes from baked per-vertex
// shading, and dropping the attribute here would merge that away and leave him
// flat-shaded again.
const KEEP_ATTRIBUTES = ['position', 'normal', 'uv', 'color'];

// Strips a geometry down to the attributes every primitive shares, in a form
// that can be concatenated with any other.
function normalise(geometry, matrix) {
  let geo = geometry.index ? geometry.toNonIndexed() : geometry.clone();

  for (const name of Object.keys(geo.attributes)) {
    if (!KEEP_ATTRIBUTES.includes(name)) geo.deleteAttribute(name);
  }
  // A geometry missing an attribute cannot be merged with one that has it, so
  // both optional channels are filled in rather than left absent. Colour fills
  // with white, which is the identity value: an unshaded part merged next to a
  // shaded one keeps its own appearance instead of being blacked out.
  const count = geo.attributes.position.count;
  if (!geo.attributes.uv) {
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  if (!geo.attributes.color) {
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3));
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();

  geo.applyMatrix4(matrix);
  return geo;
}

// Merges the meshes that are rigid *within* each animated pivot, and stops dead
// at the next pivot down.
//
// mergeStatic collapses an entire subtree, which is right for a pillar and
// catastrophic for a character: it would bake the arms into the torso and the
// figure would animate as one solid lump. This walks each pivot's descendants
// and abandons a branch the moment it reaches another pivot, so every joint
// keeps its own transform while the parts that can never move relative to it
// become a single draw call per material.
//
// `pivots` is every node whose transform is driven at runtime. Passing an
// incomplete list is the one way to break this: a joint left out gets merged
// into its parent and silently stops moving.
export function mergeRigidWithin(pivots) {
  const held = new Set(pivots);
  let before = 0;
  let after = 0;

  for (const pivot of pivots) {
    const own = [];
    const stack = pivot.children.slice();
    while (stack.length) {
      const node = stack.pop();
      if (held.has(node)) continue;              // another joint: not ours to merge
      if (node.isMesh && !node.userData.noMerge) own.push(node);
      for (const child of node.children) stack.push(child);
    }
    before += own.length;
    if (own.length < 2) { after += own.length; continue; }

    for (const mesh of own) {
      const attrs = mesh.geometry && mesh.geometry.attributes;
      if (!attrs || !attrs.position || typeof mesh.geometry.clone !== 'function') {
        after += own.length;
        own.length = 0;                          // stubbed geometry: leave this pivot alone
        break;
      }
    }
    if (!own.length) continue;

    pivot.updateMatrixWorld(true);
    const toPivot = new THREE.Matrix4().copy(pivot.matrixWorld).invert();
    const relative = new THREE.Matrix4();

    const groups = new Map();
    let failed = false;
    for (const mesh of own) {
      const key = mesh.material.uuid;
      if (!groups.has(key)) groups.set(key, { material: mesh.material, geometries: [], cast: false, receive: false });
      const group = groups.get(key);
      relative.multiplyMatrices(toPivot, mesh.matrixWorld);
      try {
        group.geometries.push(normalise(mesh.geometry, relative));
      } catch (e) { failed = true; break; }
      group.cast = group.cast || mesh.castShadow;
      group.receive = group.receive || mesh.receiveShadow;
    }
    if (failed) { after += own.length; continue; }

    const merged = [];
    for (const group of groups.values()) {
      const geo = group.geometries.length === 1
        ? group.geometries[0]
        : mergeGeometries(group.geometries, false);
      if (!geo) { failed = true; break; }
      const mesh = new THREE.Mesh(geo, group.material);
      mesh.castShadow = group.cast;
      mesh.receiveShadow = group.receive;
      merged.push(mesh);
    }
    if (failed) { after += own.length; continue; }

    for (const mesh of own) if (mesh.parent) mesh.parent.remove(mesh);
    merged.forEach(m => pivot.add(m));
    after += merged.length;
  }

  return { before, after };
}

export function mergeStatic(root) {
  if (!root || typeof root.traverse !== 'function') return root;

  const meshes = [];
  root.traverse(o => {
    if (o.isMesh && !o.userData.noMerge) meshes.push(o);
  });
  if (meshes.length < 2) return root;

  // Bail out wholesale if anything here is not a plain attribute geometry -
  // the headless test harness stubs geometry out, and a partial merge would be
  // worse than none.
  for (const m of meshes) {
    const attrs = m.geometry && m.geometry.attributes;
    if (!attrs || !attrs.position || typeof m.geometry.clone !== 'function') return root;
  }

  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const relative = new THREE.Matrix4();

  // Group by material identity: same material object, same draw state
  const groups = new Map();
  for (const mesh of meshes) {
    const key = mesh.material.uuid;
    if (!groups.has(key)) groups.set(key, { material: mesh.material, geometries: [], cast: false, receive: false });
    const group = groups.get(key);

    relative.multiplyMatrices(toRoot, mesh.matrixWorld);
    try {
      group.geometries.push(normalise(mesh.geometry, relative));
    } catch (e) {
      return root;   // anything unmergeable and the prop is left as it was
    }
    group.cast = group.cast || mesh.castShadow;
    group.receive = group.receive || mesh.receiveShadow;
  }

  const merged = [];
  for (const group of groups.values()) {
    const geo = group.geometries.length === 1
      ? group.geometries[0]
      : mergeGeometries(group.geometries, false);
    if (!geo) return root;

    const mesh = new THREE.Mesh(geo, group.material);
    mesh.castShadow = group.cast;
    mesh.receiveShadow = group.receive;
    merged.push(mesh);
  }

  // Drop the originals only once every merge has succeeded
  for (const mesh of meshes) {
    if (mesh.parent) mesh.parent.remove(mesh);
  }
  // Clear out the now-empty container nodes they hung from
  for (let i = root.children.length - 1; i >= 0; i--) {
    const child = root.children[i];
    if (!child.isMesh && !child.isLight && child.children.length === 0) root.remove(child);
  }

  merged.forEach(m => root.add(m));
  root.userData.merged = merged.length;
  return root;
}
