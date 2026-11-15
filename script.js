/**
 * BEAT CHRONO - Rhythm Game Tempo & Division Visualizer
 * Core Application Logic & Web Audio Engine
 */

(function () {
  'use strict';

  // --- State Management ---
  const state = {
    bpm: 150,
    division: 16, // 16th notes
    timeSignatureBeats: 4, // 4/4
    speedMultiplier: 1.0,
    volume: 0.8,
    soundType: 'arcade',
    accentBeat: true,
    subBeatMetronome: false,
    alternateLanes: true,
    viewMode: 'vertical', // 'vertical' | 'horizontal' | 'circle'
    isPlaying: false,

    // Sequencer pattern: array of booleans [true, true, ...]
    pattern: [],

    // Timing tracking
    startTime: 0,
    currentStepIndex: 0,
    audioContext: null,
    nextNoteTime: 0,
    lookaheadMs: 25.0,
    scheduleAheadSec: 0.12,
    timerId: null,

    // Notes queue for visual rendering & timing judgment
    scheduledNotes: [],

    // Tap tempo history
    tapTimestamps: []
  };

  // --- DOM Elements ---
  const el = {
    bpmInput: document.getElementById('bpmInput'),
    bpmSlider: document.getElementById('bpmSlider'),
    divisionDesc: document.getElementById('divisionDesc'),
    divisionButtons: document.querySelectorAll('.btn-div'),
    customDivBtn: document.getElementById('customDivBtn'),
    customDivGroup: document.getElementById('customDivGroup'),
    customDivInput: document.getElementById('customDivInput'),
    timeSigSelect: document.getElementById('timeSigSelect'),
    speedSlider: document.getElementById('speedSlider'),
    speedVal: document.getElementById('speedVal'),
    soundSelect: document.getElementById('soundSelect'),
    volumeSlider: document.getElementById('volumeSlider'),
    volumeVal: document.getElementById('volumeVal'),
    accentBeatCheck: document.getElementById('accentBeatCheck'),
    subBeatMetronomeCheck: document.getElementById('subBeatMetronomeCheck'),
    patternPresetSelect: document.getElementById('patternPresetSelect'),
    sequencerGrid: document.getElementById('sequencerGrid'),
    seqAllOn: document.getElementById('seqAllOn'),
    seqInvert: document.getElementById('seqInvert'),
    seqClear: document.getElementById('seqClear'),
    playBtn: document.getElementById('playBtn'),
    resetBtn: document.getElementById('resetBtn'),
    tapTempoBtn: document.getElementById('tapTempoBtn'),
    tapCount: document.getElementById('tapCount'),

    // Stats
    statInterval: document.getElementById('statInterval'),
    statNps: document.getElementById('statNps'),
    refIntervalMs: document.getElementById('refIntervalMs'),
    refNps: document.getElementById('refNps'),
    refTier: document.getElementById('refTier'),

    // Visualizer & Tabs
    tabButtons: document.querySelectorAll('.tab-btn'),
    alternateLaneCheck: document.getElementById('alternateLaneCheck'),
    canvasWrapper: document.getElementById('canvasWrapper'),
    canvas: document.getElementById('visualizerCanvas'),
    judgmentOverlay: document.getElementById('judgmentOverlay'),
    judgmentText: document.getElementById('judgmentText'),
    timingDelta: document.getElementById('timingDelta'),
    beatIndicator: document.getElementById('beatIndicator'),

    // Practice buttons
    tapKeyLeft: document.getElementById('tapKeyLeft'),
    tapKeySpace: document.getElementById('tapKeySpace'),
    tapKeyRight: document.getElementById('tapKeyRight')
  };

  // Canvas context
  const ctx = el.canvas.getContext('2d');
  let animationFrameId = null;

  // Visual effects list (explosions, flashes)
  const hitEffects = [];

  // ==========================================================================
  // Web Audio Synthesis Engine
  // ==========================================================================
  function initAudio() {
    if (!state.audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      state.audioContext = new AudioCtx();
    }
    if (state.audioContext.state === 'suspended') {
      state.audioContext.resume();
    }
  }

  function playSound(time, isAccent, isBarStart, soundType) {
    if (!state.audioContext) return;
    const actx = state.audioContext;
    const vol = state.volume;
    if (vol <= 0.001) return;

    const masterGain = actx.createGain();
    masterGain.gain.setValueAtTime(vol, time);
    masterGain.connect(actx.destination);

    switch (soundType) {
      case 'arcade': {
        // High click + synthesized metallic tone
        const osc = actx.createOscillator();
        const gain = actx.createGain();
        osc.type = isAccent ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(isBarStart ? 1760 : (isAccent ? 1320 : 880), time);
        osc.frequency.exponentialRampToValueAtTime(110, time + 0.04);

        gain.gain.setValueAtTime(isAccent ? 1.0 : 0.7, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.045);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(time);
        osc.stop(time + 0.05);

        // Transient noise click
        createNoiseClick(actx, masterGain, time, 0.015, isAccent ? 0.9 : 0.5);
        break;
      }

      case 'laser': {
        const osc = actx.createOscillator();
        const gain = actx.createGain();
        osc.type = 'sawtooth';
        const startFreq = isBarStart ? 2400 : (isAccent ? 1800 : 1200);
        osc.frequency.setValueAtTime(startFreq, time);
        osc.frequency.exponentialRampToValueAtTime(80, time + 0.07);

        gain.gain.setValueAtTime(isAccent ? 0.8 : 0.5, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(time);
        osc.stop(time + 0.08);
        break;
      }

      case 'taiko': {
        // Taiko: Don (Low resonant skin) or Ka (Snappy rim)
        if (isAccent) {
          // DON
          const osc = actx.createOscillator();
          const gain = actx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(140, time);
          osc.frequency.exponentialRampToValueAtTime(55, time + 0.12);

          gain.gain.setValueAtTime(1.0, time);
          gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(time);
          osc.stop(time + 0.16);
          createNoiseClick(actx, masterGain, time, 0.02, 0.6);
        } else {
          // KA
          const osc = actx.createOscillator();
          const gain = actx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(450, time);
          osc.frequency.exponentialRampToValueAtTime(180, time + 0.05);

          gain.gain.setValueAtTime(0.8, time);
          gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);

          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(time);
          osc.stop(time + 0.07);
          createNoiseClick(actx, masterGain, time, 0.02, 0.8);
        }
        break;
      }

      case 'metronome': {
        const osc = actx.createOscillator();
        const gain = actx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(isBarStart ? 2500 : (isAccent ? 1800 : 1000), time);

        gain.gain.setValueAtTime(isAccent ? 1.0 : 0.6, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.025);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(time);
        osc.stop(time + 0.03);
        break;
      }

      case 'woodblock': {
        const osc = actx.createOscillator();
        const gain = actx.createGain();
        osc.type = 'sine';
        const freq = isBarStart ? 1200 : (isAccent ? 950 : 700);
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(isAccent ? 1.0 : 0.7, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(time);
        osc.stop(time + 0.05);
        break;
      }

      case 'kick_snare': {
        if (isAccent) {
          // Kick drum
          const osc = actx.createOscillator();
          const gain = actx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(160, time);
          osc.frequency.exponentialRampToValueAtTime(40, time + 0.1);

          gain.gain.setValueAtTime(1.0, time);
          gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(time);
          osc.stop(time + 0.13);
        } else {
          // Snare / Hat click
          createNoiseClick(actx, masterGain, time, 0.04, 0.7);
          const osc = actx.createOscillator();
          const gain = actx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(280, time);
          gain.gain.setValueAtTime(0.5, time);
          gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(time);
          osc.stop(time + 0.04);
        }
        break;
      }
    }
  }

  function createNoiseClick(actx, destGain, time, duration, vol) {
    const bufferSize = Math.floor(actx.sampleRate * duration);
    const buffer = actx.createBuffer(1, bufferSize, actx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }
    const noise = actx.createBufferSource();
    noise.buffer = buffer;
    const filter = actx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1000;

    const gain = actx.createGain();
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(destGain);
    noise.start(time);
    noise.stop(time + duration);
  }

  // Background 4-beat pulse sound
  function playBackgroundQuarterBeat(time, isBarStart) {
    if (!state.audioContext || state.volume <= 0.001) return;
    const actx = state.audioContext;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isBarStart ? 880 : 440, time);
    gain.gain.setValueAtTime(state.volume * 0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start(time);
    osc.stop(time + 0.035);
  }

  // ==========================================================================
  // Timing & Step Calculations
  // ==========================================================================
  function getStepDuration() {
    // 1 beat = 4th note = 60 / BPM seconds
    // n-th note duration = (60 / BPM) * (4 / n)
    return (60.0 / state.bpm) * (4.0 / state.division);
  }

  function getQuarterBeatDuration() {
    return 60.0 / state.bpm;
  }

  function getTotalStepsInBar() {
    // Number of steps in one measure (bar)
    // 4/4 bar = 4 beats. Each beat has (division / 4) steps.
    const stepsPerBeat = state.division / 4.0;
    return Math.max(1, Math.round(state.timeSignatureBeats * stepsPerBeat));
  }

  function updateMathStats() {
    const intervalSec = getStepDuration();
    const intervalMs = intervalSec * 1000;
    const nps = 1.0 / intervalSec;

    el.statInterval.innerHTML = `${intervalMs.toFixed(1)} <small>ms</small>`;
    el.statNps.innerHTML = `${nps.toFixed(2)} <small>打/秒 (NPS)</small>`;
    el.refIntervalMs.textContent = `${intervalMs.toFixed(2)} ms`;
    el.refNps.textContent = `${nps.toFixed(2)} 打/秒`;

    // Speed tier description
    let tierText = '';
    if (nps < 5.0) {
      tierText = '低速 (ゆったりしたリズム)';
    } else if (nps < 8.5) {
      tierText = '中速 (標準的な16分連打)';
    } else if (nps < 12.0) {
      tierText = '高速 (高難易度連打・乱打)';
    } else if (nps < 16.0) {
      tierText = '超高速 (音ゲーボス曲レベル)';
    } else {
      tierText = '発狂・理論値超え (人間卒業)';
    }
    el.refTier.textContent = tierText;

    // Division description badge
    const stepsPerBeat = (state.division / 4).toFixed(2).replace(/\.00$/, '');
    el.divisionDesc.textContent = `${state.division}分音符 (1拍${stepsPerBeat}打)`;
  }

  // ==========================================================================
  // Sequencer Pattern Management
  // ==========================================================================
  function rebuildSequencerGrid() {
    const totalSteps = getTotalStepsInBar();
    const stepsPerBeat = state.division / 4.0;

    // Preserve old pattern if possible, else resize
    const oldPattern = state.pattern;
    state.pattern = new Array(totalSteps).fill(true);
    for (let i = 0; i < totalSteps && i < oldPattern.length; i++) {
      state.pattern[i] = oldPattern[i];
    }

    el.sequencerGrid.innerHTML = '';
    for (let i = 0; i < totalSteps; i++) {
      const stepBtn = document.createElement('div');
      stepBtn.className = 'seq-step';
      if (state.pattern[i]) stepBtn.classList.add('active');

      // Mark beat start
      if (stepsPerBeat >= 1 && (i % Math.round(stepsPerBeat) === 0)) {
        stepBtn.classList.add('beat-start');
      }

      const beatNum = Math.floor(i / stepsPerBeat) + 1;
      const subIndex = Math.round(i % stepsPerBeat) + 1;
      stepBtn.innerHTML = `<span>${beatNum}.${subIndex}</span><span>●</span>`;

      stepBtn.addEventListener('click', () => {
        state.pattern[i] = !state.pattern[i];
        stepBtn.classList.toggle('active', state.pattern[i]);
      });

      el.sequencerGrid.appendChild(stepBtn);
    }
  }

  function applyPatternPreset(preset) {
    const totalSteps = state.pattern.length;
    const stepsPerBeat = state.division / 4.0;

    for (let i = 0; i < totalSteps; i++) {
      switch (preset) {
        case 'all':
          state.pattern[i] = true;
          break;
        case 'offbeat': // e.g. 2nd and 4th 16th notes
          state.pattern[i] = (i % 2 !== 0);
          break;
        case 'dotted': // dotted 8th = every 3 16ths
          state.pattern[i] = (i % 3 === 0);
          break;
        case 'gallop': // Ta-ta-, Ta-ta- (e.g. 1, 2 of 4)
          state.pattern[i] = ((i % 4 === 0) || (i % 4 === 1));
          break;
        case 'hocket': // every 2nd
          state.pattern[i] = (i % 2 === 0);
          break;
        case 'first_half':
          state.pattern[i] = (i < totalSteps / 2);
          break;
        default:
          state.pattern[i] = true;
      }
    }
    updateSequencerUI();
  }

  function updateSequencerUI() {
    const stepElements = el.sequencerGrid.querySelectorAll('.seq-step');
    stepElements.forEach((node, i) => {
      node.classList.toggle('active', !!state.pattern[i]);
    });
  }

  // ==========================================================================
  // Web Audio Lookahead Scheduler
  // ==========================================================================
  function scheduleNotes() {
    if (!state.isPlaying) return;

    const actx = state.audioContext;
    const currentTime = actx.currentTime;
    const stepDuration = getStepDuration();
    const totalSteps = state.pattern.length;
    const stepsPerBeat = state.division / 4.0;

    while (state.nextNoteTime < currentTime + state.scheduleAheadSec) {
      const stepIndex = state.currentStepIndex % totalSteps;
      const isNoteActive = state.pattern[stepIndex];
      const isBarStart = (stepIndex === 0);
      const isBeatStart = (stepsPerBeat >= 1 && (stepIndex % Math.round(stepsPerBeat) === 0));

      if (isNoteActive) {
        const isAccent = state.accentBeat ? (isBarStart || isBeatStart) : false;
        playSound(state.nextNoteTime, isAccent, isBarStart, state.soundType);

        // Store note for visual canvas & interactive judgment
        state.scheduledNotes.push({
          targetAudioTime: state.nextNoteTime,
          stepIndex: stepIndex,
          isAccent: isAccent,
          isBarStart: isBarStart,
          lane: state.alternateLanes ? (stepIndex % 2) : 0, // 0: Left, 1: Right
          judged: false
        });
      }

      // Background quarter metronome
      if (state.subBeatMetronome && isBeatStart) {
        playBackgroundQuarterBeat(state.nextNoteTime, isBarStart);
      }

      state.nextNoteTime += stepDuration;
      state.currentStepIndex++;
    }
  }

  function startPlayback() {
    initAudio();
    if (state.isPlaying) return;

    state.isPlaying = true;
    state.currentStepIndex = 0;
    state.scheduledNotes = [];
    state.nextNoteTime = state.audioContext.currentTime + 0.05;

    el.playBtn.classList.add('playing');
    el.playBtn.querySelector('.play-icon').textContent = '■';
    el.playBtn.querySelector('.play-text').textContent = 'STOP / PAUSE';

    state.timerId = setInterval(scheduleNotes, state.lookaheadMs);
  }

  function stopPlayback() {
    state.isPlaying = false;
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
    el.playBtn.classList.remove('playing');
    el.playBtn.querySelector('.play-icon').textContent = '▶';
    el.playBtn.querySelector('.play-text').textContent = 'PLAY / START';

    // Remove active step highlighting
    const activeCurrent = el.sequencerGrid.querySelectorAll('.current-playing');
    activeCurrent.forEach(c => c.classList.remove('current-playing'));
  }

  function togglePlayback() {
    if (state.isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }

  // ==========================================================================
  // Visualizer Rendering (Canvas 60fps)
  // ==========================================================================
  function resizeCanvas() {
    const rect = el.canvasWrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    el.canvas.width = rect.width * dpr;
    el.canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
  }

  window.addEventListener('resize', resizeCanvas);

  function triggerHitEffect(x, y, color, isAccent) {
    hitEffects.push({
      x: x,
      y: y,
      radius: 12,
      maxRadius: isAccent ? 48 : 32,
      alpha: 1.0,
      color: color || '#00f2fe'
    });
  }

  function flashBeatDot(beatIndex, isAccent) {
    const dots = el.beatIndicator.querySelectorAll('.beat-dot');
    if (!dots.length) return;
    const target = dots[beatIndex % dots.length];
    if (target) {
      target.classList.add(isAccent ? 'flash-accent' : 'flash');
      setTimeout(() => {
        target.classList.remove('flash', 'flash-accent');
      }, 100);
    }
  }

  function renderVisualizer() {
    const width = el.canvas.width / (window.devicePixelRatio || 1);
    const height = el.canvas.height / (window.devicePixelRatio || 1);

    // Clear background
    ctx.clearRect(0, 0, width, height);

    const currentTime = state.audioContext ? state.audioContext.currentTime : 0;
    const stepDuration = getStepDuration();
    const speed = state.speedMultiplier;

    // Mode-specific rendering
    if (state.viewMode === 'vertical') {
      renderVerticalLane(width, height, currentTime, stepDuration, speed);
    } else if (state.viewMode === 'horizontal') {
      renderHorizontalLane(width, height, currentTime, stepDuration, speed);
    } else {
      renderCircleLane(width, height, currentTime, stepDuration, speed);
    }

    // Render hit ripple / explosion effects
    renderHitEffects();

    // Clean up passed notes
    if (state.scheduledNotes.length > 0) {
      while (state.scheduledNotes.length > 0 &&
             currentTime - state.scheduledNotes[0].targetAudioTime > 0.4) {
        state.scheduledNotes.shift();
      }
    }

    animationFrameId = requestAnimationFrame(renderVisualizer);
  }

  // --- Mode 1: Vertical Falling Notes (Beatmania / Project SEKAI style) ---
  function renderVerticalLane(width, height, currentTime, stepDuration, speed) {
    const judgeY = height * 0.82;
    const laneWidth = Math.min(width * 0.85, 420);
    const laneLeft = (width - laneWidth) / 2;
    const laneRight = laneLeft + laneWidth;
    const numLanes = state.alternateLanes ? 2 : 1;
    const subLaneWidth = laneWidth / numLanes;

    // Draw Lane Backdrop
    ctx.fillStyle = 'rgba(12, 16, 28, 0.7)';
    ctx.fillRect(laneLeft, 0, laneWidth, height);

    // Lane border lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(laneLeft, 0);
    ctx.lineTo(laneLeft, height);
    ctx.moveTo(laneRight, 0);
    ctx.lineTo(laneRight, height);
    if (numLanes === 2) {
      ctx.moveTo(laneLeft + subLaneWidth, 0);
      ctx.lineTo(laneLeft + subLaneWidth, height);
    }
    ctx.stroke();

    // Draw Judgment Line
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00f2fe';
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(laneLeft - 10, judgeY);
    ctx.lineTo(laneRight + 10, judgeY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Fall travel time (seconds from top to judgment line)
    const travelTime = 1.0 / speed;
    const pxPerSec = judgeY / travelTime;

    // Draw falling notes
    for (let i = 0; i < state.scheduledNotes.length; i++) {
      const note = state.scheduledNotes[i];
      const timeDiff = note.targetAudioTime - currentTime; // > 0 means coming, < 0 means passed
      const noteY = judgeY - (timeDiff * pxPerSec);

      if (noteY < -30 || noteY > height + 30) continue;

      const laneIdx = state.alternateLanes ? note.lane : 0;
      const noteX = laneLeft + (laneIdx * subLaneWidth) + 6;
      const noteW = subLaneWidth - 12;
      const noteH = 14;

      // Note Colors
      let noteColor = (laneIdx === 0) ? '#00f2fe' : '#fe0879';
      if (note.isAccent) noteColor = '#ffea00';

      // Draw Note
      ctx.shadowBlur = 10;
      ctx.shadowColor = noteColor;
      ctx.fillStyle = noteColor;
      roundRect(ctx, noteX, noteY - (noteH / 2), noteW, noteH, 5, true, false);
      ctx.shadowBlur = 0;

      // Trigger judgment line flash at hit time
      if (!note.hasFlashed && Math.abs(timeDiff) < 0.02) {
        note.hasFlashed = true;
        triggerHitEffect(noteX + (noteW / 2), judgeY, noteColor, note.isAccent);
        highlightSequencerStep(note.stepIndex);
        flashBeatDot(Math.floor(note.stepIndex / (state.division / 4)), note.isAccent);
      }
    }
  }

  // --- Mode 2: Horizontal Scrolling (Taiko / Muse Dash style) ---
  function renderHorizontalLane(width, height, currentTime, stepDuration, speed) {
    const laneY = height * 0.5;
    const laneH = 100;
    const judgeX = width * 0.20;

    // Track background
    ctx.fillStyle = 'rgba(15, 20, 35, 0.8)';
    ctx.fillRect(0, laneY - (laneH / 2), width, laneH);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, laneY - (laneH / 2));
    ctx.lineTo(width, laneY - (laneH / 2));
    ctx.moveTo(0, laneY + (laneH / 2));
    ctx.lineTo(width, laneY + (laneH / 2));
    ctx.stroke();

    // Judgment circle target
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#00f2fe';
    ctx.beginPath();
    ctx.arc(judgeX, laneY, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    const travelTime = 1.2 / speed;
    const pxPerSec = (width - judgeX) / travelTime;

    // Draw notes moving right to left
    for (let i = 0; i < state.scheduledNotes.length; i++) {
      const note = state.scheduledNotes[i];
      const timeDiff = note.targetAudioTime - currentTime;
      const noteX = judgeX + (timeDiff * pxPerSec);

      if (noteX < -30 || noteX > width + 30) continue;

      const radius = note.isAccent ? 22 : 18;
      const noteColor = (note.lane === 0) ? '#fe0879' : '#00f2fe';

      ctx.shadowBlur = 10;
      ctx.shadowColor = noteColor;
      ctx.fillStyle = noteColor;
      ctx.beginPath();
      ctx.arc(noteX, laneY, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;

      if (!note.hasFlashed && Math.abs(timeDiff) < 0.02) {
        note.hasFlashed = true;
        triggerHitEffect(judgeX, laneY, noteColor, note.isAccent);
        highlightSequencerStep(note.stepIndex);
        flashBeatDot(Math.floor(note.stepIndex / (state.division / 4)), note.isAccent);
      }
    }
  }

  // --- Mode 3: Circle / Radar Pulse (maimai / Metronome style) ---
  function renderCircleLane(width, height, currentTime, stepDuration, speed) {
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const maxRadius = Math.min(width, height) * 0.40;

    // Outer Target Ring
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00f2fe';
    ctx.beginPath();
    ctx.arc(centerX, centerY, maxRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Inner center hub
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 15, 0, Math.PI * 2);
    ctx.fill();

    const travelTime = 1.0 / speed;

    // Notes expand from center outward
    for (let i = 0; i < state.scheduledNotes.length; i++) {
      const note = state.scheduledNotes[i];
      const timeDiff = note.targetAudioTime - currentTime;
      const progress = 1.0 - (timeDiff / travelTime);

      if (progress < 0 || progress > 1.3) continue;

      const r = maxRadius * Math.max(0, Math.min(progress, 1.2));
      const noteColor = note.isAccent ? '#ffea00' : (note.lane === 0 ? '#00f2fe' : '#fe0879');

      ctx.strokeStyle = noteColor;
      ctx.lineWidth = note.isAccent ? 5 : 3;
      ctx.shadowBlur = 10;
      ctx.shadowColor = noteColor;
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      if (!note.hasFlashed && Math.abs(timeDiff) < 0.02) {
        note.hasFlashed = true;
        triggerHitEffect(centerX, centerY, noteColor, note.isAccent);
        highlightSequencerStep(note.stepIndex);
        flashBeatDot(Math.floor(note.stepIndex / (state.division / 4)), note.isAccent);
      }
    }
  }

  function renderHitEffects() {
    for (let i = hitEffects.length - 1; i >= 0; i--) {
      const ef = hitEffects[i];
      ef.radius += 2.5;
      ef.alpha -= 0.06;

      if (ef.alpha <= 0) {
        hitEffects.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = ef.alpha;
      ctx.strokeStyle = ef.color;
      ctx.lineWidth = 3;
      ctx.shadowBlur = 15;
      ctx.shadowColor = ef.color;
      ctx.beginPath();
      ctx.arc(ef.x, ef.y, ef.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  function highlightSequencerStep(stepIndex) {
    const steps = el.sequencerGrid.querySelectorAll('.seq-step');
    if (!steps.length) return;
    steps.forEach((s, idx) => {
      s.classList.toggle('current-playing', idx === stepIndex);
    });
  }

  // ==========================================================================
  // Interactive Practice & Timing Judgment (PERFECT / GREAT / GOOD)
  // ==========================================================================
  function handleUserTap(lanePreference) {
    initAudio();

    // Play instant tap hit sound for tactile feedback
    playSound(state.audioContext.currentTime, false, false, 'arcade');

    // Button active animation
    if (lanePreference === 0 && el.tapKeyLeft) {
      el.tapKeyLeft.classList.add('active-tap');
      setTimeout(() => el.tapKeyLeft.classList.remove('active-tap'), 80);
    } else if (lanePreference === 1 && el.tapKeyRight) {
      el.tapKeyRight.classList.add('active-tap');
      setTimeout(() => el.tapKeyRight.classList.remove('active-tap'), 80);
    } else if (el.tapKeySpace) {
      el.tapKeySpace.classList.add('active-tap');
      setTimeout(() => el.tapKeySpace.classList.remove('active-tap'), 80);
    }

    if (!state.isPlaying || state.scheduledNotes.length === 0) return;

    const tapTime = state.audioContext.currentTime;

    // Find the closest unjudged note
    let closestNote = null;
    let minDiffSec = Infinity;

    for (let i = 0; i < state.scheduledNotes.length; i++) {
      const note = state.scheduledNotes[i];
      if (note.judged) continue;
      const diff = tapTime - note.targetAudioTime;
      if (Math.abs(diff) < Math.abs(minDiffSec)) {
        minDiffSec = diff;
        closestNote = note;
      }
    }

    if (closestNote && Math.abs(minDiffSec) < 0.16) {
      closestNote.judged = true;
      const deltaMs = minDiffSec * 1000;
      showJudgment(deltaMs);
    }
  }

  function showJudgment(deltaMs) {
    const absDelta = Math.abs(deltaMs);
    let grade = 'GOOD';
    let gradeClass = 'good';

    if (absDelta <= 25) {
      grade = 'PERFECT';
      gradeClass = 'perfect';
    } else if (absDelta <= 60) {
      grade = 'GREAT';
      gradeClass = 'great';
    } else if (absDelta <= 110) {
      grade = 'GOOD';
      gradeClass = 'good';
    } else {
      grade = deltaMs < 0 ? 'EARLY' : 'LATE';
      gradeClass = deltaMs < 0 ? 'early' : 'late';
    }

    el.judgmentText.textContent = grade;
    el.judgmentText.className = `judgment-text ${gradeClass}`;
    const sign = deltaMs >= 0 ? '+' : '';
    el.timingDelta.textContent = `${sign}${deltaMs.toFixed(1)} ms`;
  }

  // ==========================================================================
  // Tap Tempo BPM Calculator
  // ==========================================================================
  function handleTapTempo() {
    const now = performance.now();
    initAudio();

    // Reset if last tap was more than 2.5 seconds ago
    if (state.tapTimestamps.length > 0 && (now - state.tapTimestamps[state.tapTimestamps.length - 1] > 2500)) {
      state.tapTimestamps = [];
    }

    state.tapTimestamps.push(now);
    el.tapCount.textContent = state.tapTimestamps.length;

    if (state.tapTimestamps.length >= 2) {
      // Calculate average interval across last 8 taps
      const intervals = [];
      const history = state.tapTimestamps.slice(-8);
      for (let i = 1; i < history.length; i++) {
        intervals.push(history[i] - history[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const calculatedBpm = Math.round(60000 / avgInterval);

      if (calculatedBpm >= 20 && calculatedBpm <= 600) {
        setBpm(calculatedBpm);
      }
    }
  }

  // ==========================================================================
  // Parameter Setters & UI Bindings
  // ==========================================================================
  function setBpm(val) {
    const clamped = Math.max(20, Math.min(600, Math.round(val)));
    state.bpm = clamped;
    el.bpmInput.value = clamped;
    el.bpmSlider.value = Math.min(320, Math.max(30, clamped));
    updateMathStats();
  }

  function setDivision(divNum) {
    state.division = divNum;
    el.divisionButtons.forEach(btn => {
      const d = parseInt(btn.dataset.div, 10);
      btn.classList.toggle('active', d === divNum);
    });
    el.customDivBtn.classList.toggle('active', !Array.from(el.divisionButtons).some(b => parseInt(b.dataset.div, 10) === divNum));
    rebuildSequencerGrid();
    updateMathStats();
  }

  function setupEventListeners() {
    // BPM Input & Slider
    el.bpmInput.addEventListener('input', (e) => setBpm(parseInt(e.target.value, 10) || 120));
    el.bpmSlider.addEventListener('input', (e) => setBpm(parseInt(e.target.value, 10) || 120));

    // BPM Delta Buttons
    document.querySelectorAll('.btn-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const delta = parseInt(btn.dataset.bpmDelta, 10);
        setBpm(state.bpm + delta);
      });
    });

    // Division Buttons
    el.divisionButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.custom) {
          el.customDivGroup.classList.remove('hidden');
          const customVal = parseInt(el.customDivInput.value, 10) || 16;
          setDivision(customVal);
        } else {
          el.customDivGroup.classList.add('hidden');
          const d = parseInt(btn.dataset.div, 10);
          setDivision(d);
        }
      });
    });

    el.customDivInput.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      if (val && val > 0 && val <= 128) {
        setDivision(val);
      }
    });

    // Time Signature
    el.timeSigSelect.addEventListener('change', (e) => {
      state.timeSignatureBeats = parseInt(e.target.value, 10) || 4;
      rebuildSequencerGrid();
    });

    // Speed Slider
    el.speedSlider.addEventListener('input', (e) => {
      state.speedMultiplier = parseFloat(e.target.value);
      el.speedVal.textContent = `${state.speedMultiplier.toFixed(1)}x`;
    });

    // Sound Select & Volume
    el.soundSelect.addEventListener('change', (e) => {
      state.soundType = e.target.value;
    });

    el.volumeSlider.addEventListener('input', (e) => {
      state.volume = parseInt(e.target.value, 10) / 100.0;
      el.volumeVal.textContent = `${e.target.value}%`;
    });

    el.accentBeatCheck.addEventListener('change', (e) => {
      state.accentBeat = e.target.checked;
    });

    el.subBeatMetronomeCheck.addEventListener('change', (e) => {
      state.subBeatMetronome = e.target.checked;
    });

    // Pattern Sequencer actions
    el.patternPresetSelect.addEventListener('change', (e) => {
      applyPatternPreset(e.target.value);
    });

    el.seqAllOn.addEventListener('click', () => {
      state.pattern.fill(true);
      updateSequencerUI();
    });

    el.seqInvert.addEventListener('click', () => {
      state.pattern = state.pattern.map(v => !v);
      updateSequencerUI();
    });

    el.seqClear.addEventListener('click', () => {
      state.pattern.fill(false);
      updateSequencerUI();
    });

    // Playback buttons
    el.playBtn.addEventListener('click', togglePlayback);
    el.resetBtn.addEventListener('click', () => {
      stopPlayback();
      setBpm(150);
      setDivision(16);
      state.pattern.fill(true);
      updateSequencerUI();
    });

    // Tap Tempo
    el.tapTempoBtn.addEventListener('click', handleTapTempo);

    // View Mode Tabs
    el.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        el.tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.viewMode = btn.dataset.mode;
      });
    });

    el.alternateLaneCheck.addEventListener('change', (e) => {
      state.alternateLanes = e.target.checked;
    });

    // Practice Tap Buttons
    el.tapKeyLeft.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handleUserTap(0);
    });
    el.tapKeySpace.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handleUserTap(0);
    });
    el.tapKeyRight.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handleUserTap(1);
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      // Don't trigger shortcuts if focus is in an input field
      if (['INPUT', 'SELECT'].includes(document.activeElement.tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (!state.isPlaying) {
          startPlayback();
        } else {
          handleUserTap(0);
        }
      } else if (e.code === 'KeyD') {
        e.preventDefault();
        handleUserTap(0);
      } else if (e.code === 'KeyK') {
        e.preventDefault();
        handleUserTap(1);
      } else if (e.code === 'KeyT') {
        e.preventDefault();
        handleTapTempo();
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        setBpm(state.bpm + 5);
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        setBpm(state.bpm - 5);
      }
    });
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================
  function init() {
    setupEventListeners();
    rebuildSequencerGrid();
    updateMathStats();
    resizeCanvas();
    renderVisualizer();
  }

  // Run on DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
