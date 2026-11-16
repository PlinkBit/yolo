/**
 * YOLO - Enemy bases
 * A base is a brick fortress around one or more reactors. While any reactor
 * lives, the base keeps materializing enemies on the pads outside its walls.
 */

import { TILE, TILE_SIZE, COLS, ROWS } from './maze.js';
import { CONFIG } from './config.js';

/**
 * Layouts. # brick, H reinforced brick, C concrete, . open floor, R reactor.
 * Concrete survives the collapse and is left behind as ruins.
 */
const TEMPLATES = {
    bunker: [
        '#########',
        '#########',
        '##.....##',
        '##.....##',
        '##..R..##',
        '##.....##',
        '##.....##',
        '#########',
        '#########',
    ],
    fortress: [
        'CC#######CC',
        'CC#######CC',
        '##HHHHHHH##',
        '##H.....H##',
        '##H.....H##',
        '##H..R..H##',
        '##H.....H##',
        '##H.....H##',
        '##HHHHHHH##',
        'CC#######CC',
        'CC#######CC',
    ],
    twin: [
        '###############',
        '#HHHHHHHHHHHHH#',
        '#H.....C.....H#',
        '#H.....C.....H#',
        '#H..R..C..R..H#',
        '#H.....C.....H#',
        '#H.....C.....H#',
        '#HHHHHHHHHHHHH#',
        '###############',
    ],
    citadel: [
        'CC#########CC',
        'CCHHHHHHHHHCC',
        '#H.........H#',
        '#H.#######.H#',
        '#H.#.....#.H#',
        '#H.#.....#.H#',
        '#H.#..R..#.H#',
        '#H.#.....#.H#',
        '#H.#.....#.H#',
        '#H.#######.H#',
        '#H.........H#',
        'CCHHHHHHHHHCC',
        'CC#########CC',
    ],
};

/**
 * Turret mounts per layout, as vertex offsets from the base's top-left tile.
 * Each sits in the middle of a 2x2 concrete corner block.
 */
const TURRET_MOUNTS = {
    fortress: { count: 2, at: [[1, 1], [10, 10], [10, 1], [1, 10]] },
    citadel: { count: 4, at: [[1, 1], [12, 12], [12, 1], [1, 12]] },
};

const PAD_CLEARANCE = 36; // px; a pad is blocked while any tank is this close on both axes

function isBrick(tile) {
    return tile === TILE.BRICK || tile === TILE.HARD_BRICK || tile === TILE.CRACKED_BRICK;
}

class Base {
    /**
     * @param {string} templateName - key of TEMPLATES
     * @param {number} bx - top-left tile X
     * @param {number} by - top-left tile Y
     * @param {object} levelCfg - from getLevelConfig()
     */
    constructor(templateName, bx, by, levelCfg) {
        this.templateName = templateName;
        this.template = TEMPLATES[templateName];
        this.spawnWeights = levelCfg.spawnWeights;
        this.x = bx;
        this.y = by;
        this.w = this.template[0].length;
        this.h = this.template.length;
        this.hardBricks = levelCfg.hardBricks;

        // Pixel center (blast origin, radar target)
        this.cx = (bx + this.w / 2) * TILE_SIZE;
        this.cy = (by + this.h / 2) * TILE_SIZE;

        this.alive = true;
        this.reactors = [];
        this.totalBricks = 0;
        this.bricksLeft = 0;

        // Spawn pads sit in the middle of the cleared apron on each side
        this.pads = [
            { x: this.cx, y: (by - 1) * TILE_SIZE },
            { x: this.cx, y: (by + this.h + 1) * TILE_SIZE },
            { x: (bx - 1) * TILE_SIZE, y: this.cy },
            { x: (bx + this.w + 1) * TILE_SIZE, y: this.cy },
        ];

        // Spawning
        this.spawnInterval = levelCfg.spawnInterval;
        this.maxAlive = levelCfg.maxAlivePerBase;
        this.spawnTimer = this.spawnInterval;
        this.pending = null; // { pad, timer } while an enemy is materializing

        // Visuals
        this.pulse = Math.random() * Math.PI * 2;
        this.collapse = null; // { tiles, idx, radius, speed } while collapsing
    }

    /**
     * Write this base onto the grid: clear the apron, then stamp the template.
     */
    stamp(grid) {
        const apron = CONFIG.base.apron;
        for (let gy = this.y - apron; gy < this.y + this.h + apron; gy++) {
            for (let gx = this.x - apron; gx < this.x + this.w + apron; gx++) {
                if (gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS) grid[gy][gx] = TILE.EMPTY;
            }
        }

        for (let dy = 0; dy < this.h; dy++) {
            for (let dx = 0; dx < this.w; dx++) {
                const gx = this.x + dx;
                const gy = this.y + dy;
                switch (this.template[dy][dx]) {
                    case '#':
                        grid[gy][gx] = TILE.BRICK;
                        this.totalBricks++;
                        break;
                    case 'H':
                        grid[gy][gx] = this.hardBricks ? TILE.HARD_BRICK : TILE.BRICK;
                        this.totalBricks++;
                        break;
                    case 'C':
                        grid[gy][gx] = TILE.CONCRETE;
                        break;
                    case 'R':
                        grid[gy][gx] = TILE.REACTOR;
                        this.reactors.push({
                            gx, gy,
                            px: gx * TILE_SIZE + TILE_SIZE / 2,
                            py: gy * TILE_SIZE + TILE_SIZE / 2,
                            hp: CONFIG.base.reactorHp,
                            alive: true,
                            flash: 0,
                        });
                        break;
                    default:
                        grid[gy][gx] = TILE.EMPTY;
                }
            }
        }
        this.bricksLeft = this.totalBricks;
    }

    contains(gx, gy) {
        return gx >= this.x && gx < this.x + this.w && gy >= this.y && gy < this.y + this.h;
    }

    /**
     * Pixel positions for this base's fixed turrets (empty for layouts without mounts).
     * Layouts with fewer turrets than mounts use one diagonal pair, chosen at random.
     */
    turretPositions() {
        const mounts = TURRET_MOUNTS[this.templateName];
        if (!mounts) return [];
        const start = mounts.count < mounts.at.length && Math.random() < 0.5 ? 2 : 0;
        return mounts.at.slice(start, start + mounts.count)
            .map(([vx, vy]) => ({ x: (this.x + vx) * TILE_SIZE, y: (this.y + vy) * TILE_SIZE }));
    }

    /** Weighted random enemy type for the next spawn */
    _pickSpawnType() {
        const entries = Object.entries(this.spawnWeights);
        let roll = Math.random() * entries.reduce((sum, [, w]) => sum + w, 0);
        for (const [type, w] of entries) {
            roll -= w;
            if (roll < 0) return type;
        }
        return entries[0][0];
    }

    /**
     * Pads in random order, for placing the enemies a level starts with.
     */
    shuffledPads() {
        const pads = this.pads.slice();
        for (let i = pads.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pads[i], pads[j]] = [pads[j], pads[i]];
        }
        return pads;
    }

    /**
     * Apply one player hit to the reactor at (gx, gy).
     * @returns {{ type: 'reactorHit'|'reactorDestroyed', base: Base, collapsed: boolean, px: number, py: number }}
     */
    hitReactor(grid, gx, gy) {
        const reactor = this.reactors.find(r => r.alive && r.gx === gx && r.gy === gy);
        if (!reactor) {
            grid[gy][gx] = TILE.EMPTY;
            return { type: 'none' };
        }

        reactor.hp--;
        reactor.flash = 8;
        const result = { type: 'reactorHit', base: this, collapsed: false, px: reactor.px, py: reactor.py };
        if (reactor.hp > 0) return result;

        reactor.alive = false;
        grid[gy][gx] = TILE.EMPTY;
        result.type = 'reactorDestroyed';

        if (!this.reactors.some(r => r.alive)) {
            this._startCollapse(grid);
            result.collapsed = true;
        }
        return result;
    }

    /**
     * Queue every remaining brick for removal, nearest the center first.
     */
    _startCollapse(grid) {
        this.alive = false;
        this.pending = null;

        const tiles = [];
        let maxD = 0;
        for (let gy = this.y; gy < this.y + this.h; gy++) {
            for (let gx = this.x; gx < this.x + this.w; gx++) {
                if (!isBrick(grid[gy][gx])) continue;
                const d = Math.hypot(gx + 0.5 - (this.x + this.w / 2), gy + 0.5 - (this.y + this.h / 2));
                maxD = Math.max(maxD, d);
                tiles.push({ gx, gy, d });
            }
        }
        tiles.sort((a, b) => a.d - b.d);
        this.collapse = { tiles, idx: 0, radius: 0, speed: (maxD + 0.5) / CONFIG.base.collapseFrames };
    }

    /**
     * @param {number} scale - delta-time scale
     * @param {object} env - { grid, canSpawn, tanks, aliveCount }
     *   tanks: every living tank (player and enemies), used to keep pads clear
     *   aliveCount: living mobile enemies that belong to this base
     * @returns {Array} events: { type: 'debris'|'telegraph'|'spawn', x, y, base } (spawn also has enemyType)
     */
    update(scale, env) {
        const events = [];

        for (const r of this.reactors) {
            if (r.flash > 0) r.flash -= scale;
        }

        // Collapse: blow bricks out ring by ring
        if (this.collapse) {
            const c = this.collapse;
            c.radius += c.speed * scale;
            while (c.idx < c.tiles.length && c.tiles[c.idx].d <= c.radius) {
                const t = c.tiles[c.idx++];
                if (isBrick(env.grid[t.gy][t.gx])) {
                    env.grid[t.gy][t.gx] = TILE.EMPTY;
                    events.push({
                        type: 'debris',
                        x: t.gx * TILE_SIZE + TILE_SIZE / 2,
                        y: t.gy * TILE_SIZE + TILE_SIZE / 2,
                        base: this,
                    });
                }
            }
            if (c.idx >= c.tiles.length) this.collapse = null;
        }

        if (!this.alive) return events;

        // The reactor pulses faster as the walls come down
        const damage = this.totalBricks > 0 ? 1 - this.bricksLeft / this.totalBricks : 0;
        this.pulse += scale * (0.05 + 0.2 * damage);

        if (!env.canSpawn) return events;

        if (this.pending) {
            this.pending.timer -= scale;
            if (this.pending.timer <= 0 && this._padFree(this.pending.pad, env.tanks)) {
                events.push({ type: 'spawn', x: this.pending.pad.x, y: this.pending.pad.y, base: this, enemyType: this._pickSpawnType() });
                this.pending = null;
                this.spawnTimer = this.spawnInterval;
            }
        } else {
            this.spawnTimer -= scale;
            if (this.spawnTimer <= 0) {
                if (env.aliveCount >= this.maxAlive) {
                    // At capacity: wait a while instead of replacing a loss instantly
                    this.spawnTimer = this.spawnInterval * 0.5;
                } else {
                    const pad = this.shuffledPads().find(p => this._padFree(p, env.tanks));
                    if (pad) {
                        this.pending = { pad, timer: CONFIG.base.telegraph };
                        events.push({ type: 'telegraph', x: pad.x, y: pad.y, base: this });
                    }
                }
            }
        }

        return events;
    }

    _padFree(pad, tanks) {
        for (const t of tanks) {
            if (Math.abs(t.x - pad.x) < PAD_CLEARANCE && Math.abs(t.y - pad.y) < PAD_CLEARANCE) return false;
        }
        return true;
    }

    /**
     * Draw the animated parts (reactor glow, pads, spawn telegraph) in world space.
     */
    draw(ctx) {
        if (!this.alive) return;

        // Pads: dim hazard brackets on the ground
        for (const pad of this.pads) {
            const active = this.pending && this.pending.pad === pad;
            const s = 14;
            ctx.strokeStyle = active ? 'rgba(255, 80, 60, 0.9)' : 'rgba(255, 80, 60, 0.28)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
                ctx.moveTo(pad.x + sx * s, pad.y + sy * (s - 6));
                ctx.lineTo(pad.x + sx * s, pad.y + sy * s);
                ctx.lineTo(pad.x + sx * (s - 6), pad.y + sy * s);
            }
            ctx.stroke();

            // Telegraph: a ring closing in on the pad as the enemy materializes
            if (active) {
                const t = Math.max(0, this.pending.timer) / CONFIG.base.telegraph; // 1 -> 0
                ctx.fillStyle = `rgba(255, 60, 40, ${0.15 + 0.25 * (1 - t)})`;
                ctx.fillRect(pad.x - s, pad.y - s, s * 2, s * 2);
                ctx.strokeStyle = `rgba(255, 200, 120, ${0.4 + 0.6 * (1 - t)})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(pad.x, pad.y, 6 + 30 * t, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        // Reactors: pulsing glow, redder as HP drops, white flash when hit
        for (const r of this.reactors) {
            if (!r.alive) continue;
            const wave = 0.5 + 0.5 * Math.sin(this.pulse);
            const hpFrac = r.hp / CONFIG.base.reactorHp;
            const green = Math.round(60 + 155 * hpFrac);

            ctx.fillStyle = `rgba(255, ${green}, 0, ${0.10 + 0.14 * wave})`;
            ctx.beginPath();
            ctx.arc(r.px, r.py, 16 + 8 * wave, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = `rgba(255, ${green}, 0, ${0.35 + 0.5 * wave})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(r.px, r.py, 9 + 4 * wave, 0, Math.PI * 2);
            ctx.stroke();

            if (r.flash > 0) {
                ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, r.flash / 8)})`;
                ctx.fillRect(r.px - TILE_SIZE / 2, r.py - TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
            }
        }
    }
}

/**
 * Place one base per template name on the grid, away from the player spawn and
 * from each other. Walls in the way are carved out; that can only open the maze
 * further, so connectivity is preserved.
 *
 * @returns {Base[]} placed bases (shorter than requested only if the map is full)
 */
function placeBases(grid, levelCfg) {
    const bases = [];
    const apron = CONFIG.base.apron;
    const edge = apron + 2;
    const worldCx = COLS / 2;
    const worldCy = ROWS / 2;

    for (const name of levelCfg.templates) {
        const tpl = TEMPLATES[name];
        const w = tpl[0].length;
        const h = tpl.length;
        let placed = null;

        for (let attempt = 0; attempt < 400 && !placed; attempt++) {
            // Loosen the spacing rule if the map is getting crowded
            const sep = attempt < 250 ? (levelCfg.baseSeparation || CONFIG.base.minSeparation) : 5;
            const bx = edge + Math.floor(Math.random() * (COLS - w - edge * 2));
            const by = edge + Math.floor(Math.random() * (ROWS - h - edge * 2));

            const farX = Math.abs(bx + w / 2 - worldCx) >= CONFIG.base.minSpawnDistance;
            const farY = Math.abs(by + h / 2 - worldCy) >= CONFIG.base.minSpawnDistance;
            if (!farX && !farY) continue;

            const crowded = bases.some(b =>
                bx < b.x + b.w + sep && bx + w + sep > b.x &&
                by < b.y + b.h + sep && by + h + sep > b.y);
            if (crowded) continue;

            placed = new Base(name, bx, by, levelCfg);
        }

        if (placed) {
            placed.stamp(grid);
            bases.push(placed);
        } else {
            console.warn(`Could not place a ${name} base`);
        }
    }
    return bases;
}

/**
 * Apply one player bullet hit to a destructible tile.
 *
 * @returns {object} { type } where type is
 *   'none'             - nothing there any more (another bullet got it this frame)
 *   'crack'            - reinforced brick cracked
 *   'brick'            - brick destroyed
 *   'reactorHit'       - reactor damaged; also { base, px, py }
 *   'reactorDestroyed' - reactor destroyed; also { base, collapsed, px, py }
 */
function damageTile(grid, gx, gy, bases) {
    if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return { type: 'none' };
    const tile = grid[gy][gx];

    if (tile === TILE.HARD_BRICK) {
        grid[gy][gx] = TILE.CRACKED_BRICK;
        return { type: 'crack' };
    }

    if (tile === TILE.BRICK || tile === TILE.CRACKED_BRICK) {
        grid[gy][gx] = TILE.EMPTY;
        const base = bases.find(b => b.contains(gx, gy));
        if (base) base.bricksLeft--;
        return { type: 'brick' };
    }

    if (tile === TILE.REACTOR) {
        const base = bases.find(b => b.contains(gx, gy));
        if (base) return base.hitReactor(grid, gx, gy);
        grid[gy][gx] = TILE.EMPTY;
        return { type: 'brick' };
    }

    return { type: 'none' };
}

export { Base, placeBases, damageTile };
