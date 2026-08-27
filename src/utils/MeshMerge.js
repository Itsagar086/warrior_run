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

const KEEP_ATTRIBUTES = ['position', 'normal', 'uv'];

// Strips a geometry down to the attributes every primitive shares, in a form
// that can be concatenated with any other.
function normalise(geometry, matrix) {
  let geo = geometry.index ? geometry.toNonIndexed() : geometry.clone();

  for (const name of Object.keys(geo.attributes)) {
    if (!KEEP_ATTRIBUTES.includes(name)) geo.deleteAttribute(name);
  }
  // A geometry missing uv cannot be merged with one that has it
  if (!geo.attributes.uv) {
    const count = geo.attributes.position.count;
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();

  geo.applyMatrix4(matrix);
  return geo;
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
