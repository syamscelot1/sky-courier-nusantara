// aircraft.js — the Sky Courier bush plane, built from primitives (v2).
// A high-wing STOL bush plane: fat cabin tapering to a narrow tail, big
// tundra tires, two-tone livery with panel lines and rivets from a canvas
// texture, dark glass cabin windows, detailed prop + spinner, nav-light
// halos, exhaust pipe, pitot tube. The flight model lives in
// physics.js; this file only draws what it does.
const THREE = globalThis.THREE;

const PAINT_CREAM = 0xf2ead8;
const PAINT_TEAL = 0x0f7a6e;
const PAINT_ORANGE = 0xe86a1c;
const GLASS_DARK = 0x16283a;

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

// Panel lines + rivets for the fuselage: a cream canvas with faint stations
// (rings along the length), longeron lines and rivet dots. The pattern is
// a uniform grid on purpose — it reads as sheet-metal detail from any angle.
function makeFuselageTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2ead8';
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = 'rgba(90,70,50,0.28)';
  ctx.lineWidth = 2;
  for (const v of [0.12, 0.3, 0.5, 0.7, 0.88]) {
    const y = v * 256;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(90,70,50,0.16)';
  ctx.lineWidth = 1.5;
  for (const u of [0.125, 0.375, 0.625, 0.875]) {
    const x = u * 512;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(90,70,50,0.35)';
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

export function buildAircraft() {
  const plane = new THREE.Group();
  const parts = { propeller: null, gearLegs: [], navLeft: null, navRight: null, strobe: null };

  const fuselageMat = new THREE.MeshLambertMaterial({ map: makeFuselageTexture() });
  const cream = new THREE.MeshLambertMaterial({ color: PAINT_CREAM });
  const teal = new THREE.MeshLambertMaterial({ color: PAINT_TEAL });
  const orange = new THREE.MeshLambertMaterial({ color: PAINT_ORANGE });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
  const glass = new THREE.MeshPhongMaterial({ color: 0x5d8fae, shininess: 180, transparent: true, opacity: 0.8 });
  const glassDark = new THREE.MeshPhongMaterial({ color: GLASS_DARK, shininess: 220, transparent: true, opacity: 0.95 });

  // Fuselage: fat cabin tapering to a narrow tail. CylinderGeometry's top
  // radius (+Y) becomes the tail after the X rotation, so top is narrow.
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.05, 7.2, 16), fuselageMat);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.z = 0.4;
  plane.add(fuselage);
  // Pointed tail cone.
  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 12), cream);
  tailCone.rotation.x = Math.PI / 2;
  tailCone.position.z = 4.35;
  plane.add(tailCone);
  // Teal nose bowl.
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.05, 14, 10), teal);
  nose.scale.set(0.95, 0.88, 0.7);
  nose.position.set(0, -0.06, -3.2);
  plane.add(nose);
  // Teal cheatline stripe along the cabin (a proud band, like a decal).
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.34, 4.0), teal);
  stripe.position.set(0, 0.05, -0.7);
  plane.add(stripe);

  // Cabin roof bubble, kept low so it fairs into the high wing above it.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.95, 14, 10), glass);
  canopy.scale.set(0.85, 0.6, 1.4);
  canopy.position.set(0, 0.35, -1.3);
  plane.add(canopy);
  parts.canopy = canopy;
  // Sloped windscreen from the nose up to the canopy front (top edge aft).
  // Kept light and see-through: the cockpit camera looks through it.
  const windscreenMat = new THREE.MeshPhongMaterial({ color: 0x7fa8c0, shininess: 200, transparent: true, opacity: 0.5 });
  const windscreen = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.95, 0.06), windscreenMat);
  windscreen.rotation.x = 0.55;
  windscreen.position.set(0, 0.6, -2.55);
  plane.add(windscreen);
  // Dark cabin windows, front and rear pairs, set just proud of the skin.
  // Fuselage radius: r(z) = 1.05 - 0.5 * (z + 3.2) / 7.2.
  for (const side of [-1, 1]) {
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.65, 1.1), glassDark);
    front.position.set(side * 0.88, 0.35, -0.6);
    plane.add(front);
    const rear = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 1.0), glassDark);
    rear.position.set(side * 0.78, 0.35, 0.9);
    plane.add(rear);
  }

  // High wing: mounted on top of the cabin, slight dihedral, orange tips.
  // Wing group origin sits at the wing's centre section (y +1.0, z -0.1).
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    const panel = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.22, 1.9), cream);
    panel.position.x = side * 3.1;
    wing.add(panel);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.24, 1.9), orange);
    tip.position.x = side * 5.6;
    wing.add(tip);
    // Landing-light lens in the leading edge.
    const lens = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.12, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xfff6d8 }),
    );
    lens.position.set(side * 5.9, 0, -0.85);
    wing.add(lens);
    // Nav light at the tip (red left, green right) + glow halo.
    const navMat = new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff2a2a : 0x2aff66 });
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), navMat);
    nav.position.set(side * 6.05, 0, 0.4);
    wing.add(nav);
    wing.rotation.z = side * 0.04;
    // High wing: above the cockpit camera (which sits at y +1.05), high
    // enough that its underside sits in the top third of the cockpit view
    // instead of filling the middle of it. The centre-section fairing
    // below joins it to the cabin roof.
    wing.position.set(0, 1.35, -0.3);
    plane.add(wing);
    if (side < 0) parts.navLeft = nav;
    else parts.navRight = nav;
    // Lift strut from the lower fuselage up to the wing.
    plane.add(strutBetween(side * 0.6, -0.55, -0.3, side * 2.8, 1.3, -0.3, 0.07, dark));
  }
  // Wing centre-section fairing: joins the cabin roof to the wing.
  const centreSection = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 1.6), cream);
  centreSection.position.set(0, 1.08, -0.3);
  plane.add(centreSection);
  // Nav-light halos (additive sprites, shared radial texture).
  const haloTex = makeRadialTexture([
    [0, 'rgba(255,255,255,1)'],
    [0.3, 'rgba(255,255,255,0.55)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  function addHalo(x, y, z, color, scale) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTex, color, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(scale);
    plane.add(sprite);
  }
  addHalo(-6.05, 1.35, 0.1, 0xff2a2a, 1.8);
  addHalo(6.05, 1.35, 0.1, 0x2aff66, 1.8);

  // Tail: horizontal stabiliser + swept fin, teal with orange tip,
  // and a dorsal fillet fairing the fin into the fuselage.
  const hStab = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.16, 1.2), teal);
  hStab.position.set(0, 0.3, 3.9);
  plane.add(hStab);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.9, 1.5), teal);
  fin.position.set(0, 1.05, 3.9);
  fin.rotation.x = -0.12;
  plane.add(fin);
  const finTip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 1.0), orange);
  finTip.position.set(0, 2.1, 4.0);
  finTip.rotation.x = -0.12;
  plane.add(finTip);
  const dorsal = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 1.7), teal);
  dorsal.position.set(0, 0.95, 3.1);
  dorsal.rotation.x = -0.55;
  plane.add(dorsal);

  // Propeller: spinner cone + hub + backplate + two blades, spins with
  // throttle. The blur disc fades in as it spins up.
  const prop = new THREE.Group();
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 12), orange);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -0.4;
  prop.add(spinner);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.7, 10), dark);
  hub.rotation.x = Math.PI / 2;
  hub.position.z = -0.15;
  prop.add(hub);
  const backplate = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 20),
    new THREE.MeshLambertMaterial({ color: 0x3a3f46 }),
  );
  backplate.position.z = 0.08;
  prop.add(backplate);
  const blades = new THREE.Group();
  for (const angle of [0, Math.PI]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 3.4, 0.12), dark);
    blade.position.z = 0.1;
    const holder = new THREE.Group();
    holder.rotation.z = angle;
    holder.add(blade);
    blades.add(holder);
  }
  prop.add(blades);
  parts.propBlades = blades;
  prop.position.z = -4.05;
  plane.add(prop);
  parts.propeller = prop;

  // Tundra landing gear: big fat mains on spring struts, smaller nose
  // wheel. Wheel bottoms sit at y = -1.4, matching the flight model's
  // gear height (1.35 m) so the plane sits right on the runway.
  const gearMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const hubMat = new THREE.MeshLambertMaterial({ color: 0x9aa2ab });
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.add(strutBetween(side * 0.8, -0.35, -0.6, side * 1.35, -0.85, -0.6, 0.09, gearMat));
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.42, 14), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.35, -0.85, -0.6);
    leg.add(wheel);
    const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.44, 10), hubMat);
    hubCap.rotation.z = Math.PI / 2;
    hubCap.position.set(side * 1.35, -0.85, -0.6);
    leg.add(hubCap);
    plane.add(leg);
    parts.gearLegs.push(leg);
  }
  const noseLeg = new THREE.Group();
  const noseStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.6, 8), gearMat);
  noseStrut.position.set(0, -0.7, -2.6);
  noseLeg.add(noseStrut);
  const noseWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), wheelMat);
  noseWheel.rotation.z = Math.PI / 2;
  noseWheel.position.set(0, -0.98, -2.6);
  noseLeg.add(noseWheel);
  const noseHub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.32, 10), hubMat);
  noseHub.rotation.z = Math.PI / 2;
  noseHub.position.set(0, -0.98, -2.6);
  noseLeg.add(noseHub);
  plane.add(noseLeg);
  parts.gearLegs.push(noseLeg);

  // Tail strobe (white, double-blinks) + halo.
  const strobe = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  strobe.position.set(0, 0.35, 4.45);
  plane.add(strobe);
  parts.strobe = strobe;
  addHalo(0, 0.35, 4.45, 0xffffff, 1.6);

  // Pitot tube under the left wing. (The roof antenna mast + wire were
  // removed: the mast sat on the cockpit camera's sightline and blocked
  // the ring in the cockpit screenshot.)
  const pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), dark);
  pitot.rotation.x = Math.PI / 2;
  pitot.position.set(-2.6, 1.2, -0.9);
  plane.add(pitot);
  // Exhaust pipe under the nose, right side, angled back.
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.9, 8), dark);
  exhaust.rotation.x = 1.1;
  exhaust.position.set(0.72, -0.72, -2.7);
  plane.add(exhaust);

  // Prop blur disc: a radial blur texture (thin near the hub, fading at
  // the rim) instead of a flat grey disc.
  const discTex = makeRadialTexture([
    [0, 'rgba(70,70,70,0)'],
    [0.15, 'rgba(70,70,70,0.55)'],
    [0.8, 'rgba(95,95,95,0.5)'],
    [1, 'rgba(95,95,95,0)'],
  ]);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.85, 24),
    new THREE.MeshBasicMaterial({ map: discTex, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }),
  );
  disc.position.z = -4.0;
  plane.add(disc);
  parts.propDisc = disc;

  plane.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
    }
  });
  return { group: plane, parts };
}

// Animate the moving parts from the flight state. Called every frame.
export function updateAircraftVisuals(aircraft, state, dt, elapsed) {
  const { parts } = aircraft;
  // Propeller speed follows the throttle; the disc fades in as it spins up.
  const spin = 6 + state.throttle * 42;
  parts.propeller.rotation.z += spin * dt;
  parts.propDisc.material.opacity = clamp((state.throttle - 0.25) * 0.45, 0, 0.3);
  parts.propDisc.rotation.z += spin * dt * 0.5;
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
