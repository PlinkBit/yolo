/**
 * YOLO - Bullet / Projectile System
 * Handles bullet physics, collision detection, and explosion effects
 */

import { TILE, TILE_SIZE, COLS, ROWS, pixelToGrid, isDestructible } from './maze.js';
import { CONFIG } from './config.js';
import sound from './sound.js';

class Bullet {
    /**
     * @param {number} x - World X position
     * @param {number} y - World Y position
     * @param {number} angle - Firing angle in radians (0 = right, -PI/2 = up)
     * @param {string} owner - 'player' or 'enemy'
     * @param {number} speed - px per frame
     * @param {number} damage - HP removed from a tank it hits
     */
    constructor(x, y, angle, owner = 'player', speed = CONFIG.bullet.speed, damage = CONFIG.bullet.damage) {
        this.x = x;
        this.y = y;
        this.owner = owner;

        this.speed = speed;
        this.damage = damage;
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;

        this.radius = 3;
        this.alive = true;

        // Trail effect (store recent positions)
        this.trail = [];
        this.maxTrailLength = 6;

        if (owner === 'enemy') {
            this.coreColor = '#FF6644';
            this.trailColor = [255, 100, 50];
        } else {
            this.coreColor = '#FFFF80';
            this.trailColor = [255, 200, 50];
        }
    }

    /**
     * Draw the bullet and its trail
     * @param {CanvasRenderingContext2D} ctx
     */
    draw(ctx) {
        if (!this.alive) return;
        const [r, g, b] = this.trailColor;

        for (let i = 0; i < this.trail.length; i++) {
            const t = this.trail[i];
            const alpha = (i + 1) / this.trail.length * 0.5;
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
            const trailRadius = this.radius * (i + 1) / this.trail.length * 0.7;
            ctx.beginPath();
            ctx.arc(t.x, t.y, trailRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = this.coreColor;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.6)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 2, 0, Math.PI * 2);
        ctx.stroke();
    }
}

class BulletManager {
    constructor() {
        this.bullets = [];
    }

    /**
     * Fire a bullet from the tank's barrel tip. Player and enemy bullets have
     * separate caps, so enemy fire can never stop the player from shooting.
     * @param {object} tank - Tank with x, y, turretAngle
     * @param {string} owner - 'player' or 'enemy'
     * @param {number} speed - px per frame
     * @param {number} damage - HP removed from a tank it hits
     */
    fire(tank, owner = 'player', opts = {}) {
        if (!tank.alive) return null;
        const cap = owner === 'player' ? CONFIG.bullet.maxPlayer : CONFIG.bullet.maxEnemy;
        let active = 0;
        for (const b of this.bullets) {
            if (b.owner === owner) active++;
        }
        if (active >= cap) return null;

        if (!opts.silent) sound.playFire();

        const fireAngle = opts.angle !== undefined ? opts.angle : tank.turretAngle;
        const barrelLen = opts.muzzle || 22; // barrel length + tip offset
        const startX = tank.x + Math.cos(fireAngle) * barrelLen;
        const startY = tank.y + Math.sin(fireAngle) * barrelLen;

        const bullet = new Bullet(startX, startY, fireAngle, owner, opts.speed, opts.damage);
        bullet.breaksBrick = !!opts.breaksBrick; // enemy shells heavy enough to knock out brick
        bullet.shooter = tank;                   // so crossfire never hits the tank that fired
        if (opts.demo) {
            bullet.demo = true;                  // explodes on impact; game.js resolves the blast
            bullet.radius = 5;
            bullet.coreColor = '#ffb347';
            bullet.trailColor = [255, 140, 20];
            bullet.maxTrailLength = 10;
        }
        this.bullets.push(bullet);
        return bullet;
    }

    _bulletHitsTank(bullet, tank) {
        if (!tank.alive) return false;
        const halfW = tank.width / 2;
        const halfH = tank.height / 2;
        return (
            bullet.x >= tank.x - halfW &&
            bullet.x <= tank.x + halfW &&
            bullet.y >= tank.y - halfH &&
            bullet.y <= tank.y + halfH
        );
    }

    /**
     * Advance all bullets. Each bullet moves in sub-steps of at most
     * CONFIG.bullet.maxStep px and is tested against tanks and tiles at every
     * step, so it cannot tunnel through a wall or a tank after a long frame.
     *
     * Tiles are not modified here; the caller applies damage for each tile hit.
     *
     * @returns {{ tileHits: Array, playerHits: Array, enemyHits: Array, blasts: Array }}
     *   enemyHits: { bullet, target, crossfire } - crossfire is true when an enemy shell hit another enemy
     *   blasts: { x, y } where a demolition shell went off
     *   tileHits: { bullet, gridX, gridY } for player bullets striking a destructible tile
     */
    update(grid, playerTank = null, enemyTanks = null, scale = 1) {
        const tileHits = [];
        const playerHits = [];
        const enemyHits = [];
        const blasts = [];

        for (const bullet of this.bullets) {
            bullet.trail.push({ x: bullet.x, y: bullet.y });
            if (bullet.trail.length > bullet.maxTrailLength) bullet.trail.shift();

            const distance = bullet.speed * scale;
            const steps = Math.max(1, Math.ceil(distance / CONFIG.bullet.maxStep));
            const stepX = bullet.vx * scale / steps;
            const stepY = bullet.vy * scale / steps;

            for (let s = 0; s < steps && bullet.alive; s++) {
                // Tanks first, at the bullet's current position
                if (bullet.owner === 'enemy') {
                    if (playerTank && !playerTank.invincible && this._bulletHitsTank(bullet, playerTank)) {
                        bullet.alive = false;
                        playerHits.push({ bullet, target: playerTank });
                        break;
                    }
                }
                if (enemyTanks) {
                    // Player shells hit any enemy; enemy shells hit any enemy but the one that fired (crossfire)
                    for (const enemy of enemyTanks) {
                        if (enemy !== bullet.shooter && this._bulletHitsTank(bullet, enemy)) {
                            bullet.alive = false;
                            if (bullet.demo) blasts.push({ x: bullet.x, y: bullet.y });
                            else enemyHits.push({ bullet, target: enemy, crossfire: bullet.owner === 'enemy' });
                            break;
                        }
                    }
                    if (!bullet.alive) break;
                }

                const newX = bullet.x + stepX;
                const newY = bullet.y + stepY;

                if (newX < 0 || newX >= COLS * TILE_SIZE || newY < 0 || newY >= ROWS * TILE_SIZE) {
                    bullet.alive = false;
                    if (bullet.demo) blasts.push({ x: bullet.x, y: bullet.y });
                    break;
                }

                // Wall-mounted turrets sit on concrete, so they are tested at the
                // new position, before the wall underneath them stops the bullet
                if (enemyTanks) {
                    for (const enemy of enemyTanks) {
                        if (enemy !== bullet.shooter && enemy.alive && enemy.type && enemy.type.immobile &&
                            Math.abs(newX - enemy.x) <= enemy.width / 2 &&
                            Math.abs(newY - enemy.y) <= enemy.height / 2) {
                            bullet.alive = false;
                            bullet.x = newX;
                            bullet.y = newY;
                            if (bullet.demo) blasts.push({ x: newX, y: newY });
                            else enemyHits.push({ bullet, target: enemy, crossfire: bullet.owner === 'enemy' });
                            break;
                        }
                    }
                    if (!bullet.alive) break;
                }

                const { x: gx, y: gy } = pixelToGrid(newX, newY);
                const tile = grid[gy][gx];

                // A demolition shell goes off against the first solid thing it meets
                if (bullet.demo && tile !== TILE.EMPTY) {
                    bullet.alive = false;
                    blasts.push({ x: newX, y: newY });
                    break;
                }

                if (tile === TILE.CONCRETE) {
                    bullet.alive = false;
                    break;
                }

                if (isDestructible(grid, gx, gy)) {
                    bullet.alive = false;
                    // Enemy fire is absorbed by walls, except heavy shells, which break
                    // brick. Only the player can damage a reactor.
                    if (bullet.owner === 'player' || (bullet.breaksBrick && tile !== TILE.REACTOR)) {
                        tileHits.push({ bullet, gridX: gx, gridY: gy });
                    }
                    break;
                }

                bullet.x = newX;
                bullet.y = newY;
            }
        }

        this.bullets = this.bullets.filter(b => b.alive);
        return { tileHits, playerHits, enemyHits, blasts };
    }

    draw(ctx) {
        for (const bullet of this.bullets) {
            bullet.draw(ctx);
        }
    }

    clear() {
        this.bullets = [];
    }
}

const PARTICLE_COLORS = [[255, 69, 0], [255, 215, 0]]; // orange, gold

/**
 * Explosion effect - expanding shockwave + particles
 */
class Explosion {
    /**
     * @param {number} x - Center world X
     * @param {number} y - Center world Y
     * @param {number} maxRadius - Max radius in pixels
     * @param {number} particleCount - Number of particles thrown outward
     */
    constructor(x, y, maxRadius = 160, particleCount = 40) {
        this.x = x;
        this.y = y;
        this.maxRadius = maxRadius;
        this.currentRadius = 0;
        this.speed = 4;
        this.alive = true;

        this.particles = [];
        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 3;
            const dist = Math.random() * maxRadius * 0.6;
            this.particles.push({
                x: x + Math.cos(angle) * dist,
                y: y + Math.sin(angle) * dist,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 2 + Math.random() * 4,
                life: 0.6 + Math.random() * 0.4,
                color: PARTICLE_COLORS[Math.random() > 0.5 ? 0 : 1],
            });
        }

        this.frame = 0;
        this.maxFrames = 60; // ~1 second at 60fps
    }

    update(scale = 1) {
        this.frame += scale;

        this.currentRadius = Math.min(this.maxRadius, this.currentRadius + this.speed * scale);

        const drag = Math.pow(0.96, scale);
        for (const p of this.particles) {
            p.x += p.vx * scale;
            p.y += p.vy * scale;
            p.vx *= drag;
            p.vy *= drag;
        }

        if (this.frame >= this.maxFrames) {
            this.alive = false;
        }
    }

    draw(ctx) {
        if (!this.alive) return;

        const progress = this.frame / this.maxFrames; // 0 to 1

        // Expanding shockwave ring (bright orange fading out)
        const alpha = Math.max(0, 1 - progress);
        ctx.strokeStyle = `rgba(255, 69, 0, ${alpha * 0.8})`;
        ctx.lineWidth = 4 * (1 - progress);
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.currentRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Inner flash ring (white-hot core that fades)
        const innerAlpha = Math.max(0, 1 - progress * 1.5);
        ctx.strokeStyle = `rgba(255, 255, 200, ${innerAlpha})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.currentRadius * 0.7, 0, Math.PI * 2);
        ctx.stroke();

        for (const p of this.particles) {
            const particleAlpha = Math.max(0, (1 - progress) * p.life);
            const [r, g, b] = p.color;
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${particleAlpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * (1 - progress * 0.5), 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

class ExplosionManager {
    constructor() {
        this.explosions = [];
    }

    /** Large blast for a base collapse */
    addBaseExplosion(x, y, radiusPx = 160) {
        this.explosions.push(new Explosion(x, y, radiusPx, 50));
    }

    /** Medium blast for a tank death or a reactor going up */
    addTankExplosion(x, y) {
        this.explosions.push(new Explosion(x, y, 45, 20));
    }

    /** Small puff for a bullet impact */
    addImpactExplosion(x, y) {
        this.explosions.push(new Explosion(x, y, 30, 10));
    }

    /** Tiny puff for a single brick blown out during a collapse */
    addDebris(x, y) {
        this.explosions.push(new Explosion(x, y, 18, 5));
    }

    update(scale = 1) {
        for (const exp of this.explosions) {
            exp.update(scale);
        }
        this.explosions = this.explosions.filter(e => e.alive);
    }

    draw(ctx) {
        for (const exp of this.explosions) {
            exp.draw(ctx);
        }
    }

    clear() {
        this.explosions = [];
    }
}

export { Bullet, BulletManager, ExplosionManager };
