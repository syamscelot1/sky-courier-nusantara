# Sky Courier — Nusantara Run

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/syamscelot1/sky-courier-nusantara/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/syamscelot1/sky-courier-nusantara/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

Sky Courier is a complete 3D flight game built from scratch for make.fun's
"Make the best flight game" bounty — $500 in USDC. Everything is original:
the Nusantara archipelago, the bush plane, the six missions and every sound
are invented for this entry. No images, no audio files, no network: all art
is built in code with three.js and all sound is synthesized live with the
Web Audio API.

You are a courier pilot flying a bush plane across the islands of Nusantara.
Thread golden rings, land gently on the runway, haul cargo to a remote dirt
strip, photograph landmarks from the air, race a canyon at low altitude, and
fly a night sortie on instruments alone. Watch your fuel and your airframe —
every sortie is a decision.

## What is in the game

- **A 3D archipelago to fly over** — three islands with procedural mountains,
  a crater lake, a coastal town with lit windows, a control tower and hangar,
  a red-and-white lighthouse, drifting clouds and a golden-hour sky.
- **A bush plane that looks built** — cream fuselage with a teal cheatline,
  glass canopy, spinning propeller, nav lights, a blinking tail strobe and
  retractable landing gear.
- **Six missions with different mechanics** — RING RUN (8 rings, timed),
  ISLAND LANDING (precision landing, scored on softness and centreline),
  CARGO RUN (pick up a crate, land it on a dirt strip), PHOTO RUN (find and
  photograph 3 landmarks — close and centred scores best), CANYON TIME TRIAL
  (6 low gates down a carved canyon, pure time), NIGHT FLIGHT (dark sky,
  instruments only: reach the lighthouse, then land on the lit runway) —
  plus FREE FLIGHT.
- **A flight model with consequences** — throttle, pitch, roll and rudder,
  coordinated turns, stalls, fuel burn, damage from hard landings, airbrakes
  and gear discipline. Run out of fuel and you glide; come down too hard and
  you crash.
- **Instruments that look flown** — airspeed, altitude, heading tape,
  attitude indicator, throttle, fuel and damage gauges, a live minimap, a
  target-distance readout and warning callouts, in chase or cockpit camera.
- **Synthesized sound** — engine hum that follows the throttle, wind that
  follows the speed, ring chimes, landing thuds, a mission fanfare and a slow
  chord pad underneath (M toggles the music).

## Controls

| Key | Action |
| --- | --- |
| W / S | Throttle up / down |
| Arrow keys | Pitch (up/down) and roll (left/right) |
| A / D | Rudder (yaw) |
| Mouse | Steers too — move the pointer to bank and pitch |
| B | Airbrake (hold) |
| G | Landing gear up / down |
| F | Photograph a landmark (PHOTO RUN) |
| C | Camera: chase / cockpit |
| P | Pause — R restart — M music |

## Play it

No build step, no network. Serve `game/` with any static server and open
`index.html` in desktop Chrome:

```sh
node serve.ts
# open http://localhost:8080
```

## Layout

- `game/index.html` — the page, HUD and menus
- `game/css/style.css` — HUD and menu styling
- `game/js/main.js` — bootstrap, game loop and states
- `game/js/physics.js` — arcade flight dynamics
- `game/js/terrain.js` — the archipelago, runways, canyon, night mode
- `game/js/aircraft.js` — the bush plane mesh and its moving parts
- `game/js/missions.js` — the six missions and their scoring
- `game/js/hud.js` — instruments, minimap and readouts
- `game/js/audio.js` — synthesized WebAudio sound
- `game/js/camera.js` — chase, cockpit and title cameras
- `game/js/input.js` — keyboard and mouse controls
- `game/vendor/three.min.js` — three.js r160 (vendored UMD build)
- `main.ts` — the make.fun entry program (Node 22, stdlib only)

Built for the make.fun bounty
[Make the best flight game](https://make.fun/bounty/best-flight-game-20261126-0057).
