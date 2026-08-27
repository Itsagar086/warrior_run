// Pooled particle bursts for pickups, blasts and impacts.
import * as THREE from 'three';

// ===== SYSTEM id=system-fx label="Reward and Combat FX Pool" =====
const fxPool = [];
const FX_POOL_SIZE = 48;

export function initFX(scene) {
  const sparkGeo = new THREE.SphereGeometry(0.12, 6, 6);
  const sparkMat = new THREE.MeshBasicMaterial({ color: '#ffd700' });
  for (let i = 0; i < FX_POOL_SIZE; i++) {
    const mesh = new THREE.Mesh(sparkGeo, sparkMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    fxPool.push({
      mesh,
      vel: new THREE.Vector3(),
      life: 0,
      maxLife: 1.0,
      active: false
    });
  }
}

export function spawnFX(pos, colorHex, count = 8, speedMult = 1.0) {
  let spawned = 0;
  for (let i = 0; i < fxPool.length; i++) {
    const p = fxPool[i];
    if (!p.active) {
      p.active = true;
      p.life = 0;
      p.maxLife = 0.4 + Math.random() * 0.3;
      p.mesh.material.color.set(colorHex);
      p.mesh.position.copy(pos);
      p.mesh.scale.setScalar(1.0 + Math.random() * 0.6);
      p.mesh.visible = true;

      const angle = Math.random() * Math.PI * 2;
      const elev = (Math.random() - 0.2) * Math.PI;
      const spd = (3.0 + Math.random() * 4.5) * speedMult;
      p.vel.set(
        Math.cos(angle) * Math.cos(elev) * spd,
        Math.sin(elev) * spd + 2.5,
        Math.sin(angle) * Math.cos(elev) * spd
      );

      spawned++;
      if (spawned >= count) break;
    }
  }
}

export function updateFX(dt) {
  for (let i = 0; i < fxPool.length; i++) {
    const p = fxPool[i];
    if (p.active) {
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        p.mesh.visible = false;
      } else {
        p.vel.y -= 18.0 * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        const scale = 1.0 - (p.life / p.maxLife);
        p.mesh.scale.setScalar(scale);
      }
    }
  }
}
// ===== END SYSTEM =====
