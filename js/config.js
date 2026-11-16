/**
 * YOLO - Tuning constants and level curve
 * All timers are in frames at the 60fps baseline (scaled by delta time in the loop).
 */

export const CONFIG = {
    // Logical size of the game picture. Everything is drawn in these units; the
    // canvas backing store is scaled up to the screen's pixel density separately.
    view: { width: 800, height: 600 },

    player: {
        speed: 3.5,
        maxHealth: 100,
        fireCooldown: 18,          // frames between shots (~300ms)
        hitInvincibility: 30,      // frames of invincibility after taking a hit (~500ms)
        spawnInvincibility: 90,    // frames of invincibility at level start
    },

    fuel: {
        capacity: 100,
        mapWidthsPerTank: 4,       // a full tank drives this many widths of the current level's map
        lowFraction: 0.2,          // gauge flashes and beeps below this
    },

    boost: {
        speed: 1.6,                // speed multiplier while boost is held
        fuel: 3,                   // fuel burned per distance, relative to normal driving
    },

    demo: {
        maxAmmo: 6,                // demolition shells that can be held
        speed: 6,                  // px/frame, slower than a normal shell
        cooldown: 30,              // frames between demolition shots
        radius: 50,                // px; walls inside are removed
        damage: 150,               // to every enemy inside
    },

    lives: {
        start: 3,                  // tanks per game, including the one in play
        maxSpare: 4,               // spare tanks that can be held
        bonusEvery: 10000,         // points per bonus tank
        respawnInvincibility: 150, // frames of invincibility for a replacement tank
    },

    music: {
        volumeSteps: [0.03, 0.06, 0.12, 0.22, 0.35],  // music level against the effects for settings 1-5
        menuSeed: 229,              // the tune used as the game's theme (title and game-over screens)
        menuTempo: 108,            // BPM of the theme
        menuIntensity: 1,          // its arrangement: melody, kick and snare, eighth-note arpeggio
        menuDelay: 200,            // frames before the theme comes in after the game-over jingle
        levels: {                  // balance between the channels
            lead: 0.2, echo: 0.3, arp: 0.07, bass: 0.3, kick: 0.5, snare: 0.26, hat: 0.09,
        },
        tempo: { base: 116, perLevel: 4 },   // BPM at level 1, and the rise per level up to level 7
        calmBars: 4,               // bars of quiet before the music drops its extra layers
        alertRange: 600,           // px: alerted enemies this close count as contact
        firefightCount: 3,         // that many of them at once is a firefight
        baseRange: 8,              // tiles: this close to a live base also counts as a firefight
        dangerFraction: 0.2,       // health below this share sets the danger layer (low fuel does too)
    },

    // The line typed on the sector-complete screen (js/lore.js holds the wording)
    lore: {
        chance: 0.4,               // share of clears that show a lore line while unseen ones remain
        repeatChance: 0.2,         // share once every line available at that depth has been seen
        typeFrames: 2,             // frames per character
        hold: 210,                 // frames the finished line stays up before the next sector can start
        metresPerPixel: 0.25,      // scale for the "distance covered" figure (a tank is about 7 m long)
    },

    // Title-screen demo: a computer-driven tank plays the last level behind the menu
    attract: {
        dim: 0.74,                 // darkness of the veil over it (0-1); text must stay readable
        sightRange: 420,           // px: the demo tank engages enemies it can see this close
        reactorRange: 520,         // px: otherwise it shells the nearest reactor from this far
        padDwell: 420,             // frames it works one side of a base before moving round
        turnRate: 0.14,            // radians per frame its turret can swing
        regen: 0.04,               // health it gets back per frame, so the show lasts
        restartDead: 150,          // frames after it is destroyed before a new demo begins
        restartWon: 300,           // frames after it clears the level
    },

    touch: {
        stickRadius: 56,           // px (CSS) of thumb travel for full speed
        moveDeadzone: 8,           // px of slack before the tank moves
        aimDeadzone: 10,           // px of drag before the turret follows and fires
        boostAt: 1.5,              // push past this many radii to boost
        followAt: 1.9,             // beyond this many radii the stick's center trails the thumb
        aimAssist: 0.14,           // radians (about 8 deg): shots bend this far toward a visible enemy; 0 = off
        aimAssistRange: 420,       // px
    },

    gamepad: {
        moveDeadzone: 0.2,         // left-stick tilt ignored below this (0-1)
        aimDeadzone: 0.3,          // right-stick tilt needed to take over aiming
        triggerThreshold: 0.3,     // right-trigger travel that counts as firing
    },

    enemy: {
        alertTimeout: 300,         // frames an enemy stays alert after losing sight of the player
        spawnFade: 20,             // frames to fade in after materializing
        patrolRadius: 10,          // tiles around its spawn point an idle enemy wanders
        crossfireFactor: 0.5,      // enemy bullets do this share of their damage to other enemies
    },

    bullet: {
        speed: 8,
        damage: 25,
        maxStep: 8,                // px per collision sub-step (under half a tile)
        maxPlayer: 30,             // separate pools so enemy fire can never block the player
        maxEnemy: 40,
    },

    ram: {
        damage: 25,
        enemyCooldown: 60,
    },

    base: {
        reactorHp: 3,              // player hits needed per reactor
        telegraph: 60,             // frames of warning before an enemy materializes
        blastRadius: 160,          // px; enemies inside die when the base collapses
        collapseFrames: 30,        // duration of the ring-by-ring collapse
        apron: 2,                  // tiles of cleared ground around every base
        minSpawnDistance: 25,      // tiles from player spawn (either axis)
        minSeparation: 12,         // tiles between bases
    },

    pickups: {
        dropChance: 0.15,          // chance a killed enemy drops one (a type can override with dropChance)
        dropLifetime: 900,         // frames a dropped pickup lasts (maze pickups stay until collected)
        blinkAt: 240,              // frames left when a dropped pickup starts blinking
        alcoveChance: 0.5,         // share of maze alcoves that hold a pickup at level start
        collectRadius: 24,         // px from the tank center
        spreadAngle: 0.2,          // radians between spread-shot bullets
        rapidFactor: 0.5,          // fire cooldown multiplier while rapid fire lasts
    },

    streak: {
        window: 240,               // frames to make the next kill before the streak lapses
        max: 5,                    // highest score multiplier
    },

    levelBonus: {
        parBase: 30,               // par time in seconds: parBase + parPerBase per base, scaled by map width
        parPerBase: 45,
        perSecondUnderPar: 5,
        perFuelPercent: 5,         // paid on the fuel left when the last base fell
        noTankLost: 500,
    },

    // Past the sector where the level curve tops out, the pressure keeps creeping up
    deep: {
        startSector: 11,           // the last sector on the normal curve; each one after it counts as a step
        spawnStep: 10,             // frames off the spawn interval per step...
        spawnFloor: 150,           // ...down to this
        fireStep: 0.03,            // share off every enemy's fire cooldown per step...
        fireMax: 0.30,             // ...up to this much
        scoreStep: 0.05,           // kill, reactor and base scores rise this share per step (no cap)
    },

    score: {
        enemy: 100,
        reactor: 250,              // a reactor that is not the base's last one
        base: 500,
    },

    timing: {
        levelSettling: 120,
        levelComplete: 390,        // tally screen; Enter skips it
        gameOverDelay: 90,
        levelIntro: 200,           // how long the level-start banner stays up
        respawn: 90,               // pause between losing a tank and the next one arriving
        banner: 120,
    },
};

/**
 * Enemy roster. Speeds are px/frame, ranges px, timers frames.
 *
 *   behavior   chase  - patrol; when alerted follow the flow field, hold at `standoff` with a clear shot
 *              orbit  - like chase, but circles the player at `orbitRadius` instead of holding
 *              sapper - no gun; runs at the player and detonates within `blastRange`
 *              static - never moves
 *   lead       aim where the player will be, not where they are
 *   aimError   max random error per shot (radians)
 *   burst      shots per trigger pull, fanned by `burstSpread` and spaced by `burstGap`
 *   charge     frames of visible aim line before a shot
 *   muzzle     px from center where bullets appear (turrets sit on concrete and must clear it)
 */
export const ENEMY_TYPES = {
    grunt: {
        behavior: 'chase', hp: 100, size: 32, score: 100,
        patrolSpeed: 1.2, alertSpeed: 1.8, standoff: 150,
        detectRange: 350, fireRange: 350, fireCooldown: 150, bulletSpeed: 8, bulletDamage: 25,
        body: '#cc3333', dark: '#991111',
    },
    scout: {
        behavior: 'orbit', hp: 50, size: 26, score: 150,
        patrolSpeed: 1.8, alertSpeed: 2.9, orbitRadius: 180,
        detectRange: 400, fireRange: 320, fireCooldown: 70, bulletSpeed: 7, bulletDamage: 10, aimError: 0.3,
        body: '#e6c229', dark: '#9a7d0a',
    },
    turret: {
        behavior: 'static', hp: 150, size: 40, score: 200, immobile: true,
        patrolSpeed: 0, alertSpeed: 0,
        detectRange: 450, fireRange: 450, fireCooldown: 150, bulletSpeed: 11, bulletDamage: 25,
        lead: true, charge: 36, muzzle: 30,
        body: '#7a7f8a', dark: '#c0392b',
    },
    heavy: {
        behavior: 'chase', hp: 200, size: 38, score: 300,
        patrolSpeed: 0.7, alertSpeed: 1.0, standoff: 220,
        detectRange: 380, fireRange: 380, fireCooldown: 210, bulletSpeed: 7, bulletDamage: 35,
        lead: true, burst: 3, burstGap: 9, burstSpread: 0.12, breaksBrick: true, dropChance: 0.35,
        body: '#8e44ad', dark: '#5b2c6f',
    },
    sapper: {
        behavior: 'sapper', hp: 50, size: 28, score: 150,
        patrolSpeed: 1.4, alertSpeed: 3.1,
        detectRange: 320, fireCooldown: 0,
        blastRange: 40, blastRadius: 70, blastDamage: 50,
        body: '#e67e22', dark: '#a04000',
    },
    hunter: {
        behavior: 'chase', hp: 100, size: 32, score: 250, alwaysAlert: true, dropChance: 0.35,
        patrolSpeed: 1.6, alertSpeed: 2.1, standoff: 120,
        detectRange: 350, fireRange: 330, fireCooldown: 130, bulletSpeed: 8.5, bulletDamage: 25,
        body: '#16a085', dark: '#0b5345',
    },
};

/**
 * Pickups. `amount` is added at once (percent of fuel, points of health, shells);
 * `duration` is frames a timed effect lasts. `weight` is the relative odds of
 * each type appearing.
 */
export const PICKUP_TYPES = {
    fuel:   { label: 'FUEL',        color: '#d9a514', weight: 3,   amount: 40 },
    repair: { label: 'REPAIR',      color: '#2ecc71', weight: 3,   amount: 40 },
    rapid:  { label: 'RAPID FIRE',  color: '#ff5a5a', weight: 2,   duration: 840 },
    spread: { label: 'SPREAD SHOT', color: '#5ab4ff', weight: 2,   duration: 840 },
    shield: { label: 'SHIELD',      color: '#b388ff', weight: 1.5, duration: 480 },
    demo:   { label: 'DEMOLITION SHELLS', color: '#ff9f1a', weight: 0.6, amount: 3 },
};

/**
 * Relative odds of each mobile type when a base spawns an enemy.
 */
function spawnWeights(level) {
    const w = { grunt: 5 };
    if (level >= 2) w.scout = 2;
    if (level >= 4) w.heavy = level >= 6 ? 2 : 1;
    if (level >= 5) w.sapper = 2;
    if (level >= 7) w.hunter = 2;
    return w;
}

/**
 * Level curve. Bases keep producing enemies while their reactor lives, so the
 * pressure comes from spawn rate and alive caps rather than a fixed enemy count.
 *
 * @returns {{ templates: string[], initialPerBase: number, maxAlivePerBase: number,
 *             spawnInterval: number, hardBricks: boolean }}
 */
export function getLevelConfig(level, density = 3) {
    // The world grows with the level: 120x90 tiles (9 screens) at level 1,
    // 20 columns wider each level, up to 240x180 (36 screens) from level 7.
    const cols = Math.min(120 + (level - 1) * 20, 240);
    const rows = cols * 3 / 4;

    const baseCount = Math.min(1 + Math.floor((level - 1) / 2), 6);

    // Layouts unlock as levels rise; the newest one is always present.
    const pool = ['bunker'];
    if (level >= 3) pool.push('fortress');
    if (level >= 5) pool.push('twin');
    if (level >= 7) pool.push('citadel');

    const templates = [];
    for (let i = 0; i < baseCount; i++) {
        templates.push(i === 0 ? pool[pool.length - 1] : pool[Math.floor(Math.random() * pool.length)]);
    }

    // Sectors beyond the end of the curve: bases build faster, enemies fire faster, everything scores more
    const d = CONFIG.deep;
    const steps = Math.max(0, level - d.startSector);

    return {
        fireFactor: 1 - Math.min(d.fireMax, steps * d.fireStep),   // multiplies every enemy's fire cooldown
        scoreFactor: 1 + steps * d.scoreStep,
        cols,
        rows,
        density,
        baseSeparation: Math.round(CONFIG.base.minSeparation * cols / 120),   // bases spread out on bigger maps
        templates,
        initialPerBase: Math.min(1 + Math.floor(level / 3), 3),
        maxAlivePerBase: Math.min(2 + Math.floor(level / 2), 5),
        // 9.3s at level 1 down to 4s at level 9, then from level 12 on down again to 2.5s
        spawnInterval: Math.max(d.spawnFloor, Math.max(240, 600 - level * 40) - steps * d.spawnStep),
        hardBricks: level >= 3,                            // reinforced bricks take two hits
        spawnWeights: spawnWeights(level),
    };
}

/**
 * Debug switches from the URL, e.g. index.html?level=7&god=1
 */
const params = new URLSearchParams(window.location.search);
export const DEBUG = {
    level: Math.max(1, parseInt(params.get('level'), 10) || 1),
    levelSet: params.has('level'),          // true when the URL forces the starting level
    god: params.get('god') === '1',
    overlay: params.get('debug') === '1',   // draw the flow field and enemy sight lines
    seed: params.has('seed') ? (parseInt(params.get('seed'), 10) || 0) : null,   // pin the music to one tune
};
