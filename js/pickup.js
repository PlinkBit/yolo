/**
 * YOLO - Pickups
 * Dropped by destroyed enemies (and then short-lived) or tucked into maze
 * alcoves at level start (and then permanent). Drive over one to collect it.
 */

import { CONFIG, PICKUP_TYPES } from './config.js';

/**
 * Draw a pickup's symbol centered on (x, y). Shared by the world sprite and
 * the HUD's active-effect icons.
 */
export function drawPickupIcon(ctx, type, x, y, size, color) {
    const s = size / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1.5, size / 8);
    ctx.lineCap = 'round';
    ctx.beginPath();

    switch (type) {
        case 'fuel': // jerry can
            ctx.fillRect(-s * 0.55, -s * 0.45, s * 1.1, s * 1.15);
            ctx.fillRect(-s * 0.15, -s * 0.8, s * 0.6, s * 0.3);
            break;
        case 'repair': // cross
            ctx.fillRect(-s * 0.22, -s * 0.75, s * 0.44, s * 1.5);
            ctx.fillRect(-s * 0.75, -s * 0.22, s * 1.5, s * 0.44);
            break;
        case 'rapid': // double chevron
            for (const dx of [-s * 0.45, s * 0.15]) {
                ctx.moveTo(dx - s * 0.2, -s * 0.6);
                ctx.lineTo(dx + s * 0.35, 0);
                ctx.lineTo(dx - s * 0.2, s * 0.6);
            }
            ctx.stroke();
            break;
        case 'spread': // three diverging shots
            for (const a of [-0.55, 0, 0.55]) {
                ctx.moveTo(-s * 0.6, 0);
                ctx.lineTo(-s * 0.6 + Math.cos(a) * s * 1.3, Math.sin(a) * s * 1.3);
            }
            ctx.stroke();
            break;
        case 'demo': // starburst
            for (let i = 0; i < 8; i++) {
                const a = i * Math.PI / 4;
                const r = i % 2 === 0 ? s * 0.85 : s * 0.5;
                ctx.moveTo(Math.cos(a) * s * 0.2, Math.sin(a) * s * 0.2);
                ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.stroke();
            break;
        case 'shield': // ring
            ctx.arc(0, 0, s * 0.65, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2);
            ctx.fill();
            break;
    }
    ctx.restore();
}

class Pickup {
    /**
     * @param {number} life - frames until it vanishes; Infinity for a permanent one
     */
    constructor(x, y, type, life) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.life = life;
        this.age = Math.random() * 100; // offsets the bobbing so pickups do not pulse in step
    }

    draw(ctx) {
        // Blink through the last seconds of a dropped pickup's life
        if (this.life < CONFIG.pickups.blinkAt && Math.floor(this.life / 8) % 2 === 0) return;

        const def = PICKUP_TYPES[this.type];
        const pulse = 0.5 + 0.5 * Math.sin(this.age * 0.08);
        const half = 11;

        ctx.fillStyle = def.color;
        ctx.globalAlpha = 0.12 + 0.12 * pulse;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 19 + 3 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.fillStyle = '#10101c';
        ctx.fillRect(this.x - half, this.y - half, half * 2, half * 2);
        ctx.strokeStyle = def.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x - half, this.y - half, half * 2, half * 2);

        drawPickupIcon(ctx, this.type, this.x, this.y, 16, def.color);
    }
}

/**
 * Weighted random type. Fuel and repair are favored when the tank is short of
 * them and rare when it is full.
 * @param {object|null} player - omit for a neutral roll (maze pickups)
 */
function pickType(player) {
    const weights = {};
    for (const [type, def] of Object.entries(PICKUP_TYPES)) weights[type] = def.weight;

    if (player) {
        const fuel = player.fuel / player.maxFuel;
        const health = player.health / player.maxHealth;
        weights.fuel *= fuel < 0.35 ? 3 : fuel > 0.9 ? 0.3 : 1;
        weights.repair *= health < 0.5 ? 3 : health >= 1 ? 0.3 : 1;
    }

    let roll = Math.random() * Object.values(weights).reduce((a, b) => a + b, 0);
    for (const [type, w] of Object.entries(weights)) {
        roll -= w;
        if (roll < 0) return type;
    }
    return 'fuel';
}

class PickupManager {
    constructor() {
        this.items = [];
    }

    clear() {
        this.items = [];
    }

    /** A permanent pickup placed in the maze */
    place(x, y, type = pickType(null)) {
        this.items.push(new Pickup(x, y, type, Infinity));
    }

    /** A short-lived pickup left by a destroyed enemy */
    drop(x, y, type) {
        this.items.push(new Pickup(x, y, type, CONFIG.pickups.dropLifetime));
    }

    /**
     * Roll for a drop from a destroyed enemy.
     * @returns {boolean} whether something dropped
     */
    rollDrop(enemy, player) {
        if (enemy.type.immobile) return false; // turrets sit on walls, out of reach
        const chance = enemy.type.dropChance !== undefined ? enemy.type.dropChance : CONFIG.pickups.dropChance;
        if (Math.random() >= chance) return false;
        this.drop(enemy.x, enemy.y, pickType(player));
        return true;
    }

    /**
     * Age the pickups and collect any the player is touching.
     * @returns {string[]} types collected this frame
     */
    update(scale, player) {
        const collected = [];
        for (const p of this.items) {
            p.age += scale;
            p.life -= scale;
            if (player.alive && Math.hypot(p.x - player.x, p.y - player.y) <= CONFIG.pickups.collectRadius) {
                collected.push(p.type);
                p.life = 0;
            }
        }
        this.items = this.items.filter(p => p.life > 0);
        return collected;
    }

    draw(ctx) {
        for (const p of this.items) p.draw(ctx);
    }
}

export { PickupManager };
