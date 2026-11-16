/**
 * YOLO - Tank-to-tank collision and wall safety net
 */

import { boxHitsWall, TANK_HALF, TILE_SIZE, COLS, ROWS } from './maze.js';
import { CONFIG } from './config.js';

/**
 * Check if two tanks overlap (AABB). Both are 32x32; 30 leaves a little slack.
 */
function tanksOverlap(a, b) {
    return Math.abs(a.x - b.x) < 30 && Math.abs(a.y - b.y) < 30;
}

/**
 * Push two overlapping tanks apart along the axis of least overlap.
 * A push that would put a tank into a wall is skipped.
 */
function separateTanks(grid, a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const overlapX = 32 - Math.abs(dx);
    const overlapY = 32 - Math.abs(dy);

    // Fixed emplacements never move; the other tank takes the whole push
    const aFixed = isFixed(a);
    const bFixed = isFixed(b);
    if (aFixed && bFixed) return;
    const share = (aFixed || bFixed) ? 1 : 0.5;

    if (overlapX < overlapY) {
        const push = overlapX * share + 1;
        const dir = dx !== 0 ? Math.sign(dx) : 1;
        if (!aFixed && !boxHitsWall(grid, a.x + dir * push, a.y, TANK_HALF)) a.x += dir * push;
        if (!bFixed && !boxHitsWall(grid, b.x - dir * push, b.y, TANK_HALF)) b.x -= dir * push;
    } else {
        const push = overlapY * share + 1;
        const dir = dy !== 0 ? Math.sign(dy) : 1;
        if (!aFixed && !boxHitsWall(grid, a.x, a.y + dir * push, TANK_HALF)) a.y += dir * push;
        if (!bFixed && !boxHitsWall(grid, b.x, b.y - dir * push, TANK_HALF)) b.y -= dir * push;
    }
}

function isFixed(tank) {
    return !!(tank.type && tank.type.immobile);
}

/**
 * Resolve all tank-to-tank contact for this frame.
 * - Enemy vs enemy: soft separation, no damage
 * - Player vs enemy: separation plus mutual ram damage
 *
 * @param {object} handlers - { onPlayerRammed(), onEnemyRammed(enemy) } called after damage is applied
 */
function resolveTankCollisions(grid, player, enemies, handlers) {
    const alive = enemies.filter(e => e.alive);

    for (let i = 0; i < alive.length; i++) {
        for (let j = i + 1; j < alive.length; j++) {
            if (tanksOverlap(alive[i], alive[j])) separateTanks(grid, alive[i], alive[j]);
        }
    }

    if (!player.alive) return;

    for (const enemy of alive) {
        if (!tanksOverlap(player, enemy)) continue;

        separateTanks(grid, player, enemy);

        // Player damage is gated by the player's invincibility frames
        // (takeDamage reports false when a shield soaks the hit)
        if (!player.invincible && player.takeDamage(CONFIG.ram.damage)) {
            handlers.onPlayerRammed();
        }

        // Enemy damage is gated by a per-enemy cooldown
        if (enemy.collisionCooldown <= 0) {
            enemy.takeDamage(CONFIG.ram.damage);
            enemy.collisionCooldown = CONFIG.ram.enemyCooldown;
            handlers.onEnemyRammed(enemy);
        }
    }
}

/**
 * Safety net: keep a tank inside the world and out of walls. If it has ended
 * up inside one (pushed by another tank, or a wall appeared), nudge it to the
 * nearest free position.
 */
function clampTankToWalls(grid, tank) {
    const worldW = COLS * TILE_SIZE;
    const worldH = ROWS * TILE_SIZE;
    tank.x = Math.max(TANK_HALF, Math.min(tank.x, worldW - TANK_HALF));
    tank.y = Math.max(TANK_HALF, Math.min(tank.y, worldH - TANK_HALF));

    if (!boxHitsWall(grid, tank.x, tank.y, TANK_HALF)) return;

    const ox = tank.x;
    const oy = tank.y;
    const free = (x, y) => !boxHitsWall(grid, x, y, TANK_HALF);

    for (let d = 1; d <= TILE_SIZE * 2; d++) {
        const candidates = [
            [d, 0], [-d, 0], [0, d], [0, -d],
            [d, d], [d, -d], [-d, d], [-d, -d],
        ];
        for (const [dx, dy] of candidates) {
            if (free(ox + dx, oy + dy)) {
                tank.x = ox + dx;
                tank.y = oy + dy;
                return;
            }
        }
    }
}

export { resolveTankCollisions, clampTankToWalls };
