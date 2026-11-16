/**
 * YOLO - Procedural chiptune music
 *
 * Two parts:
 *   composeSong()  pure: a seed and a level in, a 32-bar four-track song out. No Web Audio, no DOM.
 *   MusicPlayer    plays a song on the audio clock and adds or drops layers with the action.
 *
 * Everything sits on a 16th-note grid, 16 steps to the bar. A note is
 * { step, dur, midi, min }: `min` is the lowest intensity (0-3) at which it sounds.
 */

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

/** Small seeded random number generator (mulberry32): same seed, same tune */
function makeRng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const mod = (n, m) => ((n % m) + m) % m;

/** Lowest note at or above `floor` with the same pitch class as `midi` */
const foldAbove = (midi, floor) => floor + mod(midi - floor, 12);

export const MODES = {
    minor:    [0, 2, 3, 5, 7, 8, 10],
    dorian:   [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
};

// Chord roots as scale degrees (0 = i). Each list avoids the mode's diminished chord.
const PROGRESSIONS = {
    minor: {
        A: [[0, 5, 2, 6], [0, 6, 5, 4], [0, 3, 6, 2], [0, 5, 3, 4], [0, 2, 6, 3], [0, 4, 5, 6]],
        B: [[5, 6, 0, 0], [3, 0, 5, 6], [5, 2, 3, 4], [3, 6, 2, 4]],
    },
    dorian: {
        A: [[0, 3, 6, 0], [0, 2, 6, 3], [0, 6, 3, 0], [0, 4, 3, 6]],
        B: [[3, 0, 6, 3], [2, 6, 3, 0], [6, 3, 0, 0]],
    },
    phrygian: {
        A: [[0, 1, 0, 6], [0, 5, 1, 0], [0, 6, 5, 1]],
        B: [[3, 2, 1, 0], [5, 6, 1, 0]],
    },
};

const KEY_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const TONICS = [9, 0, 2, 4, 7, 11, 5];   // pitch classes the lead can be centred on

// Half-bar melody rhythms: [offset, length] in 16ths
const CELLS = [
    [[0, 2], [2, 2], [4, 2], [6, 2]],
    [[0, 3], [3, 3], [6, 2]],
    [[0, 4], [4, 2], [6, 2]],
    [[0, 2], [2, 2], [4, 4]],
    [[0, 3], [3, 1], [4, 2], [6, 2]],
    [[0, 2], [2, 1], [3, 1], [4, 4]],
    [[2, 2], [4, 2], [6, 2]],
    [[0, 6], [6, 2]],
];
// Rhythms that come to rest: used to close a motif
const LONG_CELLS = [[[0, 8]], [[0, 4], [4, 4]], [[0, 2], [2, 6]], [[0, 3], [3, 5]]];
// Whole-bar rhythms that end a section on a long note
const CADENCES = [[[0, 4], [4, 12]], [[0, 2], [2, 2], [4, 12]], [[0, 3], [3, 3], [6, 10]], [[0, 16]]];

// How far the melody moves between notes, in scale steps. Mostly stepwise.
const MOVES = [-1, -1, -1, -1, 1, 1, 1, 1, -2, -2, 2, 2, 0, 0, 3, -3, 4];

const LEAD_LOW = -2;     // melody range in scale degrees around the tonic: about an octave and a half
const LEAD_HIGH = 9;
const BASS_FLOOR = 45;   // A2 (110 Hz): anything lower is lost on phone speakers
const ARP_FLOOR = 55;

// Bass patterns: [step, length, tone] with tone 0 = root, 1 = fifth, 2 = octave
const BASS_PATTERNS = [
    [[0, 2, 0], [2, 2, 0], [4, 2, 0], [6, 2, 0], [8, 2, 0], [10, 2, 0], [12, 2, 0], [14, 2, 0]],
    [[0, 2, 0], [2, 2, 2], [4, 2, 0], [6, 2, 2], [8, 2, 0], [10, 2, 2], [12, 2, 0], [14, 2, 2]],
    [[0, 2, 0], [2, 2, 0], [4, 2, 1], [6, 2, 0], [8, 2, 2], [10, 2, 0], [12, 2, 1], [14, 2, 2]],
    [[0, 3, 0], [3, 3, 0], [6, 2, 0], [8, 3, 0], [11, 3, 1], [14, 2, 2]],
    [[0, 2, 0], [2, 1, 0], [3, 1, 0], [4, 2, 0], [6, 1, 0], [7, 1, 0],
     [8, 2, 0], [10, 1, 0], [11, 1, 0], [12, 2, 2], [14, 1, 0], [15, 1, 0]],
];

// Arpeggio orders over [root, third, fifth, octave]
const ARP_PATTERNS = [[0, 1, 2, 3], [0, 1, 2, 3, 2, 1], [0, 2, 3, 1], [3, 2, 1, 0], [0, 2, 1, 3]];

const KICK_PATTERNS = [[0, 8], [0, 6, 8], [0, 8, 10], [0, 3, 8, 11], [0, 4, 8, 12], [0, 7, 8, 14]];
const GHOST_SNARES = [[], [7], [15], [7, 15], [10]];

const FORM = ['A', 'A', 'B', 'A'];   // four 8-bar sections
const BARS_PER_SECTION = 8;

/** Semitone pitch of a scale degree. With `majorV`, the seventh is raised over the V chord. */
function degreeToMidi(song, degree, chordRoot) {
    const octave = Math.floor(degree / 7);
    const index = degree - octave * 7;
    let semis = MODES[song.mode][index];
    if (song.majorV && chordRoot === 4 && index === 6) semis += 1;
    return song.tonic + octave * 12 + semis;
}

const isChordTone = (degree, chordRoot) => [0, 2, 4].includes(mod(degree - chordRoot, 7));

/** The chord tone closest to `degree` inside the melody range; `lean` (+1/-1) breaks ties */
function nearestChordTone(degree, chordRoot, lean = 1) {
    for (let off = 0; off <= 4; off++) {
        for (const d of lean >= 0 ? [degree + off, degree - off] : [degree - off, degree + off]) {
            if (d >= LEAD_LOW && d <= LEAD_HIGH && isChordTone(d, chordRoot)) return d;
        }
    }
    return degree;
}

/** A two-bar idea: a rhythm that repeats its opening and then rests, plus a melodic shape */
function makeMotif(rand) {
    const open = pick(rand, CELLS);
    const answer = pick(rand, CELLS);
    const close = pick(rand, LONG_CELLS);
    const notes = [];
    [open, answer, open, close].forEach((cell, half) => {
        for (const [offset, dur] of cell) notes.push({ step: half * 8 + offset, dur, move: pick(rand, MOVES) });
    });
    return { notes, lift: Math.floor(rand() * 5) - 1 };
}

/** The same idea with a couple of its intervals changed */
function varyMotif(motif, rand) {
    const notes = motif.notes.map(n => ({ ...n }));
    for (let i = 0; i < 2; i++) pick(rand, notes).move = pick(rand, MOVES);
    return { ...motif, notes };
}

/** The motif's first bar followed by a bar that lands on a long note */
function cadenceMotif(motif, rand) {
    const notes = motif.notes.filter(n => n.step < 16).map(n => ({ ...n }));
    const cell = pick(rand, CADENCES);
    cell.forEach(([offset, dur], i) => {
        notes.push({ step: 16 + offset, dur, move: pick(rand, [-1, -1, 1, -2]), rest: i === cell.length - 1 });
    });
    return { ...motif, notes };
}

/**
 * Turn a motif into pitches over two bars of chords. Notes on beats 1 and 3
 * (and the closing note of a cadence) are pulled onto the chord; the rest
 * walk the scale between them.
 * @returns {{ notes: Array, last: number }} notes carry `step` 0-31
 */
function realize(motif, chords, startNear) {
    const out = [];
    let prev = null;
    for (const n of motif.notes) {
        const chord = chords[n.step < 16 ? 0 : 1];
        let degree;
        if (prev === null) {
            degree = nearestChordTone(startNear, chord);
        } else {
            degree = prev + n.move;
            if (degree > LEAD_HIGH || degree < LEAD_LOW) degree = prev - n.move;   // turn back at the edge of the range
            degree = Math.max(LEAD_LOW, Math.min(LEAD_HIGH, degree));
            if (n.step % 8 === 0 || n.rest) degree = nearestChordTone(degree, chord, n.move);
        }
        out.push({ step: n.step, dur: n.dur, degree, chord });
        prev = degree;
    }
    return { notes: out, last: prev };
}

/**
 * Compose one pass (32 bars) of a song.
 *
 * The seed fixes the song's identity: key, mode, tempo, chords and the two
 * melodic motifs. `pass` changes only the dressing (how the motif is varied,
 * bass, arpeggio and drum patterns) so a level's tune stays recognisable but
 * never loops identically.
 *
 * @param {number} seed
 * @param {number} level - game level; later levels are faster and darker
 * @param {number} pass - how many times the song has already played through
 * @param {{ base?: number, perLevel?: number }} tempo - BPM at level 1 and the rise per level (levels 1-7)
 */
export function composeSong(seed, level = 1, pass = 0, tempo = {}) {
    const rand = makeRng(seed);
    const late = Math.min(Math.max(level - 1, 0), 6) / 6;   // 0 at level 1, 1 from level 7

    const roll = rand();
    const mode = roll < 0.05 + 0.3 * late ? 'phrygian' : roll < 0.45 + 0.1 * late ? 'dorian' : 'minor';
    const majorV = mode === 'minor' && rand() < 0.3 + 0.5 * late;
    const tonicPc = pick(rand, TONICS);
    const bpm = Math.round((tempo.base ?? 116) + (tempo.perLevel ?? 4) * late * 6 + rand() * 8 - 4);

    const song = {
        seed, level, pass, mode, majorV, bpm,
        tonic: 60 + tonicPc,                       // C4-B4: scale degree 0 of the lead
        key: `${KEY_NAMES[tonicPc]} ${mode}${majorV ? ' (major V)' : ''}`,
        duty: rand() < 0.5 ? [0.25, 0.125] : [0.125, 0.25],   // lead pulse width in sections A and B
        progressions: { A: pick(rand, PROGRESSIONS[mode].A), B: pick(rand, PROGRESSIONS[mode].B) },
        bars: [],
    };
    const motifs = { A: makeMotif(rand), B: makeMotif(rand) };

    // Everything below varies from pass to pass
    const vary = makeRng(seed * 31 + pass * 7919 + 1);
    const dressing = {};
    for (const name of ['A', 'B']) {
        dressing[name] = {
            bass: pick(vary, BASS_PATTERNS),
            arp: pick(vary, ARP_PATTERNS),
            kicks: pick(vary, KICK_PATTERNS),
            ghosts: pick(vary, GHOST_SNARES),
        };
    }

    FORM.forEach((name, slot) => {
        const prog = song.progressions[name];
        const motif = motifs[name];
        const look = dressing[name];

        // Melody: idea, the idea over the next chords, the idea varied, then a cadence
        const phrases = [motif, motif, varyMotif(motif, vary), cadenceMotif(motif, vary)];
        const lead = Array.from({ length: BARS_PER_SECTION }, () => []);
        let near = 2 + motif.lift;
        phrases.forEach((phrase, p) => {
            const chords = [prog[(p * 2) % 4], prog[(p * 2 + 1) % 4]];
            const { notes, last } = realize(phrase, chords, near);
            near = last;
            for (const n of notes) {
                lead[p * 2 + (n.step < 16 ? 0 : 1)].push({
                    step: n.step % 16, dur: n.dur, midi: degreeToMidi(song, n.degree, n.chord), min: 1,
                });
            }
        });

        for (let b = 0; b < BARS_PER_SECTION; b++) {
            const chord = prog[b % 4];
            const rootMidi = degreeToMidi(song, chord, chord);
            const third = degreeToMidi(song, chord + 2, chord) - rootMidi;
            const fifth = degreeToMidi(song, chord + 4, chord) - rootMidi;

            const bassRoot = foldAbove(rootMidi, BASS_FLOOR);
            const bass = look.bass.map(([step, dur, tone]) => (
                { step, dur, midi: bassRoot + [0, fifth, 12][tone], min: 0 }));

            // 16ths when the action is on, every other one (8ths) when it is quiet
            const arpRoot = foldAbove(rootMidi, ARP_FLOOR);
            const arpTones = [0, third, fifth, 12];
            const arp = [];
            for (let step = 0; step < 16; step++) {
                arp.push({ step, dur: 1, midi: arpRoot + arpTones[look.arp[step % look.arp.length]], min: step % 2 ? 2 : 0 });
            }

            const drums = [];
            const fill = b === BARS_PER_SECTION - 1;   // the last bar of each section rolls into the next
            for (let step = 0; step < 16; step++) {
                drums.push({ step, type: 'hat', min: step % 4 === 0 ? 0 : step % 2 === 0 ? 1 : 3 });
                if (fill && step >= 8) {
                    if (step !== 9 && step !== 11) drums.push({ step, type: 'snare', min: 1 });
                    continue;
                }
                if (look.kicks.includes(step)) drums.push({ step, type: 'kick', min: step % 8 === 0 ? 1 : 2 });
                if (step === 4 || step === 12) drums.push({ step, type: 'snare', min: 1 });
                else if (look.ghosts.includes(step)) drums.push({ step, type: 'ghost', min: 2 });
            }
            if (b === 0) drums.push({ step: 0, type: 'crash', min: 1 });

            song.bars.push({ section: name, slot, chord, lead: lead[b], bass, arp, drums });
        }
    });

    return song;
}

// Level-complete fanfares: three short calls over rising major chords, then a held note.
// Chord roots are semitones above the tonic; every chord is a major triad.
const FANFARE_CHORDS = [[0, 5, 7, 0], [0, 8, 10, 0], [5, 0, 7, 0]];
const FANFARE_CELLS = [[[0, 1], [1, 1], [2, 1]], [[0, 2], [2, 1]], [[0, 1], [1, 2]], [[0, 3]]];
const FANFARE_SHAPES = [[0, 0, 0], [0, 1, 2], [0, 1, 0], [0, 0, 1], [1, 0, 1]];
const FANFARE_HOLD = 9;   // steps the last note is held

/**
 * Compose a level-complete fanfare. Each seed gives a different one, so every
 * level's tune ends with its own flourish.
 * @returns {{ sec: number, lead: Array, harmony: Array, bass: Array, drums: Array }}
 *   lead/harmony/bass rows are [step, length, semitones above the tonic]; drums are [step, type]
 */
export function composeFanfare(seed) {
    const rand = makeRng((seed ^ 0x5eed) >>> 0);
    const roots = pick(rand, FANFARE_CHORDS);
    const lead = [], harmony = [], bass = [], drums = [];

    // Chord tones between a third above the tonic and the fifth an octave up
    const tonesOf = root => {
        const tones = [];
        for (let semis = 3; semis <= 19; semis++) {
            if ([0, 4, 7].includes(mod(semis - root, 12))) tones.push(semis);
        }
        return tones;
    };
    const below = (tones, note) => tones.filter(t => t < note).pop() ?? note - 12;

    let step = 0;
    let floor = 4 + Math.floor(rand() * 4);   // each call starts higher than the one before
    let last = floor;
    for (let seg = 0; seg < 3; seg++) {
        const tones = tonesOf(roots[seg]);
        const anchor = Math.max(0, tones.findIndex(t => t >= floor));
        const cell = pick(rand, FANFARE_CELLS);
        const shape = pick(rand, FANFARE_SHAPES);
        cell.forEach(([offset, dur], i) => {
            last = tones[Math.min(anchor + shape[i], tones.length - 1)];
            lead.push([step + offset, dur, last]);
            if (seg === 0 || dur === 1) drums.push([step + offset, 'snare']);
        });
        harmony.push([step, 3, below(tones, lead[lead.length - cell.length][2])]);
        bass.push([step, 3, roots[seg]]);
        if (seg > 0) drums.push([step, 'kick']);
        step += 3;
        floor = tones[anchor] + 2 + Math.floor(rand() * 2);
    }

    // Land on the tonic chord, at or above where the calls ended
    const home = tonesOf(0).filter(t => t >= 12);
    const high = home.filter(t => t >= last - 2);
    const final = high.length ? pick(rand, high) : home[home.length - 1];
    const homeStep = step;
    if (rand() < 0.5) {
        lead.push([step, 1, below([7, ...home], final)]);   // a quick pickup from the chord tone below
        drums.push([step, 'snare']);
        step += 1;
    }
    lead.push([step, FANFARE_HOLD, final]);
    harmony.push([step, FANFARE_HOLD, below(tonesOf(0), final)]);
    bass.push([homeStep, FANFARE_HOLD + step - homeStep, 0]);
    drums.push([step, 'kick'], [step, 'crash']);

    return { sec: 0.105 + rand() * 0.02, lead, harmony, bass, drums };
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

const DEFAULTS = {
    volume: 0.35,          // music bus level under the sound effects
    levels: { lead: 0.2, echo: 0.3, arp: 0.07, bass: 0.3, kick: 0.5, snare: 0.26, hat: 0.09 },
    tempo: { base: 116, perLevel: 4 },
    lookahead: 0.12,       // seconds of notes kept scheduled ahead of the audio clock
    tick: 25,              // ms between scheduler runs
    calmBars: 4,           // bars the action must stay down before layers drop out
};

const midiToHz = midi => 440 * Math.pow(2, (midi - 69) / 12);

/** A pulse wave of the given duty cycle (0.5 = square), as on the old sound chips */
function pulseWave(ctx, duty, harmonics = 48) {
    const real = new Float32Array(harmonics + 1);
    const imag = new Float32Array(harmonics + 1);
    for (let n = 1; n <= harmonics; n++) real[n] = 2 / (n * Math.PI) * Math.sin(n * Math.PI * duty);
    return ctx.createPeriodicWave(real, imag);
}

export class MusicPlayer {
    constructor(options = {}) {
        this.cfg = { ...DEFAULTS, ...options, levels: { ...DEFAULTS.levels, ...options.levels } };
        this.ctx = null;
        this.song = null;
        this.playing = false;
        this.timer = null;

        // Position: the next step to schedule and the audio-clock time it falls on
        this.bar = 0;
        this.step = 0;
        this.nextTime = 0;

        // Intensity 0-3: what the game wants, what is sounding, and the bookkeeping between
        this.intensity = 0;
        this.wanted = 0;
        this.barPeak = 0;      // highest request since the last bar line
        this.calm = 0;         // bars in a row that asked for less than is sounding
        this.forced = null;    // debug override
        this.fixed = null;     // a song's own set arrangement (the menu theme), or null to follow the game
        this.bpm = null;       // a song's own set tempo, or null for the composer's
        this.tag = 'level';    // what the current song is for: 'level' or 'menu'
        this.previewOut = null;
    }

    /** Build the audio graph. Safe to call repeatedly; only the first call does anything. */
    attach(ctx, destination) {
        if (this.ctx) return;
        this.ctx = ctx;
        this.destination = destination;

        this.bus = ctx.createGain();           // faded in and out with play/stop
        this.bus.gain.value = 0;
        this.bus.connect(destination);

        this.jingleBus = ctx.createGain();     // fanfares, heard while the song itself is stopped
        this.jingleBus.gain.value = this.cfg.volume;
        this.jingleBus.connect(destination);

        // Lead goes through one feedback delay: the echo that fills out a single voice
        this.leadBus = ctx.createGain();
        this.leadBus.connect(this.bus);
        this.delay = ctx.createDelay(1);
        const feedback = ctx.createGain();
        feedback.gain.value = 0.3;
        const echo = ctx.createGain();
        echo.gain.value = this.cfg.levels.echo;
        this.leadBus.connect(this.delay);
        this.delay.connect(feedback);
        feedback.connect(this.delay);
        this.delay.connect(echo);
        echo.connect(this.bus);

        this.waves = { 0.25: pulseWave(ctx, 0.25), 0.125: pulseWave(ctx, 0.125) };

        // One second of noise shared by every drum hit
        this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

        this._applyTempo();
    }

    get stepSeconds() {
        return 60 / this.song.bpm / 4;
    }

    _applyTempo() {
        if (this.ctx && this.song) this.delay.delayTime.value = this.stepSeconds * 3;   // dotted-eighth echo
    }

    /**
     * Switch to a new song from its first bar. If music is playing it carries straight on.
     * @param {{ intensity?: number, bpm?: number, tag?: string }} options - a fixed arrangement
     *   (ignores the game's intensity), a fixed tempo, and a label saying what the song is for
     */
    newSong(level, seed, options = {}) {
        this.fixed = options.intensity ?? null;
        this.bpm = options.bpm ?? null;
        this.tag = options.tag ?? 'level';
        this.song = this._compose(seed, level, 0);
        this.bar = 0;
        this.step = 0;
        this.intensity = this.wanted = this.barPeak = this.calm = 0;
        this._applyTempo();
    }

    _compose(seed, level, pass) {
        const song = composeSong(seed, level, pass, this.cfg.tempo);
        if (this.bpm) song.bpm = this.bpm;
        return song;
    }

    /** Set the music level (0-1). Heard at once if music is playing. */
    setVolume(volume) {
        this.cfg.volume = volume;
        if (this.ctx && this.playing) this._fade(this.bus.gain, volume, 0.1);
    }

    /**
     * Play the current bar once at the current volume while the song itself is
     * stopped, so a volume change can be heard. A new preview cuts off the last.
     */
    preview() {
        if (!this.ctx || !this.song) return;
        const now = this.ctx.currentTime;
        if (this.previewOut) {
            const old = this.previewOut;
            this._fade(old.gain, 0, 0.04);
            setTimeout(() => old.disconnect(), 200);
        }
        const out = this.previewOut = this.ctx.createGain();
        out.gain.value = this.cfg.volume;
        out.connect(this.destination);
        const level = Math.max(1, this.intensity);
        for (let step = 0; step < 16; step++) {
            this._playStep(this.song.bars[this.bar], step, now + 0.03 + step * this.stepSeconds, level, out);
        }
    }

    /** Start, or resume from the top of the bar that was playing when stop() was called */
    start() {
        if (!this.ctx || !this.song || this.playing) return;
        this.playing = true;
        this.step = 0;
        this._fade(this.bus.gain, this.cfg.volume, 0.4);
        this.nextTime = this.ctx.currentTime + 0.06;
        this.timer = setInterval(() => this._pump(), this.cfg.tick);
        this._pump();
    }

    /** Fade out and hold position. Notes are separate short-lived nodes, so there is nothing to tear down. */
    stop() {
        if (!this.playing) return;
        this.playing = false;
        clearInterval(this.timer);
        this.timer = null;
        this._fade(this.bus.gain, 0, 0.3);
        this._fade(this.jingleBus.gain, 0, 0.3);
    }

    /** Called by the game every frame with how hot the action is (0-3) */
    setIntensity(level) {
        this.wanted = level;
        if (level > this.barPeak) this.barPeak = level;
    }

    _fade(param, value, seconds) {
        const now = this.ctx.currentTime;
        if (param.cancelAndHoldAtTime) {
            param.cancelAndHoldAtTime(now);
        } else {
            param.cancelScheduledValues(now);
            param.setValueAtTime(param.value, now);
        }
        param.linearRampToValueAtTime(value, now + seconds);
    }

    /** Schedule every step that starts before `horizon` on the audio clock */
    _pump(horizon = this.ctx.currentTime + this.cfg.lookahead) {
        // If the browser held our timer back, skip ahead rather than play a burst of late notes
        if (this.nextTime < this.ctx.currentTime - 0.2) this.nextTime = this.ctx.currentTime + 0.05;

        while (this.nextTime < horizon) {
            this._scheduleStep(this.nextTime);
            this.nextTime += this.stepSeconds;
            if (++this.step === 16) {
                this.step = 0;
                if (++this.bar === this.song.bars.length) {
                    this.bar = 0;
                    this.song = this._compose(this.song.seed, this.song.level, this.song.pass + 1);
                }
            }
        }
    }

    /** Layers come in on the next beat; they drop out only on a bar line after several calm bars */
    _settleIntensity() {
        const pinned = this.forced ?? this.fixed;   // debug override, or a song with a set arrangement
        if (pinned !== null) {
            this.intensity = pinned;
            return;
        }
        if (this.wanted > this.intensity) {
            this.intensity = this.wanted;
            this.calm = 0;
        }
        if (this.step !== 0) return;
        if (this.barPeak < this.intensity) {
            if (++this.calm >= this.cfg.calmBars) {
                this.intensity = this.barPeak;
                this.calm = 0;
            }
        } else {
            this.calm = 0;
        }
        this.barPeak = this.wanted;
    }

    _scheduleStep(time) {
        if (this.step % 4 === 0) this._settleIntensity();
        this._playStep(this.song.bars[this.bar], this.step, time, this.intensity);
    }

    /**
     * Sound one step of a bar at the given intensity.
     * @param {AudioNode} [out] - send everything here instead of the song's own buses (no echo)
     */
    _playStep(bar, step, time, level, out = null) {
        const sec = this.stepSeconds;
        const mix = this.cfg.levels;
        const leadOut = out || this.leadBus;
        const restOut = out || this.bus;
        const sounding = n => n.step === step && n.min <= level;

        for (const n of bar.lead) {
            if (!sounding(n)) continue;
            const wave = this.waves[this.song.duty[bar.section === 'A' ? 0 : 1]];
            const length = n.dur * sec * 0.92;
            this._tone(wave, n.midi, time, length, mix.lead, leadOut, n.dur >= 4);
            // In danger the melody is doubled an octave up
            if (level >= 3) this._tone(this.waves[0.125], n.midi + 12, time, length, mix.lead * 0.35, leadOut);
        }
        for (const n of bar.arp) {
            if (sounding(n)) this._tone('square', n.midi, time, sec * 0.8, mix.arp, restOut);
        }
        for (const n of bar.bass) {
            if (sounding(n)) this._tone('triangle', n.midi, time, n.dur * sec * 0.9, mix.bass, restOut);
        }
        for (const n of bar.drums) {
            if (sounding(n)) this._drum(n.type, time, restOut);
        }
    }

    /** One note: its own oscillator and envelope, with a short attack and release so nothing clicks */
    _tone(wave, midi, time, length, volume, destination, vibrato = false) {
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        if (typeof wave === 'string') osc.type = wave;
        else osc.setPeriodicWave(wave);
        const hz = midiToHz(midi);
        osc.frequency.value = hz;

        const release = Math.min(0.03, length * 0.3);
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(volume, time + 0.005);
        gain.gain.linearRampToValueAtTime(volume * 0.65, time + length - release);
        gain.gain.linearRampToValueAtTime(0, time + length);

        osc.connect(gain);
        gain.connect(destination);
        osc.start(time);
        osc.stop(time + length + 0.01);

        if (vibrato) {
            // Held notes start straight and then waver
            const lfo = ctx.createOscillator();
            const depth = ctx.createGain();
            lfo.frequency.value = 5.5;
            depth.gain.value = 0;
            depth.gain.setValueAtTime(0, time + 0.15);
            depth.gain.linearRampToValueAtTime(hz * 0.008, time + 0.32);
            lfo.connect(depth);
            depth.connect(osc.frequency);
            lfo.start(time);
            lfo.stop(time + length + 0.01);
        }
    }

    _noise(time, seconds, volume, filterType, hz, destination) {
        const ctx = this.ctx;
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const filter = ctx.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.value = hz;
        filter.Q.value = 0.7;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + seconds);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(destination);
        src.start(time, Math.random() * 0.5, seconds + 0.01);
    }

    _drum(type, time, destination) {
        const mix = this.cfg.levels;
        switch (type) {
            case 'kick': {
                const ctx = this.ctx;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(170, time);
                osc.frequency.exponentialRampToValueAtTime(48, time + 0.09);
                gain.gain.setValueAtTime(mix.kick, time);
                gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
                osc.connect(gain);
                gain.connect(destination);
                osc.start(time);
                osc.stop(time + 0.15);
                break;
            }
            case 'snare': this._noise(time, 0.11, mix.snare, 'bandpass', 1900, destination); break;
            case 'ghost': this._noise(time, 0.06, mix.snare * 0.35, 'bandpass', 1900, destination); break;
            case 'hat':   this._noise(time, 0.03, mix.hat, 'highpass', 7000, destination); break;
            case 'crash': this._noise(time, 0.35, mix.hat * 1.6, 'highpass', 5000, destination); break;
        }
    }

    /**
     * A short one-off phrase in the current song's key, heard even while the song is stopped.
     * @param {'victory'|'highscore'|'gameover'} kind
     */
    jingle(kind) {
        if (!this.ctx || !this.song) return;
        const start = this.ctx.currentTime + 0.05;
        const out = this.jingleBus;
        out.gain.cancelScheduledValues(start - 0.05);
        out.gain.setValueAtTime(this.cfg.volume, start - 0.05);

        const mix = this.cfg.levels;
        const tonic = this.song.tonic;
        const low = foldAbove(tonic, BASS_FLOOR);
        // Rows are [step, length, semitones above the tonic]
        const play = (rows, sec, wave, base, volume, vibrato) => {
            for (const [step, dur, semis] of rows) {
                this._tone(wave, base + semis, start + step * sec, dur * sec * 0.92, volume, out, vibrato && dur >= 6);
            }
        };

        if (kind === 'victory') {
            // A fanfare of this level's own, in the major of its tune's key
            const fanfare = composeFanfare(this.song.seed);
            const sec = fanfare.sec;
            play(fanfare.lead, sec, this.waves[0.25], tonic, mix.lead, true);
            play(fanfare.harmony, sec, 'square', tonic, mix.arp * 1.5);
            play(fanfare.bass, sec, 'triangle', low, mix.bass);
            for (const [step, type] of fanfare.drums) this._drum(type, start + step * sec, out);
        } else if (kind === 'highscore') {
            // Three calls on the tonic, then a I-IV-V-I climb to a held fifth
            const sec = 0.11;
            play([[0, 1, 12], [1, 1, 12], [2, 1, 12], [3, 2, 17], [5, 1, 16], [6, 2, 14], [8, 9, 19]], sec, this.waves[0.25], tonic, mix.lead, true);
            play([[3, 2, 9], [6, 2, 11], [8, 9, 16]], sec, 'square', tonic, mix.arp * 1.5);
            play([[0, 3, 0], [3, 3, 5], [6, 2, 7], [8, 9, 0]], sec, 'triangle', low, mix.bass);
            for (const step of [0, 1, 2, 5]) this._drum('snare', start + step * sec, out);
            for (const step of [3, 6, 8]) this._drum('kick', start + step * sec, out);
            this._drum('crash', start + 8 * sec, out);
        } else {
            // Falling minor line that sinks to the tonic
            const sec = 0.16;
            play([[0, 2, 12], [2, 2, 8], [4, 2, 7], [6, 2, 3], [8, 10, 0]], sec, this.waves[0.25], tonic, mix.lead, true);
            play([[0, 8, 7], [8, 10, 0]], sec, 'triangle', low, mix.bass);
            this._drum('kick', start + 8 * sec, out);
        }
    }
}
