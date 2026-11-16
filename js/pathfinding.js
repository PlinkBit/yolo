/**
 * YOLO - Pathfinding and line of sight
 *
 * Navigation nodes are tile corners ("vertices"), not tiles. A tank centered on
 * a vertex covers exactly the 2x2 tiles around it (its collision box is 28px,
 * a tile is 20px), so a vertex is walkable when those four tiles are open.
 * That makes 2-tile-wide corridors and base aprons navigable.
 *
 * One flow field (BFS distance from the player) is shared by every chaser.
 */

import { TILE, TILE_SIZE, COLS, ROWS } from './maze.js';

let VW = 0; // vertices per row and column; set by Navigator.resize()
let VH = 0;
const FLOW_INTERVAL = 30; // frames between flow-field refreshes

// 8 neighbors; diagonals are only allowed when both adjacent orthogonals are walkable
const NEIGHBORS = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
];

class Navigator {
    constructor() {
        this.dirty = true;  // set when the grid changes (new level, tile destroyed)
        this.timer = 0;
        this.resize();
    }

    /**
     * Match the current world size. Call after the maze for a new level is generated.
     */
    resize() {
        VW = COLS + 1;
        VH = ROWS + 1;
        this.walkable = new Uint8Array(VW * VH);
        this.dist = new Int16Array(VW * VH).fill(-1);
        this.queue = new Int32Array(VW * VH);
        this.dirty = true;
    }

    /**
     * Refresh the walkable map (if the grid changed) and the flow field (periodically).
     */
    update(grid, targetX, targetY, scale) {
        this.timer -= scale;
        if (!this.dirty && this.timer > 0) return;

        if (this.dirty) {
            this._rebuildWalkable(grid);
            this.dirty = false;
        }
        this._buildFlowField(targetX, targetY);
        this.timer = FLOW_INTERVAL;
    }

    _rebuildWalkable(grid) {
        this.walkable.fill(0);
        for (let vy = 1; vy < ROWS; vy++) {
            for (let vx = 1; vx < COLS; vx++) {
                if (grid[vy - 1][vx - 1] === TILE.EMPTY && grid[vy - 1][vx] === TILE.EMPTY &&
                    grid[vy][vx - 1] === TILE.EMPTY && grid[vy][vx] === TILE.EMPTY) {
                    this.walkable[vy * VW + vx] = 1;
                }
            }
        }
    }

    _canStep(vx, vy, dx, dy) {
        const nx = vx + dx;
        const ny = vy + dy;
        if (nx < 0 || nx >= VW || ny < 0 || ny >= VH) return false;
        if (!this.walkable[ny * VW + nx]) return false;
        if (dx !== 0 && dy !== 0) {
            return this.walkable[vy * VW + nx] === 1 && this.walkable[ny * VW + vx] === 1;
        }
        return true;
    }

    /**
     * Breadth-first distances from the walkable vertex nearest (targetX, targetY).
     * If the target has no walkable vertex nearby, the previous field is kept.
     */
    _buildFlowField(targetX, targetY) {
        const start = this.nearestWalkable(targetX, targetY);
        if (!start) return;

        const dist = this.dist;
        const queue = this.queue;
        dist.fill(-1);

        let head = 0;
        let tail = 0;
        const startIdx = start.vy * VW + start.vx;
        dist[startIdx] = 0;
        queue[tail++] = startIdx;

        while (head < tail) {
            const idx = queue[head++];
            const vx = idx % VW;
            const vy = (idx - vx) / VW;
            const d = dist[idx] + 1;
            for (const [dx, dy] of NEIGHBORS) {
                if (!this._canStep(vx, vy, dx, dy)) continue;
                const nIdx = (vy + dy) * VW + (vx + dx);
                if (dist[nIdx] !== -1) continue;
                dist[nIdx] = d;
                queue[tail++] = nIdx;
            }
        }
    }

    _node(vx, vy) {
        return { vx, vy, x: vx * TILE_SIZE, y: vy * TILE_SIZE };
    }

    /**
     * Closest walkable vertex to a pixel position (searching the 3x3 around it), or null.
     */
    nearestWalkable(x, y) {
        const cx = Math.round(x / TILE_SIZE);
        const cy = Math.round(y / TILE_SIZE);
        let best = null;
        let bestD = Infinity;
        for (let vy = cy - 1; vy <= cy + 1; vy++) {
            for (let vx = cx - 1; vx <= cx + 1; vx++) {
                if (vx < 0 || vx >= VW || vy < 0 || vy >= VH || !this.walkable[vy * VW + vx]) continue;
                const d = Math.hypot(vx * TILE_SIZE - x, vy * TILE_SIZE - y);
                if (d < bestD) {
                    bestD = d;
                    best = this._node(vx, vy);
                }
            }
        }
        return best;
    }

    /** Flow distance (in steps) from a vertex to the player, or -1 if unreachable */
    distanceAt(vx, vy) {
        return this.dist[vy * VW + vx];
    }

    /**
     * The neighbor of (vx, vy) that is one step closer to the player.
     * @returns {object|null} node, or null if already there or unreachable
     */
    next(vx, vy) {
        const here = this.dist[vy * VW + vx];
        if (here <= 0) return null;

        let best = null;
        let bestD = here;
        for (const [dx, dy] of NEIGHBORS) {
            if (!this._canStep(vx, vy, dx, dy)) continue;
            const d = this.dist[(vy + dy) * VW + (vx + dx)];
            if (d !== -1 && d < bestD) {
                bestD = d;
                best = this._node(vx + dx, vy + dy);
            }
        }
        return best;
    }

    /**
     * A random walkable vertex within radiusTiles of a pixel position, or null.
     */
    randomVertexNear(x, y, radiusTiles) {
        const cx = Math.round(x / TILE_SIZE);
        const cy = Math.round(y / TILE_SIZE);
        for (let attempt = 0; attempt < 12; attempt++) {
            const vx = cx + Math.round((Math.random() * 2 - 1) * radiusTiles);
            const vy = cy + Math.round((Math.random() * 2 - 1) * radiusTiles);
            if (vx < 1 || vx >= COLS || vy < 1 || vy >= ROWS) continue;
            if (this.walkable[vy * VW + vx]) return this._node(vx, vy);
        }
        return null;
    }

    /**
     * Debug overlay: an arrow at each on-screen vertex pointing down the flow field.
     */
    drawDebug(ctx, camera) {
        const b = camera.getVisibleBounds(TILE_SIZE);
        ctx.strokeStyle = 'rgba(0, 255, 200, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let vy = Math.max(1, b.startRow); vy <= Math.min(ROWS - 1, b.endRow); vy++) {
            for (let vx = Math.max(1, b.startCol); vx <= Math.min(COLS - 1, b.endCol); vx++) {
                const n = this.next(vx, vy);
                if (!n) continue;
                const x = vx * TILE_SIZE;
                const y = vy * TILE_SIZE;
                ctx.moveTo(x, y);
                ctx.lineTo(x + (n.x - x) * 0.4, y + (n.y - y) * 0.4);
            }
        }
        ctx.stroke();
    }
}

/**
 * True if nothing solid lies on the straight line between two points.
 * @param {number} skip - px from the start to ignore (for a shooter mounted on a wall)
 */
function hasLineOfSight(grid, x0, y0, x1, y1, skip = 0) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len <= skip) return true;

    const steps = Math.ceil((len - skip) / 8);
    for (let i = 0; i <= steps; i++) {
        const t = (skip + (len - skip) * (i / steps)) / len;
        const gx = Math.floor((x0 + dx * t) / TILE_SIZE);
        const gy = Math.floor((y0 + dy * t) / TILE_SIZE);
        if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return false;
        if (grid[gy][gx] !== TILE.EMPTY) return false;
    }
    return true;
}

export { Navigator, hasLineOfSight };
