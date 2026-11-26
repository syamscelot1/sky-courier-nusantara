// missions.js — the sorties of Sky Courier. Six missions, six different
// ways to fly; free flight makes seven. Each one is playable to a finish
// and scores on its own terms, with fuel and damage always in play.
//   RING RUN    — thread 8 golden rings in order, against the clock.
//   ISLAND LANDING — put the plane down gently on runway 09.
//   CARGO RUN   — pick up a crate at the home field, land it on the
//                 remote dirt strip of the second island.
//   PHOTO RUN   — find three landmarks and photograph them (F) from the
//                 air: close and centred scores best.
//   CANYON TIME TRIAL — six low gates down the carved canyon, pure time.
//   NIGHT FLIGHT — dark sky, instruments only: reach the lighthouse,
//                 then come home and land on the lit runway.
//   FREE FLIGHT — no goal, just fly.
import { RUNWAY, DIRT_STRIP, CANYON_POINTS, CANYON_FLOOR } from './terrain.js';

const THREE = globalThis.THREE;

export const MISSIONS = [
  {
    id: 'rings',
    name: 'RING RUN',
    tagline: 'Terbang melewati 8 ring emas di atas kepulauan',
    parTime: 150,
    briefing: 'Lepas landas dari Bandara Nusantara dan terbang melewati 8 ring emas. Ring berikutnya menyala terang — ikuti panahnya. Semakin cepat, semakin besar bonus waktu.',
  },
  {
    id: 'landing',
    name: 'ISLAND LANDING',
    tagline: 'Mendarat mulus di runway Bandara Nusantara',
    parTime: 180,
    briefing: 'Terbang menuju runway 09, turunkan roda pendarat (G), dan sentuh landasan dengan lembut. Pendaratan dinilai dari kecepatan turun, kelurusan, dan zona sentuh.',
  },
  {
    id: 'cargo',
    name: 'CARGO RUN',
    tagline: 'Antar kargo ke strip terpencil Pulau Kedua',
    parTime: 300,
    briefing: 'Lepas landas ke timur dan terbang melewati gerbang kargo biru untuk memuat peti, lalu antar ke strip tanah Pulau Kedua dan mendarat di sana. Perhatikan bahan bakar — jaraknya jauh.',
  },
  {
    id: 'photo',
    name: 'PHOTO RUN',
    tagline: 'Foto 3 landmark dari udara — dekat dan pas tengah',
    parTime: 240,
    briefing: 'Tiga landmark menunggu difoto: mercusuar, danau kawah, dan puncak tertinggi. Dekati landmark, arahkan hidung pesawat ke arahnya, dan tekan F untuk memotret. Foto dekat dan pas tengah nilainya besar.',
  },
  {
    id: 'canyon',
    name: 'CANYON TIME TRIAL',
    tagline: 'Terbang rendah menembus canyon — adu waktu',
    parTime: 120,
    briefing: 'Enam gerbang oranye menanti di dasar canyon timur. Terbang rendah, ikuti lembah, dan lewati semua gerbang secepat mungkin. Dinding canyon tidak memaafkan.',
  },
  {
    id: 'night',
    name: 'NIGHT FLIGHT',
    tagline: 'Terbang malam hanya dengan instrumen',
    parTime: 300,
    briefing: 'Langit gelap, tanah nyaris tak terlihat. Terbang dengan instrumen menuju sinar mercusuar di Pulau Mercusuar, lalu pulang dan mendarat di runway yang lampunya menyala. Jangan andalkan mata — andalkan altimeter dan kompas.',
  },
  {
    id: 'free',
    name: 'FREE FLIGHT',
    tagline: 'Terbang bebas di atas kepulauan',
    parTime: 0,
    briefing: 'Tidak ada misi — terbang saja, nikmati pemandangan, dan coba mendarat di mana pun kamu bisa.',
  },
];

const RING_ROUTE = [
  [420, 700, 150], [-250, 300, 190], [350, -450, 120], [900, -300, 230],
  [1150, -950, 170], [1550, -1050, 130], [-600, 400, 200], [150, 950, 110],
];

export function getRingPositions(groundHeight) {
  return RING_ROUTE.map(([x, z, alt]) => new THREE.Vector3(x, groundHeight(x, z) + alt, z));
}

// The highest point of the main island, found by scanning the terrain.
function findPeak(groundHeight) {
  let best = { x: 0, z: 0, h: 0 };
  for (let x = -1200; x <= 1200; x += 100) {
    for (let z = -1200; z <= 1200; z += 100) {
      const h = groundHeight(x, z);
      if (h > best.h) best = { x, z, h };
    }
  }
  return best;
}

function canyonGatePositions(groundHeight) {
  const gates = [];
  const total = CANYON_POINTS.length - 1;
  for (let i = 0; i < 6; i++) {
    const t = (i + 0.5) / 6 * total;
    const seg = Math.min(total - 1, Math.floor(t));
    const frac = t - seg;
    const [ax, az] = CANYON_POINTS[seg];
    const [bx, bz] = CANYON_POINTS[seg + 1];
    const x = ax + (bx - ax) * frac;
    const z = az + (bz - az) * frac;
    gates.push(new THREE.Vector3(x, groundHeight(x, z) + 22, z));
  }
  return gates;
}

export function createMissionRunner(scene, world, onEvent) {
  const markerGroup = new THREE.Group();
  scene.add(markerGroup);
  const rings = [];
  const canyonGates = [];
  const photoTargets = [];
  const ringGeo = new THREE.TorusGeometry(14, 1.3, 10, 28);
  const gateGeo = new THREE.TorusGeometry(12, 1.1, 10, 28);
  const matNext = new THREE.MeshBasicMaterial({ color: 0xffc21c });
  const matIdle = new THREE.MeshBasicMaterial({ color: 0x8a7a4a, transparent: true, opacity: 0.55 });
  const matDone = new THREE.MeshBasicMaterial({ color: 0x2aff66, transparent: true, opacity: 0.7 });
  const matOrange = new THREE.MeshBasicMaterial({ color: 0xff6b2d });
  const matCyan = new THREE.MeshBasicMaterial({ color: 0x35c4ff, transparent: true, opacity: 0.9 });
  const beaconGeo = new THREE.CylinderGeometry(1.6, 1.6, 260, 8, 1, true);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffc21c, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false });
  const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  markerGroup.add(beacon);

  // Cargo gates: pickup just past the runway's east end (right in the
  // takeoff path), drop over the dirt strip.
  const pickupPos = new THREE.Vector3(520, RUNWAY.elevation + 45, RUNWAY.z);
  const pickupGate = new THREE.Mesh(gateGeo, matCyan.clone());
  pickupGate.position.copy(pickupPos);
  pickupGate.rotation.y = Math.PI / 2;
  const dropPos = new THREE.Vector3(DIRT_STRIP.x, world.groundHeight(DIRT_STRIP.x, DIRT_STRIP.z) + 60, DIRT_STRIP.z);
  const dropGate = new THREE.Mesh(gateGeo, matCyan.clone());
  dropGate.position.copy(dropPos);
  dropGate.rotation.y = Math.PI / 4;
  pickupGate.visible = false;
  dropGate.visible = false;
  markerGroup.add(pickupGate);
  markerGroup.add(dropGate);

  // Photo landmarks.
  const peak = findPeak(world.groundHeight);
  const photoDefs = [
    { name: 'MERCUSUAR', pos: new THREE.Vector3(-1450, world.groundHeight(-1450, 950) + 95, 950) },
    { name: 'DANAU KAWAH', pos: new THREE.Vector3(350, world.groundHeight(350, -450) + 85, -450) },
    { name: 'PUNCAK TERTINGGI', pos: new THREE.Vector3(peak.x, peak.h + 85, peak.z) },
  ];
  for (const def of photoDefs) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(10, 1, 10, 24), matCyan.clone());
    mesh.position.copy(def.pos);
    mesh.visible = false;
    markerGroup.add(mesh);
    photoTargets.push({ ...def, mesh, done: false, points: 0 });
  }

  // Canyon gates.
  const canyonPositions = canyonGatePositions(world.groundHeight);
  for (const pos of canyonPositions) {
    const mesh = new THREE.Mesh(gateGeo, matOrange.clone());
    mesh.position.copy(pos);
    mesh.visible = false;
    markerGroup.add(mesh);
    canyonGates.push({ mesh, position: pos, passed: false });
  }

  let current = null;
  let ringIndex = 0;
  let canyonIndex = 0;
  let elapsed = 0;
  let score = 0;
  let cargoLoaded = false;
  let completed = false;
  let landingScored = false;
  let nightPhase = 0; // 0 = fly to the lighthouse, 1 = return and land
  let photosTaken = 0;

  function buildRings() {
    for (const ring of rings) markerGroup.remove(ring.mesh);
    rings.length = 0;
    for (const pos of getRingPositions(world.groundHeight)) {
      const mesh = new THREE.Mesh(ringGeo, matIdle.clone());
      mesh.position.copy(pos);
      mesh.rotation.y = Math.PI / 2;
      markerGroup.add(mesh);
      rings.push({ mesh, position: pos, passed: false });
    }
  }

  function start(missionId) {
    current = MISSIONS.find((m) => m.id === missionId) || MISSIONS[0];
    ringIndex = 0;
    canyonIndex = 0;
    elapsed = 0;
    score = 0;
    cargoLoaded = false;
    completed = false;
    landingScored = false;
    nightPhase = 0;
    photosTaken = 0;
    world.setNight && world.setNight(current.id === 'night');
    buildRings();
    beacon.visible = current.id === 'rings';
    pickupGate.visible = current.id === 'cargo';
    dropGate.visible = false;
    for (const ring of rings) {
      ring.mesh.visible = current.id === 'rings' || current.id === 'free';
      ring.passed = false;
      ring.mesh.material = matIdle.clone();
    }
    if (current.id === 'rings' && rings[0]) rings[0].mesh.material = matNext.clone();
    for (const target of photoTargets) {
      target.mesh.visible = current.id === 'photo';
      target.done = false;
      target.points = 0;
    }
    for (const gate of canyonGates) {
      gate.mesh.visible = current.id === 'canyon';
      gate.passed = false;
      gate.mesh.material = matOrange.clone();
    }
    if (current.id === 'canyon' && canyonGates[0]) {
      canyonGates[0].mesh.material = matNext.clone();
    }
    return current;
  }

  function finish() {
    completed = true;
    const timeBonus = current.parTime > 0 ? Math.max(0, Math.round((current.parTime - elapsed) * 5)) : 0;
    score += timeBonus;
    onEvent && onEvent('mission-complete', { score, timeBonus, time: elapsed });
    return 'mission-complete';
  }

  // Called every frame while flying. photoPressed is true on the frame the
  // player pressed F. Returns an event string for the HUD.
  function update(state, dt, photoPressed) {
    if (!current || completed) return '';
    elapsed += dt;
    let event = '';

    if (current.id === 'rings' || current.id === 'free') {
      const target = rings[ringIndex];
      if (target && !target.passed) {
        target.mesh.rotation.y += dt * 0.25;
        const pulse = 1 + Math.sin(elapsed * 4) * 0.06;
        target.mesh.scale.setScalar(pulse);
        beacon.position.set(target.position.x, target.position.y + 70, target.position.z);
        if (state.position.distanceTo(target.position) < 14) {
          target.passed = true;
          target.mesh.material = matDone.clone();
          target.mesh.scale.setScalar(1);
          score += 100;
          event = 'ring';
          onEvent && onEvent('ring', { index: ringIndex, score });
          ringIndex += 1;
          if (current.id === 'rings' && ringIndex >= rings.length) {
            event = finish();
          } else if (rings[ringIndex]) {
            rings[ringIndex].mesh.material = matNext.clone();
          }
        }
      }
    }

    if (current.id === 'cargo') {
      pickupGate.rotation.y += dt * 0.3;
      dropGate.rotation.y += dt * 0.3;
      if (!cargoLoaded && state.position.distanceTo(pickupPos) < 13) {
        cargoLoaded = true;
        score += 250;
        pickupGate.visible = false;
        dropGate.visible = true;
        event = 'cargo-pickup';
        onEvent && onEvent('cargo-pickup', { score });
      }
    }

    if (current.id === 'photo') {
      for (const target of photoTargets) {
        target.mesh.rotation.y += dt * 0.4;
      }
      if (photoPressed) {
        let best = null;
        let bestScore = 0;
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(state.quaternion);
        for (const target of photoTargets) {
          if (target.done) continue;
          const toTarget = new THREE.Vector3().subVectors(target.pos, state.position);
          const dist = toTarget.length();
          if (dist > 260) continue;
          const dot = forward.dot(toTarget.normalize());
          if (dot < 0.7) continue;
          const points = 100 + Math.round(200 * (1 - dist / 260) * (0.5 + 0.5 * dot));
          if (points > bestScore) {
            bestScore = points;
            best = target;
          }
        }
        if (best) {
          best.done = true;
          best.points = bestScore;
          best.mesh.material = matDone.clone();
          photosTaken += 1;
          score += bestScore;
          event = 'photo';
          onEvent && onEvent('photo', { name: best.name, points: bestScore, score, taken: photosTaken });
          if (photosTaken >= photoTargets.length) event = finish();
        } else {
          event = 'photo-miss';
          onEvent && onEvent('photo-miss', {});
        }
      }
    }

    if (current.id === 'canyon') {
      const gate = canyonGates[canyonIndex];
      if (gate && !gate.passed) {
        gate.mesh.rotation.y += dt * 0.3;
        const pulse = 1 + Math.sin(elapsed * 5) * 0.08;
        gate.mesh.scale.setScalar(pulse);
        if (state.position.distanceTo(gate.position) < 12) {
          gate.passed = true;
          gate.mesh.material = matDone.clone();
          gate.mesh.scale.setScalar(1);
          score += 100;
          event = 'ring';
          onEvent && onEvent('ring', { index: canyonIndex, score });
          canyonIndex += 1;
          if (canyonIndex >= canyonGates.length) {
            event = finish();
          } else if (canyonGates[canyonIndex]) {
            canyonGates[canyonIndex].mesh.material = matNext.clone();
          }
        }
      }
    }

    if (current.id === 'night') {
      const lighthouse = new THREE.Vector3(-1450, world.groundHeight(-1450, 950) + 40, 950);
      if (nightPhase === 0 && state.position.distanceTo(lighthouse) < 200) {
        nightPhase = 1;
        score += 250;
        event = 'night-beacon';
        onEvent && onEvent('night-beacon', { score });
      }
    }

    if ((current.id === 'landing' || current.id === 'cargo' || current.id === 'night') && state.landed && !landingScored) {
      const surface = world.surfaceAt(state.position.x, state.position.z);
      const wanted = current.id === 'cargo' ? 'strip' : 'runway';
      if (surface === wanted && state.speed < 25) {
        if (current.id === 'night' && nightPhase === 0) {
          // Landed before reaching the lighthouse: not the goal yet.
          event = 'wrong-field';
          onEvent && onEvent('wrong-field', { surface });
        } else {
          landingScored = true;
          const softness = Math.max(0, 500 - Math.round(state.touchdownVs));
          score += softness + 150;
          event = finish();
        }
      } else if (surface && surface !== wanted) {
        event = 'wrong-field';
        onEvent && onEvent('wrong-field', { surface });
      }
    }

    if (state.fuel <= 0 && !state.landed && !completed) {
      event = event || 'fuel-empty';
    }
    return event;
  }

  function currentTarget() {
    if (!current) return null;
    if (current.id === 'rings' || current.id === 'free') {
      const target = rings[ringIndex];
      if (!target) return null;
      return { position: target.position, label: `RING ${ringIndex + 1} / ${rings.length}`, kind: 'ring' };
    }
    if (current.id === 'cargo') {
      if (!cargoLoaded) return { position: pickupPos, label: 'AMBIL KARGO — GERBANG BIRU', kind: 'gate' };
      return { position: dropPos, label: 'ANTAR KE PULAU KEDUA', kind: 'gate' };
    }
    if (current.id === 'landing') {
      const r = world.runway;
      return { position: new THREE.Vector3(r.x, r.elevation + 30, r.z), label: 'MENDARAT DI RUNWAY 09', kind: 'runway' };
    }
    if (current.id === 'photo') {
      const next = photoTargets.find((t) => !t.done);
      if (!next) return null;
      return { position: next.pos, label: `FOTO: ${next.name}`, kind: 'photo' };
    }
    if (current.id === 'canyon') {
      const gate = canyonGates[canyonIndex];
      if (!gate) return null;
      return { position: gate.position, label: `GERBANG ${canyonIndex + 1} / ${canyonGates.length}`, kind: 'gate' };
    }
    if (current.id === 'night') {
      if (nightPhase === 0) {
        return { position: new THREE.Vector3(-1450, world.groundHeight(-1450, 950) + 40, 950), label: 'MENUJU MERCUSUAR', kind: 'beacon' };
      }
      const r = world.runway;
      return { position: new THREE.Vector3(r.x, r.elevation + 30, r.z), label: 'PULANG — MENDARAT DI RUNWAY 09', kind: 'runway' };
    }
    return null;
  }

  function objectiveText() {
    if (!current) return '';
    if (completed) return 'MISI SELESAI — skor tersimpan. Tekan R untuk terbang lagi.';
    if (current.id === 'rings') return `Ring ${Math.min(ringIndex + 1, 8)} dari 8 — ikuti ring emas berikutnya`;
    if (current.id === 'landing') return 'Mendarat di runway 09 — roda turun (G), pelan-pelan';
    if (current.id === 'cargo') {
      return cargoLoaded
        ? 'Kargo dimuat — antar ke strip Pulau Kedua dan mendarat'
        : 'Lepas landas ke timur, terbang lewat gerbang biru untuk memuat kargo';
    }
    if (current.id === 'photo') return `Foto ${photosTaken} dari 3 landmark — dekati, arahkan hidung, tekan F`;
    if (current.id === 'canyon') return `Gerbang ${Math.min(canyonIndex + 1, 6)} dari 6 — tetap rendah, tetap cepat`;
    if (current.id === 'night') {
      return nightPhase === 0
        ? 'Gelap total — ikuti kompas ke sinar mercusuar di barat'
        : 'Mercusuar tercapai — pulang dan mendarat di runway 09';
    }
    return 'Terbang bebas — nikmati kepulauan Nusantara';
  }

  return {
    start,
    update,
    currentTarget,
    objectiveText,
    get mission() { return current; },
    get score() { return score; },
    get elapsed() { return elapsed; },
    get completed() { return completed; },
    get cargoLoaded() { return cargoLoaded; },
    get ringsTotal() { return rings.length; },
    get ringsDone() { return ringIndex; },
    get photosTaken() { return photosTaken; },
    get canyonDone() { return canyonIndex; },
    get canyonTotal() { return canyonGates.length; },
    get nightPhase() { return nightPhase; },
    get photoTargets() { return photoTargets.map((t) => ({ name: t.name, pos: t.pos, done: t.done })); },
    get canyonGatePositions() { return canyonPositions; },
  };
}
