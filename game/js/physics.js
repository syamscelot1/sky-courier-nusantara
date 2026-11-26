// physics.js — arcade flight dynamics for Sky Courier.
// One job: move the aircraft through the air from control inputs.
// The model is arcade, not a full aero sim: speed chases a throttle target,
// banked turns follow the coordinated-turn rule, slow flight sinks and the
// nose drops, and the ground decides between a landing, damage or a crash.
// Units: metres, seconds, radians. Speeds shown to the player as knots/ft.
const THREE = globalThis.THREE;

export const FLIGHT = {
  maxSpeed: 96, // m/s, about 186 kt at full throttle
  stallSpeed: 27, // m/s, about 52 kt — below this the wing quits
  cruiseSpeed: 62,
  throttleAccel: 14, // m/s^2 gained per second at full throttle
  drag: 0.00155, // quadratic drag, tuned so maxSpeed balances thrust
  pitchRate: 0.85, // rad/s at full deflection, full authority
  rollRate: 1.9,
  yawRate: 0.45,
  maxBank: 1.25, // rad, about 72 degrees
  gravity: 9.81,
  gearHeight: 1.35, // metres from belly to wheels
  fuelBurnCruise: 0.16, // fuel units per second at 60% throttle
  fuelBurnFull: 0.42, // fuel units per second at full throttle
};

export function createFlightState(spawn) {
  return {
    position: new THREE.Vector3(spawn.x, spawn.y, spawn.z),
    quaternion: new THREE.Quaternion().setFromEuler(
      new THREE.Euler(spawn.pitch || 0, spawn.heading || 0, spawn.roll || 0, 'YXZ'),
    ),
    speed: spawn.speed ?? 55,
    throttle: spawn.throttle ?? 0.65,
    fuel: 100,
    damage: 0,
    gearDown: spawn.gearDown ?? true,
    onGround: spawn.onGround ?? false,
    landed: false,
    crashed: false,
    crashReason: '',
    verticalSpeed: 0,
    bank: 0,
    pitchAngle: 0,
    headingDeg: 0,
    groundSpeedKts: 0,
    altitudeFt: 0,
    groundClearance: 0,
    stalled: false,
    engineOut: false,
    touchdownVs: 0,
    touchdownBank: 0,
    touchdownSpeed: 0,
  };
}

// Euler angles of the current attitude, YXZ order (heading, pitch, bank).
export function attitudeOf(state) {
  const euler = new THREE.Euler().setFromQuaternion(state.quaternion, 'YXZ');
  return { heading: euler.y, pitch: euler.x, bank: euler.z };
}

export function forwardOf(state) {
  return new THREE.Vector3(0, 0, -1).applyQuaternion(state.quaternion);
}

// One physics step. groundHeightAt(x, z) comes from terrain.js.
// Returns an event string when something notable happened, else ''.
export function stepFlight(state, ctrl, dt, groundHeightAt, isRunwayAt) {
  if (state.crashed) return '';
  const att = attitudeOf(state);
  const forward = forwardOf(state);
  let event = '';

  // --- Throttle and speed -------------------------------------------------
  if (state.fuel > 0) {
    if (ctrl.throttleUp) state.throttle = Math.min(1, state.throttle + dt * 0.55);
    if (ctrl.throttleDown) state.throttle = Math.max(0, state.throttle - dt * 0.55);
  }
  state.engineOut = state.fuel <= 0;
  const effectiveThrottle = state.engineOut ? 0 : state.throttle;
  const targetSpeed = effectiveThrottle * FLIGHT.maxSpeed;
  const dragDecel = FLIGHT.drag * state.speed * state.speed;
  let accel = effectiveThrottle * FLIGHT.throttleAccel - dragDecel;
  if (ctrl.brake) accel -= 14;
  // Climbing costs speed, descending gives it back.
  accel -= FLIGHT.gravity * Math.sin(att.pitch) * 0.55;
  state.speed += accel * dt;
  if (state.speed < 0) state.speed = 0;

  // --- Fuel ----------------------------------------------------------------
  if (!state.engineOut) {
    const burn = FLIGHT.fuelBurnCruise + (FLIGHT.fuelBurnFull - FLIGHT.fuelBurnCruise) * effectiveThrottle;
    state.fuel = Math.max(0, state.fuel - burn * dt);
  }

  // --- Attitude ------------------------------------------------------------
  const authority = clamp(state.speed / FLIGHT.cruiseSpeed, 0.25, 1);
  const pitchRate = ctrl.pitch * FLIGHT.pitchRate * authority;
  const rollRate = ctrl.roll * FLIGHT.rollRate * authority;
  const yawRate = ctrl.yaw * FLIGHT.yawRate * authority;
  // Gentle auto-level: a trainer wing eases back toward level flight.
  const levelRoll = -att.bank * 0.25 * (Math.abs(ctrl.roll) < 0.05 ? 1 : 0.15);
  const dq = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(pitchRate * dt, yawRate * dt, (rollRate + levelRoll) * dt, 'YXZ'),
  );
  state.quaternion.multiply(dq);
  state.quaternion.normalize();

  // Coordinated turn: banking turns the nose.
  const newAtt = attitudeOf(state);
  const bank = clamp(newAtt.bank, -FLIGHT.maxBank, FLIGHT.maxBank);
  const turnRate = (FLIGHT.gravity * Math.tan(bank)) / Math.max(state.speed, 12);
  const headingQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turnRate * dt);
  state.quaternion.premultiply(headingQ);
  state.quaternion.normalize();

  // --- Stall ---------------------------------------------------------------
  state.stalled = state.speed < FLIGHT.stallSpeed && !state.onGround;
  const sinkRate = state.stalled ? 9 : 0;
  if (state.stalled) {
    // The nose drops when the wing quits.
    const dropQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5 * dt, 0, 0, 'YXZ'));
    state.quaternion.multiply(dropQ);
    state.quaternion.normalize();
  }

  // --- Move ------------------------------------------------------------------
  const newForward = forwardOf(state);
  const velocity = newForward.clone().multiplyScalar(state.speed);
  velocity.y -= sinkRate;
  state.verticalSpeed = velocity.y;
  state.position.addScaledVector(velocity, dt);

  // --- Ground ----------------------------------------------------------------
  const ground = groundHeightAt(state.position.x, state.position.z);
  const clearance = state.position.y - ground;
  state.groundClearance = clearance;
  const finalAtt = attitudeOf(state);
  state.bank = finalAtt.bank;
  state.pitchAngle = finalAtt.pitch;
  state.headingDeg = ((-finalAtt.heading * 180) / Math.PI % 360 + 360) % 360;
  state.groundSpeedKts = state.speed * 1.94384;
  state.altitudeFt = Math.max(0, clearance * 3.28084);

  if (clearance <= FLIGHT.gearHeight && !state.onGround) {
    const onRunway = isRunwayAt ? isRunwayAt(state.position.x, state.position.z) : false;
    const vsFpm = -state.verticalSpeed * 196.85;
    const bankDeg = Math.abs(finalAtt.bank) * 180 / Math.PI;
    state.touchdownVs = vsFpm;
    state.touchdownBank = bankDeg;
    state.touchdownSpeed = state.groundSpeedKts;
    if (ground <= 0.6) {
      // Water: a ditching is a crash, whatever the speed.
      state.crashed = true;
      state.crashReason = 'DITCHED IN THE SEA';
      return 'crash';
    }
    if (!ctrl.gearDown && onRunway) {
      state.crashed = true;
      state.crashReason = 'BELLY LANDING — GEAR UP';
      return 'crash';
    }
    if (vsFpm > 780 || bankDeg > 28 || (state.speed > 62 && !onRunway)) {
      state.crashed = true;
      state.crashReason = vsFpm > 780
        ? 'HARD IMPACT — CAME DOWN TOO FAST'
        : bankDeg > 28
          ? 'WING STRUCK THE GROUND'
          : 'OVERRAN INTO ROUGH TERRAIN';
      return 'crash';
    }
    // A survivable touchdown.
    state.onGround = true;
    state.landed = true;
    state.position.y = ground + FLIGHT.gearHeight;
    if (vsFpm > 400) {
      state.damage = Math.min(100, state.damage + (vsFpm - 400) / 6);
      event = 'hard-landing';
    } else {
      event = 'landing';
    }
  }

  if (state.onGround) {
    // Roll-out: brakes and drag bleed speed, the nose stays on the ground.
    state.speed = Math.max(0, state.speed - (ctrl.brake ? 28 : 9) * dt);
    if (state.speed > FLIGHT.stallSpeed + 8 && finalAtt.pitch > 0.09) {
      // Liftoff: enough speed and the nose is up — the wing takes over.
      state.onGround = false;
      state.landed = false;
      event = event || 'takeoff';
    } else {
      state.position.y = ground + FLIGHT.gearHeight;
    }
    if (state.speed < 1.5 && state.throttle < 0.05) {
      // Only call it stopped when the pilot is off the throttle —
      // otherwise this clamp zeroes the speed every substep and the
      // plane can never accelerate away from a standstill.
      state.speed = 0;
      event = event || 'stopped';
    }
  }

  if (state.damage >= 100) {
    state.crashed = true;
    state.crashReason = 'AIRFRAME FAILURE';
    return 'crash';
  }
  return event;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
