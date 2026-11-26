// audio.js — every sound in Sky Courier, synthesized live with WebAudio.
// One job: make the plane sound alive without shipping a single audio file.
// Engine hum follows the throttle, wind follows the speed, rings chime,
// landings thud, and a slow pad of chords plays underneath (toggle with M).
export function createAudio() {
  let ctx = null;
  let engineOsc1 = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let windGain = null;
  let windFilter = null;
  let musicGain = null;
  let musicTimer = null;
  let musicOn = true;
  let started = false;
  const chordSets = [
    [110.0, 130.81, 164.81], // Am
    [87.31, 110.0, 130.81], // F
    [130.81, 164.81, 196.0], // C
    [98.0, 123.47, 146.83], // G
  ];
  let chordIndex = 0;

  function ensure() {
    if (ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    ctx = new AudioContext();
    // Engine: two detuned saws through a low-pass, gain follows throttle.
    engineOsc1 = ctx.createOscillator();
    engineOsc1.type = 'sawtooth';
    engineOsc1.frequency.value = 58;
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'square';
    engineOsc2.frequency.value = 116;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc1.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOsc1.start();
    engineOsc2.start();
    // Wind: looped noise through a band-pass, gain follows airspeed.
    const noiseLength = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseLength; i++) noiseData[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    noise.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ctx.destination);
    noise.start();
    // Music pad: a quiet gain node; chords are scheduled by playChord.
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.05;
    musicGain.connect(ctx.destination);
    started = true;
  }

  function playChord() {
    if (!ctx || !musicOn) return;
    const chord = chordSets[chordIndex % chordSets.length];
    chordIndex += 1;
    const now = ctx.currentTime;
    for (const freq of chord) {
      for (const detune of [-4, 4]) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        osc.detune.value = detune;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.5, now + 1.2);
        gain.gain.linearRampToValueAtTime(0, now + 8);
        osc.connect(gain);
        gain.connect(musicGain);
        osc.start(now);
        osc.stop(now + 8.2);
      }
    }
  }

  function tone(freq, startAt, duration, type, volume) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(volume, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.05);
  }

  return {
    // Call from a user gesture (click / keypress) so the browser allows audio.
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
      if (ctx && !musicTimer) {
        playChord();
        musicTimer = window.setInterval(playChord, 8000);
      }
    },
    setEngine(throttle, speed) {
      if (!ctx || !started) return;
      const now = ctx.currentTime;
      engineOsc1.frequency.setTargetAtTime(52 + throttle * 70, now, 0.1);
      engineOsc2.frequency.setTargetAtTime(104 + throttle * 140, now, 0.1);
      engineFilter.frequency.setTargetAtTime(320 + throttle * 900, now, 0.1);
      engineGain.gain.setTargetAtTime(0.05 + throttle * 0.11, now, 0.1);
      windGain.gain.setTargetAtTime(Math.min(0.14, speed * 0.0016), now, 0.15);
      windFilter.frequency.setTargetAtTime(500 + speed * 9, now, 0.15);
    },
    ringChime() {
      if (!ctx) return;
      const now = ctx.currentTime;
      tone(880, now, 0.5, 'sine', 0.25);
      tone(1318.5, now + 0.09, 0.6, 'sine', 0.22);
      tone(1760, now + 0.18, 0.7, 'sine', 0.18);
    },
    thud(intensity) {
      if (!ctx) return;
      const now = ctx.currentTime;
      tone(70, now, 0.35, 'sine', Math.min(0.5, 0.2 + intensity * 0.3));
      const noiseLength = ctx.sampleRate * 0.2;
      const buffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < noiseLength; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / noiseLength);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 300;
      const gain = ctx.createGain();
      gain.gain.value = 0.4;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start(now);
    },
    crashSound() {
      if (!ctx) return;
      const now = ctx.currentTime;
      tone(55, now, 0.9, 'sawtooth', 0.4);
      tone(38, now + 0.1, 1.1, 'sine', 0.5);
      const noiseLength = ctx.sampleRate * 0.8;
      const buffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < noiseLength; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / noiseLength);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      const gain = ctx.createGain();
      gain.gain.value = 0.5;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start(now);
    },
    fanfare() {
      if (!ctx) return;
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => tone(freq, now + i * 0.13, 0.5, 'triangle', 0.25));
      tone(1318.5, now + 0.55, 0.9, 'triangle', 0.22);
    },
    click() {
      if (!ctx) return;
      tone(1200, ctx.currentTime, 0.08, 'sine', 0.15);
    },
    setMusic(on) {
      musicOn = on;
      if (musicGain) musicGain.gain.value = on ? 0.05 : 0;
    },
    get musicOn() {
      return musicOn;
    },
  };
}
