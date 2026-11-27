// aircraft.js — the Sky Courier fighter jet, built from primitives (v2).
// An F-14-style twin-engine fighter: pointed radome, bubble canopy with
// frame, swept wings with gloves, boxy side intakes, twin canted vertical
// stabilizers, stabilators, twin afterburner nozzles with orange glow and
// throttle-driven flames. Blue-orange livery with panel lines and rivets
// from a canvas texture. No propeller — this is a jet. The flight model
// lives in physics.js; this file only draws what it does.
const THREE = globalThis.THREE;

const JET_GREY = 0x9aa2ab;
const GREY_DARK = 0x5d646d;
const RADOME_GREY = 0x7d858e;
const NOZZLE_METAL = 0x3a3f46;
const FRAME_DARK = 0x2e3138;
const INTAKE_DARK = 0x0a0d10;
const FLASH_RED = 0xc23b2e;

// Livery palettes. 'standard' is the grey military scheme (kept as a
// fallback); 'default' is the blue-orange scheme from the reference
// (blue skin, orange fin flashes and wing tips) — the livery every scene
// flies, since main.js always passes 'default'.
const PALETTES = {
  standard: {
    base: '#9aa2ab', dark: GREY_DARK, radome: RADOME_GREY, flash: FLASH_RED,
    tip: GREY_DARK, line: 'rgba(40,48,56,0.30)', lineSoft: 'rgba(40,48,56,0.18)',
    rivet: 'rgba(40,48,56,0.35)',
  },
  default: {
    // Deep saturated blue: under the warm orange sunset light a mid blue
    // washes out to grey, so the base has to start much bluer — and in
    // daylight it must still read vivid blue, not grey.
    base: '#1e5fd6', dark: 0x0f2a55, radome: 0x1e56b8, flash: 0xff7a1a,
    tip: 0xff7a1a, line: 'rgba(6,20,48,0.35)', lineSoft: 'rgba(6,20,48,0.20)',
    rivet: 'rgba(6,20,48,0.40)',
  },
};

function makeRadialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// Panel lines + rivets for the jet skin: faint stations (rings along the
// length), longeron lines and rivet dots. A uniform grid on purpose — it
// reads as sheet-metal detail from any angle.
function makeJetTexture(pal) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = pal.base;
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = pal.line;
  ctx.lineWidth = 2;
  for (const v of [0.12, 0.3, 0.5, 0.7, 0.88]) {
    const y = v * 256;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
  ctx.strokeStyle = pal.lineSoft;
  ctx.lineWidth = 1.5;
  for (const u of [0.125, 0.375, 0.625, 0.875]) {
    const x = u * 512;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  ctx.fillStyle = pal.rivet;
  for (const v of [0.12, 0.3, 0.5, 0.7, 0.88]) {
    const y = v * 256;
    for (let x = 8; x < 512; x += 16) {
      ctx.beginPath();
      ctx.arc(x, y, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return new THREE.CanvasTexture(c);
}

// A cylinder (or thin rod) stretched between two points.
function strutBetween(ax, ay, az, bx, by, bz, r, mat) {
  const a = new THREE.Vector3(ax, ay, az);
  const b = new THREE.Vector3(bx, by, bz);
  const dir = b.clone().sub(a);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

export function buildAircraft(opts = {}) {
  const pal = PALETTES[opts.livery] || PALETTES.standard;
  const plane = new THREE.Group();
  const parts = { gearLegs: [], navLeft: null, navRight: null, strobe: null, afterburner: { left: null, right: null }, boostAfterburner: false };

  const jetMat = new THREE.MeshLambertMaterial({ map: makeJetTexture(pal) });
  const greyDark = new THREE.MeshLambertMaterial({ color: pal.dark });
  const tipMat = new THREE.MeshLambertMaterial({ color: pal.tip });
  const radomeMat = new THREE.MeshLambertMaterial({ color: pal.radome });
  const nozzleMat = new THREE.MeshLambertMaterial({ color: NOZZLE_METAL });
  const dark = new THREE.MeshLambertMaterial({ color: FRAME_DARK });
  const tireMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const hubMat = new THREE.MeshLambertMaterial({ color: 0x9aa2ab });
  const gearMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const glassDark = new THREE.MeshPhongMaterial({ color: 0x101c28, shininess: 240, transparent: true, opacity: 0.92 });
  const redFlash = new THREE.MeshLambertMaterial({ color: pal.flash });

  // --- Fuselage ------------------------------------------------------------
  // Pointed radome, slightly drooped. ConeGeometry points +Y; rotation.x
  // -PI/2 turns the tip forward (-Z).
  const radome = new THREE.Mesh(new THREE.ConeGeometry(0.62, 2.1, 14), radomeMat);
  radome.rotation.x = -Math.PI / 2;
  radome.position.set(0, -0.05, -4.25);
  plane.add(radome);
  // Front fuselage: tapered cylinder, wide and flat (scale x 1.3, z 0.9
  // after the X rotation the local Z becomes world height). Nose end
  // (radius 0.62) meets the radome base; aft end (0.78) meets the pancake.
  const frontFuse = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.62, 3.4, 16), jetMat);
  frontFuse.rotation.x = Math.PI / 2;
  frontFuse.scale.set(1.3, 1, 0.9);
  frontFuse.position.set(0, 0, -1.5);
  plane.add(frontFuse);
  // Rear centre section: the flat "pancake" between the engines.
  const pancake = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.95, 3.6), jetMat);
  pancake.position.set(0, -0.08, 1.9);
  plane.add(pancake);
  // Dorsal spine fairing over the joint, running back between the tails.
  const spine = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 3.5), jetMat);
  spine.position.set(0, 0.55, 1.85);
  plane.add(spine);
  // Twin engine nacelles, side by side at the tail.
  for (const side of [-1, 1]) {
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 3.4, 12), jetMat);
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(side * 0.95, -0.05, 2.0);
    plane.add(nacelle);
  }

  // --- Canopy ---------------------------------------------------------------
  // Two-seat tandem bubble, dark glass. Hidden in cockpit mode by
  // camera.js (from behind it renders as a dome that blocks the view);
  // the frame below stays visible so the cockpit still reads as a jet.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10), glassDark);
  canopy.scale.set(0.82, 0.55, 1.5);
  canopy.position.set(0, 0.72, -1.7);
  plane.add(canopy);
  parts.canopy = canopy;
  // Canopy frame: side rails only. Stays visible in cockpit mode — the
  // pilot sees the frame, the windscreen and the long pointed nose
  // ahead. The rails are thin and low so they hug the bottom edge of
  // the view instead of cutting across the sightline. There is
  // deliberately no bow arch in front: any frame element near eye level
  // read as a black bar across the ring, not as a canopy frame — the
  // windscreen's own tinted edge frames the view instead.
  const frame = new THREE.Group();
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 2.5), dark);
    rail.position.set(side * 0.70, 0.78, -1.7);
    frame.add(rail);
  }
  plane.add(frame);
  parts.canopyFrame = frame;
  // Sloped windscreen at the front of the canopy (top edge aft), kept
  // light and see-through: the cockpit camera looks through it.
  const windscreenMat = new THREE.MeshPhongMaterial({ color: 0x6a93b5, shininess: 200, transparent: true, opacity: 0.45 });
  const windscreen = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.85, 0.06), windscreenMat);
  windscreen.rotation.x = 0.5;
  windscreen.position.set(0, 0.72, -2.85);
  plane.add(windscreen);

  // --- Wings: swept, mid-mounted --------------------------------------------
  // Wing group origin at the root; rotation.y sweeps the tip aft
  // (right wing -0.55, left wing +0.55: +X maps toward +Z for negative
  // rotation). Cantilevered — no struts on a fighter.
  const haloTex = makeRadialTexture([
    [0, 'rgba(255,255,255,1)'],
    [0.3, 'rgba(255,255,255,0.55)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  function addHalo(x, y, z, color, scale, parent = plane) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTex, color, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(scale);
    parent.add(sprite);
  }
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    const panel = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.16, 2.0), jetMat);
    panel.position.x = side * 3.15;
    wing.add(panel);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 1.7), tipMat);
    tip.position.x = side * 5.75;
    wing.add(tip);
    // Nav light at the tip (red left, green right) + glow halo. The halo
    // is a child of the wing group at the light's own position: a halo
    // placed at a hand-computed swept position floats a metre off the tip
    // and reads as a detached glowing orb from the quarter camera.
    const navMat = new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff2a2a : 0x2aff66 });
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), navMat);
    nav.position.set(side * 5.85, 0, 0.2);
    wing.add(nav);
    addHalo(side * 5.85, 0, 0.2, side < 0 ? 0xff2a2a : 0x2aff66, 1.1, wing);
    wing.rotation.y = side * 0.55;
    wing.position.set(0, 0.12, 0.5);
    plane.add(wing);
    if (side < 0) parts.navLeft = nav;
    else parts.navRight = nav;
    // Fixed glove: the leading-edge extension at the wing root.
    const glove = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.14, 1.7), jetMat);
    glove.rotation.y = side * 0.35;
    glove.position.set(side * 1.25, 0.12, -0.55);
    plane.add(glove);
  }

  // --- Tail: twin canted fins + stabilators ----------------------------------
  for (const side of [-1, 1]) {
    // Vertical stabilizer, canted outward (top leans away from the
    // centreline) and swept back.
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.7, 1.5), jetMat);
    fin.position.set(side * 1.02, 1.15, 3.3);
    fin.rotation.z = -side * 0.14;
    fin.rotation.x = 0.2;
    plane.add(fin);
    // Red squadron flash on the fin tip.
    const flash = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, 1.05), redFlash);
    flash.position.set(side * 1.13, 1.92, 3.42);
    flash.rotation.z = -side * 0.14;
    flash.rotation.x = 0.2;
    plane.add(flash);
    // Horizontal stabilator, swept back, mounted on the aft fuselage.
    const stab = new THREE.Group();
    const stabPanel = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.12, 1.1), jetMat);
    stabPanel.position.x = side * 1.6;
    stab.add(stabPanel);
    stab.rotation.y = side * 0.45;
    stab.position.set(0, 0.28, 3.5);
    plane.add(stab);
  }

  // --- Intakes: boxy side intakes under the wing glove ------------------------
  for (const side of [-1, 1]) {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.0, 2.3), greyDark);
    intake.position.set(side * 1.15, -0.15, -0.6);
    plane.add(intake);
    const mouth = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.85, 0.06),
      new THREE.MeshLambertMaterial({ color: INTAKE_DARK }),
    );
    mouth.position.set(side * 1.15, -0.15, -1.78);
    plane.add(mouth);
  }

  // --- Afterburners: twin nozzles, glow discs, flames -------------------------
  for (const side of [-1, 1]) {
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.46, 0.8, 12), nozzleMat);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(side * 0.95, -0.05, 4.0);
    plane.add(nozzle);
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(0.36, 16),
      new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.9 }),
    );
    glow.position.set(side * 0.95, -0.05, 4.42);
    glow.castShadow = false;
    plane.add(glow);
    // Flame cone, tip aft (+Z after the X rotation). Length and opacity
    // follow the throttle in updateAircraftVisuals; no time flicker, so
    // the dossier screenshots stay deterministic across main.ts runs.
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.30, 1.3, 12),
      new THREE.MeshBasicMaterial({ color: 0xff8c1a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    flame.rotation.x = Math.PI / 2;
    flame.position.set(side * 0.95, -0.05, 5.07);
    flame.castShadow = false;
    plane.add(flame);
    // Blue-white core inside the orange flame: the hot inner jet of a
    // full afterburner. Invisible unless the staging boost is on.
    const core = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 1.0, 10),
      new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    core.rotation.x = Math.PI / 2;
    core.position.set(side * 0.95, -0.05, 4.95);
    core.castShadow = false;
    plane.add(core);
    addHalo(side * 0.95, -0.05, 4.55, 0xffa030, 2.0);
    parts.afterburner[side < 0 ? 'left' : 'right'] = { flame, glow, core };
  }

  // --- Landing gear: jet wheels, smaller than the bush plane's tundra tires.
  // Wheel bottoms sit at y = -1.4, matching the flight model's gear
  // height (1.35 m) so the jet sits right on the runway.
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.add(strutBetween(side * 1.0, -0.45, -0.6, side * 1.35, -0.98, -0.6, 0.08, gearMat));
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14), tireMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.35, -0.98, -0.6);
    leg.add(wheel);
    const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.32, 10), hubMat);
    hubCap.rotation.z = Math.PI / 2;
    hubCap.position.set(side * 1.35, -0.98, -0.6);
    leg.add(hubCap);
    plane.add(leg);
    parts.gearLegs.push(leg);
  }
  const noseLeg = new THREE.Group();
  const noseStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), gearMat);
  noseStrut.position.set(0, -0.83, -2.6);
  noseLeg.add(noseStrut);
  const noseWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12), tireMat);
  noseWheel.rotation.z = Math.PI / 2;
  noseWheel.position.set(0, -1.06, -2.6);
  noseLeg.add(noseWheel);
  const noseHub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.26, 10), hubMat);
  noseHub.rotation.z = Math.PI / 2;
  noseHub.position.set(0, -1.06, -2.6);
  noseLeg.add(noseHub);
  plane.add(noseLeg);
  parts.gearLegs.push(noseLeg);

  // --- Tail strobe (white, double-blinks) + halo, on the spine top -----------
  const strobe = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  strobe.position.set(0, 0.88, 3.4);
  plane.add(strobe);
  parts.strobe = strobe;
  addHalo(0, 0.88, 3.4, 0xffffff, 1.1);

  // Pitot tube on the radome, right side.
  const pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), dark);
  pitot.rotation.x = Math.PI / 2;
  pitot.position.set(0.45, 0.05, -4.9);
  plane.add(pitot);
  // Ventral strakes under the tail.
  for (const side of [-1, 1]) {
    const strake = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 1.0), greyDark);
    strake.rotation.x = 0.15;
    strake.position.set(side * 0.8, -0.75, 3.5);
    plane.add(strake);
  }

  plane.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
    }
  });
  // Additive flame/glow must not cast shadows (they are light, not metal).
  for (const side of ['left', 'right']) {
    const ab = parts.afterburner[side];
    ab.flame.castShadow = false;
    ab.glow.castShadow = false;
    if (ab.core) ab.core.castShadow = false;
  }
  return { group: plane, parts };
}

// Animate the moving parts from the flight state. Called every frame.
export function updateAircraftVisuals(aircraft, state, dt, elapsed) {
  const { parts } = aircraft;
  // Afterburner flame follows the throttle: brighter and longer at full
  // power. No time-based flicker — the dossier screenshots must stay
  // deterministic across main.ts runs.
  // Staging boost (?scene=sunset): long afterburner like the reference —
  // ~3.4x the flame, brighter, with the blue-white core lit. Gameplay
  // flames are untouched (boostAfterburner is false outside staging).
  const boost = aircraft.boostAfterburner === true;
  const flameOpacity = boost
    ? clamp(0.3 + state.throttle * 0.55, 0, 0.9)
    : clamp(0.12 + state.throttle * 0.45, 0, 0.6);
  const flameLen = boost
    ? (0.6 + state.throttle * 0.7) * 3.4
    : 0.6 + state.throttle * 0.7;
  for (const side of ['left', 'right']) {
    const ab = parts.afterburner[side];
    ab.flame.material.opacity = flameOpacity;
    ab.flame.scale.set(1, flameLen, 1);
    ab.glow.material.opacity = boost ? 0.9 : 0.5 + state.throttle * 0.5;
    if (ab.core) {
      ab.core.material.opacity = boost ? clamp(0.5 + state.throttle * 0.4, 0, 0.9) : 0;
      ab.core.scale.set(1, boost ? (0.5 + state.throttle * 0.5) * 2.6 : 1, 1);
    }
  }
  // Nav lights stay on; the tail strobe double-blinks.
  const blink = (elapsed % 1.4) < 0.12 || ((elapsed % 1.4) > 0.24 && (elapsed % 1.4) < 0.36);
  parts.strobe.visible = blink;
  // Gear legs fold up when retracted.
  for (const leg of parts.gearLegs) {
    leg.visible = state.gearDown !== false;
  }
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
