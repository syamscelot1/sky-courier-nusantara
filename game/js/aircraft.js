// aircraft.js — the Sky Courier bush plane, built from primitives.
// One job: build the aircraft mesh and animate its moving parts
// (propeller, nav lights, landing gear). The flight model lives in
// physics.js; this file only draws what it does.
const THREE = globalThis.THREE;

const PAINT_CREAM = 0xf2ead8;
const PAINT_TEAL = 0x0f7a6e;
const PAINT_ORANGE = 0xe86a1c;
const GLASS = 0x9fd4e8;

export function buildAircraft() {
  const plane = new THREE.Group();
  const parts = { propeller: null, gearLegs: [], navLeft: null, navRight: null, strobe: null };

  const cream = new THREE.MeshLambertMaterial({ color: PAINT_CREAM });
  const teal = new THREE.MeshLambertMaterial({ color: PAINT_TEAL });
  const orange = new THREE.MeshLambertMaterial({ color: PAINT_ORANGE });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
  const glass = new THREE.MeshPhongMaterial({ color: GLASS, shininess: 140, transparent: true, opacity: 0.85 });

  // Fuselage: a tapered cylinder with a rounded nose.
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.55, 7.2, 14), cream);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.z = 0.4;
  plane.add(fuselage);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.05, 14, 10), teal);
  nose.scale.set(1, 1, 0.7);
  nose.position.z = -3.2;
  plane.add(nose);
  // Teal cheatline stripe along the fuselage.
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.34, 6.4), teal);
  stripe.position.set(0, 0.05, 0.4);
  plane.add(stripe);

  // Cockpit canopy: a glass bubble on top, front.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.95, 14, 10), glass);
  canopy.scale.set(0.9, 0.75, 1.5);
  canopy.position.set(0, 0.85, -1.4);
  plane.add(canopy);
  parts.canopy = canopy;
  // Cabin windows behind the canopy.
  for (const side of [-1, 1]) {
    const windowPane = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 1.6), glass);
    windowPane.position.set(side * 1.0, 0.55, 0.7);
    plane.add(windowPane);
  }

  // Main wings: low wing, slight dihedral, orange tips.
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    const panel = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.22, 1.9), cream);
    panel.position.x = side * 3.1;
    wing.add(panel);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.24, 1.9), orange);
    tip.position.x = side * 5.6;
    wing.add(tip);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 0.12), dark);
    strut.position.set(side * 2.2, -0.7, 0.3);
    strut.rotation.z = side * 0.5;
    wing.add(strut);
    wing.rotation.z = side * 0.06;
    wing.position.y = -0.35;
    plane.add(wing);
  }

  // Tail: horizontal stabiliser + vertical fin, teal with orange tip.
  const hStab = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.16, 1.1), teal);
  hStab.position.set(0, 0.25, 3.9);
  plane.add(hStab);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.7, 1.4), teal);
  fin.position.set(0, 1.0, 3.9);
  plane.add(fin);
  const finTip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 1.0), orange);
  finTip.position.set(0, 1.95, 3.95);
  plane.add(finTip);

  // Propeller: spinner cone + two blades, spins with throttle.
  const prop = new THREE.Group();
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 12), orange);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -0.4;
  prop.add(spinner);
  for (const angle of [0, Math.PI]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 3.4, 0.12), dark);
    blade.position.z = 0.1;
    const holder = new THREE.Group();
    holder.rotation.z = angle;
    holder.add(blade);
    prop.add(holder);
  }
  prop.position.z = -4.05;
  plane.add(prop);
  parts.propeller = prop;

  // Landing gear: two mains + nose wheel, fold away when retracted.
  const gearMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.5, 8), gearMat);
    strut.position.y = -0.75;
    leg.add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.y = -1.5;
    leg.add(wheel);
    leg.position.set(side * 1.1, -0.9, -0.6);
    plane.add(leg);
    parts.gearLegs.push(leg);
  }
  const noseLeg = new THREE.Group();
  const noseStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.4, 8), gearMat);
  noseStrut.position.y = -0.7;
  noseLeg.add(noseStrut);
  const noseWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12), wheelMat);
  noseWheel.rotation.z = Math.PI / 2;
  noseWheel.position.y = -1.4;
  noseLeg.add(noseWheel);
  noseLeg.position.set(0, -0.9, -2.6);
  plane.add(noseLeg);
  parts.gearLegs.push(noseLeg);

  // Navigation lights: red left, green right, white strobe on the tail.
  const navLeft = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
  );
  navLeft.position.set(-6.05, -0.3, 0.4);
  plane.add(navLeft);
  parts.navLeft = navLeft;
  const navRight = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0x2aff66 }),
  );
  navRight.position.set(6.05, -0.3, 0.4);
  plane.add(navRight);
  parts.navRight = navRight;
  const strobe = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  strobe.position.set(0, 0.35, 4.45);
  plane.add(strobe);
  parts.strobe = strobe;

  // A faint spinning disc so the prop reads at speed.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.85, 24),
    new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.0, side: THREE.DoubleSide }),
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
  parts.propDisc.material.opacity = clamp((state.throttle - 0.25) * 0.35, 0, 0.22);
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
