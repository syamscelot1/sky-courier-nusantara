// camera.js — the camera rig for Sky Courier.
// One job: put the camera where the pilot expects it and never fight them.
// Chase: a smoothed follow behind and above the aircraft, looking ahead.
// Cockpit: just behind the canopy, looking over the nose, so the
// pilot sees the aircraft in the frame (and the HUD instruments) instead
// of an empty sky.
// Orbit: a slow cinematic circle for the title screen.
const THREE = globalThis.THREE;

export function createCameraRig(camera, aircraft) {
  const aircraftGroup = aircraft.group;
  const aircraftParts = aircraft.parts || {};
  let mode = 'chase';
  // Staging-only close chase for screenshots (?scene presets in main.js).
  // Default false: the chase camera players fly with is unchanged.
  // When true, the camera sits much closer behind the plane so the
  // aircraft fills a large part of the frame, like the competitor's
  // close chase shot — with tighter tracking so headless lag does not
  // stretch the distance back out. Only main.js scene presets set it;
  // startMission/showTitle always reset it to false.
  let closeUp = false;
  // Staging-only quarter view for screenshots (?scene=sunset): the camera
  // sits behind AND to the side, so the jet reads in 3/4 from the rear
  // — top and flank visible, nose and runway ahead — instead of straight
  // down the tail. Default false: gameplay chase is unchanged. Only
  // main.js scene presets set it; startMission/showTitle reset it.
  let quarter = false;
  const chasePos = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const desired = new THREE.Vector3();
  let orbitAngle = 0;
  let firstFrame = true;

  function setMode(next) {
    mode = next;
    firstFrame = true;
  }

  function setCloseUp(v) {
    closeUp = !!v;
    firstFrame = true;
  }

  function setQuarter(v) {
    quarter = !!v;
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
      return;
    }

    if (mode === 'cockpit') {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(state.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(state.quaternion);
      // Just behind and above the canopy, looking over the nose: the
      // pilot sees the canopy frame, the windscreen and the long pointed
      // nose in the frame instead of an empty sky. The glass canopy
      // itself is hidden in this mode — from behind it renders as a dome
      // that blocks the view. The canopy frame rails and the windscreen
      // stay visible, so the cockpit still reads as a jet.
      desired.copy(state.position).addScaledVector(forward, -0.9).addScaledVector(up, 1.05);
      camera.position.copy(desired);
      lookTarget.copy(state.position).addScaledVector(forward, 60).addScaledVector(up, 2);
      camera.lookAt(lookTarget);
      camera.up.copy(up);
      aircraftGroup.visible = true;
      if (aircraftParts.canopy) aircraftParts.canopy.visible = false;
      return;
    }

    // Chase camera.
    aircraftGroup.visible = true;
    if (aircraftParts.canopy) aircraftParts.canopy.visible = true;
    camera.up.set(0, 1, 0);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(state.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(state.quaternion);
    // Close-up staging: ~8.5 m behind at cruise (vs ~16 m default), low
    // and tight, looking just past the nose so the ring stays centred
    // ahead and the plane fills most of the frame width.
    // Quarter staging: ~10 m behind and 7 m to the LEFT of the flight
    // direction, low, looking past the nose — the 3/4 rear view, jet
    // left of frame with the target ahead. Left, not right: on the
    // southbound sunset approach the sun sits south-east, so the left
    // (east) flank is the sunlit one and the blue-orange livery catches
    // the warm light instead of showing its shadow side.
    const left = new THREE.Vector3().crossVectors(up, forward).normalize();
    const back = quarter ? 10 + state.speed * 0.02 : closeUp ? 7.5 + state.speed * 0.02 : 13 + state.speed * 0.06;
    const height = quarter ? 3.0 + state.speed * 0.006 : closeUp ? 2.6 + state.speed * 0.006 : 3.4 + state.speed * 0.012;
    desired.copy(state.position).addScaledVector(forward, -back).addScaledVector(up, height);
    if (quarter) desired.addScaledVector(left, 7);
    // Never let the camera dig into a mountain.
    const ground = world.groundHeight(desired.x, desired.z);
    if (desired.y < ground + 2.5) desired.y = ground + 2.5;
    if (firstFrame) {
      chasePos.copy(desired);
      firstFrame = false;
    } else {
      const stiffness = (closeUp || quarter) ? 10 : (state.onGround ? 8 : 4.5);
      chasePos.lerp(desired, 1 - Math.exp(-dt * stiffness));
    }
    camera.position.copy(chasePos);
    // Quarter view looks down more than the level chase: the hero ring
    // flies at ~345 m while the runway sits at 18 m, only ~420 m past
    // it — with a level camera the runway is ~38 deg below the horizon
    // and falls out of the frame, while the town beyond it (farther, so
    // a shallower angle) is visible. Pitching the view ~15 deg down puts
    // the ring in the upper half, the jet near the centre, and the
    // runway strip in the lower frame in the same shot.
    lookTarget.copy(state.position).addScaledVector(forward, quarter ? 30 : closeUp ? 22 : 34).addScaledVector(up, quarter ? -5 : closeUp ? -1.5 : 1.5);
    camera.lookAt(lookTarget);
  }

  return {
    setMode,
    setCloseUp,
    setQuarter,
    update,
    get mode() {
      return mode;
    },
  };
}
