/**
 * YOLO - Small visual effects: tread marks, muzzle flashes, brick fragments.
 * Purely cosmetic; nothing here affects play.
 */

const MAX_TREADS = 500;
const TREAD_LIFE = 180;     // frames a tread mark takes to fade (3s)
const TREAD_SPACING = 9;    // px a tank travels between marks
const FLASH_LIFE = 5;       // frames a muzzle flash lasts
const MAX_FRAGMENTS = 300;

class EffectsManager {
    constructor() {
        this.clear();
    }

    clear() {
        this.treads = [];
        this.flashes = [];
        this.fragments = [];
        this.lastTread = new WeakMap(); // tank -> where it left its last mark
    }

    /**
     * Leave tread marks behind a moving tank. Call every frame per tank.
     * @param {number} angle - the hull's facing (radians)
     * @param {number} half - half the hull width (px)
     * @param {boolean} hot - scorched marks, left while boosting
     */
    trackTank(tank, angle, half, hot = false) {
        const last = this.lastTread.get(tank);
        if (!last) {
            this.lastTread.set(tank, { x: tank.x, y: tank.y });
            return;
        }
        const moved = Math.hypot(tank.x - last.x, tank.y - last.y);
        if (moved < TREAD_SPACING) return;
        last.x = tank.x;
        last.y = tank.y;
        if (moved > 60) return; // teleported (respawn, new level): no streak across the map

        this.treads.push({ x: tank.x, y: tank.y, angle, half: half - 3, life: TREAD_LIFE, hot });
        if (this.treads.length > MAX_TREADS) this.treads.shift();
    }

    addMuzzleFlash(x, y, angle, enemy = false) {
        this.flashes.push({ x, y, angle, life: FLASH_LIFE, enemy });
    }

    /** A burst of small fragments from a broken brick */
    addBrickFragments(x, y, color = '#8B4513') {
        for (let i = 0; i < 7 && this.fragments.length < MAX_FRAGMENTS; i++) {
            const a = Math.random() * Math.PI * 2;
            const speed = 0.8 + Math.random() * 2.4;
            this.fragments.push({
                x, y,
                vx: Math.cos(a) * speed,
                vy: Math.sin(a) * speed,
                size: 2 + Math.random() * 3,
                spin: Math.random() * Math.PI,
                life: 22 + Math.random() * 16,
                color,
            });
        }
    }

    update(scale = 1) {
        for (const t of this.treads) t.life -= scale;
        while (this.treads.length && this.treads[0].life <= 0) this.treads.shift();

        for (const f of this.flashes) f.life -= scale;
        this.flashes = this.flashes.filter(f => f.life > 0);

        const drag = Math.pow(0.9, scale);
        for (const p of this.fragments) {
            p.x += p.vx * scale;
            p.y += p.vy * scale;
            p.vx *= drag;
            p.vy *= drag;
            p.spin += 0.2 * scale;
            p.life -= scale;
        }
        this.fragments = this.fragments.filter(p => p.life > 0);
    }

    /** Ground layer: tread marks. Draw after the maze, before tanks. */
    drawGround(ctx, camera) {
        const x0 = camera.x - 30, x1 = camera.x + camera.width + 30;
        const y0 = camera.y - 30, y1 = camera.y + camera.height + 30;
        for (const t of this.treads) {
            if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
            ctx.save();
            ctx.translate(t.x, t.y);
            ctx.rotate(t.angle);
            const fade = t.life / TREAD_LIFE;
            ctx.fillStyle = t.hot ? `rgba(255, 150, 40, ${0.7 * fade})` : `rgba(70, 72, 96, ${0.5 * fade})`;
            ctx.fillRect(-2, -t.half - 2, 4, 5);
            ctx.fillRect(-2, t.half - 3, 4, 5);
            ctx.restore();
        }
    }

    /** Top layer: muzzle flashes and fragments. Draw after tanks and bullets. */
    drawTop(ctx) {
        for (const f of this.flashes) {
            const k = f.life / FLASH_LIFE; // 1 -> 0
            ctx.save();
            ctx.translate(f.x, f.y);
            ctx.rotate(f.angle);
            ctx.fillStyle = f.enemy ? `rgba(255, 150, 90, ${k})` : `rgba(255, 240, 150, ${k})`;
            ctx.beginPath();
            ctx.moveTo(-3, 0);
            ctx.lineTo(4, -6 * k - 2);
            ctx.lineTo(16 * k + 4, 0);
            ctx.lineTo(4, 6 * k + 2);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = `rgba(255, 255, 255, ${k})`;
            ctx.beginPath();
            ctx.arc(1, 0, 3.5 * k + 1, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        for (const p of this.fragments) {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.spin);
            ctx.globalAlpha = Math.min(1, p.life / 12);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();
        }
    }
}

export { EffectsManager };
