/**
 * YOLO - Top-down action tank game inspired by Jim Lane's 1982 Apple II classic, Bolo (Synergistic Software)
 * Main game loop, state machine, and level setup
 *
 * Copyright (c) 2026 PlinkBit. All rights reserved. See LICENSE.
 */

import input from './input.js';
import Camera from './camera.js';
import sound from './sound.js';
import { currentMaze, currentAlcoves, resetLevelMaze, renderMaze, isPassable, TILE, TILE_SIZE, COLS, ROWS } from './maze.js';
import Tank from './tank.js';
import EnemyTank from './enemy.js';
import { BulletManager, ExplosionManager } from './bullet.js';
import { placeBases, damageTile } from './base.js';
import { Navigator, hasLineOfSight } from './pathfinding.js';
import { resolveTankCollisions, clampTankToWalls } from './collision.js';
import { drawHud } from './hud.js';
import { addHighScore, qualifiesForHighScore, MAX_NAME_LENGTH } from './highscore.js';
import { CONFIG, DEBUG, PICKUP_TYPES, getLevelConfig } from './config.js';
import { PickupManager } from './pickup.js';
import { EffectsManager } from './effects.js';
import { LORE, buildReport, chooseLore, longestReport } from './lore.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const VIEW = CONFIG.view;
const camera = new Camera(VIEW.width, VIEW.height);
const bulletManager = new BulletManager();
const explosionManager = new ExplosionManager();
const nav = new Navigator();
const pickupManager = new PickupManager();
const effects = new EffectsManager();

// 'startScreen' | 'playing' | 'paused' | 'levelSettling' | 'levelComplete'
// | 'respawning' | 'gameOverDelay' | 'enterInitials' | 'gameover'
let gameState = 'startScreen';
let stateTimer = 0;      // countdown for the timed states (frames)
let uiTime = 0;          // running frame clock for blinking UI
let lastTime = 0;

// Title-screen choices, remembered between visits
const SETTINGS_KEY = 'yolo_settings';
const MAX_START_LEVEL = 9;
const MAX_DENSITY = 5;
const MAX_VOLUME = CONFIG.music.volumeSteps.length;
let savedLevel = 1;      // the start level last chosen on the title screen
const settings = loadSettings();
if (settings.musicVolume > 0) sound.setMusicVolume(settings.musicVolume);
let menuRow = 0;         // 0 = start level, 1 = maze density, 2 = lives, 3 = music volume
let titleFrames = 0;     // frames since the title screen came up, for its typed-out status line
let runYolo = false;     // this run is in true YOLO mode (one tank, no spares, no bonus tanks)
let titlePage = 'main';  // 'main' or 'help' (the How to Play page)
let gameOverFrames = 0;  // frames spent on the game-over screen, for its score count-up
const NO_RANK = { main: -1, yolo: -1 };
let runRank = NO_RANK;   // where this run landed in each high-score table (0 = best, -1 = not on it)
let pauseRow = 0;        // 0 = resume, 1 = quit to main menu
let levelIntroTimer = 0; // frames left on the level-start banner

function loadSettings() {
    const clamp = (v, max, fallback) => (Number.isInteger(v) && v >= 1 && v <= max ? v : fallback);
    let saved = {};
    try {
        saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch (e) { /* unreadable or blocked storage: use the defaults */ }
    savedLevel = clamp(saved.level, MAX_START_LEVEL, 1);

    // Music volume 0-5, where 0 is off. M flips between 0 and the last audible setting.
    const lastVolume = clamp(saved.lastVolume, MAX_VOLUME, clamp(saved.musicVolume, MAX_VOLUME, 3));
    let musicVolume = saved.musicVolume === 0 ? 0 : clamp(saved.musicVolume, MAX_VOLUME, 3);
    if (saved.music === false) musicVolume = 0;   // saved before 0 existed: music was switched off
    return {
        level: DEBUG.levelSet ? DEBUG.level : savedLevel,
        density: clamp(saved.density, MAX_DENSITY, 3),
        yolo: saved.yolo === true,          // true YOLO mode: one tank, no spares
        lastLevel: Number.isInteger(saved.lastLevel) && saved.lastLevel >= 1 ? saved.lastLevel : savedLevel,   // the title demo plays it
        musicVolume,
        lastVolume,
        music: musicVolume > 0,             // kept in step with musicVolume
        // Lore lines this player has been shown (ids from lore.js), so new ones come first
        loreSeen: Array.isArray(saved.loreSeen) ? saved.loreSeen.filter(id => typeof id === 'string') : [],
    };
}

function saveSettings() {
    // A level forced by the URL (?level=N) is for testing and is not remembered
    if (!DEBUG.levelSet) savedLevel = settings.level;
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({
            level: savedLevel, density: settings.density, yolo: settings.yolo, lastLevel: settings.lastLevel,
            musicVolume: settings.musicVolume, lastVolume: settings.lastVolume, loreSeen: settings.loreSeen,
        }));
    } catch (e) { /* not fatal */ }
}

// Run totals
let currentLevel = settings.level;
let score = 0;
let kills = 0;
let basesDestroyed = 0;
let spareTanks = CONFIG.lives.start - 1;      // tanks in reserve, not counting the one in play
let nextBonusAt = CONFIG.lives.bonusEvery;    // score that earns the next bonus tank
let deathCause = 'hit';                       // 'hit' or 'fuel': why the last tank was lost
let lowFuelBeep = 0;                          // frames until the next low-fuel warning

// Kill streak: quick successive kills multiply enemy scores
let streak = 0;          // kills in the current chain
let streakTimer = 0;     // frames left to extend it

// Level-clear bonus inputs and the resulting tally (shown on the level-complete screen)
let levelFrames = 0;     // frames spent playing this level
let tankLostThisLevel = false;
let tally = null;
// What happened in this sector, for the report typed on the sector-complete screen
let sector = newSectorStats();
let report = '';             // that line: a status report, or a lore line in its place
let reportFrames = 0;        // frames it has been typing
let scoreFactor = 1;         // what kills, reactors and bases pay in this sector, against their listed values
let loreLastClear = false;   // the previous clear showed a lore line: never two in a row
const reportMemory = {};     // the last report's opening and closing, so the next one differs
let forcedLore = null;       // ?debug=1 only: lore line to show on the next clear
let fuelAtLastBase = 0;  // fuel in the tank when the most recent base fell, before its refill
let damageFlash = 0;     // frames left on the red screen-edge flash after the player is hit
let boosting = false;    // true on frames the player is driving with boost held
let demoTimer = 0;       // frames until the next demolition shell can be fired
let debugAim = null;     // ?debug=1 only: turret angle forced through window.yolo.aim()

// Level contents
let playerTank = null;
let enemyTanks = [];
let bases = [];
let scorePopups = [];

let fireTimer = 0;       // frames until the player can fire again
let bannerTimer = 0;     // frames left on the banner at the top of the screen
let bannerText = '';
let initialsBuffer = '';
let padCharIndex = 0;    // candidate character when entering initials with a gamepad
const PAD_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Advance the game by one frame.
 * @param {number} scale - Delta-time scale (1.0 = one 60fps frame)
 */
function update(scale) {
    uiTime += scale;

    // Read and clear every one-shot input once per frame, so a press that the
    // current state ignores cannot fire later in a different state
    input.update();
    let enterPressed = input.enterPressed;
    let pauseToggled = input.pauseToggled;
    let musicToggled = input.musicToggled;
    let restartPressed = input.restartPressed;
    let backPressed = false;   // a tap on the How to Play page
    const tap = input.tap;
    input.tap = null;
    input.enterPressed = input.pauseToggled = input.musicToggled = input.restartPressed = false;

    // Touch sticks exist only while driving; the shell button mirrors the ammo count
    input.touch.sync(gameState === 'playing', playerTank.demoAmmo);

    // A tap or click on a menu item drawn last frame acts like the matching key
    if (tap) {
        const hit = uiHits.find(h => tap.x >= h.x && tap.x <= h.x + h.w && tap.y >= h.y && tap.y <= h.y + h.h);
        const step = (value, by, max) => Math.max(1, Math.min(max, value + by));
        switch (hit && hit.action) {
            case 'level-': menuRow = 0; settings.level = step(settings.level, -1, MAX_START_LEVEL); break;
            case 'level+': menuRow = 0; settings.level = step(settings.level, 1, MAX_START_LEVEL); break;
            case 'density-': menuRow = 1; settings.density = step(settings.density, -1, MAX_DENSITY); break;
            case 'density+': menuRow = 1; settings.density = step(settings.density, 1, MAX_DENSITY); break;
            case 'lives-': menuRow = 2; settings.yolo = false; break;
            case 'lives+': menuRow = 2; settings.yolo = true; break;
            case 'volume-': menuRow = 3; changeMusicVolume(-1); break;
            case 'volume+': menuRow = 3; changeMusicVolume(1); break;
            case 'start':
            case 'continue': enterPressed = true; break;
            case 'resume': pauseRow = 0; enterPressed = true; break;
            case 'quit': pauseRow = 1; enterPressed = true; break;
            case 'restart': restartPressed = true; break;
            case 'title': pauseToggled = true; break;
            case 'music': musicToggled = true; break;
            case 'help': titlePage = 'help'; break;
            case 'scores': titlePage = 'scores'; break;
            case 'back': backPressed = true; break;
            case undefined:
            case null:
            case false: break;
            default: input._lastKey = hit.action; // initials entry: PadUp, PadDown, PadAccept, Backspace, Enter
        }
    }

    // The theme plays on the title and game-over screens, once the browser allows sound
    // (after the first key, click or tap) and any game-over jingle has had its moment
    if (MENU_MUSIC_STATES.has(gameState) && !enterPressed && !restartPressed) {
        if (menuMusicDelay > 0) menuMusicDelay -= scale;
        else if (settings.music && (audioUnlocked || input.padStatus.activeId)) sound.playMenuMusic();
    }

    // M switches the music preference in any state except while typing initials
    if (musicToggled && gameState !== 'enterInitials') {
        setMusicVolume(settings.musicVolume > 0 ? 0 : settings.lastVolume);
    }

    if (gameState === 'startScreen') {
        titleFrames += scale;
        attract(scale);
        if (titlePage !== 'main') {
            // Any of the usual "back" inputs closes the How to Play or High Scores page
            const key = input.getLastKey();
            if (enterPressed || pauseToggled || backPressed || (key && ['h', 't', 'backspace', 'padx'].includes(key.toLowerCase()))) {
                titlePage = 'main';
            }
            return;
        }
        updateStartMenu();
        if (titlePage !== 'main') return;
        if (enterPressed) {
            saveSettings();
            resetGame(); // builds the first level with the chosen settings
        }
        return;
    }

    if (gameState === 'paused') {
        // Pause menu: up/down picks, Enter (A) selects, Escape/P resumes
        const key = input.getLastKey();
        const k = key && key.length === 1 ? key.toLowerCase() : key;
        if (k === 'ArrowUp' || k === 'w' || k === 'PadUp') pauseRow = 0;
        else if (k === 'ArrowDown' || k === 's' || k === 'PadDown') pauseRow = 1;
        else if (k === 'ArrowLeft' || k === 'a' || k === 'PadLeft') changeMusicVolume(-1);
        else if (k === 'ArrowRight' || k === 'd' || k === 'PadRight') changeMusicVolume(1);

        if (enterPressed && pauseRow === 1) {
            // Abandon the run and return to the title screen
            enterTitle();
        } else if (enterPressed || pauseToggled) {
            gameState = 'playing';
            startMusic();
        }
        return;
    }

    if (pauseToggled && gameState === 'playing') {
        gameState = 'paused';
        pauseRow = 0;
        input.getLastKey(); // discard whatever key was last pressed during play
        sound.stopMusic();
        return;
    }

    // Menu-like states: only the lingering effects keep animating
    if (gameState === 'enterInitials') {
        updateEffects(scale);
        updateInitialsEntry();
        return;
    }
    if (gameState === 'gameover') {
        updateEffects(scale);
        gameOverFrames += scale;
        if (restartPressed) {
            resetGame();
        } else if (pauseToggled) {
            // Back to the title screen to change level or density
            enterTitle();
        }
        return;
    }

    simulate(scale);
    sound.setMusicIntensity(musicIntensity());

    // Bonus tank at every score milestone
    while (score >= nextBonusAt) {
        nextBonusAt += CONFIG.lives.bonusEvery;
        if (!runYolo && spareTanks < CONFIG.lives.maxSpare) {
            spareTanks++;
            sector.bonusHull = true;
            showBanner('BONUS TANK!');
            sound.playBonusTank();
        }
    }

    switch (gameState) {
        case 'playing':
            if (!playerTank.alive && playerTank.deathTimer <= 0) {
                tankLostThisLevel = true;
                sector.hullsLost++;
                playerTank.clearEffects();
                streak = 0;
                streakTimer = 0;
                if (spareTanks > 0) {
                    spareTanks--;
                    gameState = 'respawning';
                    stateTimer = CONFIG.timing.respawn;
                } else {
                    gameState = 'gameOverDelay';
                    stateTimer = CONFIG.timing.gameOverDelay;
                }
            } else if (playerTank.alive && bases.every(b => !b.alive)) {
                beginLevelSettling();
            }
            break;

        case 'respawning':
            stateTimer -= scale;
            if (stateTimer <= 0) {
                // A replacement tank arrives at the start point; the level keeps its progress
                bulletManager.bullets = bulletManager.bullets.filter(b => b.owner === 'player');
                for (const enemy of enemyTanks) enemy.alertTimer = 0; // back to patrol until they spot it
                placePlayerAtStart(CONFIG.lives.respawnInvincibility);
                gameState = 'playing';
            }
            break;

        case 'gameOverDelay':
            stateTimer -= scale;
            if (stateTimer <= 0) {
                sound.stopMusic();
                const highScore = !DEBUG.god && qualifiesForHighScore(score, runYolo);
                if (settings.music) sound.playJingle(highScore ? 'highscore' : 'gameover');
                menuMusicDelay = CONFIG.music.menuDelay;
                if (highScore) {
                    gameState = 'enterInitials';
                    initialsBuffer = '';
                    padCharIndex = 0;
                    input.getLastKey(); // discard whatever key was last pressed during play
                } else {
                    gameState = 'gameover';
                    gameOverFrames = 0;
                }
            }
            break;

        case 'levelSettling':
            stateTimer -= scale;
            if (stateTimer <= 0) {
                gameState = 'levelComplete';
                awardLevelBonus();
                fileSectorReport();
                // Long enough for the report to type out and be read
                stateTimer = Math.max(CONFIG.timing.levelComplete, report.length * CONFIG.lore.typeFrames + CONFIG.lore.hold);
                if (settings.music) sound.playJingle('victory');
            }
            break;

        case 'levelComplete':
            stateTimer -= scale;
            reportFrames += scale;
            if (stateTimer <= 0 || enterPressed) {
                currentLevel++;
                resetLevel(currentLevel);
                gameState = 'playing';
                startMusic();
            }
            break;
    }
}

/**
 * World simulation shared by 'playing' and the timed wind-down states.
 * Enemy AI, base spawning, and ramming only run while actually playing.
 */
function simulate(scale) {
    const demo = gameState === 'startScreen';   // the title-screen demo: the pilot drives, nothing is at stake
    const playing = gameState === 'playing' || demo;
    const grid = currentMaze;
    const controls = demo ? pilot : input;

    // --- Player ---
    boosting = playing && playerTank.alive && controls.boostHeld && playerTank.fuel > 0;
    playerTank.speed = CONFIG.player.speed * (boosting ? CONFIG.boost.speed : 1);
    playerTank.update(controls, grid, scale);
    if (playerTank.vx === 0 && playerTank.vy === 0) boosting = false; // nothing to boost while parked
    playerTank.updateInvincibility(scale);
    playerTank.turretAngle = controls.getAimAngle(
        playerTank.x - camera.x, playerTank.y - camera.y, playerTank.turretAngle);
    if (!demo) {
        applyAimAssist(grid);
        if (debugAim !== null) playerTank.turretAngle = debugAim;
    }

    if (fireTimer > 0) fireTimer -= scale;
    const shell = controls.fireHeld && fireTimer <= 0 ? bulletManager.fire(playerTank) : null;
    if (shell) {
        sector.rounds += playerTank.effects.spread > 0 ? 3 : 1;
        effects.addMuzzleFlash(shell.x, shell.y, playerTank.turretAngle);
        playerTank.recoil = 5;
        if (playerTank.effects.spread > 0) {
            for (const side of [-1, 1]) {
                bulletManager.fire(playerTank, 'player',
                    { angle: playerTank.turretAngle + side * CONFIG.pickups.spreadAngle, silent: true });
            }
        }
        fireTimer = CONFIG.player.fireCooldown * (playerTank.effects.rapid > 0 ? CONFIG.pickups.rapidFactor : 1);
    }

    // Demolition shell: its own trigger, its own (slower) cadence
    if (demoTimer > 0) demoTimer -= scale;
    if (controls.demoHeld && demoTimer <= 0 && playerTank.demoAmmo > 0 && fireDemolitionShell()) {
        demoTimer = CONFIG.demo.cooldown;
    }
    if (!playerTank.alive && playerTank.deathTimer > 0) playerTank.deathTimer -= scale;

    // --- Pickups and timed effects ---
    if (playing) {
        levelFrames += scale;
        if (playerTank.alive) sector.px += Math.hypot(playerTank.vx, playerTank.vy) * scale;
        if (streakTimer > 0) {
            streakTimer -= scale;
            if (streakTimer <= 0) streak = 0;
        }
        if (playerTank.tickEffects(scale).length > 0) sound.playPowerDown();
        for (const type of pickupManager.update(scale, playerTank)) collectPickup(type);
    }

    // --- Fuel: burned by distance driven; running dry costs the tank ---
    if (playing && playerTank.alive && !DEBUG.god && !demo) {
        // Boost covers ground faster but burns several times the fuel for it
        const driven = Math.hypot(playerTank.vx, playerTank.vy) * scale * (boosting ? CONFIG.boost.fuel : 1);
        const range = CONFIG.fuel.mapWidthsPerTank * COLS * TILE_SIZE; // px on a full tank
        playerTank.fuel = Math.max(0, playerTank.fuel - driven * playerTank.maxFuel / range);

        if (playerTank.fuel <= 0) {
            deathCause = 'fuel';
            playerTank.destroy();
            sound.playExplosion();
            explosionManager.addTankExplosion(playerTank.x, playerTank.y);
        } else if (playerTank.fuel <= playerTank.maxFuel * CONFIG.fuel.lowFraction) {
            lowFuelBeep -= scale;
            if (lowFuelBeep <= 0) {
                sound.playLowFuel();
                lowFuelBeep = 75;
            }
        }
    }

    // --- Bullets ---
    const { tileHits, playerHits, enemyHits, blasts } = bulletManager.update(grid, playerTank, enemyTanks, scale);
    for (const blast of blasts) detonateShell(blast.x, blast.y);

    for (const hit of playerHits) {
        explosionManager.addImpactExplosion(hit.bullet.x, hit.bullet.y);
        if (playerTank.takeDamage(hit.bullet.damage)) {
            playerHurt();
            sound.playPlayerHit();
            camera.shake(2, 10);
        } else if (playerTank.effects.shield > 0) {
            sound.playShieldHit();
        }
    }

    for (const hit of enemyHits) {
        const enemy = hit.target;
        if (!enemy.alive) continue; // already killed by another bullet this frame
        // Crossfire (an enemy shell hitting another enemy) does reduced damage and earns nothing
        enemy.takeDamage(hit.bullet.damage * (hit.crossfire ? CONFIG.enemy.crossfireFactor : 1));
        const near = Math.hypot(enemy.x - playerTank.x, enemy.y - playerTank.y) < 600;
        if (near) sound.playEnemyHit();
        explosionManager.addImpactExplosion(hit.bullet.x, hit.bullet.y);
        if (!enemy.alive) onEnemyKilled(enemy, !hit.crossfire, near);
    }

    for (const hit of tileHits) {
        handleTileHit(hit.gridX, hit.gridY, hit.bullet.owner === 'player');
    }

    // --- Bases: collapse animation always, spawning only while playing ---
    const livingTanks = enemyTanks.filter(e => e.alive);
    if (playerTank.alive) livingTanks.push(playerTank);

    updateBases(scale, playing && playerTank.alive, livingTanks, true);

    // --- Enemies ---
    if (playing) {
        nav.update(grid, playerTank.x, playerTank.y, scale);

        for (const enemy of enemyTanks) {
            const shots = enemy.update({ grid, player: playerTank, nav, scale });
            for (const shot of shots) {
                const round = bulletManager.fire(enemy, 'enemy', shot);
                if (round) {
                    effects.addMuzzleFlash(round.x, round.y, shot.angle, true);
                    enemy.recoil = 4;
                }
            }
            if (enemy.startedCharge) {
                enemy.startedCharge = false;
                if (Math.hypot(enemy.x - playerTank.x, enemy.y - playerTank.y) < 500) sound.playTurretCharge();
            }
            if (enemy.wantsDetonate && enemy.alive) detonateSapper(enemy);
        }
    }

    for (const enemy of enemyTanks) {
        // Self-destruct countdown, set when the last base falls
        if (enemy.alive && enemy.doomTimer !== null) {
            enemy.doomTimer -= scale;
            if (enemy.doomTimer <= 0) {
                enemy.takeDamage(Infinity);
                onEnemyKilled(enemy, false);
            }
        }
        if (!enemy.alive && enemy.deathTimer > 0) enemy.deathTimer -= scale;
        if (enemy.collisionCooldown > 0) enemy.collisionCooldown -= scale;
    }
    enemyTanks = enemyTanks.filter(e => e.alive || e.deathTimer > 0);

    // --- Tank contact + wall safety net ---
    if (playing) {
        resolveTankCollisions(grid, playerTank, enemyTanks, {
            onPlayerRammed() {
                playerHurt();
                sound.playPlayerHit();
                camera.shake(2, 10);
            },
            onEnemyRammed(enemy) {
                sound.playEnemyHit();
                explosionManager.addImpactExplosion((playerTank.x + enemy.x) / 2, (playerTank.y + enemy.y) / 2);
                if (!enemy.alive) onEnemyKilled(enemy, true);
            },
        });

        for (const enemy of enemyTanks) {
            if (enemy.alive && !enemy.type.immobile) clampTankToWalls(grid, enemy);
        }
        if (playerTank.alive) clampTankToWalls(grid, playerTank);
    }

    // --- Cosmetic: barrel recoil settles, moving tanks leave tread marks ---
    const settle = Math.pow(0.72, scale);
    playerTank.recoil *= settle;
    playerTank.boosting = boosting;
    if (playerTank.alive) effects.trackTank(playerTank, playerTank.angle, playerTank.width / 2, boosting);
    for (const enemy of enemyTanks) {
        enemy.recoil = (enemy.recoil || 0) * settle;
        if (enemy.alive && !enemy.type.immobile) effects.trackTank(enemy, enemy.bodyAngle, enemy.type.size / 2);
    }

    updateEffects(scale);

    camera.setTarget(playerTank.x, playerTank.y);
}

/**
 * Bases: collapse animation, and (when `canSpawn`) building new enemies.
 * @param {Array} livingTanks - tanks a new enemy must not materialize on top of
 * @param {boolean} audible - play the spawn warning when it happens near the player
 */
function updateBases(scale, canSpawn, livingTanks, audible) {
    for (const base of bases) {
        const events = base.update(scale, {
            grid: currentMaze,
            canSpawn,
            tanks: livingTanks,
            aliveCount: enemyTanks.filter(e => e.alive && e.homeBase === base && !e.type.immobile).length,
        });

        for (const ev of events) {
            if (ev.type === 'debris') {
                explosionManager.addDebris(ev.x, ev.y);
                effects.addBrickFragments(ev.x, ev.y);
                gridChanged(); // a wall tile just opened up
            } else if (ev.type === 'telegraph') {
                // Only audible when the player is close enough for it to matter
                if (audible && Math.hypot(ev.x - playerTank.x, ev.y - playerTank.y) < 500) sound.playSpawnWarning();
            } else if (ev.type === 'spawn') {
                const enemy = new EnemyTank(ev.x, ev.y, ev.base, ev.enemyType);
                enemy.spawnFade = CONFIG.enemy.spawnFade;
                enemyTanks.push(enemy);
                livingTanks.push(enemy); // keeps other bases from using an overlapping pad this frame
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Title-screen demo: a computer-driven tank plays the last level the player was
// on, behind the menu. It uses the real simulation, with `pilot` standing in
// for the input handler. Effects are muted and nothing it does is kept.
// ---------------------------------------------------------------------------

/** The demo tank's driver. Offers what simulate() and Tank.update() read from `input`. */
const pilot = {
    move: { x: 0, y: 0 },
    aim: -Math.PI / 2,
    fireHeld: false,
    boostHeld: false,
    demoHeld: false,
    base: null,        // the base it is attacking
    pad: null,         // the spot beside that base it is heading for
    padTimer: 0,       // frames until it moves round to another side
    wp: null,          // next vertex on the way there
    stuck: 0,
    getDirection() { return { x: this.move.x, y: this.move.y }; },
    getAimAngle() { return this.aim; },
};
const pilotNav = new Navigator();   // flow field toward the pilot's goal (enemies use `nav`, toward the tank)
let demoRestart = 0;                // frames until a fresh demo begins (0 = not counting)

/** Decide this frame's driving, aiming and firing for the demo tank */
function drivePilot(scale) {
    const cfg = CONFIG.attract;
    const grid = currentMaze;
    const me = playerTank;
    pilot.move.x = pilot.move.y = 0;
    pilot.fireHeld = false;
    if (!me.alive) return;

    me.health = Math.min(me.maxHealth, me.health + cfg.regen * scale);

    // --- Where to go: one side of the nearest standing base, moving round every few seconds ---
    let base = null;
    let baseDist = Infinity;
    for (const b of bases) {
        const d = Math.hypot(b.cx - me.x, b.cy - me.y);
        if (b.alive && d < baseDist) { base = b; baseDist = d; }
    }
    if (base) {
        pilot.padTimer -= scale;
        if (pilot.base !== base || !pilot.pad || pilot.padTimer <= 0) {
            pilot.base = base;
            pilot.pad = base.pads[Math.floor(Math.random() * base.pads.length)];
            pilot.padTimer = cfg.padDwell;
            pilot.wp = null;
            pilotNav.timer = 0;   // rebuild the route now
        }
        pilotNav.update(grid, pilot.pad.x, pilot.pad.y, scale);

        if (Math.hypot(pilot.pad.x - me.x, pilot.pad.y - me.y) > 30) {
            if (pilot.wp && Math.hypot(pilot.wp.x - me.x, pilot.wp.y - me.y) < 1.5) {
                pilot.wp = pilotNav.next(pilot.wp.vx, pilot.wp.vy);
            }
            if (!pilot.wp) pilot.wp = pilotNav.nearestWalkable(me.x, me.y);
            if (pilot.wp && pilotNav.distanceAt(pilot.wp.vx, pilot.wp.vy) < 0) pilot.wp = null;   // no way through from here
            if (pilot.wp) {
                const dx = pilot.wp.x - me.x;
                const dy = pilot.wp.y - me.y;
                const reach = Math.max(Math.hypot(dx, dy), me.speed * scale, 0.001);   // slow into the vertex, never past it
                pilot.move.x = dx / reach;
                pilot.move.y = dy / reach;
            }
            // Wedged against something (usually another tank): try a different side
            pilot.stuck = Math.hypot(me.vx || 0, me.vy || 0) < 0.3 ? pilot.stuck + scale : 0;
            if (pilot.stuck > 45) {
                pilot.stuck = 0;
                pilot.padTimer = 0;
            }
        }
    }

    // --- What to shoot: the nearest enemy in sight, else the nearest reactor in range ---
    let target = null;
    let targetDist = cfg.sightRange;
    for (const enemy of enemyTanks) {
        if (!enemy.alive) continue;
        const d = Math.hypot(enemy.x - me.x, enemy.y - me.y);
        if (d < targetDist && hasLineOfSight(grid, enemy.x, enemy.y, me.x, me.y, enemy.type.muzzle || 0)) {
            target = enemy;
            targetDist = d;
        }
    }
    if (!target && base) {
        let best = cfg.reactorRange;
        for (const reactor of base.reactors) {
            const d = Math.hypot(reactor.px - me.x, reactor.py - me.y);
            if (reactor.alive && d < best) { target = { x: reactor.px, y: reactor.py }; best = d; }
        }
    }

    // The turret swings toward its target and fires once it is nearly on it
    const want = target ? Math.atan2(target.y - me.y, target.x - me.x)
        : (pilot.move.x || pilot.move.y) ? Math.atan2(pilot.move.y, pilot.move.x) : pilot.aim;
    let turn = want - pilot.aim;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));   // shortest way round
    const limit = cfg.turnRate * scale;
    pilot.aim += Math.max(-limit, Math.min(limit, turn));
    pilot.fireHeld = !!target && Math.abs(turn) < 0.12;
}

/** Build a fresh level for the demo and put the pilot in the tank */
function startDemo() {
    sound.effectsMuted = true;
    resetLevel(settings.lastLevel, true);
    playerTank.clearEffects();
    playerTank.demoAmmo = 0;
    levelIntroTimer = 0;
    pilot.base = pilot.pad = pilot.wp = null;
    pilot.aim = playerTank.turretAngle;
    demoRestart = 0;
}

/** One frame of the demo; starts another when the tank is lost or the level is cleared */
function attract(scale) {
    drivePilot(scale);
    simulate(scale);

    if (demoRestart > 0) {
        demoRestart -= scale;
        if (demoRestart <= 0) startDemo();
    } else if (!playerTank.alive && playerTank.deathTimer <= 0) {
        demoRestart = CONFIG.attract.restartDead;
    } else if (bases.every(b => !b.alive)) {
        demoRestart = CONFIG.attract.restartWon;
    }
}

/** Go to the title screen from a finished or abandoned run */
function enterTitle() {
    gameState = 'startScreen';
    titlePage = 'main';
    titleFrames = 0;
    input.getLastKey();
    startDemo();
}

/**
 * Explosions, popups, banner, and camera motion. Runs in every unpaused state.
 */
function updateEffects(scale) {
    explosionManager.update(scale);
    effects.update(scale);
    if (damageFlash > 0) damageFlash -= scale;

    for (const popup of scorePopups) popup.update(scale);
    scorePopups = scorePopups.filter(p => p.alive);

    if (bannerTimer > 0) bannerTimer -= scale;
    if (levelIntroTimer > 0 && gameState === 'playing') levelIntroTimer -= scale;

    camera.update(scale);
}

/**
 * Apply a player bullet to a destructible tile and play the matching feedback.
 */
function handleTileHit(gx, gy, byPlayer = true) {
    const result = damageTile(currentMaze, gx, gy, bases);
    const px = gx * TILE_SIZE + TILE_SIZE / 2;
    const py = gy * TILE_SIZE + TILE_SIZE / 2;

    // Any tile that opened up changes where tanks can drive
    if (result.type === 'brick' || result.type === 'reactorDestroyed') gridChanged();

    switch (result.type) {
        case 'crack':
        case 'brick':
            if (result.type === 'brick' && byPlayer) sector.walls++;   // a Heavy's shells break brick too
            sound.playBrickHit();
            explosionManager.addImpactExplosion(px, py);
            effects.addBrickFragments(px, py, result.type === 'crack' ? '#6e3a1e' : '#8B4513');
            break;

        case 'reactorHit':
            sound.playReactorHit();
            explosionManager.addImpactExplosion(px, py);
            camera.shake(2, 8);
            break;

        case 'reactorDestroyed':
            if (result.collapsed) {
                onBaseDestroyed(result.base);
            } else {
                // One of several reactors: the base stands until the last one goes
                sound.playExplosion();
                explosionManager.addTankExplosion(px, py);
                camera.shake(5, 25);
                score += deepScore(CONFIG.score.reactor);
                scorePopups.push(new ScorePopup(px, py, deepScore(CONFIG.score.reactor)));
            }
            break;
    }
}

function onBaseDestroyed(base) {
    sound.playReactorCollapse();
    explosionManager.addBaseExplosion(base.cx, base.cy, CONFIG.base.blastRadius);
    camera.shake(8, 45);

    // The blast takes out every enemy near the base, and the base's own turrets wherever they sit
    for (const enemy of enemyTanks) {
        if (!enemy.alive) continue;
        const inBlast = Math.hypot(enemy.x - base.cx, enemy.y - base.cy) <= CONFIG.base.blastRadius;
        const ownTurret = enemy.type.immobile && enemy.homeBase === base;
        if (inBlast || ownTurret) {
            enemy.takeDamage(Infinity);
            onEnemyKilled(enemy, true);
        }
    }

    score += deepScore(CONFIG.score.base);
    basesDestroyed++;
    fuelAtLastBase = playerTank.fuel;     // what the level-clear fuel bonus is paid on
    playerTank.fuel = playerTank.maxFuel; // a fallen base's stores refuel the tank
    showBanner('BASE DESTROYED!  FUEL RESTORED');
    scorePopups.push(new ScorePopup(base.cx, base.cy, deepScore(CONFIG.score.base)));
}

/**
 * Death feedback for an enemy that has just been killed.
 * @param {boolean} award - whether the player earns the kill
 * @param {boolean} near - false for a death far from the player (crossfire elsewhere): no sound or shake
 */
function onEnemyKilled(enemy, award, near = true) {
    explosionManager.addTankExplosion(enemy.x, enemy.y);
    if (near) {
        sound.playEnemyDeath();
        camera.shake(3, 15);
    }
    if (award) {
        kills++;

        // Each kill made before the streak timer runs out raises the multiplier
        streak = streakTimer > 0 ? streak + 1 : 1;
        streakTimer = CONFIG.streak.window;
        sector.bestStreak = Math.max(sector.bestStreak, streak);
        const mult = streakMultiplier();
        if (mult > 1) sound.playStreak(mult);

        const points = deepScore(enemy.type.score) * mult;
        score += points;
        scorePopups.push(new ScorePopup(enemy.x, enemy.y, points, mult > 1 ? `+${points}  x${mult}` : null));

        if (gameState === 'playing') pickupManager.rollDrop(enemy, playerTank);
    }
}

function newSectorStats() {
    return { rounds: 0, walls: 0, px: 0, bestStreak: 0, damaged: false, hullsLost: 0, bonusHull: false, killsAtStart: kills };
}

/**
 * Write the line for the sector-complete screen. Call after the tally is worked out.
 * Most clears get a status report built from the sector's numbers; some get a lore line instead.
 */
function fileSectorReport() {
    const lore = forcedLore || chooseLore(currentLevel, settings.loreSeen, loreLastClear, CONFIG.lore);
    forcedLore = null;
    loreLastClear = !!lore;
    reportFrames = 0;
    if (lore) {
        report = lore.text;
        if (!settings.loreSeen.includes(lore.id)) {
            settings.loreSeen.push(lore.id);
            saveSettings();
        }
        return;
    }
    // A bonus tank earned by the tally itself is handed over a frame from now
    const bonusDue = !runYolo && spareTanks < CONFIG.lives.maxSpare && score >= nextBonusAt;
    report = buildReport({
        sector: currentLevel,
        kills: kills - sector.killsAtStart,
        reactors: bases.reduce((n, b) => n + b.reactors.length, 0),
        bases: bases.length,
        seconds: tally.seconds,
        rounds: sector.rounds,
        bestStreak: sector.bestStreak,
        walls: sector.walls,
        km: sector.px * CONFIG.lore.metresPerPixel / 1000,
        healthPct: 100 * playerTank.health / playerTank.maxHealth,
        damaged: sector.damaged,
        hullsLost: sector.hullsLost,
        spareHulls: spareTanks + (bonusDue ? 1 : 0),
        bonusHull: sector.bonusHull || bonusDue,
        fast: tally.seconds <= tally.par * 0.6,
    }, reportMemory);
}

/** A score value as paid in this sector: more in the deep sectors, kept to multiples of 5. */
function deepScore(points) {
    return Math.round(points * scoreFactor / 5) * 5;
}

function streakMultiplier() {
    return Math.max(1, Math.min(streak, CONFIG.streak.max));
}

/**
 * Apply a collected pickup to the player's tank.
 */
function collectPickup(type) {
    const def = PICKUP_TYPES[type];
    if (type === 'fuel') {
        playerTank.fuel = Math.min(playerTank.maxFuel, playerTank.fuel + playerTank.maxFuel * def.amount / 100);
    } else if (type === 'repair') {
        playerTank.health = Math.min(playerTank.maxHealth, playerTank.health + def.amount);
    } else if (type === 'demo') {
        playerTank.demoAmmo = Math.min(CONFIG.demo.maxAmmo, playerTank.demoAmmo + def.amount);
    } else {
        playerTank.effects[type] = def.duration; // collecting another restarts the clock
    }
    sound.playPickup();
    scorePopups.push(new ScorePopup(playerTank.x, playerTank.y - 10, 0, def.label, def.color));
}

/**
 * Work out the level-clear bonuses and add them to the score.
 * Par time grows with the number of bases and the size of the maze.
 */
function awardLevelBonus() {
    const b = CONFIG.levelBonus;
    const seconds = Math.round(levelFrames / 60);
    const par = Math.round(b.parBase + b.parPerBase * bases.length * COLS / 120);
    const fuelPct = Math.round(100 * fuelAtLastBase / playerTank.maxFuel); // before the last base refilled it

    tally = {
        seconds,
        par,
        timeBonus: Math.max(0, par - seconds) * b.perSecondUnderPar,
        fuelPct,
        fuelBonus: fuelPct * b.perFuelPercent,
        noLossBonus: tankLostThisLevel ? 0 : b.noTankLost,
    };
    tally.total = tally.timeBonus + tally.fuelBonus + tally.noLossBonus;
    score += tally.total;
}

/**
 * Fire one demolition shell from the player's tank.
 * @returns {boolean} whether a shell left the barrel
 */
function fireDemolitionShell() {
    const shell = bulletManager.fire(playerTank, 'player', { demo: true, speed: CONFIG.demo.speed, silent: true });
    if (!shell) return false;
    playerTank.demoAmmo--;
    sector.rounds++;
    playerTank.recoil = 9;
    sound.playDemoFire();
    effects.addMuzzleFlash(shell.x, shell.y, playerTank.turretAngle);
    camera.shake(2, 6);
    return true;
}

/**
 * A demolition shell goes off at (x, y): walls inside the blast are removed,
 * enemies inside take heavy damage, and any reactor inside takes one hit.
 */
function detonateShell(x, y) {
    const grid = currentMaze;
    const r = CONFIG.demo.radius;

    sound.playExplosion();
    explosionManager.addBaseExplosion(x, y, r + 15);
    camera.shake(6, 25);

    let opened = false;
    const gx0 = Math.max(0, Math.floor((x - r) / TILE_SIZE));
    const gx1 = Math.min(COLS - 1, Math.floor((x + r) / TILE_SIZE));
    const gy0 = Math.max(0, Math.floor((y - r) / TILE_SIZE));
    const gy1 = Math.min(ROWS - 1, Math.floor((y + r) / TILE_SIZE));

    for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
            const px = gx * TILE_SIZE + TILE_SIZE / 2;
            const py = gy * TILE_SIZE + TILE_SIZE / 2;
            if (Math.hypot(px - x, py - y) > r) continue;

            const tile = grid[gy][gx];
            if (tile === TILE.CONCRETE) {
                grid[gy][gx] = TILE.EMPTY;
                effects.addBrickFragments(px, py, '#808080');
                sector.walls++;
                opened = true;
            } else if (tile === TILE.REACTOR) {
                handleTileHit(gx, gy); // one hit, scored like any other
            } else if (tile !== TILE.EMPTY) {
                // Brick of any kind: knock it out through damageTile so a base's brick count stays right
                while (grid[gy][gx] !== TILE.EMPTY && damageTile(grid, gx, gy, bases).type !== 'none') { /* crack, then break */ }
                effects.addBrickFragments(px, py);
                sector.walls++;
                opened = true;
            }
        }
    }
    if (opened) gridChanged();

    for (const enemy of enemyTanks) {
        if (!enemy.alive) continue;
        if (Math.hypot(enemy.x - x, enemy.y - y) > r + enemy.type.size / 2) continue;
        enemy.takeDamage(CONFIG.demo.damage);
        if (!enemy.alive) onEnemyKilled(enemy, true);
    }
}

/**
 * A sapper blows itself up: area damage to the player, no kill credit.
 */
function detonateSapper(enemy) {
    const t = enemy.type;
    enemy.takeDamage(Infinity);
    sound.playExplosion();
    explosionManager.addBaseExplosion(enemy.x, enemy.y, t.blastRadius);
    camera.shake(5, 20);

    if (playerTank.alive && !playerTank.invincible &&
        Math.hypot(playerTank.x - enemy.x, playerTank.y - enemy.y) <= t.blastRadius) {
        if (playerTank.takeDamage(t.blastDamage)) playerHurt();
        sound.playPlayerHit();
    }
}

/**
 * The last base has fallen: stop incoming fire and set the surviving enemies
 * to self-destruct one after another while the scene plays out.
 */
function beginLevelSettling() {
    gameState = 'levelSettling';
    stateTimer = CONFIG.timing.levelSettling;
    sound.stopMusic(); // the explosions get the stage; a fanfare follows with the tally

    bulletManager.bullets = bulletManager.bullets.filter(b => b.owner === 'player');

    const survivors = enemyTanks.filter(e => e.alive);
    const gap = Math.min(6, 90 / Math.max(1, survivors.length));
    survivors.forEach((enemy, i) => {
        enemy.doomTimer = 15 + i * gap;
    });
}

/** The player just took damage: red edge flash, and a short buzz on phones that support it. */
function playerHurt() {
    if (gameState === 'startScreen') return;   // the demo tank's troubles are not the player's
    damageFlash = 14;
    sector.damaged = true;
    input.touch.buzz(25);
}

function showBanner(text) {
    bannerText = text;
    bannerTimer = CONFIG.timing.banner;
}

/**
 * Put a fresh tank on the level's start point: full health and fuel, briefly invincible.
 */
function placePlayerAtStart(invincibleFrames) {
    const spawnX = (COLS * TILE_SIZE) / 2;
    const spawnY = (ROWS * TILE_SIZE) / 2;
    playerTank.x = spawnX;
    playerTank.y = spawnY;
    playerTank.health = playerTank.maxHealth;
    playerTank.fuel = playerTank.maxFuel;
    playerTank.alive = true;
    playerTank.deathTimer = 0;
    playerTank.grantInvincibility(invincibleFrames);
    deathCause = 'hit';
    lowFuelBeep = 0;
    fireTimer = 0;

    camera.reset(spawnX - VIEW.width / 2, spawnY - VIEW.height / 2);
    camera.setTarget(spawnX, spawnY);
}

// States in which background music plays (when the player has it switched on)
// (the level-complete screens have a fanfare instead)
const MUSIC_STATES = new Set(['playing', 'respawning', 'gameOverDelay']);

// States in which the game's theme plays instead
const MENU_MUSIC_STATES = new Set(['startScreen', 'gameover', 'enterInitials']);
let menuMusicDelay = 0;      // frames before the theme may start (lets the game-over jingle finish)

// Browsers refuse to play sound before the first key, click or tap
let audioUnlocked = false;
for (const type of ['keydown', 'mousedown', 'pointerup', 'touchend']) {
    window.addEventListener(type, () => { audioUnlocked = true; }, { once: true });
}

function startMusic() {
    if (settings.music) sound.playMusic();
}

/**
 * Step the music volume setting up or down; 0 is off. On the pause screen,
 * where the music is silent, a bar is played so the new level can be heard.
 */
function changeMusicVolume(by) {
    const volume = Math.max(0, Math.min(MAX_VOLUME, settings.musicVolume + by));
    if (volume !== settings.musicVolume) setMusicVolume(volume);
}

/**
 * Set the music volume setting (0 = off) and put the right thing on for the
 * current screen. The title and game-over theme is started by update().
 */
function setMusicVolume(volume) {
    settings.musicVolume = volume;
    settings.music = volume > 0;
    if (volume > 0) {
        settings.lastVolume = volume;   // what M comes back to
        sound.setMusicVolume(volume);
    }
    saveSettings();

    if (!settings.music) sound.stopMusic();
    else if (MUSIC_STATES.has(gameState)) sound.playMusic();
    else if (gameState === 'paused') sound.previewMusic();
}

/**
 * How hot the action around the player is, for the music's layers:
 * 0 exploring, 1 contact, 2 firefight, 3 in danger (low health or fuel).
 */
function musicIntensity() {
    const cfg = CONFIG.music;
    if (!playerTank.alive) return 0;
    if (playerTank.health < CONFIG.player.maxHealth * cfg.dangerFraction ||
        playerTank.fuel < CONFIG.fuel.capacity * CONFIG.fuel.lowFraction) return 3;

    let alerted = 0;
    for (const enemy of enemyTanks) {
        if (enemy.alive && enemy.alert &&
            Math.hypot(enemy.x - playerTank.x, enemy.y - playerTank.y) < cfg.alertRange) alerted++;
    }
    const tx = playerTank.x / TILE_SIZE;
    const ty = playerTank.y / TILE_SIZE;
    const atBase = bases.some(b => b.alive &&
        tx > b.x - cfg.baseRange && tx < b.x + b.w + cfg.baseRange &&
        ty > b.y - cfg.baseRange && ty < b.y + b.h + cfg.baseRange);

    if (alerted >= cfg.firefightCount || atBase) return 2;
    return alerted > 0 ? 1 : 0;
}

/**
 * Touch only: a thumb is less exact than a mouse, so while the aim stick is
 * held the turret snaps to the nearest enemy that is close to the stick's
 * direction, in range and in line of sight.
 */
function applyAimAssist(grid) {
    const cfg = CONFIG.touch;
    if (!cfg.aimAssist || input.aimSource !== 'touch' || !input._touchAiming || !playerTank.alive) return;

    let best = null;
    let bestOff = cfg.aimAssist;
    for (const enemy of enemyTanks) {
        if (!enemy.alive) continue;
        const dx = enemy.x - playerTank.x;
        const dy = enemy.y - playerTank.y;
        if (Math.hypot(dx, dy) > cfg.aimAssistRange) continue;
        const bearing = Math.atan2(dy, dx);
        let off = Math.abs(bearing - input._touchAngle);
        if (off > Math.PI) off = Math.PI * 2 - off;
        if (off >= bestOff) continue;
        // Turrets sit on walls, which would always block the sight line to their center
        if (!enemy.type.immobile && !hasLineOfSight(grid, playerTank.x, playerTank.y, enemy.x, enemy.y)) continue;
        best = bearing;
        bestOff = off;
    }
    if (best !== null) playerTank.turretAngle = best;
}

// Menu items drawn this frame that can be tapped or clicked: { x, y, w, h, action } in logical coordinates
const uiHits = [];

/** The maze changed: enemies need new routes. */
function gridChanged() {
    nav.dirty = true;
    pilotNav.dirty = true;
}

/**
 * Title screen: up/down picks a row, left/right changes its value.
 */
function updateStartMenu() {
    const key = input.getLastKey();
    if (!key) return;
    const k = key.length === 1 ? key.toLowerCase() : key;

    // H, or B on a controller, opens the How to Play page
    if (k === 'h' || k === 'Backspace') {
        titlePage = 'help';
        return;
    }
    // T, or X on a controller, opens the high-score tables
    if (k === 't' || k === 'PadX') {
        titlePage = 'scores';
        return;
    }

    if (k === 'ArrowUp' || k === 'w' || k === 'PadUp') menuRow = Math.max(0, menuRow - 1);
    else if (k === 'ArrowDown' || k === 's' || k === 'PadDown') menuRow = Math.min(3, menuRow + 1);

    const step = (k === 'ArrowRight' || k === 'd' || k === 'PadRight') ? 1
        : (k === 'ArrowLeft' || k === 'a' || k === 'PadLeft') ? -1 : 0;
    if (step === 0) return;

    if (menuRow === 0) {
        settings.level = Math.max(1, Math.min(MAX_START_LEVEL, settings.level + step));
    } else if (menuRow === 1) {
        settings.density = Math.max(1, Math.min(MAX_DENSITY, settings.density + step));
    } else if (menuRow === 2) {
        settings.yolo = step > 0;   // left: the usual three tanks; right: true YOLO mode
    } else {
        changeMusicVolume(step);
    }
}

/**
 * Typing initials for a new high score
 */
function updateInitialsEntry() {
    let pressed = input.getLastKey();
    if (!pressed) return;
    if (pressed === 'PadLeft') pressed = 'Backspace';
    if (pressed === 'PadRight') pressed = 'PadAccept';

    const save = () => {
        runRank = addHighScore(initialsBuffer, score, currentLevel, kills, basesDestroyed, settings.level, settings.density, runYolo);
        initialsBuffer = '';
        gameOverFrames = 0;
        gameState = 'gameover';
    };

    if (pressed === 'PadUp' || pressed === 'PadDown') {
        // Gamepad: cycle the candidate character
        const step = pressed === 'PadUp' ? 1 : -1;
        padCharIndex = (padCharIndex + step + PAD_CHARS.length) % PAD_CHARS.length;
    } else if (pressed === 'PadAccept') {
        initialsBuffer += PAD_CHARS[padCharIndex];
        if (initialsBuffer.length >= MAX_NAME_LENGTH) save();
    } else if (pressed === 'Backspace') {
        initialsBuffer = initialsBuffer.slice(0, -1);
    } else if ((pressed === 'Enter' || pressed === ' ') && initialsBuffer.length >= 1) {
        save();
    } else if (/^[A-Za-z0-9]$/.test(pressed) && initialsBuffer.length < MAX_NAME_LENGTH) {
        initialsBuffer += pressed.toUpperCase();
        if (initialsBuffer.length >= MAX_NAME_LENGTH) save(); // auto-submit when full
    }
}

/**
 * ?debug=1 overlay (world space): flow-field arrows, and a line from each
 * alerted enemy to the player — green when it can see them, red when it cannot.
 */
function drawDebugOverlay() {
    nav.drawDebug(ctx, camera);
    ctx.lineWidth = 1;
    for (const enemy of enemyTanks) {
        if (!enemy.alive || !enemy.alert) continue;
        ctx.strokeStyle = enemy.canSeePlayer ? 'rgba(0, 255, 0, 0.5)' : 'rgba(255, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.moveTo(enemy.x, enemy.y);
        ctx.lineTo(playerTank.x, playerTank.y);
        ctx.stroke();
    }
}

/**
 * Match the canvas's backing store to the size it is shown at, in device
 * pixels, so the picture is sharp on high-density screens. Drawing code keeps
 * using the 800x600 logical view; render() applies `renderScale`.
 */
let renderScale = 1;
function fitCanvas() {
    const shownWidth = canvas.getBoundingClientRect().width || VIEW.width;
    const density = Math.min(window.devicePixelRatio || 1, 3);
    // Never below 1 (desktop at small sizes) and capped so huge screens do not cost fill rate
    renderScale = Math.max(1, Math.min(shownWidth * density / VIEW.width, 2.5));
    const w = Math.round(VIEW.width * renderScale);
    const h = Math.round(VIEW.height * renderScale);
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        if (playerTank) render(); // resizing wipes the canvas; repaint now rather than flash blank
    }
}

/**
 * Pause because the player cannot be looking: tab hidden, window unfocused, or device held upright.
 */
function autoPause() {
    if (gameState !== 'playing') return;
    gameState = 'paused';
    pauseRow = 0;
    input.getLastKey();
    sound.stopMusic();
}

function render() {
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    uiHits.length = 0; // the HUD refills this as it draws menus
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    // World space
    camera.applyTransform(ctx);
    renderMaze(currentMaze, ctx, camera);
    effects.drawGround(ctx, camera);
    for (const base of bases) base.draw(ctx);
    pickupManager.draw(ctx);
    playerTank.draw(ctx, true);
    for (const enemy of enemyTanks) enemy.draw(ctx);
    bulletManager.draw(ctx);
    effects.drawTop(ctx);
    if (DEBUG.overlay) drawDebugOverlay();
    explosionManager.draw(ctx);
    for (const popup of scorePopups) popup.draw(ctx);
    camera.resetTransform(ctx);

    // Screen space
    drawHud(ctx, VIEW, {
        gameState,
        player: playerTank,
        level: currentLevel,
        score,
        kills,
        basesDestroyed,
        bases,
        enemies: enemyTanks,
        bannerTimer,
        bannerText,
        streakMultiplier: streakMultiplier(),
        streakFraction: streakTimer / CONFIG.streak.window,
        tally,
        report,
        reportFrames,
        damageFlash,
        boosting,
        spareTanks,
        deathCause,
        uiTime,
        levelCompleteTimer: stateTimer,
        initialsBuffer,
        usingPad: input.lastDevice === 'pad',
        usingTouch: input.lastDevice === 'touch',
        hits: uiHits,
        touchDebug: DEBUG.overlay && input.touch.enabled ? input.touch.debugLines() : null,
        padChar: PAD_CHARS[padCharIndex],
        padStatus: input.padStatus,
        padDebug: DEBUG.overlay ? input.padDebugLines() : null,
        musicOn: settings.music,
        titlePage,
        titleFrames,
        yolo: runYolo,
        gameOverFrames,
        runRank,
        pauseRow,
        levelIntroTimer,
        worldScreens: Math.round(COLS * ROWS / 1200),
        settings,
        menuRow,
    });
}

/**
 * Start a fresh run without reloading the page
 */
function resetGame() {
    currentLevel = settings.level;
    score = 0;
    kills = 0;
    basesDestroyed = 0;
    runYolo = settings.yolo;
    spareTanks = runYolo ? 0 : CONFIG.lives.start - 1;
    playerTank.clearEffects();
    playerTank.demoAmmo = 0;
    nextBonusAt = CONFIG.lives.bonusEvery;

    runRank = NO_RANK;
    loreLastClear = false;
    sound.effectsMuted = false;   // the title demo ran silent

    resetLevel(currentLevel);

    menuMusicDelay = 0;
    startMusic();
    gameState = 'playing';
}

/**
 * Build level `level`: new maze, new bases, starting enemies, player back at center.
 */
function resetLevel(level, demo = false) {
    const cfg = getLevelConfig(level, settings.density);
    scoreFactor = cfg.scoreFactor;
    EnemyTank.fireFactor = cfg.fireFactor;
    const grid = resetLevelMaze(cfg);
    bases = placeBases(grid, cfg);

    levelIntroTimer = CONFIG.timing.levelIntro;
    if (!demo) {
        sound.newSong(level); // every level gets its own tune
        if (settings.lastLevel !== level) {
            settings.lastLevel = level;   // the title demo will play this level next time
            saveSettings();
        }
    }

    // The world is a different size on each level
    nav.resize();
    pilotNav.resize();
    camera.setWorldBounds(COLS * TILE_SIZE, ROWS * TILE_SIZE);
    gridChanged();

    enemyTanks = [];
    levelFrames = 0;
    tankLostThisLevel = false;
    tally = null;
    sector = newSectorStats();
    streak = 0;
    streakTimer = 0;

    // About half the alcoves hold a pickup, for those who go looking
    pickupManager.clear();
    effects.clear();
    for (const spot of currentAlcoves) {
        const gx = Math.floor(spot.x / TILE_SIZE);
        const gy = Math.floor(spot.y / TILE_SIZE);
        const inBase = bases.some(b => gx >= b.x - 3 && gx < b.x + b.w + 3 && gy >= b.y - 3 && gy < b.y + b.h + 3);
        if (!inBase && isPassable(grid, gx, gy) && Math.random() < CONFIG.pickups.alcoveChance) {
            pickupManager.place(spot.x, spot.y);
        }
    }
    scorePopups = [];
    bulletManager.clear();
    explosionManager.clear();
    bannerTimer = 0;
    fireTimer = 0;

    // Player at world center (the maze guarantees a clear zone there), full health and fuel
    placePlayerAtStart(CONFIG.player.spawnInvincibility);

    // Each base starts with a few grunts out on its pads, plus its fixed turrets
    for (const base of bases) {
        for (const pad of base.shuffledPads().slice(0, cfg.initialPerBase)) {
            enemyTanks.push(new EnemyTank(pad.x, pad.y, base, 'grunt'));
        }
        for (const pos of base.turretPositions()) {
            enemyTanks.push(new EnemyTank(pos.x, pos.y, base, 'turret'));
        }
    }

    if (!demo) console.log(`Level ${level}: ${COLS}x${ROWS} tiles, density ${cfg.density}, bases [${cfg.templates.join(', ')}], ${enemyTanks.length} starting enemies, ` +
        `spawn every ${cfg.spawnInterval} frames, up to ${cfg.maxAlivePerBase} alive per base`);
}

function init() {
    playerTank = new Tank((COLS * TILE_SIZE) / 2, (ROWS * TILE_SIZE) / 2);
    startDemo();   // the title screen opens on a demo of the last level played

    // Keep the picture sharp as the window, zoom or device orientation changes
    fitCanvas();
    window.addEventListener('resize', fitCanvas);
    window.addEventListener('orientationchange', () => setTimeout(fitCanvas, 300));

    // Pause when the player cannot be looking
    document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
    window.addEventListener('blur', autoPause);
    const upright = window.matchMedia('(orientation: portrait) and (pointer: coarse)');
    const onUpright = () => { if (upright.matches) autoPause(); };
    if (upright.addEventListener) upright.addEventListener('change', onUpright);
    else if (upright.addListener) upright.addListener(onUpright); // older Safari

    requestAnimationFrame(gameLoop);
}

const BASE_FRAME_DURATION = 1000 / 60; // one frame at the 60fps baseline

function gameLoop(timestamp) {
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;

    // Cap delta to prevent huge jumps after a tab switch or long GC pause
    const scale = Math.min(deltaTime, 100) / BASE_FRAME_DURATION;

    update(scale);
    render();

    requestAnimationFrame(gameLoop);
}

/**
 * ScorePopup - Floating score text that drifts upward and fades out
 */
class ScorePopup {
    constructor(x, y, value, text = null, color = null) {
        this.x = x;
        this.y = y - 20; // start above the kill so the text clears the explosion
        this.value = value;
        this.text = text;                 // shown instead of "+value" when given
        this.color = color || '#FFD700';
        this.alpha = 1.0;
        this.velocity = 1.2; // px per frame upward
        this.lifetime = 0;
        this.maxLifetime = 90; // ~1.5 seconds
        this.alive = true;
    }

    update(scale = 1) {
        this.lifetime += scale;
        this.y -= this.velocity * scale;
        this.alpha = Math.max(0, 1 - this.lifetime / this.maxLifetime);
        if (this.lifetime >= this.maxLifetime) this.alive = false;
    }

    draw(ctx) {
        if (!this.alive) return;
        ctx.textAlign = 'center';
        ctx.font = 'bold 22px Courier New';
        ctx.fillStyle = `rgba(0, 0, 0, ${this.alpha})`;
        const label = this.text || `+${this.value}`;
        ctx.fillText(label, this.x + 1, this.y + 1);
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.alpha;
        ctx.fillText(label, this.x, this.y);
        ctx.globalAlpha = 1;
    }
}

// ?debug=1: a console handle for inspecting and poking the running game (window.yolo)
if (DEBUG.overlay) {
    window.yolo = {
        get state() {
            return {
                gameState, level: currentLevel, score, spareTanks,
                fuel: Math.round(playerTank.fuel * 10) / 10, health: playerTank.health, alive: playerTank.alive,
                basesLeft: bases.filter(b => b.alive).length, enemies: enemyTanks.length, world: `${COLS}x${ROWS}`,
                effects: Object.fromEntries(Object.entries(playerTank.effects).map(([k, v]) => [k, Math.round(v)])),
                streak, mult: streakMultiplier(), pickups: pickupManager.items.length, tally, report, reportFrames, sector: { ...sector },
                demoAmmo: playerTank.demoAmmo, x: Math.round(playerTank.x), y: Math.round(playerTank.y), treads: effects.treads.length,
                boosting, device: input.lastDevice, music: settings.music, settings: { ...settings }, initials: initialsBuffer,
            };
        },
        // Music: yolo.music.info, .intensity(0-3) to force the layers (null hands back control),
        // .song(seed) to hear a particular tune, .next() for a new random one, .jingle('victory'|'gameover')
        music: {
            get info() {
                const m = sound.music;
                const song = m.song || {};   // no tune exists until the theme or a level starts one
                return { seed: song.seed, key: song.key, bpm: song.bpm, pass: song.pass, bar: m.bar,
                    intensity: m.intensity, wanted: m.wanted, forced: m.forced, playing: m.playing };
            },
            intensity(n) { sound.music.forced = n; },
            song(seed) { sound.newSong(currentLevel, seed); return this.info; },
            next() { sound.newSong(currentLevel, Math.floor(Math.random() * 0x100000000)); return this.info; },
            jingle(kind = 'victory') { sound.playJingle(kind); },
            // Try another tune as the theme (title and game-over screens); set CONFIG.music.menuSeed to keep it
            theme(seed) { CONFIG.music.menuSeed = seed; sound.music.tag = ''; },
        },
        // Sector reports: yolo.lore.show(id) puts that lore line on the next clear, .seen() / .reset() for the
        // saved list, .all for the table, .longest() for the widest status report
        lore: {
            all: LORE,
            seen() { return [...settings.loreSeen]; },
            reset() { settings.loreSeen = []; saveSettings(); },
            show(id) { forcedLore = LORE.find(l => l.id === id) || null; return forcedLore; },
            longest: longestReport,
        },
        clearSector() { while (bases.some(b => b.alive)) this.destroyBase(); },
        addScore(n) { score += n; },
        setFuel(n) { playerTank.fuel = n; },
        hurt(n) { playerTank.takeDamage(n); },
        teleport(x, y) { playerTank.x = x; playerTank.y = y; },
        baseInfo() { return bases.map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h, alive: b.alive, bricksLeft: b.bricksLeft, reactors: b.reactors.map(r => ({ px: r.px, py: r.py, hp: r.hp })) })); },
        spawnPickup(type, dx = 60, dy = 0) { pickupManager.drop(playerTank.x + dx, playerTank.y + dy, type); },
        // Test helpers: tile lookups, a blast at a point, and staging crossfire between two enemies
        tileAt(px, py) { const r = currentMaze[Math.floor(py / TILE_SIZE)]; return r ? r[Math.floor(px / TILE_SIZE)] : undefined; },
        setTile(px, py, t) { currentMaze[Math.floor(py / TILE_SIZE)][Math.floor(px / TILE_SIZE)] = t; gridChanged(); },
        aim(angle) { debugAim = angle; },   // hold the turret at an angle (null hands it back to the mouse/stick)
        turret() { return playerTank.turretAngle; },
        enemies() { return enemyTanks.filter(e => e.alive).map(e => ({ type: e.type.behavior, hp: e.health, x: Math.round(e.x), y: Math.round(e.y), immobile: !!e.type.immobile })); },
        stageCrossfire() {
            const mobile = enemyTanks.filter(e => e.alive && !e.type.immobile);
            if (mobile.length < 2) return null;
            const [a, b] = mobile;
            b.x = a.x + 44; b.y = a.y;
            const before = { a: a.health, b: b.health, score };
            bulletManager.fire(a, 'enemy', { angle: 0, speed: 8, damage: 25 });
            return { before, read: () => ({ a: a.health, b: b.health, score, bAlive: b.alive }), kill: () => { b.x = a.x + 44; b.y = a.y; b.health = 5; bulletManager.fire(a, 'enemy', { angle: 0, speed: 8, damage: 25 }); } };
        },
        killEnemy() {
            const e = enemyTanks.find(t => t.alive && !t.type.immobile);
            if (!e) return false;
            e.takeDamage(Infinity);
            onEnemyKilled(e, true);
            return true;
        },
        setLevelSeconds(n) { levelFrames = n * 60; },
        fireCount() { return bulletManager.bullets.filter(b => b.owner === 'player').length; },
        destroyBase() {
            const base = bases.find(b => b.alive);
            if (!base) return;
            for (const r of base.reactors) {
                while (r.alive) handleTileHit(r.gx, r.gy);
            }
        },
    };
}

init();
