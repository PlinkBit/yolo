/**
 * YOLO - HUD and screen overlays (all drawn in screen space)
 *
 * `canvas` in these functions is the logical view size ({ width, height }), not the canvas element.
 * Every function takes a read-only view of the game:
 *   { gameState, player, level, score, kills, basesDestroyed, bases, enemies,
 *     bannerTimer, bannerText, spareTanks, deathCause, uiTime, levelCompleteTimer, initialsBuffer, musicOn,
 *     usingPad, padChar, padStatus, padDebug, settings, menuRow, pauseRow,
 *     levelIntroTimer, worldScreens, streakMultiplier, streakFraction, tally, damageFlash,
 *     usingTouch, hits (array the menus fill with tappable areas), touchDebug }
 */

import { loadHighScores, getBestScore, MAX_NAME_LENGTH } from './highscore.js';
import { CONFIG, DEBUG, PICKUP_TYPES } from './config.js';
import { drawPickupIcon } from './pickup.js';

const GREEN = '#00ff41';
const GOLD = '#FFD700';

/**
 * Draw the in-game HUD plus whichever overlay the current state calls for.
 */
export function drawHud(ctx, canvas, s) {
    // The title and game-over screens stand alone: no gauges or key hints showing through
    if (!MENU_SCREENS.has(s.gameState)) drawPlayHud(ctx, canvas, s);

    switch (s.gameState) {
        case 'playing': drawRadar(ctx, canvas, s); drawLevelIntro(ctx, canvas, s); break;
        case 'levelComplete': drawLevelComplete(ctx, canvas, s); break;
        case 'respawning': drawTankLost(ctx, canvas, s); break;
        case 'startScreen':
            (s.titlePage === 'help' ? drawHowToPlay : s.titlePage === 'scores' ? drawScoresPage : drawStartScreen)(ctx, canvas, s);
            break;
        case 'gameover': drawGameOver(ctx, canvas, s); break;
        case 'enterInitials': drawEnterInitials(ctx, canvas, s); break;
        case 'paused': drawPauseOverlay(ctx, canvas, s); break;
    }

    // ?debug=1: what the browser reports for controllers, drawn over everything
    if (s.touchDebug) {
        ctx.font = '12px Courier New';
        ctx.textAlign = 'left';
        s.touchDebug.forEach((line, i) => {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(8, 220 + i * 15, ctx.measureText(line).width + 6, 15);
            ctx.fillStyle = '#ffd27f';
            ctx.fillText(line, 11, 232 + i * 15);
        });
    }
    if (s.padDebug) {
        ctx.font = '12px Courier New';
        ctx.textAlign = 'left';
        s.padDebug.forEach((line, i) => {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(8, 136 + i * 15, ctx.measureText(line).width + 6, 15);
            ctx.fillStyle = '#7fffd4';
            ctx.fillText(line, 11, 148 + i * 15);
        });
    }
}

const MENU_SCREENS = new Set(['startScreen', 'gameover', 'enterInitials']);

/** Gauges, counters, key hints and the banner shown during play */
function drawPlayHud(ctx, canvas, s) {
    drawDamageVignette(ctx, canvas, s);
    drawHealthBar(ctx, s.player);
    drawFuelGauge(ctx, s);
    if (s.yolo) {
        // True YOLO mode: no spares to show, so say why
        ctx.fillStyle = '#ff5a5a';
        ctx.font = 'bold 14px Courier New';
        ctx.textAlign = 'left';
        ctx.fillText('YOLO', 220, 25);
    } else {
        drawSpareTanks(ctx, s.spareTanks);
    }
    drawEffects(ctx, s);
    drawStreak(ctx, s);

    const basesLeft = s.bases.filter(b => b.alive).length;
    ctx.fillStyle = GREEN;
    ctx.font = '16px Courier New';
    ctx.textAlign = 'left';
    ctx.fillText(`Sector: ${s.level}`, 10, 64);
    ctx.fillText(`Score: ${s.score}`, 10, 84);
    ctx.fillText(`Kills: ${s.kills}  Bases left: ${basesLeft}`, 10, 104);
    if (DEBUG.god) {
        ctx.fillStyle = '#ff6b6b';
        ctx.fillText('GOD MODE (score not saved, no fuel use)', 10, 124);
    }

    // Key hints along the bottom are for keyboard and controller only
    if (!s.usingTouch) {
        // Music indicator, bottom-right
        ctx.fillStyle = s.musicOn ? GREEN : '#666666';
        ctx.font = '14px Courier New';
        ctx.textAlign = 'right';
        ctx.fillText(`Music: ${s.musicOn ? 'ON' : 'OFF'} [M]`, canvas.width - 10, canvas.height - 20);
    
        // Controls hint, bottom-left
        ctx.fillStyle = GREEN;
        ctx.font = '16px Courier New';
        ctx.textAlign = 'left';
        ctx.fillText(s.usingPad
            ? 'L-Stick: Drive | R-Stick: Aim | RT: Fire | LB: Boost | LT: Shell'
            : 'WASD: Drive | Click: Fire | Shift: Boost | Space: Shell', 10, canvas.height - 20);
    }

    // "BASE DESTROYED!" banner, fading out over its last half second
    if (s.bannerTimer > 0) {
        ctx.fillStyle = `rgba(255, 215, 0, ${Math.min(1, s.bannerTimer / 30)})`;
        ctx.font = 'bold 24px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText(s.bannerText, canvas.width / 2, 30);
    }
}

/**
 * Red glow at the screen edges: a sharp flash when the player is hit, and a
 * slow pulse while health is at a quarter or less.
 */
function drawDamageVignette(ctx, canvas, s) {
    if (s.gameState === 'startScreen') return;
    const flash = Math.max(0, s.damageFlash) / 14 * 0.5;
    const critical = s.player.alive && s.player.health <= s.player.maxHealth * 0.25;
    const pulse = critical ? 0.12 + 0.1 * Math.sin(s.uiTime * 0.1) : 0;
    const alpha = Math.max(flash, pulse);
    if (alpha <= 0.01) return;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const glow = ctx.createRadialGradient(cx, cy, canvas.height * 0.42, cx, cy, canvas.width * 0.68);
    glow.addColorStop(0, 'rgba(255, 0, 0, 0)');
    glow.addColorStop(1, `rgba(255, 0, 0, ${alpha})`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawHealthBar(ctx, player) {
    const w = 200, h = 16, x = 10, y = 12;
    const pct = player.health / player.maxHealth;

    ctx.fillStyle = '#333333';
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = pct <= 0.25 ? '#ff0000' : pct <= 0.5 ? '#ff8800' : GREEN;
    ctx.fillRect(x, y, w * pct, h);

    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(`${player.health} / ${player.maxHealth}`, x + w / 2, y + 12);
}

/**
 * Fuel gauge under the health bar. Below the low-fuel mark it turns red and
 * blinks, with a warning under the banner line.
 */
function drawFuelGauge(ctx, s) {
    const w = 200, h = 9, x = 10, y = 33;
    const pct = s.player.fuel / s.player.maxFuel;
    const low = s.player.alive && pct <= CONFIG.fuel.lowFraction;
    const blinkOn = Math.floor(s.uiTime / 12) % 2 === 0;

    ctx.fillStyle = '#333333';
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = low ? (blinkOn ? '#ff3030' : '#801818') : '#d9a514';
    ctx.fillRect(x, y, w * pct, h);

    ctx.strokeStyle = low ? '#ff3030' : '#d9a514';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = low ? '#ff3030' : '#d9a514';
    ctx.font = 'bold 11px Courier New';
    ctx.textAlign = 'left';
    if (s.boosting) ctx.fillStyle = blinkOn ? '#ffffff' : '#ff9f1a';
    ctx.fillText(s.boosting ? 'BOOST' : 'FUEL', x + w + 8, y + 9);

    if (low && blinkOn && s.gameState === 'playing') {
        ctx.fillStyle = '#ff3030';
        ctx.font = 'bold 20px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText('LOW FUEL - DESTROY A BASE TO REFUEL', CONFIG.view.width / 2, CONFIG.view.height - 50);
    }
}

/** Spare tanks as small tank icons to the right of the health bar */
function drawSpareTanks(ctx, count) {
    for (let i = 0; i < count; i++) {
        const x = 220 + i * 20;
        const y = 13;
        ctx.fillStyle = '#4488ff';
        ctx.fillRect(x, y, 14, 14);
        ctx.fillStyle = '#3366bb';
        ctx.fillRect(x, y, 3, 14);
        ctx.fillRect(x + 11, y, 3, 14);
        ctx.fillStyle = '#2266dd';
        ctx.fillRect(x + 6, y - 3, 2, 10);
        ctx.strokeStyle = '#1a4488';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, 13, 13);
    }
}

/** Shown between losing a tank and the next one arriving */
function drawTankLost(ctx, canvas, s) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 44px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(s.deathCause === 'fuel' ? 'OUT OF FUEL' : 'TANK DESTROYED', canvas.width / 2, canvas.height / 2 - 20);

    ctx.fillStyle = GREEN;
    ctx.font = 'bold 22px Courier New';
    const left = s.spareTanks + 1; // the arriving tank plus the spares behind it
    ctx.fillText(left === 1 ? 'Last tank!' : `${left} tanks left`, canvas.width / 2, canvas.height / 2 + 22);
}

/**
 * Direction radar, upper-right: gold = every live base, inner dots = the nearest enemies in their type color
 */
function drawRadar(ctx, canvas, s) {
    const radarX = canvas.width - 60;
    const radarY = 70;
    const radarRadius = 40;

    ctx.fillStyle = 'rgba(0, 20, 0, 0.6)';
    ctx.beginPath();
    ctx.arc(radarX, radarY, radarRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(radarX, radarY, radarRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = GREEN;
    ctx.beginPath();
    ctx.arc(radarX, radarY, 2, 0, Math.PI * 2);
    ctx.fill();

    const marker = (target, color, radiusFrac, size) => {
        const angle = Math.atan2(target.y - s.player.y, target.x - s.player.x);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(radarX + Math.cos(angle) * radarRadius * radiusFrac,
                radarY + Math.sin(angle) * radarRadius * radiusFrac, size, 0, Math.PI * 2);
        ctx.fill();
    };

    const nearestEnemies = s.enemies
        .filter(e => e.alive)
        .map(e => ({ e, d: Math.hypot(e.x - s.player.x, e.y - s.player.y) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 6);
    for (const { e } of nearestEnemies) marker(e, e.type.body, 0.55, 2.5);

    for (const base of s.bases) {
        if (base.alive) marker({ x: base.cx, y: base.cy }, GOLD, 0.85, 3.5);
    }
}

/**
 * Sector-start banner: the sector number, how big this maze is, and how many bases it holds.
 */
function drawLevelIntro(ctx, canvas, s) {
    if (s.levelIntroTimer <= 0) return;
    const alpha = Math.min(1, s.levelIntroTimer / 40);
    const centerX = canvas.width / 2;
    const bases = s.bases.length;

    ctx.textAlign = 'center';
    ctx.font = 'bold 44px Courier New';
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.7})`;
    ctx.fillText(`SECTOR ${s.level}`, centerX + 2, 192);
    ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`;
    ctx.fillText(`SECTOR ${s.level}`, centerX, 190);

    const line = `Maze size: ${s.worldScreens} screens     Enemy bases: ${bases}`;
    ctx.font = 'bold 18px Courier New';
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.7})`;
    ctx.fillText(line, centerX + 1, 223);
    ctx.fillStyle = `rgba(0, 255, 65, ${alpha})`;
    ctx.fillText(line, centerX, 222);
}

const DENSITY_NAMES = ['', 'Open', 'Sparse', 'Standard', 'Dense', 'Labyrinth'];

/** True when menus should show controller buttons: a controller is in use or has been picked up */
function padPrompts(s) {
    return !s.usingTouch && (s.usingPad || !!s.padStatus.activeId);
}

// The line under the logo, typed out like a combat unit reporting in
const STATUS_LINE = 'UNIT YLO ONLINE. HOSTILITIES DETECTED.';
const TYPE_FRAMES = 3.5;   // frames per character

/**
 * A line in the unit's voice: appears a character at a time behind a "> " prompt,
 * then a cursor blinks at the end. Left-aligned from a fixed point so the text does
 * not slide as it grows. Text too wide for the screen breaks between sentences.
 * @param {number} chars - how many characters have been typed so far
 * @returns {number} the number of lines the full text takes
 */
function drawTyped(ctx, s, text, chars, centerX, y, maxWidth = CONFIG.view.width - 40) {
    ctx.font = '16px Courier New';
    ctx.textAlign = 'left';

    // Break only after a full stop, so a sentence is never split
    const lines = [];
    for (const sentence of text.replace(/\. /g, '.\n').split('\n')) {
        const last = lines[lines.length - 1];
        if (last !== undefined && ctx.measureText('> ' + last + ' ' + sentence + '_').width <= maxWidth) {
            lines[lines.length - 1] = last + ' ' + sentence;
        } else {
            lines.push(sentence);
        }
    }

    const widest = Math.max(...lines.map(line => ctx.measureText('> ' + line).width));
    const x = centerX - widest / 2;
    const indent = ctx.measureText('> ').width;
    const done = chars >= text.length;
    ctx.fillStyle = '#00c232';
    let left = Math.max(0, Math.floor(chars));
    for (let i = 0; i < lines.length; i++) {
        const shown = lines[i].slice(0, left);
        const typingHere = left <= lines[i].length || i === lines.length - 1;
        const cursor = typingHere && (!done || Math.floor(s.uiTime / 22) % 2 === 0) ? '_' : '';
        if (i === 0) ctx.fillText('> ', x, y);
        ctx.fillText(shown + cursor, x + indent, y + i * 20);
        if (typingHere) break;
        left -= lines[i].length + 1;   // the space the break replaced
    }
    return lines.length;
}

function drawStartScreen(ctx, canvas, s) {
    ctx.fillStyle = `rgba(0, 0, 0, ${CONFIG.attract.dim})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const pad = s.padStatus;
    const usePad = padPrompts(s);

    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX - 200, 30);
    ctx.lineTo(centerX + 200, 30);
    ctx.stroke();

    ctx.fillStyle = GREEN;
    ctx.font = 'bold 72px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('YOLO', centerX, 92);

    drawTyped(ctx, s, STATUS_LINE, s.titleFrames / TYPE_FRAMES, centerX, 122);
    ctx.textAlign = 'center';

    // --- Game setup panel ---
    const panel = { x: centerX - 250, y: 142, w: 500, h: 204 };
    ctx.fillStyle = 'rgba(24, 19, 0, 0.88)';
    ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.strokeRect(panel.x, panel.y, panel.w, panel.h);

    ctx.fillStyle = '#cccccc';
    ctx.font = 'bold 16px Courier New';
    ctx.fillText('GAME SETUP', centerX, panel.y + 24);

    const blinkOn = Math.floor(s.uiTime / 18) % 2 === 0;
    const volume = s.settings.musicVolume;
    const muteKey = s.usingTouch ? 'tap' : usePad ? 'Y' : 'M';
    // Each row: what it shows, whether it can still go down or up, and a note beside it
    const rows = [
        { name: 'level', label: 'START SECTOR', text: s.settings.level, down: s.settings.level > 1, up: s.settings.level < 9,
          note: DEBUG.levelSet ? 'set by URL' : '' },
        { name: 'density', label: 'MAZE DENSITY', text: s.settings.density, down: s.settings.density > 1, up: s.settings.density < 5,
          note: DENSITY_NAMES[s.settings.density] },
        { name: 'lives', label: 'LIVES', text: s.settings.yolo ? 'YOLO' : CONFIG.lives.start, down: s.settings.yolo, up: !s.settings.yolo,
          note: s.settings.yolo ? 'one tank' : '', wide: s.settings.yolo, hot: s.settings.yolo },
        // The note doubles as the on/off switch (M, Y, or a tap on it)
        { name: 'volume', label: 'MUSIC VOLUME', text: volume, down: volume > 0, up: volume < CONFIG.music.volumeSteps.length,
          note: volume === 0 ? `off (${muteKey}: on)` : `${muteKey}: off`, hot: volume === 0, tapNote: 'music' },
    ];
    rows.forEach((row, i) => {
        const y = panel.y + 58 + i * 32;
        const selected = i === s.menuRow;
        // Tap targets: the left arrow's side lowers the value, the right arrow's side raises it
        s.hits.push({ x: centerX - 10, y: y - 24, w: 70, h: 32, action: row.name + '-' });
        s.hits.push({ x: centerX + 60, y: y - 24, w: row.tapNote ? 44 : 75, h: 32, action: row.name + '+' });
        if (row.tapNote) s.hits.push({ x: centerX + 104, y: y - 24, w: 136, h: 32, action: row.tapNote });

        if (selected) {
            ctx.fillStyle = 'rgba(255, 215, 0, 0.14)';
            ctx.fillRect(panel.x + 10, y - 22, panel.w - 20, 30);
        }

        ctx.font = 'bold 22px Courier New';
        ctx.fillStyle = selected ? GOLD : '#bbbbbb';
        ctx.textAlign = 'right';
        ctx.fillText(row.label, centerX - 10, y);

        // Arrows show which way the value can still go; they blink on the selected row
        const arrowColor = selected ? (blinkOn ? '#ffffff' : GOLD) : '#666666';
        const spread = row.wide ? 42 : 30;   // a word needs more room between the arrows than a digit
        ctx.textAlign = 'center';
        ctx.fillStyle = row.down ? arrowColor : '#333333';
        ctx.fillText('<', centerX + 60 - spread, y);
        ctx.fillStyle = row.up ? arrowColor : '#333333';
        ctx.fillText('>', centerX + 60 + spread, y);
        ctx.fillStyle = row.name === 'lives' && row.hot ? '#ff5a5a' : selected ? '#ffffff' : '#bbbbbb';
        ctx.fillText(String(row.text), centerX + 60, y);

        ctx.textAlign = 'left';
        ctx.font = '15px Courier New';
        ctx.fillStyle = row.hot ? '#ff8800' : selected ? '#dddddd' : '#888888';
        ctx.fillText(row.note, centerX + (row.wide ? 124 : 112), y - 2);
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = '#bbbbbb';
    ctx.font = '14px Courier New';
    ctx.fillText(s.usingTouch ? 'Tap the arrows to change'
        : usePad ? 'D-pad Up/Down: choose     D-pad Left/Right: change'
        : 'Up/Down arrows: choose     Left/Right arrows: change', centerX, panel.y + 190);

    // --- Which controls are live ---
    let deviceLine;
    let deviceColor = '#aaaaaa';
    if (s.usingTouch) {
        deviceLine = 'Touch controls on';
        deviceColor = GREEN;
    } else if (pad.activeId) {
        deviceLine = 'Controller connected' + (pad.standard ? '' : ' (unrecognized layout)');
        deviceColor = pad.standard ? GREEN : '#ff8800';
    } else if (pad.count > 0) {
        deviceLine = 'Controller found - press any button';
    } else {
        deviceLine = 'Keyboard and mouse     (controller: press any button)';
    }
    ctx.fillStyle = deviceColor;
    ctx.font = '15px Courier New';
    ctx.fillText(deviceLine, centerX, 376);

    // The controls and rules, and the score tables, live on their own pages
    if (s.usingTouch) {
        tapButton(ctx, s, centerX - 125, 410, 230, 36, 'HOW TO PLAY', 'help', true);
        tapButton(ctx, s, centerX + 125, 410, 230, 36, 'HIGH SCORES', 'scores', true);
    } else {
        ctx.fillStyle = '#dddddd';
        ctx.font = 'bold 17px Courier New';
        ctx.fillText(`${usePad ? 'B' : 'H'}: How to Play`, centerX - 130, 408);
        ctx.fillText(`${usePad ? 'X' : 'T'}: High Scores`, centerX + 130, 408);
        s.hits.push({ x: centerX - 250, y: 388, w: 240, h: 30, action: 'help' });
        s.hits.push({ x: centerX + 10, y: 388, w: 240, h: 30, action: 'scores' });
    }

    // The top of each table: every run, and YOLO runs only
    const bestLine = (label, e) => `${label}: ` + (e ? `${e.name} - ${points(e.score)} (Sector ${e.level})` : '---');
    const best = getBestScore('main');
    const bestY = s.usingTouch ? 448 : 442;
    ctx.fillStyle = '#bbbbbb';
    ctx.font = '15px Courier New';
    ctx.fillText(bestLine('Best', best) + (best && best.yolo ? '  YOLO' : ''), centerX, bestY);
    ctx.fillText(bestLine('YOLO best', getBestScore('yolo')), centerX, bestY + 19);

    if (s.usingTouch) {
        tapButton(ctx, s, centerX, 506, 340, 54, 'TAP TO START', 'start', true);
    } else {
        // Always on screen; it breathes rather than blinking off
        const glow = 0.82 + 0.18 * Math.sin(s.uiTime * 0.09);
        ctx.fillStyle = `rgba(255, 215, 0, ${glow})`;
        ctx.font = 'bold 30px Courier New';
        ctx.fillText(usePad ? 'Press A or START' : 'Press ENTER to Start', centerX, 512);
        s.hits.push({ x: centerX - 200, y: 480, w: 400, h: 46, action: 'start' }); // clickable too
    }

    ctx.fillStyle = '#888888';
    ctx.font = '12px Courier New';
    ctx.fillText('Inspired by Bolo (1982) by Jim Lane', centerX, 562);
    ctx.fillText('© 2026 PlinkBit', centerX, 580);
}

/**
 * How to Play: the aim of the game and the controls for every input device,
 * with the one in use picked out. Opened from the title screen.
 */
function drawHowToPlay(ctx, canvas, s) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const centerX = canvas.width / 2;

    ctx.textAlign = 'center';
    ctx.fillStyle = GOLD;
    ctx.font = 'bold 36px Courier New';
    ctx.fillText('HOW TO PLAY', centerX, 62);

    const rules = [
        'Destroy every enemy base: shoot through its walls and hit the reactors inside.',
        'A base keeps building tanks until its last reactor is gone.',
        'Driving burns fuel. A destroyed base refuels you; fuel pickups help in between.',
        'Demolition shells blast through walls and anything near them.',
        `Quick kills in a row multiply the score. Bonus tank every ${CONFIG.lives.bonusEvery.toLocaleString('en-US')} points.`,
        'YOLO mode: one tank, no spares, no bonus tanks. Marked in the high scores.',
    ];
    ctx.fillStyle = '#dddddd';
    ctx.font = '15px Courier New';
    rules.forEach((line, i) => ctx.fillText(line, centerX, 98 + i * 22));

    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, 232);
    ctx.lineTo(canvas.width - 30, 232);
    ctx.stroke();

    // One column per device; the device in use is bright, the others dimmed
    const active = s.usingTouch ? 3 : padPrompts(s) ? 2 : 1;
    const columns = [30, 185, 395, 590];
    const table = [
        ['', 'KEYBOARD + MOUSE', 'CONTROLLER', 'TOUCH'],
        ['Drive', 'WASD or arrow keys', 'Left stick / D-pad', 'Left thumb'],
        ['Aim', 'Mouse', 'Right stick', 'Right thumb'],
        ['Fire', 'Left click', 'RT or RB', 'Right thumb'],
        ['Boost', 'Shift', 'LB', 'Push stick past its ring'],
        ['Demolition shell', 'Right click or Space', 'LT', 'SHELL button'],
        ['Pause', 'Escape or P', 'Start', 'II button'],
        ['Music on/off', 'M', 'Y', 'Tap the music line'],
    ];
    ctx.textAlign = 'left';
    table.forEach((row, r) => {
        const y = 260 + r * 27 + (r > 0 ? 6 : 0);
        row.forEach((cell, c) => {
            const header = r === 0;
            ctx.font = header || c === 0 ? 'bold 14px Courier New' : '14px Courier New';
            ctx.fillStyle = c === 0 ? GREEN : c === active ? (header ? GOLD : '#ffffff') : '#777777';
            ctx.fillText(cell, columns[c], y);
        });
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '14px Courier New';
    ctx.fillText('Boost burns fuel several times faster.', centerX, 490);

    if (s.usingTouch) {
        tapButton(ctx, s, centerX, 540, 240, 46, 'BACK', 'back', true);
    } else {
        ctx.fillStyle = GOLD;
        ctx.font = 'bold 20px Courier New';
        ctx.fillText(padPrompts(s) ? 'B or A: Back' : 'ESC or H: Back', centerX, 546);
    }
    s.hits.push({ x: 0, y: 0, w: canvas.width, h: canvas.height, action: 'back' });   // a tap or click anywhere
}

/**
 * A menu button that can be tapped or clicked. Always registers its hit area;
 * draws the button itself only when `visible` (touch layouts), since keyboard
 * and controller layouts show a text prompt instead.
 * (cx, cy) is the button's center in logical coordinates.
 */
function tapButton(ctx, s, cx, cy, w, h, label, action, visible) {
    s.hits.push({ x: cx - w / 2, y: cy - h / 2, w, h, action });
    if (!visible) return;
    ctx.fillStyle = 'rgba(40, 32, 0, 0.75)';
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
    ctx.fillStyle = GOLD;
    ctx.font = 'bold 22px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy + 8);
}

/**
 * Classic arcade initials entry
 */
function drawEnterInitials(ctx, canvas, s) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    let y = 180;

    ctx.fillStyle = GOLD;
    ctx.font = 'bold 36px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('NEW HIGH SCORE!', centerX, y);

    ctx.fillStyle = GREEN;
    ctx.font = '20px Courier New';
    ctx.fillText(`Score: ${s.score}`, centerX, y + 40);

    y += 90;
    ctx.fillStyle = GOLD;
    ctx.font = 'bold 22px Courier New';
    ctx.fillText('ENTER YOUR NAME:', centerX, y);

    const boxWidth = 200;
    const boxHeight = 45;
    const boxX = centerX - boxWidth / 2;
    const boxY = y + 20;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

    // Typed characters, a blinking cursor in the next slot, underscores for the rest
    const typed = s.initialsBuffer;
    const blinkOn = Math.floor(s.uiTime / 20) % 2 === 0;
    let display = typed;
    for (let i = typed.length; i < MAX_NAME_LENGTH; i++) {
        if (i !== typed.length) display += '_';
        else if (s.usingPad || s.usingTouch) display += blinkOn ? s.padChar : ' ';   // candidate letter, chosen with up/down
        else display += blinkOn ? '|' : '_';
    }

    ctx.fillStyle = GREEN;
    ctx.font = 'bold 32px Courier New';
    ctx.fillText(display, centerX, boxY + 34);

    ctx.fillStyle = '#aaaaaa';
    ctx.font = '16px Courier New';
    if (s.usingTouch) {
        // On-screen keys: step through letters, accept one, delete one, finish
        const keys = [['\u25B2', 'PadUp'], ['\u25BC', 'PadDown'], ['OK', 'PadAccept'], ['DEL', 'Backspace'], ['DONE', 'Enter']];
        keys.forEach(([label, action], i) => tapButton(ctx, s, centerX - 240 + i * 120, y + 130, 104, 56, label, action, true));
    } else {
        ctx.fillText(s.usingPad ? 'Up/Down: letter   A: accept   B: delete' : 'Type your name and press ENTER', centerX, y + 120);
    }
}

/**
 * Pause menu: resume, or abandon the run and return to the title screen.
 */
function drawPauseOverlay(ctx, canvas, s) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const midY = canvas.height / 2;

    ctx.fillStyle = GREEN;
    ctx.font = 'bold 48px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', centerX, midY - 70);

    ['RESUME', 'QUIT TO MAIN MENU'].forEach((label, i) => {
        const y = midY - 5 + i * 40;
        const selected = i === s.pauseRow;
        s.hits.push({ x: centerX - 190, y: y - 28, w: 380, h: 40, action: i === 0 ? 'resume' : 'quit' });
        if (selected) {
            ctx.fillStyle = 'rgba(255, 215, 0, 0.14)';
            ctx.fillRect(centerX - 170, y - 25, 340, 34);
        }
        ctx.fillStyle = selected ? GOLD : '#aaaaaa';
        ctx.font = 'bold 24px Courier New';
        ctx.fillText((selected ? '> ' : '  ') + label + (selected ? ' <' : '  '), centerX, y);
    });

    ctx.fillStyle = '#aaaaaa';
    ctx.font = '15px Courier New';
    ctx.fillText(s.usingTouch ? 'Tap a choice'
        : s.usingPad ? 'D-pad: choose     A: select     START: resume'
        : 'Up/Down: choose     ENTER: select     ESC: resume', centerX, midY + 90);
    if (!s.usingTouch) ctx.fillText('Left/Right: music volume', centerX, midY + 150);

    // Music: the label switches it on and off, the arrows set its volume (0 is off)
    const y = midY + 124;
    const toggle = s.usingTouch ? 'tap' : s.usingPad ? 'Y' : 'M';
    const volume = s.settings.musicVolume;
    const max = CONFIG.music.volumeSteps.length;
    ctx.textAlign = 'right';
    if (volume === 0) ctx.fillStyle = '#ff8800';
    ctx.fillText(volume === 0 ? `Music off (${toggle}: on)` : `Music volume (${toggle}: off)`, centerX + 40, y);
    s.hits.push({ x: centerX - 200, y: y - 22, w: 245, h: 34, action: 'music' });
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px Courier New';
    ctx.fillStyle = volume > 0 ? GOLD : '#444444';
    ctx.fillText('<', centerX + 75, y + 1);
    ctx.fillStyle = volume < max ? GOLD : '#444444';
    ctx.fillText('>', centerX + 145, y + 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(volume), centerX + 110, y + 1);
    s.hits.push({ x: centerX + 50, y: y - 22, w: 50, h: 34, action: 'volume-' });
    s.hits.push({ x: centerX + 120, y: y - 22, w: 50, h: 34, action: 'volume+' });
}

/** A score with thousands separators: 12,500 */
function points(n) {
    return Math.round(n).toLocaleString('en-US');
}

/**
 * One high-score table with numbered places, centered on cx.
 * @param {'main'|'yolo'} table
 * @param {number} rank - the place this run just took (0 = best); that row pulses. -1 for none
 * @returns {boolean} false if the table is empty and nothing was drawn
 */
function drawScoreTable(ctx, s, table, cx, startY, rank = -1) {
    const scores = loadHighScores(table);
    ctx.textAlign = 'center';
    ctx.fillStyle = table === 'yolo' ? '#ff5a5a' : GOLD;
    ctx.font = 'bold 18px Courier New';
    ctx.fillText(table === 'yolo' ? '--- YOLO SCORES ---' : '--- HIGH SCORES ---', cx, startY);

    if (scores.length === 0) {
        ctx.fillStyle = '#777777';
        ctx.font = '15px Courier New';
        ctx.fillText('no scores yet', cx, startY + 28);
        return false;
    }

    for (let i = 0; i < scores.length; i++) {
        const e = scores[i];
        const y = startY + 26 + i * 21;
        const mine = i === rank;
        const line = `${String(i + 1).padStart(2)}. ${e.name.padEnd(3)} ${points(e.score).padStart(9)}  SEC ${String(e.level).padEnd(2)}`;
        const half = table === 'main' ? 172 : 140;   // the main table has a tag column on the right
        if (mine) {
            // This run's row: a pulsing gold bar, bold type and a NEW flag
            const pulse = 0.5 + 0.5 * Math.sin(s.uiTime * 0.14);
            ctx.fillStyle = `rgba(255, 215, 0, ${0.16 + 0.22 * pulse})`;
            ctx.fillRect(cx - half, y - 16, half * 2, 21);
            ctx.strokeStyle = GOLD;
            ctx.lineWidth = 1;
            ctx.strokeRect(cx - half - 0.5, y - 16.5, half * 2 + 1, 22);
        }
        ctx.font = mine ? 'bold 16px Courier New' : '16px Courier New';
        ctx.fillStyle = mine ? '#ffffff' : GREEN;
        ctx.fillText(line, cx, y);
        ctx.textAlign = 'left';
        if (table === 'main' && e.yolo) {
            // On the main table, runs made in YOLO mode (one tank) carry the tag
            ctx.fillStyle = mine ? '#ffffff' : '#ff5a5a';
            ctx.fillText('YOLO', cx + 122, y);
        }
        if (mine) {
            ctx.fillStyle = GOLD;
            ctx.font = 'bold 12px Courier New';
            ctx.fillText('NEW', cx + half + 6, y - 1);
        }
        ctx.textAlign = 'center';
    }
    return true;
}

/**
 * High scores, opened from the title screen: every run on the left, YOLO runs on the right.
 */
function drawScoresPage(ctx, canvas, s) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const centerX = canvas.width / 2;

    ctx.textAlign = 'center';
    ctx.fillStyle = GOLD;
    ctx.font = 'bold 36px Courier New';
    ctx.fillText('HIGH SCORES', centerX, 70);

    drawScoreTable(ctx, s, 'main', 200, 130);
    drawScoreTable(ctx, s, 'yolo', 590, 130);

    ctx.fillStyle = '#aaaaaa';
    ctx.font = '14px Courier New';
    ctx.fillText('YOLO runs have one tank and no spares. They count on both tables.', centerX, 420);

    if (s.usingTouch) {
        tapButton(ctx, s, centerX, 540, 240, 46, 'BACK', 'back', true);
    } else {
        ctx.fillStyle = GOLD;
        ctx.font = 'bold 20px Courier New';
        ctx.fillText(padPrompts(s) ? 'B or A: Back' : 'ESC or T: Back', centerX, 546);
    }
    s.hits.push({ x: 0, y: 0, w: canvas.width, h: canvas.height, action: 'back' });   // a tap or click anywhere
}

/**
 * Active timed power-ups: an icon each, with a bar that drains as it runs out.
 */
function drawEffects(ctx, s) {
    let x = 330;
    for (const [type, frames] of Object.entries(s.player.effects)) {
        if (frames <= 0) continue;
        const def = PICKUP_TYPES[type];
        const size = 24;
        const y = 10;
        // Blink through the last 1.5 seconds
        if (frames > 90 || Math.floor(frames / 6) % 2 === 0) {
            ctx.fillStyle = 'rgba(16, 16, 28, 0.85)';
            ctx.fillRect(x, y, size, size);
            ctx.strokeStyle = def.color;
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, size, size);
            drawPickupIcon(ctx, type, x + size / 2, y + size / 2, 17, def.color);
        }
        ctx.fillStyle = '#333333';
        ctx.fillRect(x, y + size + 3, size, 4);
        ctx.fillStyle = def.color;
        ctx.fillRect(x, y + size + 3, size * Math.min(1, frames / def.duration), 4);
        x += size + 14;
    }

    // Demolition shells carried
    if (s.player.demoAmmo > 0) {
        const def = PICKUP_TYPES.demo;
        ctx.fillStyle = 'rgba(16, 16, 28, 0.85)';
        ctx.fillRect(x, 10, 24, 24);
        ctx.strokeStyle = def.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, 10, 24, 24);
        drawPickupIcon(ctx, 'demo', x + 12, 22, 17, def.color);
        ctx.fillStyle = def.color;
        ctx.font = 'bold 16px Courier New';
        ctx.textAlign = 'left';
        ctx.fillText(`x${s.player.demoAmmo}`, x + 30, 28);
    }
}

/**
 * Kill-streak multiplier beside the score, with the time left to extend it.
 */
function drawStreak(ctx, s) {
    if (s.streakMultiplier < 2 || s.streakFraction <= 0) return;
    const x = 190;
    ctx.fillStyle = GOLD;
    ctx.font = 'bold 16px Courier New';
    ctx.textAlign = 'left';
    ctx.fillText(`STREAK x${s.streakMultiplier}`, x, 84);
    ctx.fillStyle = '#554400';
    ctx.fillRect(x, 89, 96, 3);
    ctx.fillStyle = GOLD;
    ctx.fillRect(x, 89, 96 * Math.max(0, s.streakFraction), 3);
}

/**
 * Sector-clear tally: the unit's typed report, time against par, fuel left, and the no-tank-lost bonus.
 */
function drawLevelComplete(ctx, canvas, s) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    ctx.fillStyle = GOLD;
    ctx.font = 'bold 44px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(`SECTOR ${s.level} COMPLETE!`, centerX, 150);

    // The unit's report on the sector. Now and then it has something else to say.
    if (s.report) drawTyped(ctx, s, s.report, s.reportFrames / CONFIG.lore.typeFrames, centerX, 186);

    const t = s.tally;
    if (t) {
        const clock = sec => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
        const rows = [
            [`Time ${clock(t.seconds)}  (par ${clock(t.par)})`, t.timeBonus],
            [`Fuel left ${t.fuelPct}%`, t.fuelBonus],
            [t.noLossBonus > 0 ? 'No tank lost' : 'Tank lost', t.noLossBonus],
        ];
        ctx.font = '20px Courier New';
        rows.forEach(([label, points], i) => {
            const y = 254 + i * 32;
            ctx.fillStyle = points > 0 ? GREEN : '#888888';
            ctx.textAlign = 'left';
            ctx.fillText(label, centerX - 210, y);
            ctx.textAlign = 'right';
            ctx.fillText(points > 0 ? `+${points}` : '-', centerX + 210, y);
        });

        ctx.strokeStyle = GREEN;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(centerX - 210, 334);
        ctx.lineTo(centerX + 210, 334);
        ctx.stroke();

        ctx.font = 'bold 22px Courier New';
        ctx.fillStyle = GOLD;
        ctx.textAlign = 'left';
        ctx.fillText('SECTOR BONUS', centerX - 210, 364);
        ctx.textAlign = 'right';
        ctx.fillText(`+${t.total}`, centerX + 210, 364);
    }

    const secondsLeft = Math.ceil(s.levelCompleteTimer / 60);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '18px Courier New';
    const how = s.usingTouch ? 'tap' : s.usingPad ? 'A' : 'ENTER';
    ctx.fillText(`Next sector in ${secondsLeft}...   (${how} to continue)`, centerX, 424);
    s.hits.push({ x: 0, y: 0, w: canvas.width, h: canvas.height, action: 'continue' });
}

/**
 * End of the run: how it ended, the score counting up, where it ranks, and the
 * table (both tables for a YOLO run) with this run's row picked out.
 */
function drawGameOver(ctx, canvas, s) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    ctx.textAlign = 'center';

    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 48px Courier New';
    ctx.fillText('GAME OVER', centerX, 66);

    ctx.fillStyle = '#ff9a9a';
    ctx.font = '18px Courier New';
    const ending = s.deathCause === 'fuel' ? 'Ran out of fuel' : s.yolo ? 'Tank destroyed' : 'Last tank destroyed';
    ctx.fillText(`${ending} in sector ${s.level}${s.yolo ? '  -  YOLO run' : ''}`, centerX, 96);

    // The score counts up over about a second, then the verdict appears
    const COUNT_FRAMES = 60;
    const counted = Math.min(1, s.gameOverFrames / COUNT_FRAMES);
    const eased = 1 - Math.pow(1 - counted, 3);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px Courier New';
    ctx.fillText(points(s.score * eased), centerX, 148);
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '14px Courier New';
    ctx.fillText('FINAL SCORE', centerX, 168);

    const rank = s.runRank;
    const main = loadHighScores('main');
    if (counted >= 1) {
        let verdict = '';
        let color = GOLD;
        let flash = false;
        if (rank.main === 0) {
            verdict = 'NEW BEST SCORE!';
            flash = true;
        } else if (rank.yolo === 0) {
            verdict = 'NEW YOLO BEST!' + (rank.main > 0 ? `   RANK ${rank.main + 1} OVERALL` : '');
            flash = true;
        } else if (rank.main > 0 || rank.yolo > 0) {
            const parts = [];
            if (rank.main > 0) parts.push(`RANK ${rank.main + 1} OF ${main.length}`);
            if (rank.yolo > 0) parts.push(`YOLO RANK ${rank.yolo + 1}`);
            verdict = parts.join('     ');
        } else if (main.length > 0 && s.score > 0) {
            // Missed a full table: say what it would have taken
            verdict = `${points(main[main.length - 1].score - s.score + 1)} more to reach the table`;
            color = '#aaaaaa';
        }
        if (verdict) {
            // A new best breathes like the highlighted row; nothing flashes
            ctx.fillStyle = flash ? `rgba(255, 215, 0, ${0.78 + 0.22 * Math.sin(s.uiTime * 0.14)})` : color;
            ctx.font = 'bold 22px Courier New';
            ctx.fillText(verdict, centerX, 202);
        }
    }

    ctx.fillStyle = GREEN;
    ctx.font = '17px Courier New';
    ctx.fillText(`Sector ${s.level}     Enemies destroyed ${s.kills}     Bases destroyed ${s.basesDestroyed}`, centerX, 236);

    // A YOLO run is on both tables, so show both; otherwise just the main one
    if (s.yolo) {
        drawScoreTable(ctx, s, 'main', 200, 276, rank.main);
        drawScoreTable(ctx, s, 'yolo', 590, 276, rank.yolo);
    } else {
        drawScoreTable(ctx, s, 'main', centerX, 276, rank.main);
    }

    // Restart or return to the title: keys, pad buttons, or tap/click the labels
    const goY = canvas.height - 38;
    tapButton(ctx, s, centerX - 150, goY, 260, 46, 'RESTART', 'restart', s.usingTouch);
    tapButton(ctx, s, centerX + 150, goY, 260, 46, 'TITLE SCREEN', 'title', s.usingTouch);
    if (!s.usingTouch) {
        ctx.fillStyle = GOLD;
        ctx.font = 'bold 20px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText(s.usingPad ? 'A: Restart     START: Title Screen' : 'R: Restart     ESC: Title Screen', centerX, canvas.height - 30);
    }
}
