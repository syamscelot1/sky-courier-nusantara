// terrain.js — the Nusantara archipelago Sky Courier flies over.
// One job: own the ground. It builds the 3D world (terrain mesh, ocean,
// lake, runways, town, lighthouse, clouds, sky) and answers the one
// question the flight model keeps asking: how high is the ground here?
const THREE = globalThis.THREE;

// --- Deterministic value noise (seeded by lattice hash, no Math.random) -----
function hash2(ix, iz) {
  let n = (ix * 374761393 + iz * 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function smooth(t) {
  return t * t * (3 - 2 * t);
}
function valueNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  const ux = smooth(fx);
  const uz = smooth(fz);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
function fbm(x, z) {
  return valueNoise(x, z) * 0.55 + valueNoise(x * 2.13, z * 2.13) * 0.3 + valueNoise(x * 4.31, z * 4.31) * 0.15;
}

// --- The airfields ----------------------------------------------------------
export const RUNWAY = {
  x: 150, z: 950, elevation: 18, headingDeg: 90, length: 700, width: 34,
  name: 'BANDARA NUSANTARA',
};
export const DIRT_STRIP = {
  x: 1550, z: -1050, elevation: 26, headingDeg: 40, length: 420, width: 26,
  name: 'PULAU KEDUA STRIP',
};

// --- The canyon -------------------------------------------------------------
// A carved valley on the east side of the main island, the canyon time
// trial's race course. A polyline down the valley floor; the ground is
// pressed down near it so the walls stand on both sides.
export const CANYON_POINTS = [
  [1050, 420], [1010, 120], [930, -160], [820, -430], [680, -680], [520, -900],
];
export const CANYON_FLOOR = 42;

function distanceToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (pz - az) * dz) / lenSq;
  t = clamp(t, 0, 1);
  const qx = ax + t * dx;
  const qz = az + t * dz;
  return Math.hypot(px - qx, pz - qz);
}

function canyonBlend(x, z) {
  let nearest = Infinity;
  for (let i = 0; i < CANYON_POINTS.length - 1; i++) {
    const [ax, az] = CANYON_POINTS[i];
    const [bx, bz] = CANYON_POINTS[i + 1];
    nearest = Math.min(nearest, distanceToSegment(x, z, ax, az, bx, bz));
  }
  if (nearest > 190) return 0;
  // Floor flat within 70 m of the centreline, walls rise over the next 120 m.
  const wall = smooth(clamp((nearest - 70) / 120, 0, 1));
  return 1 - wall;
}

// Flat approach valleys along each airfield's extended centreline, so the
// landing approach is a valley, not a hillside: the runway sits in a bowl
// of hills, and without these a final approach has to dive over a ridge.
function corridorBlend(airfield, x, z, alongLimit = 950, fade = 200) {
  const heading = (airfield.headingDeg * Math.PI) / 180;
  const dx = x - airfield.x;
  const dz = z - airfield.z;
  const along = dx * Math.sin(heading) + dz * Math.cos(heading);
  const across = dx * Math.cos(heading) - dz * Math.sin(heading);
  if (Math.abs(along) > alongLimit || Math.abs(across) > 170) return 0;
  const lateral = smooth(clamp((170 - Math.abs(across)) / 90, 0, 1));
  const ends = smooth(clamp((alongLimit - Math.abs(along)) / fade, 0, 1));
  return lateral * ends;
}
function runwayLocal(airfield, x, z) {
  const heading = (airfield.headingDeg * Math.PI) / 180;
  const dx = x - airfield.x;
  const dz = z - airfield.z;
  const along = dx * Math.sin(heading) + dz * Math.cos(heading);
  const across = dx * Math.cos(heading) - dz * Math.sin(heading);
  return { along, across };
}
function flattenBlend(airfield, x, z) {
  const { along, across } = runwayLocal(airfield, x, z);
  const halfL = airfield.length / 2 + 90;
  const halfW = airfield.width / 2 + 70;
  if (Math.abs(along) > halfL || Math.abs(across) > halfW) return 0;
  const edge = Math.min((halfL - Math.abs(along)) / 90, (halfW - Math.abs(across)) / 70, 1);
  return smooth(clamp(edge, 0, 1));
}

function islandHeight(cx, cz, radius, peak, x, z) {
  const dx = x - cx;
  const dz = z - cz;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d >= radius) return 0;
  const fall = 1 - (d / radius) * (d / radius);
  const n = fbm(x * 0.0016 + 7.3, z * 0.0016 + 2.9);
  return fall * (peak * 0.3 + peak * 0.7 * n);
}

// The single source of truth for ground height, shared by the mesh,
// the flight model, the missions and the screenshot staging.
export function groundHeight(x, z) {
  let h = 0;
  h = Math.max(h, islandHeight(0, 0, 1750, 285, x, z));
  h = Math.max(h, islandHeight(1550, -1050, 780, 135, x, z));
  h = Math.max(h, islandHeight(-1450, 950, 540, 95, x, z));
  // The crater lake on the main island: a flat bowl of water.
  const ldx = x - 350;
  const ldz = z + 450;
  const ld = Math.sqrt(ldx * ldx + ldz * ldz);
  if (ld < 230) {
    const blend = smooth(clamp((230 - ld) / 70, 0, 1));
    h = h * (1 - blend) + 9 * blend;
  }
  // Flatten the ground under both airfields.
  const rb = flattenBlend(RUNWAY, x, z);
  if (rb > 0) h = h * (1 - rb) + RUNWAY.elevation * rb;
  const sb = flattenBlend(DIRT_STRIP, x, z);
  if (sb > 0) h = h * (1 - sb) + DIRT_STRIP.elevation * sb;
  // Carve the canyon valley, then the flat approach corridors.
  const cb = canyonBlend(x, z);
  if (cb > 0) h = h * (1 - cb) + Math.min(h, CANYON_FLOOR) * cb;
  // The home runway gets a long approach valley (flat to 1100 m out, so a
  // final approach starts over flat ground, not a hillside). The strip
  // keeps the short corridor. Corridors never touch the sea: blending
  // water up to airfield elevation would build a land bridge.
  const rCorr = corridorBlend(RUNWAY, x, z, 1400, 300);
  if (rCorr > 0 && h > 0.6) h = h * (1 - rCorr) + RUNWAY.elevation * rCorr;
  const sCorr = corridorBlend(DIRT_STRIP, x, z);
  if (sCorr > 0 && h > 0.6) h = h * (1 - sCorr) + DIRT_STRIP.elevation * sCorr;
  return h;
}

// 'runway' | 'strip' | null — used for landing rules and mission checks.
export function surfaceAt(x, z) {
  const r = runwayLocal(RUNWAY, x, z);
  if (Math.abs(r.along) <= RUNWAY.length / 2 && Math.abs(r.across) <= RUNWAY.width / 2) return 'runway';
  const s = runwayLocal(DIRT_STRIP, x, z);
  if (Math.abs(s.along) <= DIRT_STRIP.length / 2 && Math.abs(s.across) <= DIRT_STRIP.width / 2) return 'strip';
  return null;
}

// --- Procedural canvas textures (seeded, no Math.random) --------------------
// A neutral speckle that multiplies with the terrain's vertex colours:
// it adds grain to the ground without changing its painted zones.
function makeDetailTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5200; i++) {
    const v = 200 + Math.floor(hash2(i, 61) * 55);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    const s = 1 + hash2(i, 62) * 2;
    ctx.fillRect(hash2(i, 63) * 256, hash2(i, 64) * 256, s, s);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(170, 170);
  return tex;
}

// Water surface: pale streaks on the sea colour, tiled and scrolled slowly
// in update() so the ocean moves instead of sitting flat.
function makeWaterTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const x = hash2(i, 71) * 256;
    const y = hash2(i, 72) * 256;
    const len = 6 + hash2(i, 73) * 26;
    ctx.strokeStyle = hash2(i, 74) > 0.5 ? 'rgba(225,242,252,0.6)' : 'rgba(110,165,205,0.55)';
    ctx.lineWidth = 1 + hash2(i, 75) * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (hash2(i, 76) - 0.5) * 4);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(36, 36);
  return tex;
}

// Ocean normal map: fine seeded wave facets (tileable, no Math.random).
// The facets break the midday sun's specular into scattered glints
// across the water instead of one flat highlight. Integer-frequency
// sines only, so the texture tiles seamlessly at any repeat.
function makeWaterNormalTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  // [freqU, freqV, amplitude, seeded phase] — fixed every run.
  const comps = [
    [6, 0, 0.30, hash2(11, 1)], [0, 8, 0.26, hash2(12, 2)],
    [11, 11, 0.20, hash2(13, 3)], [15, -15, 0.14, hash2(14, 4)],
    [23, 0, 0.08, hash2(15, 5)], [0, 29, 0.06, hash2(16, 6)],
  ];
  function heightAt(u, v) {
    let h = 0;
    for (const [fu, fv, amp, ph] of comps) {
      h += Math.sin((u * fu + v * fv + ph) * Math.PI * 2) * amp;
    }
    return h;
  }
  const strength = 2.0;
  const du = 1 / S;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      let nx = (heightAt(u - du, v) - heightAt(u + du, v)) * strength;
      let ny = (heightAt(u, v - du) - heightAt(u, v + du)) * strength;
      let nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * S + x) * 4;
      img.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      img.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      img.data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(48, 48);
  return tex;
}

export function createTerrain(scene) {
  const group = new THREE.Group();
  const clouds = [];
  const windsock = { cone: null };

  // --- Terrain mesh with painted height colours ----------------------------
  const size = 4200;
  const segments = 190;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const sand = new THREE.Color(0xd9c28a);
  const wetSand = new THREE.Color(0xb59a68);
  const grass = new THREE.Color(0x5d8a3c);
  const deepGrass = new THREE.Color(0x3f6b2e);
  const dryGrass = new THREE.Color(0xa8a05a);
  const rock = new THREE.Color(0x8a7f74);
  const darkRock = new THREE.Color(0x5e564e);
  const snow = new THREE.Color(0xf2f4f6);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = groundHeight(x, z);
    pos.setY(i, h);
    const n = fbm(x * 0.004 + 11, z * 0.004 + 5);
    const patch = fbm(x * 0.0009 + 31, z * 0.0009 + 17);
    if (h < 1.5) tmp.copy(sand).lerp(wetSand, 0.6);
    else if (h < 4) tmp.copy(sand).lerp(grass, ((h - 1.5) / 2.5) * 0.35);
    else if (h < 110) {
      tmp.copy(grass).lerp(deepGrass, n);
      // Dry meadows and darker forest patches break up the green wash.
      if (patch > 0.62) tmp.lerp(dryGrass, (patch - 0.62) * 1.8);
      else if (patch < 0.38) tmp.lerp(deepGrass, (0.38 - patch) * 1.4);
    } else if (h < 190) tmp.copy(grass).lerp(rock, (h - 110) / 80);
    else if (h < 240) tmp.copy(rock).lerp(darkRock, n * 0.5);
    else tmp.copy(rock).lerp(snow, (h - 240) / 45);
    // Rocky ridges catch the light differently.
    if (n > 0.72 && h > 60) tmp.lerp(rock, 0.35);
    // Fine grain so the ground is not a flat wash of colour.
    const grain = (hash2(Math.floor(x * 0.35), Math.floor(z * 0.35)) - 0.5) * 0.07;
    tmp.offsetHSL(0, 0, grain);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrainMesh = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true, map: makeDetailTexture() }),
  );
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);

  // --- Ocean and lake -------------------------------------------------------
  const waterTex = makeWaterTexture();
  const waterNormalTex = makeWaterNormalTexture();
  const ocean = new THREE.Mesh(
    new THREE.CircleGeometry(4200, 48),
    new THREE.MeshPhongMaterial({ color: 0x0e5da4, map: waterTex, normalMap: waterNormalTex, normalScale: new THREE.Vector2(0.7, 0.7), transparent: true, opacity: 0.96, shininess: 150, specular: 0xfff2cc }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = 0.4;
  group.add(ocean);
  const lake = new THREE.Mesh(
    new THREE.CircleGeometry(195, 32),
    new THREE.MeshPhongMaterial({ color: 0x2f8fc4, map: waterTex, shininess: 200, specular: 0xa8d4f0 }),
  );
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(350, 10.2, -450);
  group.add(lake);

  // --- Runway: asphalt, markings, edge lights ------------------------------
  const runwayGroup = buildRunway(RUNWAY, 0x2e3138, true);
  group.add(runwayGroup);
  const stripGroup = buildRunway(DIRT_STRIP, 0x8a6b45, false);
  group.add(stripGroup);

  // --- Town beside the main runway ------------------------------------------
  group.add(buildTown());
  group.add(buildTowerAndHangar());
  group.add(buildLighthouse());

  // --- Sky dome, sun and clouds ----------------------------------------------
  const dome = buildSkyDome();
  group.add(dome);
  // A crisp sun disc in the direction of the directional light, with the
  // painted glow in the sky texture behind it. Low south-south-east for
  // the sunset staging: the hero approach flies south toward ring 1, so
  // the setting sun sits ahead-left over the valley (~30 deg off the
  // nose, inside the frame), lighting the jet's east flank — the side
  // the 3/4 camera sees.
  const SUN_DAY_POS = new THREE.Vector3(1400, 3000, -1600).normalize().multiplyScalar(3600);
  const SUN_SET_POS = new THREE.Vector3(1800, 700, 3000);
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(130, 24),
    new THREE.MeshBasicMaterial({ color: 0xfffbe8, fog: false }),
  );
  sunDisc.position.copy(SUN_DAY_POS);
  sunDisc.lookAt(0, 0, 0);
  scene.add(sunDisc);
  const sun = new THREE.DirectionalLight(0xfff3d6, 1.9);
  sun.position.set(1400, 3000, -1600);
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0xcfe4ff, 0.55);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xa8ccec, 0x6b8a58, 0.7);
  scene.add(hemi);
  scene.fog = new THREE.Fog(0xd9eaf6, 900, 3800);

  // Scattered trees on the islands: two instanced meshes (trunks, canopies),
  // seeded positions kept clear of the airfields, town, corridors, canyon.
  group.add(buildTrees());

  // Lighthouse beam: a slow rotating cone of light, faint by day, the
  // night mission's guiding star after dark.
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff2b0, transparent: true, opacity: 0.1,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
  });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(26, 420, 12, 1, true), beamMat);
  beam.rotation.z = Math.PI / 2;
  beam.position.set(-1450, groundHeight(-1450, 950) + 30, 950);
  const beamPivot = new THREE.Group();
  beamPivot.position.set(-1450, groundHeight(-1450, 950) + 30, 950);
  beam.position.set(210, 0, 0);
  beamPivot.add(beam);
  scene.add(beamPivot);
  let nightMode = false;

  for (let i = 0; i < 22; i++) {
    const cloud = buildCloud(i);
    const angle = hash2(i, 3) * Math.PI * 2;
    const radius = 500 + hash2(i, 7) * 2600;
    // Clouds ride above the usual flight band (460–600 m) so the plane
    // flies under them instead of through them — a cloud dead ahead
    // fills the whole cockpit view.
    cloud.position.set(Math.cos(angle) * radius, 460 + hash2(i, 11) * 140, Math.sin(angle) * radius);
    cloud.userData.drift = 2 + hash2(i, 13) * 4;
    clouds.push(cloud);
    group.add(cloud);
  }
  windsock.group = buildWindsock();
  group.add(windsock.group);

  scene.add(group);

  return {
    groundHeight,
    surfaceAt,
    runway: RUNWAY,
    dirtStrip: DIRT_STRIP,
    setNight(on) {
      nightMode = on;
      sun.intensity = on ? 0.12 : 1.9;
      ambient.intensity = on ? 0.14 : 0.55;
      hemi.intensity = on ? 0.1 : 0.7;
      scene.fog.color.set(on ? 0x0a1420 : 0xd9eaf6);
      scene.fog.near = on ? 350 : 900;
      scene.fog.far = on ? 2400 : 3800;
      dome.material.map = on ? nightTexture : dayTexture;
      dome.material.needsUpdate = true;
      beamMat.opacity = on ? 0.5 : 0.1;
      sunDisc.visible = !on;
      cloudMat.color.set(on ? 0x5a6673 : 0xffffff);
    },
    // Staging only (?scene=sunset): low orange-pink sun ahead over the
    // green valley, warm light, pink clouds. Restores every value it
    // touches when switched off, so gameplay lighting is untouched.
    setSunset(on) {
      if (on) {
        sun.intensity = 1.7;
        sun.color.set(0xffb36b);
        sun.position.copy(SUN_SET_POS);
        // Stronger fill than day: the 3/4 camera looks at the jet's
        // shadow side, and the blue livery must still read blue.
        ambient.intensity = 0.62;
        ambient.color.set(0xffd9b0);
        hemi.intensity = 0.7;
        hemi.color.set(0xffc890);
        hemi.groundColor.set(0x54683f);
        scene.fog.color.set(0xf0a878);
        scene.fog.near = 900;
        scene.fog.far = 3800;
        dome.material.map = sunsetTexture;
        dome.material.needsUpdate = true;
        // Blob direction is (cos ry, 0, -sin ry); ry = -1.03 puts the
        // painted glow at the sunset azimuth, south-south-east.
        dome.rotation.y = -1.03;
        sunDisc.visible = true;
        sunDisc.position.copy(SUN_SET_POS);
        sunDisc.lookAt(0, 0, 0);
        sunDisc.material.color.set(0xffcf7d);
        sunDisc.scale.setScalar(1.5);
        cloudMat.color.set(0xffd9c2);
      } else {
        sun.intensity = 1.9;
        sun.color.set(0xfff3d6);
        sun.position.set(1400, 3000, -1600);
        ambient.intensity = 0.55;
        ambient.color.set(0xcfe4ff);
        hemi.intensity = 0.7;
        hemi.color.set(0xa8ccec);
        hemi.groundColor.set(0x6b8a58);
        scene.fog.color.set(0xd9eaf6);
        scene.fog.near = 900;
        scene.fog.far = 3800;
        dome.material.map = dayTexture;
        dome.material.needsUpdate = true;
        dome.rotation.y = 0.85;
        sunDisc.visible = true;
        sunDisc.position.copy(SUN_DAY_POS);
        sunDisc.lookAt(0, 0, 0);
        sunDisc.material.color.set(0xfffbe8);
        sunDisc.scale.setScalar(1);
        cloudMat.color.set(0xffffff);
      }
    },
    get night() { return nightMode; },
    update(dt) {
      waterTex.offset.x += dt * 0.004;
      waterTex.offset.y += dt * 0.0016;
      // The normal map drifts at its own rate so the sun glints shimmer
      // instead of sitting frozen on the water.
      waterNormalTex.offset.x += dt * 0.002;
      waterNormalTex.offset.y += dt * 0.0012;
      for (const cloud of clouds) {
        cloud.position.x += cloud.userData.drift * dt;
        if (cloud.position.x > 3600) cloud.position.x = -3600;
      }
      if (windsock.group) windsock.group.rotation.y += dt * 0.4;
      beamPivot.rotation.y += dt * 0.35;
    },
  };
}

function buildRunway(field, color, paved) {
  const g = new THREE.Group();
  const heading = (field.headingDeg * Math.PI) / 180;
  const mat = new THREE.MeshLambertMaterial({ color });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(field.length, 0.6, field.width), mat);
  slab.position.set(field.x, field.elevation + 0.1, field.z);
  slab.rotation.y = -heading + Math.PI / 2;
  g.add(slab);
  // Centreline dashes.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5f5f0 });
  const dashCount = Math.floor(field.length / 44);
  for (let i = 0; i < dashCount; i++) {
    const along = -field.length / 2 + 22 + i * 44;
    const dash = new THREE.Mesh(new THREE.BoxGeometry(18, 0.15, 2.2), dashMat);
    dash.position.set(
      field.x + Math.sin(heading) * along,
      field.elevation + 0.45,
      field.z + Math.cos(heading) * along,
    );
    dash.rotation.y = -heading + Math.PI / 2;
    g.add(dash);
  }
  // Threshold bars at both ends.
  for (const end of [-1, 1]) {
    const along = end * (field.length / 2 - 14);
    for (let k = -2; k <= 2; k++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(10, 0.15, 2.4), dashMat);
      bar.position.set(
        field.x + Math.sin(heading) * along + Math.cos(heading) * k * 5,
        field.elevation + 0.45,
        field.z + Math.cos(heading) * along - Math.sin(heading) * k * 5,
      );
      bar.rotation.y = -heading + Math.PI / 2;
      g.add(bar);
    }
  }
  // Touchdown zone bars: pairs either side of the centreline, 150 m and
  // 300 m in from each threshold.
  for (const end of [-1, 1]) {
    for (const dist of [150, 300]) {
      const along = end * (field.length / 2 - dist);
      for (const side of [-1, 1]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(16, 0.15, 2.2), dashMat);
        bar.position.set(
          field.x + Math.sin(heading) * along + Math.cos(heading) * side * 8,
          field.elevation + 0.45,
          field.z + Math.cos(heading) * along - Math.sin(heading) * side * 8,
        );
        bar.rotation.y = -heading + Math.PI / 2;
        g.add(bar);
      }
    }
  }
  if (paved) {
    // Edge stripes: continuous white lines along both runway edges.
    for (const side of [-1, 1]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(field.length - 10, 0.15, 1.6), dashMat);
      stripe.position.set(
        field.x + Math.cos(heading) * side * (field.width / 2 - 1.5),
        field.elevation + 0.45,
        field.z - Math.sin(heading) * side * (field.width / 2 - 1.5),
      );
      stripe.rotation.y = -heading + Math.PI / 2;
      g.add(stripe);
    }
    // PAPI lights: two red, two white, beside the runway 300 m from the
    // approach (west) threshold.
    const papiRed = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    const papiWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let k = 0; k < 4; k++) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.4), k < 2 ? papiRed : papiWhite);
      const along = -(field.length / 2 - 300);
      const across = field.width / 2 + 8 + k * 3.5;
      lamp.position.set(
        field.x + Math.sin(heading) * along + Math.cos(heading) * across,
        field.elevation + 1.0,
        field.z + Math.cos(heading) * along - Math.sin(heading) * across,
      );
      g.add(lamp);
    }
    // Edge lights, warm amber, both sides.
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
    const lightGeo = new THREE.SphereGeometry(0.7, 8, 6);
    for (let i = 0; i <= 14; i++) {
      const along = -field.length / 2 + (i / 14) * field.length;
      for (const side of [-1, 1]) {
        const light = new THREE.Mesh(lightGeo, lightMat);
        light.position.set(
          field.x + Math.sin(heading) * along + Math.cos(heading) * side * (field.width / 2 + 3),
          field.elevation + 1.2,
          field.z + Math.cos(heading) * along - Math.sin(heading) * side * (field.width / 2 + 3),
        );
        g.add(light);
      }
    }
    // Runway name board at the threshold.
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(30, 6, 1),
      new THREE.MeshLambertMaterial({ color: 0x14324a }),
    );
    board.position.set(field.x - Math.sin(heading) * (field.length / 2 + 26), field.elevation + 4, field.z - Math.cos(heading) * (field.length / 2 + 26));
    board.rotation.y = -heading + Math.PI / 2;
    g.add(board);
  } else {
    // Orange cones mark the dirt strip ends.
    const coneMat = new THREE.MeshLambertMaterial({ color: 0xff6b2d });
    for (const end of [-1, 1]) {
      const along = end * (field.length / 2 - 6);
      for (const side of [-1, 1]) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.4, 10), coneMat);
        cone.position.set(
          field.x + Math.sin(heading) * along + Math.cos(heading) * side * (field.width / 2 + 4),
          field.elevation + 2,
          field.z + Math.cos(heading) * along - Math.sin(heading) * side * (field.width / 2 + 4),
        );
        g.add(cone);
      }
    }
  }
  return g;
}

function buildTown() {
  const g = new THREE.Group();
  const wallColors = [0xe8dcc0, 0xd9a441, 0xc96f4a, 0x7fa88f, 0xb0c4d8, 0xe0b090];
  const roofColors = [0x9e3d2e, 0x5d6b7a, 0x7a4a2e, 0x4a6741];
  for (let i = 0; i < 42; i++) {
    const gx = 60 + hash2(i, 21) * 620;
    const gz = 1060 + hash2(i, 22) * 300;
    if (Math.abs(gx - RUNWAY.x) < 60 && Math.abs(gz - RUNWAY.z) < 60) continue;
    const w = 9 + hash2(i, 23) * 7;
    const d = 9 + hash2(i, 24) * 7;
    const h = 6 + hash2(i, 25) * 8;
    const gy = groundHeight(gx, gz);
    const house = new THREE.Group();
    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color: wallColors[i % wallColors.length] }),
    );
    walls.position.y = h / 2;
    house.add(walls);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(w, d) * 0.75, 3.5 + hash2(i, 26) * 2, 4),
      new THREE.MeshLambertMaterial({ color: roofColors[i % roofColors.length] }),
    );
    roof.position.y = h + 1.8;
    roof.rotation.y = Math.PI / 4;
    house.add(roof);
    // Lit windows: a warm strip on the front face.
    if (hash2(i, 27) > 0.35) {
      const win = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.55, 1.6, 0.2),
        new THREE.MeshBasicMaterial({ color: 0xffd27a }),
      );
      win.position.set(0, h * 0.55, d / 2 + 0.1);
      house.add(win);
    }
    house.position.set(gx, gy, gz);
    house.rotation.y = hash2(i, 28) * Math.PI;
    g.add(house);
  }
  // A small white mosque with a green dome and minaret, the town landmark
  // (east of the town block, clear of the houses and the runway corridor).
  const mosqueY = groundHeight(770, 1160);
  const mosque = new THREE.Group();
  const mBase = new THREE.Mesh(
    new THREE.BoxGeometry(20, 9, 14),
    new THREE.MeshLambertMaterial({ color: 0xf2ede2 }),
  );
  mBase.position.y = 4.5;
  mosque.add(mBase);
  const mDome = new THREE.Mesh(
    new THREE.SphereGeometry(5, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x1f7a4d }),
  );
  mDome.position.y = 9;
  mosque.add(mDome);
  const minaret = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.4, 18, 8),
    new THREE.MeshLambertMaterial({ color: 0xf2ede2 }),
  );
  minaret.position.set(12, 9, 0);
  mosque.add(minaret);
  const minTop = new THREE.Mesh(
    new THREE.ConeGeometry(1.8, 3.5, 8),
    new THREE.MeshLambertMaterial({ color: 0x1f7a4d }),
  );
  minTop.position.set(12, 19.5, 0);
  mosque.add(minTop);
  mosque.position.set(770, mosqueY, 1160);
  g.add(mosque);
  return g;
}

function buildTowerAndHangar() {
  const g = new THREE.Group();
  const baseY = groundHeight(90, 1030);
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 6, 34, 10),
    new THREE.MeshLambertMaterial({ color: 0xd8d2c4 }),
  );
  tower.position.set(90, baseY + 17, 1030);
  g.add(tower);
  const cab = new THREE.Mesh(
    new THREE.CylinderGeometry(7.5, 6, 7, 10),
    new THREE.MeshPhongMaterial({ color: 0x2a4a66, shininess: 80 }),
  );
  cab.position.set(90, baseY + 37, 1030);
  g.add(cab);
  // Dark glass band around the cab + a thin antenna on top.
  const glassBand = new THREE.Mesh(
    new THREE.CylinderGeometry(7.6, 7.6, 3, 10),
    new THREE.MeshPhongMaterial({ color: 0x0e2a3f, shininess: 120 }),
  );
  glassBand.position.set(90, baseY + 37, 1030);
  g.add(glassBand);
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 9, 6),
    new THREE.MeshLambertMaterial({ color: 0x3a3f46 }),
  );
  antenna.position.set(90, baseY + 45, 1030);
  g.add(antenna);
  const hangarY = groundHeight(40, 1120);
  const hangar = new THREE.Mesh(
    new THREE.BoxGeometry(46, 14, 30),
    new THREE.MeshLambertMaterial({ color: 0x7a8a99 }),
  );
  hangar.position.set(40, hangarY + 7, 1120);
  g.add(hangar);
  const hangarRoof = new THREE.Mesh(
    new THREE.CylinderGeometry(15, 15, 46, 12, 1, false, 0, Math.PI),
    new THREE.MeshLambertMaterial({ color: 0x5d6b7a }),
  );
  hangarRoof.rotation.z = Math.PI / 2;
  hangarRoof.rotation.y = Math.PI / 2;
  hangarRoof.position.set(40, hangarY + 14, 1120);
  g.add(hangarRoof);
  // Big dark hangar door facing the runway.
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(34, 10, 0.4),
    new THREE.MeshLambertMaterial({ color: 0x2e343c }),
  );
  door.position.set(40, hangarY + 5, 1120 - 15.2);
  g.add(door);
  return g;
}

function buildLighthouse() {
  const g = new THREE.Group();
  const baseY = groundHeight(-1450, 950);
  const stripeWhite = new THREE.MeshLambertMaterial({ color: 0xf2ede2 });
  const stripeRed = new THREE.MeshLambertMaterial({ color: 0xc23b2e });
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(3.4 - i * 0.3, 3.8 - i * 0.3, 7, 12),
      i % 2 === 0 ? stripeWhite : stripeRed,
    );
    seg.position.y = 3.5 + i * 7;
    g.add(seg);
  }
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(2.6, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
  );
  lamp.position.y = 30;
  g.add(lamp);
  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(3.4, 3, 12),
    new THREE.MeshLambertMaterial({ color: 0x2e3138 }),
  );
  cap.position.y = 33;
  g.add(cap);
  g.position.set(-1450, baseY, 950);
  return g;
}

function buildCloud(seed) {
  const g = new THREE.Group();
  const big = hash2(seed, 81) > 0.72;
  const puffs = 4 + Math.floor(hash2(seed, 82) * 3);
  for (let i = 0; i < puffs; i++) {
    const r = (big ? 26 : 14) + hash2(seed, 83 + i) * (big ? 22 : 14);
    const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), cloudMat);
    puff.position.set(
      (hash2(seed, 90 + i) - 0.5) * (big ? 110 : 55),
      (hash2(seed, 100 + i) - 0.5) * 8,
      (hash2(seed, 110 + i) - 0.5) * 26,
    );
    puff.scale.y = 0.42;
    g.add(puff);
  }
  return g;
}

// One shared material for all clouds: sunlit white by day, dimmed at night
// by setNight. Cloud shapes are seeded (no Math.random) so every run
// renders the same sky.
const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.94 });

// Scattered trees on the islands: two instanced meshes (trunks, canopies),
// seeded positions kept clear of the airfields, town, corridors and canyon.
function buildTrees() {
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.85, 6, 6);
  const canopyGeo = new THREE.ConeGeometry(3.4, 10, 7);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2e });
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const spots = [];
  for (let i = 0; i < 420; i++) {
    const x = (hash2(i, 51) - 0.5) * 3800;
    const z = (hash2(i, 52) - 0.5) * 3800;
    const h = groundHeight(x, z);
    if (h < 8 || h > 150) continue;
    if (flattenBlend(RUNWAY, x, z) > 0 || flattenBlend(DIRT_STRIP, x, z) > 0) continue;
    if (x > -40 && x < 780 && z > 1000 && z < 1420) continue; // town
    if (corridorBlend(RUNWAY, x, z, 1400, 300) > 0.3) continue;
    if (canyonBlend(x, z) > 0.2) continue;
    spots.push([x, h, z, 0.7 + hash2(i, 53) * 0.9, hash2(i, 54)]);
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, spots.length);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  spots.forEach(([x, h, z, s, r], idx) => {
    dummy.position.set(x, h + 3 * s, z);
    dummy.scale.setScalar(s);
    dummy.rotation.y = r * Math.PI * 2;
    dummy.updateMatrix();
    trunks.setMatrixAt(idx, dummy.matrix);
    dummy.position.set(x, h + 9.5 * s, z);
    dummy.updateMatrix();
    canopies.setMatrixAt(idx, dummy.matrix);
    col.setHSL(0.29 + r * 0.04, 0.5, 0.26 + hash2(idx, 55) * 0.1);
    canopies.setColorAt(idx, col);
  });
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  const g = new THREE.Group();
  g.add(trunks);
  g.add(canopies);
  return g;
}

function makeSkyTexture(mode) {
  const night = mode === 'night';
  const sunset = mode === 'sunset';
  const canvas = document.createElement('canvas');
  canvas.width = night ? 4 : 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  if (night) {
    grad.addColorStop(0, '#020610');
    grad.addColorStop(0.5, '#0a1a2e');
    grad.addColorStop(0.78, '#16283e');
    grad.addColorStop(0.92, '#2a2118');
    grad.addColorStop(1, '#1a140e');
  } else if (sunset) {
    // Low sun over a green valley: indigo overhead, magenta mid-sky,
    // orange-pink band right at the horizon (v = 0.5, canvas y = 128).
    grad.addColorStop(0, '#232a63');
    grad.addColorStop(0.26, '#7a4a8c');
    grad.addColorStop(0.4, '#e86a6a');
    grad.addColorStop(0.48, '#ff9a4d');
    grad.addColorStop(0.54, '#ffd28a');
    grad.addColorStop(0.62, '#f7c98a');
    grad.addColorStop(1, '#e8b083');
  } else {
    // The horizon sits at v = 0.5 (canvas y = 128), so the warm haze band
    // is painted right around it, not below the ground like before.
    // Blazing midday: deep bright blue overhead fading to a pale hazy
    // blue-white at the horizon — no orange sunset band.
    grad.addColorStop(0, '#2168c4');
    grad.addColorStop(0.3, '#6fb4e8');
    grad.addColorStop(0.45, '#b9dcf0');
    grad.addColorStop(0.52, '#eef6fa');
    grad.addColorStop(0.58, '#f2f7fa');
    grad.addColorStop(0.65, '#eef4f8');
    grad.addColorStop(1, '#dfeef5');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, 256);
  if (night) {
    // A scattering of stars in the upper sky.
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 90; i++) {
      const y = hash2(i, 91) * 120;
      const x = hash2(i, 92) * 4;
      ctx.globalAlpha = 0.4 + hash2(i, 93) * 0.6;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.globalAlpha = 1;
  } else if (sunset) {
    // Wide soft glow hugging the horizon at the sun's azimuth (u = 0.5),
    // low like a setting sun — not a tight midday disc.
    ctx.save();
    ctx.translate(512, 122);
    ctx.scale(2, 1);
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 110);
    glow.addColorStop(0, 'rgba(255,214,140,1)');
    glow.addColorStop(0.4, 'rgba(255,150,90,0.7)');
    glow.addColorStop(1, 'rgba(255,120,80,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-110, -110, 220, 220);
    ctx.restore();
  } else {
    // Bright glare around the midday sun: u = 0.5 faces the sun after
    // the dome is rotated (see buildSkyDome); sun elevation ~55 deg ->
    // canvas y ~ 50. The canvas is 4:1, so the gradient is drawn in a
    // 2:1-scaled context to come out round on the sphere instead of a
    // vertical pillar.
    ctx.save();
    ctx.translate(512, 50);
    ctx.scale(2, 1);
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 46);
    glow.addColorStop(0, 'rgba(255,252,225,1)');
    glow.addColorStop(0.35, 'rgba(255,236,180,0.6)');
    glow.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-46, -46, 92, 92);
    ctx.restore();
  }
  return new THREE.CanvasTexture(canvas);
}
const dayTexture = makeSkyTexture('day');
const nightTexture = makeSkyTexture('night');
const sunsetTexture = makeSkyTexture('sunset');

function buildSkyDome() {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(3800, 24, 16),
    new THREE.MeshBasicMaterial({ map: dayTexture, side: THREE.BackSide, fog: false }),
  );
  // Rotate the dome so the painted sun glow (u = 0.5, the +X point) sits
  // at the sun's azimuth: sun at (1400, -1600) -> rotation.y = 0.85 rad.
  dome.rotation.y = 0.85;
  return dome;
}

function buildWindsock() {
  const groundY = groundHeight(60, 1010);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 12, 8),
    new THREE.MeshLambertMaterial({ color: 0xd8d2c4 }),
  );
  pole.position.set(0, 6, 0);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(1.6, 7, 10),
    new THREE.MeshLambertMaterial({ color: 0xff7a1a }),
  );
  cone.rotation.z = Math.PI / 2;
  cone.position.set(3.5, 11.4, 0);
  const g = new THREE.Group();
  g.position.set(60, groundY, 1010);
  g.add(pole);
  g.add(cone);
  return g;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
