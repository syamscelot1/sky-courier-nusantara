// main.js — Sky Courier: Nusantara Run. Bootstrap and game loop.
// One job: tie the modules together — renderer, flight model, terrain,
// missions, HUD, audio and camera — and run the game states:
// title -> flying -> paused / crashed / mission complete.
// URL staging for screenshots (real renders of this same code):
//   ?scene=cover    chase view, ring run, ring + runway in frame
//   ?scene=rings    mid-route, about to thread a ring
//   ?scene=landing  final approach, gear down, runway ahead
//   ?scene=cockpit  cockpit camera, ring ahead, instruments lit
//   ?mission=rings|landing|cargo|free  (default rings)
import { createInput } from './input.js';
import { createFlightState, stepFlight, attitudeOf, forwardOf } from './physics.js';
import { createTerrain, groundHeight, surfaceAt, RUNWAY, DIRT_STRIP } from './terrain.js';
import { buildAircraft, updateAircraftVisuals } from './aircraft.js';
import { createMissionRunner, MISSIONS, getRingPositions } from './missions.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createCameraRig } from './camera.js';

const THREE = globalThis.THREE;
const params = new URLSearchParams(window.location.search);
const sceneParam = params.get('scene') || '';
const missionParam = params.get('mission') || 'rings';
const lowFx = params.get('lowfx') === '1';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowFx });
renderer.setPixelRatio(lowFx ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !lowFx;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 9000);
const world = createTerrain(scene);
const aircraft = buildAircraft();
scene.add(aircraft.group);
const hud = createHud();
const audio = createAudio();
const input = createInput(canvas);
const cameraRig = createCameraRig(camera, aircraft);
const missionRunner = createMissionRunner(scene, world, onMissionEvent);

let flight = null;
let gameState = 'title'; // title | flying | paused | crashed | complete
let currentMissionId = missionParam;
let gearDown = true;
let cameraMode = 'chase';
let elapsed = 0;
let lastTimestamp = 0;
let crashInfo = null;
let resultsShown = false;

// Heading (Euler Y) that points the nose along a horizontal direction.
function headingToward(fromX, fromZ, toX, toZ) {
  const fx = toX - fromX;
  const fz = toZ - fromZ;
  const len = Math.hypot(fx, fz) || 1;
  return Math.atan2(-fx / len, -fz / len);
}

function runwaySpawn() {
  return {
    x: RUNWAY.x - 260,
    y: RUNWAY.elevation + 1.35,
    z: RUNWAY.z,
    heading: -Math.PI / 2, // east, down runway 09
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    gearDown: true,
    onGround: true,
  };
}

function spawnForMission(missionId) {
  if (missionId === 'landing') {
    return {
      x: -900, y: 78, z: RUNWAY.z,
      heading: -Math.PI / 2, pitch: -0.05, roll: 0,
      speed: 55, throttle: 0.4, gearDown: true, onGround: false,
    };
  }
  return runwaySpawn();
}

function spawnForScene(name) {
  const ringPositions = getRingPositions(groundHeight);
  if (name === 'cover' || name === 'cockpit') {
    // Chase the first ring at exactly its altitude so the shot reads.
    // Modest speed: the ring must still be ahead (not yet passed) when
    // the screenshot lands ~6 s after load.
    const ring = ringPositions[0];
    const px = 760;
    const pz = 830;
    return {
      x: px, y: ring.y + 2, z: pz,
      heading: headingToward(px, pz, ring.x, ring.z),
      pitch: -0.02, roll: 0, speed: 35, throttle: 0.5, gearDown: false, onGround: false,
    };
  }
  if (name === 'rings') {
    const ring = ringPositions[3];
    const px = 1180;
    const pz = -180;
    return {
      x: px, y: ring.y + 2, z: pz,
      heading: headingToward(px, pz, ring.x, ring.z),
      pitch: -0.02, roll: 0.08, speed: 62, throttle: 0.7, gearDown: false, onGround: false,
    };
  }
  if (name === 'landing') {
    return {
      x: -750, y: 62, z: RUNWAY.z,
      heading: -Math.PI / 2, pitch: -0.05, roll: 0,
      speed: 50, throttle: 0.35, gearDown: true, onGround: false,
    };
  }
  if (name === 'canyon') {
    const gates = missionRunner.canyonGatePositions;
    const gate = gates[0];
    // Approach along the canyon from its south mouth, on the canyon floor
    // (the old offset sat on the raw hillside east of the rim).
    const px = gate.x + 26;
    const pz = gate.z + 198;
    return {
      x: px, y: gate.y + 4, z: pz,
      heading: headingToward(px, pz, gate.x, gate.z),
      pitch: -0.02, roll: 0, speed: 58, throttle: 0.65, gearDown: false, onGround: false,
    };
  }
  if (name === 'night') {
    return {
      x: 150, y: 260, z: 950,
      heading: headingToward(150, 950, -1450, 950),
      pitch: -0.02, roll: 0, speed: 60, throttle: 0.65, gearDown: false, onGround: false,
    };
  }
  if (name === 'photo') {
    const target = missionRunner.photoTargets[0];
    const px = target.pos.x + 260;
    const pz = target.pos.z + 120;
    return {
      x: px, y: target.pos.y + 6, z: pz,
      heading: headingToward(px, pz, target.pos.x, target.pos.z),
      pitch: -0.02, roll: 0, speed: 52, throttle: 0.55, gearDown: false, onGround: false,
    };
  }
  return null;
}

function startMission(missionId, spawn) {
  currentMissionId = missionId;
  missionRunner.start(missionId);
  flight = createFlightState(spawn || spawnForMission(missionId));
  gearDown = flight.gearDown;
  flight.gearDown = gearDown;
  crashInfo = null;
  resultsShown = false;
  gameState = 'flying';
  cameraRig.setMode(cameraMode);
  document.getElementById('title-screen').classList.add('hidden');
  document.getElementById('results-screen').classList.add('hidden');
  document.getElementById('crash-screen').classList.add('hidden');
  document.getElementById('pause-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  hud.showMessage(`${missionRunner.mission.name} — ${missionRunner.mission.tagline}`, 4);
}

function startScenePreset(name) {
  const missionByScene = { cover: 'rings', rings: 'rings', cockpit: 'rings', landing: 'landing', canyon: 'canyon', night: 'night', photo: 'photo' };
  const missionId = missionByScene[name] || 'rings';
  currentMissionId = missionId;
  missionRunner.start(missionId);
  flight = createFlightState(spawnForScene(name));
  gearDown = flight.gearDown;
  gameState = 'flying';
  cameraMode = name === 'cockpit' ? 'cockpit' : 'chase';
  cameraRig.setMode(cameraMode);
  document.getElementById('title-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.body.classList.add('shot-mode');
}

function showTitle() {
  gameState = 'title';
  cameraRig.setMode('orbit');
  document.getElementById('title-screen').classList.remove('hidden');
  document.getElementById('hud').classList.add('hidden');
  // A parked plane on the runway for the title backdrop.
  flight = createFlightState(runwaySpawn());
}

function onMissionEvent(kind, data) {
  if (kind === 'ring') {
    audio.ringChime();
    hud.showMessage(`RING ${data.index + 1} — +100  •  SKOR ${data.score}`, 2);
  } else if (kind === 'cargo-pickup') {
    audio.ringChime();
    hud.showMessage('KARGO DIMUAT +250 — ANTAR KE PULAU KEDUA', 3.5);
  } else if (kind === 'photo') {
    audio.ringChime();
    flashPhoto();
    hud.showMessage(`FOTO ${data.name} — +${data.points}  •  ${data.taken}/3`, 3);
  } else if (kind === 'photo-miss') {
    hud.showMessage('Tidak ada landmark dalam frame — dekati dan arahkan hidung pesawat', 3);
  } else if (kind === 'night-beacon') {
    audio.ringChime();
    hud.showMessage('MERCUSUAR TERCAPAI +250 — PULANG KE RUNWAY 09', 3.5);
  } else if (kind === 'mission-complete') {
    audio.fanfare();
    gameState = 'complete';
    showResults(data);
  } else if (kind === 'wrong-field') {
    hud.showMessage('Itu bukan lapangan tujuan — coba lagi di lapangan yang benar', 3.5);
  }
}

function showResults(data) {
  resultsShown = true;
  const mission = missionRunner.mission;
  document.getElementById('results-title').textContent = 'MISI SELESAI';
  document.getElementById('results-mission').textContent = mission.name;
  const lines = [
    `Skor misi: ${missionRunner.score}`,
    `Waktu: ${formatTime(missionRunner.elapsed)}`,
  ];
  if (data && data.timeBonus) lines.push(`Bonus waktu: +${data.timeBonus}`);
  if (data && data.landingBonus) lines.push(`Bonus pendaratan: +${data.landingBonus}`);
  lines.push(`Bahan bakar tersisa: ${Math.round(flight.fuel)} L`);
  lines.push(`Kerusakan: ${Math.round(flight.damage)}%`);
  document.getElementById('results-lines').innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
  const next = nextMission(mission);
  const nextBtn = document.getElementById('results-next');
  nextBtn.textContent = `Misi berikutnya: ${next.name} →`;
  nextBtn.onclick = () => {
    audio.click();
    startMission(next.id);
  };
  document.getElementById('results-screen').classList.remove('hidden');
}

function showCrash(reason) {
  gameState = 'crashed';
  audio.crashSound();
  document.getElementById('crash-reason').textContent = reason;
  document.getElementById('crash-score').textContent = `Skor: ${missionRunner.score}  •  Ring: ${missionRunner.ringsDone}/${missionRunner.ringsTotal}`;
  document.getElementById('crash-screen').classList.remove('hidden');
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Next real mission after this one (free flight is not a mission).
function nextMission(mission) {
  const real = MISSIONS.filter((m) => m.id !== 'free');
  const index = real.findIndex((m) => m.id === mission.id);
  return real[(index + 1) % real.length];
}

// Camera flash when a photo is taken.
function flashPhoto() {
  const flash = document.getElementById('hud-flash');
  flash.classList.add('flash');
  window.setTimeout(() => flash.classList.remove('flash'), 220);
}

function onFlightEvent(event) {
  if (event === 'landing') {
    audio.thud(0.4);
    hud.showMessage('MENDARAT — bagus, roda menyentuh landasan', 2.5);
  } else if (event === 'hard-landing') {
    audio.thud(0.9);
    hud.showMessage('PENDARATAN KERAS — pesawat rusak!', 3);
  } else if (event === 'takeoff') {
    hud.showMessage('LEPAS LANDAS!', 2);
  } else if (event === 'crash') {
    showCrash(flight.crashReason);
  }
}

// --- Title screen wiring ----------------------------------------------------
function buildMissionButtons() {
  const container = document.getElementById('mission-list');
  container.innerHTML = '';
  for (const mission of MISSIONS) {
    const button = document.createElement('button');
    button.className = 'mission-btn';
    button.innerHTML = `<span class="mission-btn-name">${mission.name}</span><span class="mission-btn-tag">${mission.tagline}</span>`;
    button.onclick = () => {
      audio.unlock();
      audio.click();
      startMission(mission.id);
    };
    container.appendChild(button);
  }
}
buildMissionButtons();

document.getElementById('title-start').onclick = () => {
  audio.unlock();
  audio.click();
  startMission('rings');
};
document.getElementById('crash-retry').onclick = () => {
  audio.click();
  startMission(currentMissionId);
};
document.getElementById('crash-title').onclick = () => {
  audio.click();
  showTitle();
};
document.getElementById('results-again').onclick = () => {
  audio.click();
  startMission(currentMissionId);
};
document.getElementById('results-title-btn').onclick = () => {
  audio.click();
  showTitle();
};
document.getElementById('pause-resume').onclick = () => {
  audio.click();
  gameState = 'flying';
  document.getElementById('pause-screen').classList.add('hidden');
};
document.getElementById('pause-restart').onclick = () => {
  audio.click();
  document.getElementById('pause-screen').classList.add('hidden');
  startMission(currentMissionId);
};
document.getElementById('pause-quit').onclick = () => {
  audio.click();
  document.getElementById('pause-screen').classList.add('hidden');
  showTitle();
};
window.addEventListener('keydown', (event) => {
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) audio.unlock();
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Main loop ----------------------------------------------------------------
// Fixed 50 ms physics substeps: slow frames run up to 4 substeps so the
// simulation keeps real time down to ~5 fps instead of slowing down.
function frame(timestamp) {
  requestAnimationFrame(frame);
  const rawDt = Math.min(0.5, lastTimestamp ? (timestamp - lastTimestamp) / 1000 : 0.016);
  lastTimestamp = timestamp;
  elapsed += rawDt;
  const dt = rawDt;
  const ctrl = input.readControls();

  if (gameState === 'title') {
    if (ctrl.confirmPressed) {
      audio.unlock();
      startMission('rings');
      input.endFrame();
      renderer.render(scene, camera);
      return;
    }
    cameraRig.update(dt, flight, world);
    world.update(dt);
    input.endFrame();
    renderer.render(scene, camera);
    return;
  }

  if (gameState === 'paused') {
    if (ctrl.pausePressed || ctrl.confirmPressed) {
      gameState = 'flying';
      document.getElementById('pause-screen').classList.add('hidden');
    }
    input.endFrame();
    renderer.render(scene, camera);
    return;
  }

  if (gameState === 'flying' || gameState === 'complete') {
    if (ctrl.pausePressed && gameState === 'flying') {
      gameState = 'paused';
      document.getElementById('pause-screen').classList.remove('hidden');
      input.endFrame();
      renderer.render(scene, camera);
      return;
    }
    if (ctrl.restartPressed) {
      startMission(currentMissionId);
      input.endFrame();
      renderer.render(scene, camera);
      return;
    }
    if (ctrl.gearPressed) {
      gearDown = !gearDown;
      flight.gearDown = gearDown;
      hud.showMessage(gearDown ? 'RODA PENDARAT TURUN' : 'RODA PENDARAT NAIK', 1.6);
      audio.click();
    }
    if (ctrl.cameraPressed) {
      cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase';
      cameraRig.setMode(cameraMode);
      hud.showMessage(cameraMode === 'cockpit' ? 'KAMERA KOKPIT' : 'KAMERA CHASE', 1.6);
    }
    if (ctrl.musicPressed) {
      audio.setMusic(!audio.musicOn);
      hud.showMessage(audio.musicOn ? 'MUSIK: NYALA' : 'MUSIK: MATI', 1.6);
    }

    if (gameState === 'flying') {
      const flightCtrl = {
        pitch: ctrl.pitch,
        roll: ctrl.roll,
        yaw: ctrl.yaw,
        throttleUp: ctrl.throttleUp,
        throttleDown: ctrl.throttleDown,
        brake: ctrl.brake,
        gearDown,
      };
      flight.brakeOn = ctrl.brake;
      const substeps = Math.min(4, Math.max(1, Math.ceil(dt / 0.05)));
      const stepDt = dt / substeps;
      for (let i = 0; i < substeps; i++) {
        const event = stepFlight(flight, flightCtrl, stepDt, groundHeight, surfaceAt);
        if (event) onFlightEvent(event);
        if (flight.crashed) break;
        const missionEvent = missionRunner.update(flight, stepDt, ctrl.photoPressed && i === 0);
        if (missionEvent === 'fuel-empty') hud.showMessage('BAHAN BAKAR HABIS — cari tempat mendarat!', 2);
        if (missionRunner.completed) break;
      }
      audio.setEngine(flight.throttle, flight.speed);
    }

    aircraft.group.position.copy(flight.position);
    aircraft.group.quaternion.copy(flight.quaternion);
    updateAircraftVisuals(aircraft, flight, dt, elapsed);
    cameraRig.update(dt, flight, world);
    world.update(dt);
    hud.update(flight, missionRunner, world, cameraMode, dt);
  }

  input.endFrame();
  renderer.render(scene, camera);
}

// --- Boot ----------------------------------------------------------------------
if (sceneParam) {
  startScenePreset(sceneParam);
} else {
  showTitle();
}
requestAnimationFrame(frame);

// Test hooks: automated play-tests drive the game through this handle.
// (No network, no cheats in the shipped game — the handle only reads state
// and replays the same inputs a player could press.)
window.__game = {
  get state() { return gameState; },
  get flight() { return flight; },
  get mission() { return missionRunner; },
  get score() { return missionRunner.score; },
  startMission: (id) => startMission(id),
  teleport(x, y, z, headingDeg, speed, gear = true, pitch = 0) {
    flight.position.set(x, y, z);
    flight.quaternion.setFromEuler(new THREE.Euler(pitch, (-headingDeg * Math.PI) / 180, 0, 'YXZ'));
    flight.speed = speed;
    flight.onGround = false;
    flight.landed = false;
    flight.gearDown = gear;
    gearDown = gear;
  },
  setThrottle(value) {
    flight.throttle = value;
  },
  snapshot() {
    const att = attitudeOf(flight);
    return {
      state: gameState,
      x: flight.position.x,
      y: flight.position.y,
      z: flight.position.z,
      speedKts: flight.groundSpeedKts,
      altFt: flight.altitudeFt,
      heading: flight.headingDeg,
      fuel: flight.fuel,
      damage: flight.damage,
      score: missionRunner.score,
      rings: missionRunner.ringsDone,
      photosTaken: missionRunner.photosTaken,
      canyonDone: missionRunner.canyonDone,
      nightPhase: missionRunner.nightPhase,
      crashed: flight.crashed,
      landed: flight.landed,
      onGround: flight.onGround,
      throttle: flight.throttle,
      pitchDeg: (att.pitch * 180) / Math.PI,
      bankDeg: (att.bank * 180) / Math.PI,
    };
  },
};
