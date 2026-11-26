// input.js — keyboard + mouse controls for Sky Courier.
// One job: turn raw device events into a clean control frame each tick.
// Keyboard: W/S throttle, arrows pitch/roll, A/D rudder yaw, B air brake,
// G landing gear, C camera, M music, P pause, R restart, Enter confirm.
// Mouse: moving the pointer steers (roll + pitch) while the mouse is live.
const KEY_THROTTLE_UP = ['KeyW'];
const KEY_THROTTLE_DOWN = ['KeyS'];
const KEY_PITCH_UP = ['ArrowDown']; // pull back = nose up
const KEY_PITCH_DOWN = ['ArrowUp']; // push forward = nose down
const KEY_ROLL_LEFT = ['ArrowLeft'];
const KEY_ROLL_RIGHT = ['ArrowRight'];
const KEY_YAW_LEFT = ['KeyA'];
const KEY_YAW_RIGHT = ['KeyD'];
const KEY_BRAKE = ['KeyB'];
const KEY_GEAR = ['KeyG'];
const KEY_CAMERA = ['KeyC'];
const KEY_MUSIC = ['KeyM'];
const KEY_PHOTO = ['KeyF'];
const KEY_PAUSE = ['KeyP', 'Escape'];
const KEY_RESTART = ['KeyR'];
const KEY_CONFIRM = ['Enter', 'Space'];

export function createInput(canvas) {
  const down = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, active: false, movedAt: 0 };
  let lastMouseMove = 0;

  function onKeyDown(event) {
    if (event.repeat) return;
    down.add(event.code);
    pressed.add(event.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  }
  function onKeyUp(event) {
    down.delete(event.code);
  }
  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    mouse.active = true;
    lastMouseMove = performance.now();
  }
  function onMouseLeave() {
    mouse.active = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseleave', onMouseLeave);

  function anyDown(codes) {
    return codes.some((code) => down.has(code));
  }
  function anyPressed(codes) {
    return codes.some((code) => pressed.has(code));
  }

  return {
    // Read the current control frame. Mouse steer blends with keyboard:
    // whichever axis is stronger wins, so both devices feel alive.
    readControls() {
      let pitch = 0;
      let roll = 0;
      let yaw = 0;
      if (anyDown(KEY_PITCH_UP)) pitch += 1;
      if (anyDown(KEY_PITCH_DOWN)) pitch -= 1;
      if (anyDown(KEY_ROLL_LEFT)) roll -= 1;
      if (anyDown(KEY_ROLL_RIGHT)) roll += 1;
      if (anyDown(KEY_YAW_LEFT)) yaw -= 1;
      if (anyDown(KEY_YAW_RIGHT)) yaw += 1;
      const mouseFresh = mouse.active && performance.now() - lastMouseMove < 2500;
      if (mouseFresh) {
        const mouseRoll = clamp(mouse.x * 1.1, -1, 1);
        const mousePitch = clamp(-mouse.y * 0.9, -1, 1);
        if (Math.abs(mouseRoll) > Math.abs(roll)) roll = mouseRoll;
        if (Math.abs(mousePitch) > Math.abs(pitch)) pitch = mousePitch;
      }
      return {
        pitch: clamp(pitch, -1, 1),
        roll: clamp(roll, -1, 1),
        yaw: clamp(yaw, -1, 1),
        throttleUp: anyDown(KEY_THROTTLE_UP),
        throttleDown: anyDown(KEY_THROTTLE_DOWN),
        brake: anyDown(KEY_BRAKE),
        gearPressed: anyPressed(KEY_GEAR),
        cameraPressed: anyPressed(KEY_CAMERA),
        musicPressed: anyPressed(KEY_MUSIC),
        photoPressed: anyPressed(KEY_PHOTO),
        pausePressed: anyPressed(KEY_PAUSE),
        restartPressed: anyPressed(KEY_RESTART),
        confirmPressed: anyPressed(KEY_CONFIRM),
        mouseSteer: mouseFresh,
      };
    },
    // Call once per frame after the game consumed the controls.
    endFrame() {
      pressed.clear();
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
    },
  };
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
