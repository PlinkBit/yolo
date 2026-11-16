/**
 * YOLO - Enemy tanks
 * One class, six types. Stats come from ENEMY_TYPES in config.js; each type's
 * movement is one of the small behavior methods below.
 */

import { leadingEdgeHitsWall, TANK_HALF, TILE_SIZE, COLS, ROWS } from './maze.js';
import { hasLineOfSight } from './pathfinding.js';
import { CONFIG, ENEMY_TYPES } from './config.js';

const TURRET_TURN_SPEED = 0.08;   // radians per frame
const BODY_TURN_SPEED = 0.18;
const AIM_TOLERANCE = 0.2;        // radians off target at which an enemy will still fire
const SENSE_LIMIT = 600;          // px beyond which sight checks are skipped

function angleDiff(to, from) {
    let d = to - from;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
}

class EnemyTank {
    /**
     * @param {number} x - World X
     * @param {number} y - World Y
     * @param {object|null} homeBase - the Base that produced this enemy
     * @param {string} typeId - key of ENEMY_TYPES
     */
    constructor(x, y, homeBase = null, typeId = 'grunt') {
        this.typeId = typeId;
        this.type = ENEMY_TYPES[typeId];
        this.homeBase = homeBase;
        this.homeX = x;
        this.homeY = y;

        this.x = x;
        this.y = y;
        this.width = this.type.size;   // bullet hitbox
        this.height = this.type.size;
        this.bodyAngle = Math.random() * Math.PI * 2;
        this.turretAngle = this.bodyAngle;

        this.health = this.type.hp;
        this.maxHealth = this.type.hp;
        this.alive = true;
        this.deathTimer = 0;       // frames left of the death animation
        this.doomTimer = null;     // frames until self-destruct, set when the last base falls
        this.spawnFade = 0;        // frames left of the materialize fade-in
        this.hitFlash = 0;         // frames left of the white hit flash
        this.collisionCooldown = 0;

        // Senses
        this.alert = !!this.type.alwaysAlert;
        this.alertTimer = 0;
        this.canSeePlayer = false;

        // Movement
        this.wp = null;            // current flow-field waypoint { vx, vy, x, y }
        this.stuck = 0;            // frames without real progress
        this.patrolTarget = null;
        this.patrolWait = Math.random() * 60;
        this.patrolTime = 0;
        this.orbitDir = Math.random() < 0.5 ? 1 : -1;

        // Gun
        this.fireTimer = Math.random() * this.type.fireCooldown * 0.5;
        this.charging = 0;         // frames left before a charged shot goes off
        this.startedCharge = false; // one-shot flag for the charge sound
        this.burstLeft = 0;
        this.burstTimer = 0;

        // Sapper
        this.wantsDetonate = false;
        this.blink = 0;
    }

    /**
     * @param {object} env - { grid, player, nav, scale }
     * @returns {Array} shots to fire this frame: { angle, speed, damage, muzzle }
     */
    update(env) {
        if (!this.alive) return [];
        const { grid, player, scale } = env;
        const t = this.type;

        if (this.hitFlash > 0) this.hitFlash -= scale;
        if (this.spawnFade > 0) this.spawnFade -= scale;
        this.blink += scale * (this.alert ? 0.5 : 0.12);

        // --- Senses ---
        const dist = Math.hypot(player.x - this.x, player.y - this.y);
        this.canSeePlayer = player.alive && dist <= SENSE_LIMIT &&
            hasLineOfSight(grid, this.x, this.y, player.x, player.y, t.muzzle || 0);

        if (this.canSeePlayer && dist <= t.detectRange) {
            this.alertTimer = CONFIG.enemy.alertTimeout;
        } else if (this.alertTimer > 0) {
            this.alertTimer -= scale;
        }
        this.alert = player.alive && (!!t.alwaysAlert || this.alertTimer > 0);

        // --- Movement ---
        switch (t.behavior) {
            case 'chase': this._behaveChase(env, dist); break;
            case 'orbit': this._behaveOrbit(env, dist); break;
            case 'sapper': this._behaveSapper(env, dist); break;
            // 'static' never moves
        }

        return this._updateGun(env, dist);
    }

    // ----------------------------------------------------------------- behaviors

    /** Grunt, Heavy, Hunter: close in along the flow field, hold at standoff with a clear shot */
    _behaveChase(env, dist) {
        if (!this.alert) return this._patrol(env);

        if (this.canSeePlayer && dist <= this.type.standoff) {
            this.wp = null; // in position: stop and shoot
            return;
        }
        this._advance(env);
    }

    /** Scout: circle the player at orbitRadius, reversing when blocked */
    _behaveOrbit(env, dist) {
        if (!this.alert) return this._patrol(env);

        const t = this.type;
        if (!this.canSeePlayer || dist > t.orbitRadius + 80) {
            this._advance(env);
            return;
        }

        this.wp = null;
        const { player, grid, scale } = env;
        const fromPlayer = Math.atan2(this.y - player.y, this.x - player.x);
        const ahead = fromPlayer + this.orbitDir * 0.6;
        const tx = player.x + Math.cos(ahead) * t.orbitRadius;
        const ty = player.y + Math.sin(ahead) * t.orbitRadius;

        const moved = this._moveToward(tx, ty, t.alertSpeed, grid, scale);
        if (moved < t.alertSpeed * scale * 0.3) {
            this.stuck += scale;
            if (this.stuck > 20) {
                this.orbitDir = -this.orbitDir;
                this.stuck = 0;
            }
        } else {
            this.stuck = 0;
        }
    }

    /** Sapper: run at the player and blow up next to them */
    _behaveSapper(env, dist) {
        if (!this.alert) return this._patrol(env);

        if (this.canSeePlayer && dist <= this.type.blastRange) {
            this.wantsDetonate = true;
            return;
        }
        this._advance(env);
    }

    /**
     * Move toward the player: along the flow field, or straight at them when
     * the field has nothing more to offer and they are in sight.
     */
    _advance(env) {
        const { grid, player, nav, scale } = env;
        const speed = this.type.alertSpeed;
        if (this._followFlow(nav, speed, grid, scale)) return;
        if (this.canSeePlayer) this._moveToward(player.x, player.y, speed, grid, scale);
    }

    /**
     * Step vertex to vertex down the flow field.
     * @returns {boolean} false if there is no path from here
     */
    _followFlow(nav, speed, grid, scale) {
        if (this.wp && Math.hypot(this.wp.x - this.x, this.wp.y - this.y) < 1.5) {
            this.wp = nav.next(this.wp.vx, this.wp.vy);
            if (!this.wp) return false;
        }
        if (!this.wp) {
            // Get onto the vertex grid first
            this.wp = nav.nearestWalkable(this.x, this.y);
            if (!this.wp) return false;
        }
        if (nav.distanceAt(this.wp.vx, this.wp.vy) < 0) {
            this.wp = null;
            return false;
        }

        const moved = this._moveToward(this.wp.x, this.wp.y, speed, grid, scale);
        const expected = Math.min(speed * scale, Math.hypot(this.wp.x - this.x, this.wp.y - this.y) + moved);
        if (moved < expected * 0.3) {
            this.stuck += scale;
            if (this.stuck > 30) {
                this.wp = null; // shoved off course by another tank: re-acquire
                this.stuck = 0;
            }
        } else {
            this.stuck = 0;
        }
        return true;
    }

    /** Wander between random points near where this enemy spawned */
    _patrol(env) {
        const { grid, nav, scale } = env;
        this.wp = null;

        if (this.patrolWait > 0) {
            this.patrolWait -= scale;
            return;
        }

        if (!this.patrolTarget) {
            this.patrolTarget = nav.randomVertexNear(this.homeX, this.homeY, CONFIG.enemy.patrolRadius);
            this.patrolTime = 0;
            this.stuck = 0;
            if (!this.patrolTarget) {
                this.patrolWait = 30;
                return;
            }
        }

        const speed = this.type.patrolSpeed;
        const moved = this._moveToward(this.patrolTarget.x, this.patrolTarget.y, speed, grid, scale);
        this.patrolTime += scale;
        if (moved < speed * scale * 0.3) this.stuck += scale; else this.stuck = 0;

        const arrived = Math.hypot(this.patrolTarget.x - this.x, this.patrolTarget.y - this.y) < 2;
        if (arrived || this.stuck > 25 || this.patrolTime > 400) {
            this.patrolTarget = null;
            this.patrolWait = arrived ? 30 + Math.random() * 60 : 10;
        }
    }

    /**
     * Move up to speed*scale px toward a point with axis-separated, sub-stepped
     * wall collision (slides along walls). Turns the body to face the motion.
     * @returns {number} distance actually moved
     */
    _moveToward(tx, ty, speed, grid, scale) {
        const dx = tx - this.x;
        const dy = ty - this.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.01) return 0;

        const step = Math.min(speed * scale, d);
        const ox = this.x;
        const oy = this.y;
        this._axisMove('x', dx / d * step, grid);
        this._axisMove('y', dy / d * step, grid);

        const half = TANK_HALF;
        this.x = Math.max(half, Math.min(this.x, COLS * TILE_SIZE - half));
        this.y = Math.max(half, Math.min(this.y, ROWS * TILE_SIZE - half));

        const turn = angleDiff(Math.atan2(dy, dx), this.bodyAngle);
        const maxTurn = BODY_TURN_SPEED * scale;
        this.bodyAngle += Math.abs(turn) <= maxTurn ? turn : Math.sign(turn) * maxTurn;

        return Math.hypot(this.x - ox, this.y - oy);
    }

    _axisMove(axis, amount, grid) {
        let remaining = amount;
        while (Math.abs(remaining) > 0.01) {
            const step = Math.sign(remaining) * Math.min(Math.abs(remaining), 2);
            const nx = axis === 'x' ? this.x + step : this.x;
            const ny = axis === 'y' ? this.y + step : this.y;
            if (leadingEdgeHitsWall(grid, nx, ny, TANK_HALF, axis, step)) return;
            this.x = nx;
            this.y = ny;
            remaining -= step;
        }
    }

    // ----------------------------------------------------------------------- gun

    _updateGun(env, dist) {
        const { player, scale } = env;
        const t = this.type;
        const shots = [];

        // Finish a burst already under way
        if (this.burstLeft > 0) {
            this.burstTimer -= scale;
            if (this.burstTimer <= 0) {
                const index = t.burst - this.burstLeft;
                shots.push(this._shot(this.turretAngle + (index - (t.burst - 1) / 2) * t.burstSpread));
                this.burstLeft--;
                this.burstTimer = t.burstGap;
            }
        }

        if (!t.fireCooldown) return shots;
        this.fireTimer += scale;

        if (!this.canSeePlayer || dist > t.fireRange) {
            this.charging = 0;
            return shots;
        }

        // Track the target (leading it for the types that do)
        let aimX = player.x;
        let aimY = player.y;
        if (t.lead) {
            const flight = dist / t.bulletSpeed;
            aimX += (player.vx || 0) * flight;
            aimY += (player.vy || 0) * flight;
        }
        const diff = angleDiff(Math.atan2(aimY - this.y, aimX - this.x), this.turretAngle);
        const maxTurn = TURRET_TURN_SPEED * scale;
        this.turretAngle += Math.abs(diff) <= maxTurn ? diff : Math.sign(diff) * maxTurn;

        if (this.charging > 0) {
            this.charging -= scale;
            if (this.charging <= 0) this._pullTrigger(shots);
            return shots;
        }

        if (this.fireTimer >= t.fireCooldown * EnemyTank.fireFactor && Math.abs(diff) <= AIM_TOLERANCE && this.burstLeft === 0) {
            if (t.charge) {
                this.charging = t.charge;
                this.startedCharge = true;
            } else {
                this._pullTrigger(shots);
            }
        }
        return shots;
    }

    _pullTrigger(shots) {
        const t = this.type;
        this.fireTimer = 0;
        if (t.burst) {
            this.burstLeft = t.burst;
            this.burstTimer = 0; // first round leaves on the next frame
        } else {
            const error = t.aimError ? (Math.random() * 2 - 1) * t.aimError : 0;
            shots.push(this._shot(this.turretAngle + error));
        }
    }

    _shot(angle) {
        const t = this.type;
        return { angle, speed: t.bulletSpeed, damage: t.bulletDamage, muzzle: t.muzzle, breaksBrick: t.breaksBrick };
    }

    // -------------------------------------------------------------------- damage

    takeDamage(amount) {
        if (!this.alive) return;
        this.health = Math.max(0, this.health - amount);
        if (this.health <= 0) {
            this.alive = false;
            this.deathTimer = 30; // ~500ms death animation
        } else {
            this.hitFlash = 9;
            this.alertTimer = CONFIG.enemy.alertTimeout; // being shot wakes it up
        }
    }

    // ---------------------------------------------------------------------- draw

    draw(ctx) {
        if (!this.alive) {
            if (this.deathTimer > 0) this._drawDeathAnimation(ctx);
            return;
        }

        const t = this.type;
        const half = t.size / 2;
        const flashing = this.hitFlash > 0;
        const body = flashing ? '#ffffff' : t.body;
        const dark = flashing ? '#dddddd' : t.dark;

        // Turret aim line while charging a shot
        if (this.charging > 0) {
            const progress = 1 - this.charging / t.charge;
            ctx.strokeStyle = `rgba(255, 60, 40, ${0.25 + 0.6 * progress})`;
            ctx.lineWidth = 1 + progress;
            ctx.beginPath();
            ctx.moveTo(this.x + Math.cos(this.turretAngle) * t.muzzle, this.y + Math.sin(this.turretAngle) * t.muzzle);
            ctx.lineTo(this.x + Math.cos(this.turretAngle) * t.fireRange, this.y + Math.sin(this.turretAngle) * t.fireRange);
            ctx.stroke();
        }

        ctx.save();
        ctx.translate(this.x, this.y);
        if (this.spawnFade > 0) {
            ctx.globalAlpha = Math.max(0.15, 1 - this.spawnFade / CONFIG.enemy.spawnFade);
        }

        // --- Hull ---
        if (t.immobile) {
            // Turret emplacement: fixed round mount
            ctx.fillStyle = body;
            ctx.beginPath();
            ctx.arc(0, 0, half - 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#2c2f36';
            ctx.lineWidth = 3;
            ctx.stroke();
        } else {
            ctx.save();
            ctx.rotate(this.bodyAngle); // +x is forward; tracks run along the sides
            ctx.fillStyle = body;
            ctx.fillRect(-half, -half, t.size, t.size);
            ctx.fillStyle = dark;
            ctx.fillRect(-half, -half, t.size, 5);
            ctx.fillRect(-half, half - 5, t.size, 5);
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.lineWidth = 2;
            ctx.strokeRect(-half, -half, t.size, t.size);
            // Nose marker so facing is readable
            ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.fillRect(half - 5, -half + 6, 3, t.size - 12);
            ctx.restore();
        }

        // --- Type-specific top ---
        if (t.behavior === 'sapper') {
            // No gun: a warning light that blinks faster once it has seen you
            const on = Math.floor(this.blink) % 2 === 0;
            ctx.fillStyle = on ? '#ffffff' : '#7a1f00';
            ctx.beginPath();
            ctx.arc(0, 0, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            ctx.stroke();
        } else {
            ctx.fillStyle = dark;
            ctx.beginPath();
            ctx.arc(0, 0, t.size * 0.25, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.save();
            ctx.rotate(this.turretAngle);
            ctx.translate(-(this.recoil || 0), 0); // barrel kicks back after a shot
            ctx.fillStyle = dark;
            const len = t.immobile ? 26 : half + 2;
            if (t.burst) {
                // Heavy: twin barrels
                ctx.fillRect(0, -6, len, 4);
                ctx.fillRect(0, 2, len, 4);
            } else {
                const w = t.immobile ? 6 : 4;
                ctx.fillRect(0, -w / 2, len, w);
                ctx.strokeRect(0, -w / 2, len, w);
            }
            ctx.restore();

            if (t.alwaysAlert) {
                // Hunter: antenna
                ctx.strokeStyle = '#d5f5e3';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(-4, 4);
                ctx.lineTo(-10, -half - 4);
                ctx.stroke();
                ctx.fillStyle = '#d5f5e3';
                ctx.fillRect(-12, -half - 6, 4, 4);
            }
        }

        // Alert indicator
        if (this.alert && !t.alwaysAlert) {
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 14px Courier New';
            ctx.textAlign = 'center';
            ctx.fillText('!', 0, -half - 8);
        }

        ctx.restore();
    }

    /** Four shards flying outward and fading */
    _drawDeathAnimation(ctx) {
        const progress = 1 - (this.deathTimer / 30);

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.globalAlpha = Math.max(0, 1 - progress);
        ctx.fillStyle = this.type.body;

        for (const angle of [-Math.PI / 4, Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4]) {
            ctx.save();
            ctx.translate(Math.cos(angle) * progress * 20, Math.sin(angle) * progress * 20);
            ctx.rotate(angle + progress * 2);
            ctx.fillRect(-4, -6, 8, 12);
            ctx.restore();
        }

        ctx.restore();
    }
}

// Multiplies every enemy's fire cooldown; game.js lowers it in the deep sectors (CONFIG.deep)
EnemyTank.fireFactor = 1;

export default EnemyTank;
