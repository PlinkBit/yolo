/**
 * YOLO - Sound Effects Manager
 * All sounds procedurally synthesized via Web Audio API, no external assets.
 * The background music lives in music.js; this file owns the audio context and starts and stops it.
 */

import { CONFIG, DEBUG } from './config.js';
import { MusicPlayer } from './music.js';

class SoundManager {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.enabled = true;
        this.initialized = false;

        // Background music: composed and played by music.js, mixed under the effects
        this.music = new MusicPlayer(CONFIG.music);

        // True while the title-screen demo runs: its battle is silent, the music is not
        this.effectsMuted = false;
    }

    /**
     * Compose a fresh tune for a level. It starts with the next playMusic(), or
     * takes over at once if music is already playing. ?seed=N pins the tune.
     */
    newSong(level, seed = DEBUG.seed ?? Math.floor(Math.random() * 0x100000000)) {
        this.music.newSong(level, seed);
    }

    /** Start the music, or pick it up from the bar where stopMusic() left it */
    playMusic() {
        if (!this.enabled) return;
        this.ensureInitialized();
        this.music.attach(this.ctx, this.masterGain);
        this.music.start();
    }

    /**
     * The game's theme for the title and game-over screens: always the same tune,
     * in a steady arrangement. Carries on untouched if it is already playing.
     */
    playMenuMusic() {
        if (!this.enabled) return;
        this.ensureInitialized();
        this.music.attach(this.ctx, this.masterGain);
        if (this.music.tag !== 'menu') {
            const cfg = CONFIG.music;
            this.music.newSong(1, cfg.menuSeed, { intensity: cfg.menuIntensity, bpm: cfg.menuTempo, tag: 'menu' });
        }
        this.music.start();
    }

    /** @param {number} step - the player's volume setting, 1 to CONFIG.music.volumeSteps.length */
    setMusicVolume(step) {
        this.music.setVolume(CONFIG.music.volumeSteps[step - 1]);
    }

    /** Play one bar at the current volume while the music is stopped (the pause screen) */
    previewMusic() {
        if (!this.enabled) return;
        this.ensureInitialized();
        this.music.attach(this.ctx, this.masterGain);
        this.music.preview();
    }

    /** Fade the music out, keeping its place */
    stopMusic() {
        this.music.stop();
    }

    /** How hot the action is, 0 (exploring) to 3 (in danger): the music adds layers to match */
    setMusicIntensity(level) {
        this.music.setIntensity(level);
    }

    /** One-off fanfare ('victory', 'highscore') or sting ('gameover') in the current tune's key */
    playJingle(kind) {
        if (!this.enabled) return;
        this.ensureInitialized();
        this.music.attach(this.ctx, this.masterGain);
        this.music.jingle(kind);
    }

    /**
     * Lazy-initialize AudioContext on first interaction (browser policy requirement)
     */
    ensureInitialized() {
        // The browser can suspend audio again later (or refuse the first resume), so retry every time
        if (this.initialized) {
            if (this.ctx.state === 'suspended') this.ctx.resume();
            return;
        }
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.3; // Master volume to avoid blasting
            this.masterGain.connect(this.ctx.destination);
        }
        // Resume if suspended (Chrome autoplay policy)
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        this.initialized = true;
    }

    /**
     * Fire — short percussive "pop" like a suppressed tank shot, ~40ms
     */
    playFire() {
        if (!this.enabled || this.effectsMuted) return;
        this.ensureInitialized();
        const t = this.ctx.currentTime;

        // Layer 1: Quick noise burst for the "pop" impact
        const bufferSize = this.ctx.sampleRate * 0.04;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noiseSource = this.ctx.createBufferSource();
        noiseSource.buffer = buffer;

        // Bandpass filter to shape it into a muffled pop (not sharp click)
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 800;
        filter.Q.value = 2;

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.3, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.04);

        noiseSource.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        noiseSource.start(t);

        // Layer 2: Soft low thump underneath for weight
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(60, t + 0.03);

        oscGain.gain.setValueAtTime(0.15, t);
        oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.035);

        osc.connect(oscGain);
        oscGain.connect(this.masterGain);

        osc.start(t);
        osc.stop(t + 0.04);
    }

    /**
     * Brick Hit — percussive click with brief white noise decay, ~50ms
     */
    playBrickHit() {
        if (!this.enabled || this.effectsMuted) return;
        this.ensureInitialized();
        const t = this.ctx.currentTime;

        // Short burst of filtered white noise
        const bufferSize = this.ctx.sampleRate * 0.05;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1);
        }

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        // Bandpass filter to make it sound like a brick "clink"
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 2000;
        filter.Q.value = 1;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.6, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        source.start(t);
    }

    /**
     * Explosion — low-frequency rumble via filtered white noise burst, ~400ms
     */
    playExplosion() {
        if (!this.enabled || this.effectsMuted) return;
        this.ensureInitialized();
        const t = this.ctx.currentTime;
        const duration = 0.4;

        // White noise source for the rumble
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1);
        }

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        // Low-pass filter to muffle it into a rumble
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, t);
        filter.frequency.exponentialRampToValueAtTime(200, t + duration);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.8, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + duration);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        source.start(t);
    }

    /**
     * Reactor Collapse — deep bass boom with layered noise, ~800ms
     */
    playReactorCollapse() {
        if (!this.enabled || this.effectsMuted) return;
        this.ensureInitialized();
        const t = this.ctx.currentTime;
        const duration = 0.8;

        // Layer 1: Deep sine wave sweep down
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(30, t + duration);
        oscGain.gain.setValueAtTime(1.0, t);
        oscGain.gain.exponentialRampToValueAtTime(0.01, t + duration);
        osc.connect(oscGain);
        oscGain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + duration);

        // Layer 2: White noise rumble (like explosion but longer)
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, t);
        filter.frequency.exponentialRampToValueAtTime(100, t + duration);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.7, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, t + duration);

        source.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        source.start(t);
    }

    /**
     * Enemy Death — descending tone sweep with slight wail effect, ~300ms
     */
    playEnemyDeath() {
        if (!this.enabled || this.effectsMuted) return;
        this.ensureInitialized();
        const t = this.ctx.currentTime;
        const duration = 0.3;

        // Sine sweep from high to low (death wail)
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.exponentialRampToValueAtTime(100, t + duration);

        // Slight vibrato for character
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.type = 'sine';
        lfo.frequency.value = 8; // 8 Hz vibrato
        lfoGain.gain.value = 15; // ±15Hz depth
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        gain.gain.setValueAtTime(0.4, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(t);
        lfo.start(t);
        osc.stop(t + duration);
        lfo.stop(t + duration);
    }

    /**
     * Enemy Hit — metallic "clang" when bullet strikes enemy armor, ~30ms
     * High-frequency ping to clearly distinguish from player hit (low thud) and enemy death (wail)
     */
    playEnemyHit() {
        if (!this.enabled || this.effectsMuted) return;
        this.ensureInitialized();
        const t = this.ctx.currentTime;

        // High-frequency sine blip through highpass filter for metallic ping
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(3000, t);
        osc.frequency.exponentialRampToValueAtTime(1200, t + 0.03);

        filter.type = 'highpass';
        filter.frequency.value = 1500;

        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.03);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        osc.start(t);
        osc.stop(t + 0.035);
    }

    /**
     * Player Hit — sharp high-pitched impact with brief feedback, ~150ms
     */
    playPlayerHit() {
        if (!this.enabled || this.effectsMuted) return;
        this.ensureInitialized();
        const t = this.ctx.currentTime;

        // Sharp square blip at high frequency
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(1200, t);
        osc.frequency.exponentialRampToValueAtTime(300, t + 0.05);
        osc.frequency.setValueAtTime(300, t + 0.05); // Hold briefly
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.15);

        gain.gain.setValueAtTime(0.5, t);
        gain.gain.setValueAtTime(0.5, t + 0.03); // Quick drop then sustain
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(t);
        osc.stop(t + 0.15);
    }

    /**
     * Spawn Warning — rising two-tone chirp as a base starts materializing an enemy, ~250ms
     */
    /** Bright two-note chime: picked something up */
    playPickup() {
        this._tones('triangle', [[660, 0], [990, 0.07]], 0.14, 0.22);
    }

    /** Falling pair: a timed power-up ran out */
    playPowerDown() {
        this._tones('triangle', [[520, 0], [330, 0.1]], 0.16, 0.16);
    }

    /** One blip per kill in a streak, higher with each step */
    playStreak(multiplier) {
        this._tones('square', [[440 * Math.pow(1.19, multiplier), 0]], 0.1, 0.1);
    }

    /** Glassy ping: the shield soaked a hit */
    playShieldHit() {
        this._tones('sine', [[1320, 0], [1760, 0.03]], 0.12, 0.2);
    }

    /** Deep thump: a demolition shell leaving the barrel */
    playDemoFire() {
        this._tones('sawtooth', [[120, 0], [70, 0.06]], 0.22, 0.3);
    }

    /** Two low pips: fuel is running out */
    playLowFuel() {
        this._tones('square', [[220, 0], [220, 0.16]], 0.1, 0.12);
    }

    /** Rising arpeggio: a bonus tank was awarded */
    playBonusTank() {
        this._tones('triangle', [[523, 0], [659, 0.09], [784, 0.18], [1047, 0.27]], 0.16, 0.22);
    }

    /**
     * Play a short run of notes.
     * @param {Array} notes - [frequencyHz, startOffsetSeconds] pairs
     * @param {number} length - seconds each note lasts
     */
    _tones(type, notes, length, volume) {
        if (!this.enabled || this.effectsMuted) return;
        this.ensureInitialized();
        const t = this.ctx.currentTime;
        for (const [freq, offset] of notes) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, t + offset);
            gain.gain.setValueAtTime(volume, t + offset);
            gain.gain.exponentialRampToValueAtTime(0.01, t + offset + length);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(t + offset);
            osc.stop(t + offset + length);
        }
    }

    playSpawnWarning() {
        if (!this.enabled || this.effectsMuted) return;
        this.ensureInitialized();
        const t = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(330, t);
        osc.frequency.setValueAtTime(495, t + 0.12);

        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(t);
        osc.stop(t + 0.25);
    }

    /**
     * Turret Charge — rising whine while a turret lines up its shot, ~500ms
     */
    playTurretCharge() {
        if (!this.enabled || this.effectsMuted) return;
        this.ensureInitialized();
        const t = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.exponentialRampToValueAtTime(1400, t + 0.5);

        gain.gain.setValueAtTime(0.05, t);
        gain.gain.linearRampToValueAtTime(0.22, t + 0.45);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(t);
        osc.stop(t + 0.5);
    }

    /**
     * Reactor Hit — metallic descending ping when a reactor takes damage, ~180ms
     */
    playReactorHit() {
        if (!this.enabled || this.effectsMuted) return;
        this.ensureInitialized();
        const t = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.exponentialRampToValueAtTime(220, t + 0.18);

        gain.gain.setValueAtTime(0.35, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(t);
        osc.stop(t + 0.18);
    }
}

const sound = new SoundManager();

export default sound;
