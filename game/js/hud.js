// hud.js — the cockpit instruments and mission readouts.
// One job: turn flight state into readable instruments. Everything here is
// DOM + 2D canvas so the gauges glow like flown instruments, not drawings:
// airspeed, altitude, heading tape, throttle, fuel, damage, attitude
// indicator, vertical speed, score, objective, target guidance and minimap.
const THREE = globalThis.THREE;

export function createHud() {
  const el = (id) => document.getElementById(id);
  const els = {
    speed: el('hud-speed'),
    speedUnit: el('hud-speed-unit'),
    alt: el('hud-alt'),
    altUnit: el('hud-alt-unit'),
    heading: el('hud-heading'),
    throttleFill: el('hud-throttle-fill'),
    throttleValue: el('hud-throttle-value'),
    fuelFill: el('hud-fuel-fill'),
    fuelValue: el('hud-fuel-value'),
    damageFill: el('hud-damage-fill'),
    damageValue: el('hud-damage-value'),
    score: el('hud-score'),
    objective: el('hud-objective'),
    target: el('hud-target'),
    targetDist: el('hud-target-dist'),
    warning: el('hud-warning'),
    message: el('hud-message'),
    gear: el('hud-gear'),
    brake: el('hud-brake'),
    stall: el('hud-stall'),
    attitude: el('hud-attitude'),
    compass: el('hud-compass'),
    minimap: el('hud-minimap'),
    missionName: el('hud-mission-name'),
    timer: el('hud-timer'),
  };
  const attitudeCtx = els.attitude.getContext('2d');
  const compassCtx = els.compass.getContext('2d');
  const minimapCtx = els.minimap.getContext('2d');
  let messageTimer = 0;
  let messageText = '';

  function showMessage(text, seconds = 3.5) {
    messageText = text;
    messageTimer = seconds;
    els.message.textContent = text;
    els.message.classList.add('show');
  }

  function drawAttitude(bank, pitch) {
    const ctx = attitudeCtx;
    const w = els.attitude.width;
    const h = els.attitude.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = w / 2 - 4;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    // Sky and ground, rotated by bank, shifted by pitch.
    ctx.translate(cx, cy);
    ctx.rotate(-bank);
    const pitchPx = clamp(pitch * 90, -r, r);
    ctx.fillStyle = '#3f8fd2';
    ctx.fillRect(-r * 2, -r * 2 - pitchPx, r * 4, r * 2 + pitchPx);
    ctx.fillStyle = '#8a6b45';
    ctx.fillRect(-r * 2, -pitchPx, r * 4, r * 2 + pitchPx);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r, -pitchPx);
    ctx.lineTo(r, -pitchPx);
    ctx.stroke();
    // Pitch ladder lines.
    ctx.lineWidth = 1;
    for (const deg of [-20, -10, 10, 20]) {
      const y = -pitchPx - (deg * Math.PI / 180) * 90;
      ctx.beginPath();
      ctx.moveTo(-18, y);
      ctx.lineTo(18, y);
      ctx.stroke();
    }
    ctx.restore();
    // Fixed aircraft symbol + bezel.
    ctx.strokeStyle = '#ffd21c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 26, cy);
    ctx.lineTo(cx - 8, cy);
    ctx.moveTo(cx + 8, cy);
    ctx.lineTo(cx + 26, cy);
    ctx.moveTo(cx, cy - 4);
    ctx.lineTo(cx, cy + 4);
    ctx.stroke();
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawCompass(headingDeg) {
    const ctx = compassCtx;
    const w = els.compass.width;
    const h = els.compass.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(8, 18, 28, 0.72)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e8e8e8';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labels = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];
    for (const [deg, label] of labels) {
      let rel = ((deg - headingDeg + 540) % 360) - 180;
      const x = w / 2 + rel * 2.4;
      if (x < -10 || x > w + 10) continue;
      ctx.fillText(label, x, h / 2);
      ctx.fillStyle = '#ffd21c';
      ctx.fillRect(x - 1, h - 8, 2, 6);
      ctx.fillStyle = '#e8e8e8';
    }
    // Centre caret.
    ctx.fillStyle = '#ffd21c';
    ctx.beginPath();
    ctx.moveTo(w / 2 - 6, 4);
    ctx.lineTo(w / 2 + 6, 4);
    ctx.lineTo(w / 2, 12);
    ctx.closePath();
    ctx.fill();
  }

  function drawMinimap(state, world, target) {
    const ctx = minimapCtx;
    const w = els.minimap.width;
    const h = els.minimap.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(8, 18, 28, 0.72)';
    ctx.fillRect(0, 0, w, h);
    const scale = w / 4400;
    const toMap = (x, z) => [w / 2 + x * scale, h / 2 + z * scale];
    // Islands as blobs.
    ctx.fillStyle = '#3f6b2e';
    for (const [cx, cz, r] of [[0, 0, 1750], [1550, -1050, 780], [-1450, 950, 540]]) {
      const [mx, my] = toMap(cx, cz);
      ctx.beginPath();
      ctx.arc(mx, my, Math.max(3, r * scale), 0, Math.PI * 2);
      ctx.fill();
    }
    // Runway + dirt strip.
    ctx.strokeStyle = '#f5f5f0';
    ctx.lineWidth = 2;
    const [rx, ry] = toMap(world.runway.x, world.runway.z);
    ctx.beginPath();
    ctx.moveTo(rx - 14, ry);
    ctx.lineTo(rx + 14, ry);
    ctx.stroke();
    const [sx, sy] = toMap(world.dirtStrip.x, world.dirtStrip.z);
    ctx.strokeStyle = '#e86a1c';
    ctx.beginPath();
    ctx.moveTo(sx - 8, sy);
    ctx.lineTo(sx + 8, sy);
    ctx.stroke();
    // Target marker.
    if (target) {
      const [tx, ty] = toMap(target.position.x, target.position.z);
      ctx.fillStyle = '#ffc21c';
      ctx.beginPath();
      ctx.arc(tx, ty, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffc21c';
      ctx.beginPath();
      ctx.arc(tx, ty, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    // The aircraft: a small triangle pointing along its heading.
    const [px, py] = toMap(state.position.x, state.position.z);
    const heading = state.headingDeg * Math.PI / 180;
    ctx.fillStyle = '#ffffff';
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(heading);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  return {
    showMessage,
    update(state, missionRunner, world, cameraMode, dt) {
      els.speed.textContent = String(Math.round(state.groundSpeedKts));
      els.alt.textContent = String(Math.round(state.altitudeFt));
      els.heading.textContent = String(Math.round(state.headingDeg)).padStart(3, '0');
      els.throttleFill.style.width = `${Math.round(state.throttle * 100)}%`;
      els.throttleValue.textContent = `${Math.round(state.throttle * 100)}%`;
      els.fuelFill.style.width = `${Math.round(state.fuel)}%`;
      els.fuelValue.textContent = `${Math.round(state.fuel)} L`;
      els.fuelFill.classList.toggle('low', state.fuel < 25);
      els.damageFill.style.width = `${Math.round(state.damage)}%`;
      els.damageValue.textContent = `${Math.round(state.damage)}%`;
      els.damageFill.classList.toggle('high', state.damage > 50);
      els.score.textContent = String(missionRunner.score);
      els.timer.textContent = formatTime(missionRunner.elapsed);
      els.objective.textContent = missionRunner.objectiveText();
      els.missionName.textContent = missionRunner.mission ? missionRunner.mission.name : '';
      els.gear.textContent = state.gearDown === false ? 'GEAR UP' : 'GEAR DOWN';
      els.gear.classList.toggle('warn', state.gearDown === false);
      els.brake.textContent = state.brakeOn ? 'AIRBRAKE' : '';
      els.stall.textContent = state.stalled ? 'STALL!' : '';
      els.stall.classList.toggle('show', state.stalled);

      const target = missionRunner.currentTarget();
      if (target) {
        const dist = state.position.distanceTo(target.position);
        els.target.textContent = target.label;
        els.targetDist.textContent = dist > 1000
          ? `${(dist / 1000).toFixed(1)} km`
          : `${Math.round(dist)} m`;
      } else {
        els.target.textContent = '';
        els.targetDist.textContent = '';
      }

      const warnings = [];
      if (state.engineOut) warnings.push('BAHAN BAKAR HABIS — MELUNCUR!');
      else if (state.fuel < 20) warnings.push('BAHAN BAKAR RENDAH');
      if (state.damage > 60) warnings.push('KERUSAKAN PARAH');
      // Pull-up only when actually sinking fast toward the ground — a
      // normal final approach (slow descent, gear down) must not warn.
      if (state.groundClearance < 30 && !state.onGround && state.speed > 20 && state.verticalSpeed < -3.5) warnings.push('TARIK KE ATAS!');
      els.warning.textContent = warnings.join('  •  ');
      els.warning.classList.toggle('show', warnings.length > 0);

      drawAttitude(state.bank, state.pitchAngle);
      drawCompass(state.headingDeg);
      drawMinimap(state, world, target);

      if (messageTimer > 0) {
        messageTimer -= dt;
        if (messageTimer <= 0) els.message.classList.remove('show');
      }
    },
  };
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
