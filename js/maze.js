/**
 * YOLO - Maze / Terrain Generation System
 * Inverted approach: start all-empty, then draw 1-tile concrete walls at right angles
 */

// Tile types
const TILE = {
    CONCRETE: 0, // Impenetrable wall (indestructible)
    EMPTY: 1,    // Drivable ground
    BRICK: 2,    // Destructible wall (1 bullet = destroyed)
    REACTOR: 3,  // Base core - a base collapses when all its reactors are destroyed
    HARD_BRICK: 4,    // Reinforced brick - first hit cracks it
    CRACKED_BRICK: 5, // Reinforced brick after one hit - next hit destroys it
};

// Visual colors for each tile type
const TILE_COLORS = {
    [TILE.CONCRETE]: '#808080',
    [TILE.EMPTY]: '#0d0d1a',
    [TILE.BRICK]: '#8B4513',   // Saddle brown
    [TILE.REACTOR]: '#FF4500', // Orange-red glow
    [TILE.HARD_BRICK]: '#6e3a1e',
    [TILE.CRACKED_BRICK]: '#7a4a2a',
};

// Current level state (reassigned on each level generation)
let currentMaze = null;
let currentAlcoves = [];   // pixel centers of the alcoves in the current maze (pickup spots)

// Configuration
const TILE_SIZE = 20;
let COLS = 120;   // world size in tiles; set per level by resetLevelMaze
let ROWS = 90;

// Half-size of every tank's wall-collision box (28x28, slightly inside the 32x32 sprite)
const TANK_HALF = 14;

/**
 * Draw a horizontal concrete wall line (1 tile thick)
 */
function drawHWall(grid, x1, y, x2) {
    const minX = Math.max(1, Math.min(x1, x2));
    const maxX = Math.min(COLS - 2, Math.max(x1, x2));
    if (y < 1 || y > ROWS - 2) return;
    for (let x = minX; x <= maxX; x++) {
        grid[y][x] = TILE.CONCRETE;
    }
}

/**
 * Draw a vertical concrete wall line (1 tile thick)
 */
function drawVWall(grid, x, y1, y2) {
    const minY = Math.max(1, Math.min(y1, y2));
    const maxY = Math.min(ROWS - 2, Math.max(y1, y2));
    if (x < 1 || x > COLS - 2) return;
    for (let y = minY; y <= maxY; y++) {
        grid[y][x] = TILE.CONCRETE;
    }
}

/**
 * Maze shape per density setting (1 = open arena ... 5 = labyrinth).
 *   spacing   [min, max] tiles between wall lines
 *   holes     extra openings per wall line, as a fraction of the line length in tiles
 *   gap       width in tiles of the guaranteed door between neighboring rooms
 *   brick     chance that an extra opening is bricked up (a shootable shortcut) instead of left open
 */
const DENSITY = {
    1: { spacing: [12, 20], holes: 0.14, gap: 5, brick: 0.15 },
    2: { spacing: [9, 17], holes: 0.10, gap: 5, brick: 0.22 },
    3: { spacing: [7, 15], holes: 0.07, gap: 5, brick: 0.30 },
    4: { spacing: [6, 11], holes: 0.045, gap: 3, brick: 0.40 },
    5: { spacing: [5, 9], holes: 0.025, gap: 3, brick: 0.50 },
};

function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Generate a maze: start empty, draw a grid of wall lines, carve a door between
 * rooms with a depth-first walk (so every room is reachable), then knock extra
 * openings in the walls and add brick shortcuts, pillars and alcoves.
 *
 * Pillars and alcoves only go where they keep at least 3 open tiles on every
 * side, so they can never seal a passage.
 *
 * @param {object} opts - { density: 1-5, hardBricks: boolean }
 */
function generateMaze(opts = {}) {
    const shape = DENSITY[opts.density] || DENSITY[3];
    const grid = new Array(ROWS).fill(null).map(() => new Array(COLS).fill(TILE.EMPTY));
    currentAlcoves = [];

    // Wall line positions, irregularly spaced
    const hWallPositions = []; // y-coords of horizontal wall lines
    const vWallPositions = []; // x-coords of vertical wall lines
    const [minGap, maxGap] = shape.spacing;

    for (let y = randInt(minGap, maxGap); y < ROWS - minGap; y += randInt(minGap, maxGap)) hWallPositions.push(y);
    for (let x = randInt(minGap, maxGap); x < COLS - minGap; x += randInt(minGap, maxGap)) vWallPositions.push(x);

    const wallRows = hWallPositions.length;
    const wallCols = vWallPositions.length;

    for (const wy of hWallPositions) drawHWall(grid, 1, wy, COLS - 2);
    for (const wx of vWallPositions) drawVWall(grid, wx, 1, ROWS - 2);

    // Room [r][c] lies between wall lines r-1 and r vertically, c-1 and c horizontally
    const numRoomRows = wallRows + 1;
    const numRoomCols = wallCols + 1;
    const rooms = Array.from({ length: numRoomRows }, () => new Uint8Array(numRoomCols));

    const startC = Math.floor(numRoomCols / 2);
    const startR = Math.floor(numRoomRows / 2);
    rooms[startR][startC] = 1;
    const stack = [[startC, startR]];
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    // Bounding wall lines (or world edges) of a room column / row
    function roomXRange(c) {
        return { left: c > 0 ? vWallPositions[c - 1] : 0, right: c < wallCols ? vWallPositions[c] : COLS - 1 };
    }
    function roomYRange(r) {
        return { top: r > 0 ? hWallPositions[r - 1] : 0, bottom: r < wallRows ? hWallPositions[r] : ROWS - 1 };
    }

    const half = Math.floor(shape.gap / 2);
    while (stack.length > 0) {
        const [c, r] = stack[stack.length - 1];
        const unvisited = [];
        for (const [dc, dr] of dirs) {
            const nc = c + dc;
            const nr = r + dr;
            if (nc >= 0 && nc < numRoomCols && nr >= 0 && nr < numRoomRows && !rooms[nr][nc]) unvisited.push([nc, nr]);
        }

        if (unvisited.length === 0) {
            stack.pop();
            continue;
        }

        const [nc, nr] = unvisited[Math.floor(Math.random() * unvisited.length)];
        if (c === nc) {
            // Door in the horizontal wall between the two rooms, inside the width of this room
            const wy = hWallPositions[Math.min(r, nr)];
            const xr = roomXRange(c);
            const center = randInt(xr.left + 1 + half, xr.right - 1 - half);
            for (let gx = center - half; gx <= center + half; gx++) grid[wy][gx] = TILE.EMPTY;
        } else {
            const wx = vWallPositions[Math.min(c, nc)];
            const yr = roomYRange(r);
            const center = randInt(yr.top + 1 + half, yr.bottom - 1 - half);
            for (let gy = center - half; gy <= center + half; gy++) grid[gy][wx] = TILE.EMPTY;
        }
        rooms[nr][nc] = 1;
        stack.push([nc, nr]);
    }

    // Extra openings. Some are bricked up instead: a shortcut for anyone willing to shoot.
    // Only concrete is ever replaced, so the doors carved above stay open.
    const brickTile = () => (opts.hardBricks && Math.random() < 0.5 ? TILE.HARD_BRICK : TILE.BRICK);
    const punch = (lineLen, tileAt) => {
        const holes = Math.floor(lineLen * shape.holes);
        for (let h = 0; h < holes; h++) {
            const start = randInt(3, lineLen - 4);
            const runLen = randInt(4, 6);
            const fill = Math.random() < shape.brick ? brickTile() : TILE.EMPTY;
            for (let d = 0; d < runLen; d++) tileAt(start + d, fill);
        }
    };
    for (const wy of hWallPositions) {
        punch(COLS, (x, fill) => {
            if (x >= 1 && x < COLS - 1 && grid[wy][x] === TILE.CONCRETE) grid[wy][x] = fill;
        });
    }
    for (const wx of vWallPositions) {
        punch(ROWS, (y, fill) => {
            if (y >= 1 && y < ROWS - 1 && grid[y][wx] === TILE.CONCRETE) grid[y][wx] = fill;
        });
    }

    // Remove isolated concrete cells left by overlapping openings (single pass, non-cascading)
    const toRemove = [];
    for (let y = 2; y < ROWS - 2; y++) {
        for (let x = 2; x < COLS - 2; x++) {
            if (grid[y][x] !== TILE.CONCRETE) continue;
            let openCount = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if ((dx !== 0 || dy !== 0) && grid[y + dy][x + dx] !== TILE.CONCRETE) openCount++;
                }
            }
            if (openCount >= 7) toRemove.push(x, y);
        }
    }
    for (let i = 0; i < toRemove.length; i += 2) grid[toRemove[i + 1]][toRemove[i]] = TILE.EMPTY;

    // Pillars and alcoves, room by room
    const allEmpty = (x0, y0, x1, y1) => {
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                if (x < 1 || x > COLS - 2 || y < 1 || y > ROWS - 2 || grid[y][x] !== TILE.EMPTY) return false;
            }
        }
        return true;
    };

    for (let r = 0; r < numRoomRows; r++) {
        for (let c = 0; c < numRoomCols; c++) {
            const { left, right } = roomXRange(c);
            const { top, bottom } = roomYRange(r);

            // Pillar: a 2x2 concrete block with 3 clear tiles all round, for cover
            if (right - left >= 10 && bottom - top >= 10 && Math.random() < 0.4) {
                const px = randInt(left + 4, right - 5);
                const py = randInt(top + 4, bottom - 5);
                if (allEmpty(px - 3, py - 3, px + 4, py + 4)) {
                    grid[py][px] = grid[py][px + 1] = grid[py + 1][px] = grid[py + 1][px + 1] = TILE.CONCRETE;
                }
            }

            // Alcove: two stubs off the top wall of the room forming a pocket 3-4 tiles wide.
            // The wall behind must be solid, and the room must stay open beyond the pocket.
            if (r > 0 && right - left >= 13 && bottom - top >= 8 && Math.random() < 0.3) {
                const inner = randInt(3, 4);
                const depth = 3;
                const ax = randInt(left + 4, right - inner - 5);
                let solid = true;
                for (let x = ax - 1; x <= ax + inner + 2; x++) {
                    if (grid[top][x] !== TILE.CONCRETE) solid = false;
                }
                if (solid && allEmpty(ax - 3, top + 1, ax + inner + 4, top + depth + 3)) {
                    for (let d = 1; d <= depth; d++) {
                        grid[top + d][ax] = TILE.CONCRETE;
                        grid[top + d][ax + inner + 1] = TILE.CONCRETE;
                    }
                    currentAlcoves.push({ x: (ax + 1 + inner / 2) * TILE_SIZE, y: (top + 2.5) * TILE_SIZE });
                }
            }

            // Same, off the left wall of the room
            if (c > 0 && bottom - top >= 13 && right - left >= 8 && Math.random() < 0.3) {
                const inner = randInt(3, 4);
                const depth = 3;
                const ay = randInt(top + 4, bottom - inner - 5);
                let solid = true;
                for (let y = ay - 1; y <= ay + inner + 2; y++) {
                    if (grid[y][left] !== TILE.CONCRETE) solid = false;
                }
                if (solid && allEmpty(left + 1, ay - 3, left + depth + 3, ay + inner + 4)) {
                    for (let d = 1; d <= depth; d++) {
                        grid[ay][left + d] = TILE.CONCRETE;
                        grid[ay + inner + 1][left + d] = TILE.CONCRETE;
                    }
                    currentAlcoves.push({ x: (left + 2.5) * TILE_SIZE, y: (ay + 1 + inner / 2) * TILE_SIZE });
                }
            }
        }
    }

    // Clear the spawn zone at the center (13x13)
    const centerX = Math.floor(COLS / 2);
    const centerY = Math.floor(ROWS / 2);
    for (let dy = -6; dy <= 6; dy++) {
        for (let dx = -6; dx <= 6; dx++) grid[centerY + dy][centerX + dx] = TILE.EMPTY;
    }

    return grid;
}

/**
 * Draw a single tile with visual details
 */
function drawTile(ctx, x, y, tile) {
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;

    ctx.fillStyle = TILE_COLORS[tile];
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

    // Draw subtle details for concrete walls
    if (tile === TILE.CONCRETE) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);

        // Top-left highlight for depth effect
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, 2);
        ctx.fillRect(px + 1, py + 1, 2, TILE_SIZE - 2);

        // Bottom-right shadow for depth effect
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.fillRect(px + 1, py + TILE_SIZE - 3, TILE_SIZE - 2, 2);
        ctx.fillRect(px + TILE_SIZE - 3, py + 1, 2, TILE_SIZE - 2);
    }

    // Brick tile details (subtle brick pattern)
    if (tile === TILE.BRICK) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);

        // Brick highlight
        ctx.fillStyle = 'rgba(255, 150, 50, 0.15)';
        ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, 3);

        // Mortar line (horizontal groove in middle)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.fillRect(px + 1, py + Math.floor(TILE_SIZE / 2) - 1, TILE_SIZE - 2, 2);
    }

    // Reinforced brick: darker, with steel bands top and bottom
    if (tile === TILE.HARD_BRICK || tile === TILE.CRACKED_BRICK) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);

        ctx.fillStyle = 'rgba(190, 200, 210, 0.35)';
        ctx.fillRect(px + 1, py + 2, TILE_SIZE - 2, 3);
        ctx.fillRect(px + 1, py + TILE_SIZE - 5, TILE_SIZE - 2, 3);

        // Crack lines once it has taken a hit
        if (tile === TILE.CRACKED_BRICK) {
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(px + 4, py + 2);
            ctx.lineTo(px + 9, py + 9);
            ctx.lineTo(px + 6, py + 13);
            ctx.lineTo(px + 12, py + 18);
            ctx.moveTo(px + 9, py + 9);
            ctx.lineTo(px + 16, py + 6);
            ctx.stroke();
        }
    }

    // Reactor tile (static core; base.js draws the animated glow on top)
    if (tile === TILE.REACTOR) {
        const cx = px + TILE_SIZE / 2;
        const cy = py + TILE_SIZE / 2;
        ctx.fillStyle = '#FFD700'; // Gold center
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();

        // Outer glow ring
        ctx.strokeStyle = 'rgba(255, 69, 0, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.stroke();

        // Border box
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    }
}

/**
 * Render the maze to the canvas using camera for viewport clipping
 */
function renderMaze(grid, ctx, camera) {
    const bounds = camera.getVisibleBounds(TILE_SIZE);

    for (let y = bounds.startRow; y <= bounds.endRow; y++) {
        for (let x = bounds.startCol; x <= bounds.endCol; x++) {
            if (x < 0 || x >= COLS || y < 0 || y >= ROWS) continue;
            const tile = grid[y][x];
            drawTile(ctx, x, y, tile);
        }
    }
}

/**
 * Check if a tile is passable for tanks (only open ground is)
 */
function isPassable(grid, x, y) {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
    return grid[y][x] === TILE.EMPTY;
}

/**
 * Check if a tile can be damaged by bullets (any brick variant or a reactor)
 */
function isDestructible(grid, x, y) {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
    const tile = grid[y][x];
    return tile === TILE.BRICK || tile === TILE.HARD_BRICK || tile === TILE.CRACKED_BRICK || tile === TILE.REACTOR;
}

/**
 * Convert pixel coordinates to grid coordinates
 */
function pixelToGrid(px, py) {
    const x = Math.floor(px / TILE_SIZE);
    const y = Math.floor(py / TILE_SIZE);
    return { x, y };
}

/**
 * True if a square box centered at (x, y) overlaps any impassable tile or leaves
 * the world. Tests every tile the box covers, not just its corners: the tank box
 * (28px) is wider than a tile (20px), so a corner-only test misses a wall end
 * that sits between two corners.
 */
function boxHitsWall(grid, x, y, half) {
    const x0 = Math.floor((x - half) / TILE_SIZE);
    const x1 = Math.floor((x + half) / TILE_SIZE);
    const y0 = Math.floor((y - half) / TILE_SIZE);
    const y1 = Math.floor((y + half) / TILE_SIZE);
    for (let gy = y0; gy <= y1; gy++) {
        for (let gx = x0; gx <= x1; gx++) {
            if (!isPassable(grid, gx, gy)) return true;
        }
    }
    return false;
}

/**
 * Like boxHitsWall, but only tests the edge the box is moving toward, so a
 * trailing edge that grazes a wall cannot veto movement away from it.
 *
 * @param {'x'|'y'} axis - axis of movement
 * @param {number} dir - sign of movement along that axis
 */
function leadingEdgeHitsWall(grid, x, y, half, axis, dir) {
    if (axis === 'x') {
        const gx = Math.floor((x + (dir > 0 ? half : -half)) / TILE_SIZE);
        const y0 = Math.floor((y - half) / TILE_SIZE);
        const y1 = Math.floor((y + half) / TILE_SIZE);
        for (let gy = y0; gy <= y1; gy++) {
            if (!isPassable(grid, gx, gy)) return true;
        }
    } else {
        const gy = Math.floor((y + (dir > 0 ? half : -half)) / TILE_SIZE);
        const x0 = Math.floor((x - half) / TILE_SIZE);
        const x1 = Math.floor((x + half) / TILE_SIZE);
        for (let gx = x0; gx <= x1; gx++) {
            if (!isPassable(grid, gx, gy)) return true;
        }
    }
    return false;
}

/**
 * Generate a fresh maze for a new level. Bases are stamped onto it by base.js.
 * Also sets the world size: COLS and ROWS are live bindings, so every module
 * that imports them sees the new values.
 *
 * @param {object} opts - { cols, rows, density: 1-5, hardBricks }
 * @returns {Array} the new grid (also available as the live `currentMaze` binding)
 */
function resetLevelMaze(opts = {}) {
    COLS = opts.cols || 120;
    ROWS = opts.rows || 90;
    currentMaze = generateMaze(opts);
    return currentMaze;
}

export {
    currentMaze,
    currentAlcoves,
    resetLevelMaze,
    TILE,
    TILE_SIZE,
    TANK_HALF,
    COLS,
    ROWS,
    renderMaze,
    isPassable,
    isDestructible,
    pixelToGrid,
    boxHitsWall,
    leadingEdgeHitsWall,
};
