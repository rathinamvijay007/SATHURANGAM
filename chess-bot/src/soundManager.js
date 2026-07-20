class SoundManager {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playMove() {
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    // Short wooden thud
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.08);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);

    osc.start(t);
    osc.stop(t + 0.085);
  }

  playCapture() {
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    
    // 1. Noise component (for snap)
    const bufferSize = this.ctx.sampleRate * 0.05; // 0.05 seconds
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1000;
    noiseFilter.Q.value = 2.0;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.04);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    // 2. Tone component (thud)
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.06);

    oscGain.gain.setValueAtTime(0.4, t);
    oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);

    noise.start(t);
    osc.start(t);
    osc.stop(t + 0.07);
    noise.stop(t + 0.07);
  }

  playCheck() {
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    
    // Quick double chime
    const playChime = (freq, startOffset, duration) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + startOffset);
      
      gain.gain.setValueAtTime(0, t + startOffset);
      gain.gain.linearRampToValueAtTime(0.2, t + startOffset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + startOffset + duration);

      osc.start(t + startOffset);
      osc.stop(t + startOffset + duration + 0.01);
    };

    playChime(650, 0, 0.08);
    playChime(750, 0.06, 0.12);
  }

  playGameOver(isWin = true) {
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const playNote = (freq, delay, dur) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + delay);
      
      gain.gain.setValueAtTime(0, t + delay);
      gain.gain.linearRampToValueAtTime(0.15, t + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + dur);

      osc.start(t + delay);
      osc.stop(t + delay + dur + 0.01);
    };

    if (isWin) {
      // Pleasant major arpeggio: C4 -> E4 -> G4 -> C5
      playNote(261.63, 0, 0.2);
      playNote(329.63, 0.1, 0.2);
      playNote(392.00, 0.2, 0.2);
      playNote(523.25, 0.3, 0.5);
    } else {
      // Somber descending/minor interval: G4 -> Eb4 -> D4
      playNote(392.00, 0, 0.25);
      playNote(311.13, 0.15, 0.25);
      playNote(293.66, 0.3, 0.6);
    }
  }

  playPromote() {
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.25);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.2, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);

    osc.start(t);
    osc.stop(t + 0.26);
  }
}

export const soundManager = new SoundManager();
