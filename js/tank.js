/**
 * YOLO - Player Tank Class
 * Handles tank movement, wall collision, and rendering
 */

import { leadingEdgeHitsWall, TANK_HALF, TILE_SIZE, COLS, ROWS } from './maze.js';
import { CONFIG, DEBUG } from './config.js';

class Tank {
    constructor(x, y) {
        // World position (center of tank)
        this.x = x;
        this.y = y;

        // Dimensions
        this.width = 32;
        this.height = 32;

        // Movement
        this.speed = CONFIG.player.speed;
        this.angle = -Math.PI / 2;           // Body facing direction (radians)
        this.turretAngle = -Math.PI / 2;     // Turret aiming angle (controlled by mouse)

        // Health
        this.health = CONFIG.player.maxHealth;
        this.maxHealth = CONFIG.player.maxHealth;
        this.alive = true;
        this.deathTimer = 0; // Frames remaining in death animation (0 = not dying)

        // Fuel: drains with distance driven (game.js), refilled by destroying a base
        this.fuel = CONFIG.fuel.capacity;
        this.maxFuel = CONFIG.fuel.capacity;

        // Timed pickup effects: frames remaining for each (0 = inactive)
        this.effects = { rapid: 0, spread: 0, shield: 0 };
        this.shieldFlash = 0;
        this.recoil = 0;                     // px the barrel is currently kicked back
        this.demoAmmo = 0;                   // demolition shells carried

        // Invincibility after being hit (prevent instant multi-hit death)
        this.invincibleFrames = 0; // frames of invincibility remaining

        // Flash effect when invincible
        this.flashTimer = 0;
        this.flashInterval = 6; // frames per flash tick

        // Color
        this.bodyColor = '#4488ff';
        this.turretColor = '#2266dd';
    }

    /**
     * Update tank position based on input and maze collision.
     * Uses axis-separated (AABB) movement: X first, then Y, so the tank
     * slides smoothly along walls instead of snagging when moving diagonally.
     * @param {object} input - InputHandler instance
     * @param {Array} grid - Maze grid
     * @param {number} scale - Delta-time scale (1.0 = 60fps baseline)
     */
    update(input, grid, scale = 1) {
        this.vx = 0;
        this.vy = 0;
        if (!this.alive) return;

        const startX = this.x;
        const startY = this.y;
        const dir = input.getDirection();

        // Cap the input at length 1 so diagonals are not faster. Shorter vectors
        // (a partly tilted analog stick) are kept, so the tank can drive slowly.
        if (dir.x !== 0 || dir.y !== 0) {
            const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
            if (len > 1) {
                dir.x /= len;
                dir.y /= len;
            }

            // Rotate tank body to face movement direction
            this.angle = Math.atan2(dir.y, dir.x);
        }

        // --- Axis-separated collision with sub-stepping to prevent wall tunneling ---
        // X pass (sub-step at most 2px per iteration)
        if (dir.x !== 0) {
            let xRemaining = dir.x * this.speed * scale;
            const maxStep = 2;
            while (Math.abs(xRemaining) > 0.1) {
                const step = Math.sign(xRemaining) * Math.min(Math.abs(xRemaining), maxStep);
                const testX = this.x + step;
                if (!this.collidesWithWall(testX, this.y, grid, 'x')) {
                    this.x = testX;
                    xRemaining -= step;
                } else {
                    break;
                }
            }
        }

        // Y pass (sub-step at most 2px per iteration)
        if (dir.y !== 0) {
            let yRemaining = dir.y * this.speed * scale;
            const maxStep = 2;
            while (Math.abs(yRemaining) > 0.1) {
                const step = Math.sign(yRemaining) * Math.min(Math.abs(yRemaining), maxStep);
                const testY = this.y + step;
                if (!this.collidesWithWall(this.x, testY, grid, 'y')) {
                    this.y = testY;
                    yRemaining -= step;
                } else {
                    break;
                }
            }
        }

        // Clamp to world boundaries so the tank never moves outside the map
        const halfW = this.width / 2;
        const halfH = this.height / 2;
        const worldW = COLS * TILE_SIZE;
        const worldH = ROWS * TILE_SIZE;
        this.x = Math.max(halfW, Math.min(this.x, worldW - halfW));
        this.y = Math.max(halfH, Math.min(this.y, worldH - halfH));

        // Velocity in px per baseline frame, for enemies that lead their shots
        this.vx = (this.x - startX) / scale;
        this.vy = (this.y - startY) / scale;
    }

    /**
     * True if moving to (x, y) along `axis` would push the tank's leading edge
     * into a wall. Only the leading edge is tested so the tank slides along
     * walls instead of snagging on them.
     */
    collidesWithWall(x, y, grid, axis) {
        const dir = axis === 'x' ? x - this.x : y - this.y;
        return leadingEdgeHitsWall(grid, x, y, TANK_HALF, axis, dir);
    }

    /** True while the tank cannot be damaged (after a hit or at level start) */
    get invincible() {
        return this.invincibleFrames > 0;
    }

    grantInvincibility(frames) {
        this.invincibleFrames = frames;
        this.flashTimer = 0;
    }

    /**
     * Take damage from a bullet, a ram or a blast.
     * @param {number} amount - Damage to deal
     * @returns {boolean} true if the damage landed (false if shielded or invincible)
     */
    takeDamage(amount) {
        if (this.invincible || !this.alive || DEBUG.god) return false;
        if (this.effects.shield > 0) {
            this.shieldFlash = 8; // the shield lights up where it soaks a hit
            return false;
        }

        this.health = Math.max(0, this.health - amount);

        if (this.health <= 0) {
            this.alive = false;
            this.deathTimer = 30; // 30 frames of death animation (~500ms)
        } else {
            this.grantInvincibility(CONFIG.player.hitInvincibility);
        }
        return true;
    }

    /**
     * Count down timed pickup effects.
     * @returns {string[]} effects that ran out this frame
     */
    tickEffects(scale = 1) {
        const expired = [];
        for (const name of Object.keys(this.effects)) {
            if (this.effects[name] <= 0) continue;
            this.effects[name] -= scale;
            if (this.effects[name] <= 0) {
                this.effects[name] = 0;
                expired.push(name);
            }
        }
        if (this.shieldFlash > 0) this.shieldFlash -= scale;
        return expired;
    }

    clearEffects() {
        for (const name of Object.keys(this.effects)) this.effects[name] = 0;
        this.demoAmmo = 0;
    }

    /** Lose this tank outright (out of fuel), whatever its health or invincibility */
    destroy() {
        if (!this.alive) return;
        this.health = 0;
        this.alive = false;
        this.deathTimer = 30;
    }

    /**
     * Count down invincibility - call each frame. Frame-based, so it freezes with the game on pause.
     * @param {number} scale - Delta-time scale (1.0 = 60fps baseline)
     */
    updateInvincibility(scale = 1) {
        if (this.invincibleFrames > 0) {
            this.invincibleFrames = Math.max(0, this.invincibleFrames - scale);
        }
        this.flashTimer += scale;
    }

    /**
     * Draw the tank to the canvas (world coordinates)
     * @param {CanvasRenderingContext2D} ctx
     * @param {boolean} isActive - Highlight if this is the active tank
     */
    draw(ctx, isActive = true) {
        // If dead and death animation is playing, draw crumbling shards
        if (!this.alive && this.deathTimer > 0) {
            this._drawDeathAnimation(ctx);
            return;
        }

        // If dead and no death animation, don't draw at all
        if (!this.alive) return;

        // Don't draw during flash off-cycles (invincibility visual effect)
        if (this.invincible && Math.floor(this.flashTimer / this.flashInterval) % 2 === 0) {
            return;
        }

        ctx.save();
        ctx.translate(this.x, this.y);

        // Shield bubble: steady while it lasts, blinking through its last 1.5s
        const shield = this.effects.shield;
        if (shield > 0 && (shield > 90 || Math.floor(shield / 6) % 2 === 0)) {
            const hit = this.shieldFlash > 0;
            ctx.fillStyle = hit ? 'rgba(220, 200, 255, 0.35)' : 'rgba(179, 136, 255, 0.14)';
            ctx.strokeStyle = hit ? '#ffffff' : '#b388ff';
            ctx.lineWidth = hit ? 3 : 2;
            ctx.beginPath();
            ctx.arc(0, 0, this.width / 2 + 11, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }

        // Boost: exhaust flare behind the hull
        if (this.boosting) {
            ctx.save();
            ctx.rotate(this.angle);
            const len = 12 + Math.random() * 10;
            ctx.fillStyle = 'rgba(255, 150, 40, 0.85)';
            ctx.beginPath();
            ctx.moveTo(-this.width / 2, -8);
            ctx.lineTo(-this.width / 2 - len, 0);
            ctx.lineTo(-this.width / 2, 8);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'rgba(255, 240, 180, 0.9)';
            ctx.beginPath();
            ctx.moveTo(-this.width / 2, -4);
            ctx.lineTo(-this.width / 2 - len * 0.5, 0);
            ctx.lineTo(-this.width / 2, 4);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        // Active indicator ring
        if (isActive) {
            ctx.strokeStyle = '#00ff41';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, this.width / 2 + 4, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Tank body (rectangle)
        ctx.fillStyle = this.bodyColor;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);

        // Body outline
        ctx.strokeStyle = '#1a4488';
        ctx.lineWidth = 2;
        ctx.strokeRect(-this.width / 2, -this.height / 2, this.width, this.height);

        // Tracks (left and right stripes)
        ctx.fillStyle = '#3366bb';
        ctx.fillRect(-this.width / 2, -this.height / 2, 6, this.height);
        ctx.fillRect(this.width / 2 - 6, -this.height / 2, 6, this.height);

        // Turret base (circle in center)
        ctx.fillStyle = this.turretColor;
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#1a4488';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Turret barrel (line in turret aim direction, independent of body)
        const barrelLen = 18;
        const barrelWidth = 4;
        ctx.save();
        ctx.rotate(this.turretAngle);
        ctx.fillStyle = this.turretColor;
        ctx.fillRect(-this.recoil, -barrelWidth / 2, barrelLen, barrelWidth);
        ctx.strokeStyle = '#1a4488';
        ctx.lineWidth = 1;
        ctx.strokeRect(-this.recoil, -barrelWidth / 2, barrelLen, barrelWidth);
        ctx.restore();

        ctx.restore();
    }

    /**
     * Draw death animation — 4 fragmenting shards flying outward with fade
     */
    _drawDeathAnimation(ctx) {
        const progress = 1 - (this.deathTimer / 30); // 0 at start, 1 at end
        const alpha = Math.max(0, 1 - progress);

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.globalAlpha = alpha;

        // 4 shards that fly outward from center
        const shardPositions = [
            { angle: -Math.PI / 4, dist: progress * 20 },  // Top-left
            { angle: Math.PI / 4, dist: progress * 20 },   // Top-right
            { angle: 3 * Math.PI / 4, dist: progress * 20 }, // Bottom-left
            { angle: -3 * Math.PI / 4, dist: progress * 20 }, // Bottom-right
        ];

        // Color interpolation from tank blue to dark
        const r = Math.round(68 - (68 - 20) * progress);    // #4488ff → #141e3c
        const g = Math.round(136 - (136 - 30) * progress);
        const b = Math.round(255 - (255 - 60) * progress);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

        for (const shard of shardPositions) {
            const sx = Math.cos(shard.angle) * shard.dist;
            const sy = Math.sin(shard.angle) * shard.dist;
            // Each shard is a small rectangle that rotates as it flies
            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(shard.angle + progress * 2);
            ctx.fillRect(-4, -6, 8, 12);
            ctx.restore();
        }

        ctx.restore();
    }
}

export default Tank;
