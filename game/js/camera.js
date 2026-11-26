// camera.js — the camera rig for Sky Courier.
// One job: put the camera where the pilot expects it and never fight them.
// Chase: a smoothed follow behind and above the aircraft, looking ahead.
// Cockpit: just behind the canopy, looking over the nose and prop, so the
// pilot sees the aircraft in the frame (and the HUD instruments) instead
// of an empty sky.
// Orbit: a slow cinematic circle for the title screen.
const THREE = globalThis.THREE;

export function createCameraRig(camera, aircraft) {
  const aircraftGroup = aircraft.group;
  const aircraftParts = aircraft.parts || {};
  let mode = 'chase';
  const chasePos = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const desired = new THREE.Vector3();
  let orbitAngle = 0;
  let firstFrame = true;

  function setMode(next) {
    mode = next;
    firstFrame = true;
  }

  function update(dt, state, world) {
    if (mode === 'orbit') {
      orbitAngle += dt * 0.05;
      const radius = 900;
      const cx = 150;
      const cz = 950;
      desired.set(
        cx + Math.cos(orbitAngle) * radius,
        320 + Math.sin(orbitAngle * 0.7) * 60,
        cz + Math.sin(orbitAngle) * radius,
      );
      if (firstFrame) {
        camera.position.copy(desired);
        firstFrame = false;
      } else {
        camera.position.lerp(desired, 1 - Math.exp(-dt * 1.2));
      }
      lookTarget.set(150, 40, 950);
      camera.lookAt(lookTarget);
      aircraftGroup.visible = true;
      if (aircraftParts.canopy) aircraftParts.canopy.visible = true;
      if (aircraftParts.propDisc) aircraftParts.propDisc.visible = true;
      if (aircraftParts.propBlades) aircraftParts.propBlades.visible = true;
      return;
    }

    if (mode === 'cockpit') {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(state.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(state.quaternion);
      // Just behind and above the canopy, looking over the nose: the
      // pilot sees the canopy top, the nose and the prop in the frame
      // instead of an empty sky. The glass canopy itself is hidden in
      // this mode — from behind it renders as a dome that blocks the view.
      // The prop disc is hidden too: from this close it fills the frame
      // as a pale dome. The blades are hidden as well: a single blade
      // frozen mid-spin reads as a black bar in a still frame (the
      // screenshot), not as a propeller — the orange spinner cone at the
      // nose still reads as the prop from the cockpit.
      desired.copy(state.position).addScaledVector(forward, -0.9).addScaledVector(up, 1.05);
      camera.position.copy(desired);
      lookTarget.copy(state.position).addScaledVector(forward, 60).addScaledVector(up, 2);
      camera.lookAt(lookTarget);
      camera.up.copy(up);
      aircraftGroup.visible = true;
      if (aircraftParts.canopy) aircraftParts.canopy.visible = false;
      if (aircraftParts.propDisc) aircraftParts.propDisc.visible = false;
      if (aircraftParts.propBlades) aircraftParts.propBlades.visible = false;
      return;
    }

    // Chase camera.
    aircraftGroup.visible = true;
    if (aircraftParts.canopy) aircraftParts.canopy.visible = true;
    if (aircraftParts.propDisc) aircraftParts.propDisc.visible = true;
    if (aircraftParts.propBlades) aircraftParts.propBlades.visible = true;
    camera.up.set(0, 1, 0);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(state.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(state.quaternion);
    const back = 13 + state.speed * 0.06;
    const height = 3.4 + state.speed * 0.012;
    desired.copy(state.position).addScaledVector(forward, -back).addScaledVector(up, height);
    // Never let the camera dig into a mountain.
    const ground = world.groundHeight(desired.x, desired.z);
    if (desired.y < ground + 2.5) desired.y = ground + 2.5;
    if (firstFrame) {
      chasePos.copy(desired);
      firstFrame = false;
    } else {
      const stiffness = state.onGround ? 8 : 4.5;
      chasePos.lerp(desired, 1 - Math.exp(-dt * stiffness));
    }
    camera.position.copy(chasePos);
    lookTarget.copy(state.position).addScaledVector(forward, 34).addScaledVector(up, 1.5);
    camera.lookAt(lookTarget);
  }

  return {
    setMode,
    update,
    get mode() {
      return mode;
    },
  };
}
