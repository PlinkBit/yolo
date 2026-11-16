/**
 * YOLO - Touch controls (phones and tablets)
 *
 * Twin floating sticks: a thumb anywhere on the left half of the screen drives,
 * a thumb anywhere on the right half aims and fires. Each stick appears where
 * the thumb lands. Pushing the left stick past its outer ring engages boost.
 * Two HTML buttons: demolition shell and pause.
 *
 * Fingers are tracked on the window by pointer id, so both thumbs and a button
 * press can be down at once. The sticks are HTML elements (see #touch-ui in
 * index.html) so they stay sharp and can sit outside the canvas, in the bars
 * beside the picture on wide phones.
 *
 * Results are written straight into the InputHandler's _touch* fields, the same
 * way the gamepad poll fills its _pad* fields.
 */

import { CONFIG } from './config.js';

export class TouchControls {
    constructor(input) {
        this.input = input;
        this.enabled = false;   // true once a finger has touched the screen
        this.playing = false;   // sticks only work while the game is in play
        this.move = null;       // { id, ox, oy } while the driving thumb is down
        this.aim = null;        // same for the aiming thumb

        this.canvas = document.getElementById('gameCanvas');
        this.moveEl = document.getElementById('stick-move');
        this.aimEl = document.getElementById('stick-aim');
        this.shellBtn = document.getElementById('btn-shell');
        this.pauseBtn = document.getElementById('btn-pause');
        this.shellCount = document.getElementById('shell-count');
        if (!this.moveEl || !this.aimEl) return; // page without the touch markup

        const opts = { passive: false };
        window.addEventListener('pointerdown', (e) => this._down(e), opts);
        window.addEventListener('pointermove', (e) => this._moveEvent(e), opts);
        window.addEventListener('pointerup', (e) => this._up(e), opts);
        window.addEventListener('pointercancel', (e) => this._up(e), opts);

        // Stop the browser turning touches into scrolling, zooming, text selection
        // or follow-up mouse events. Pointer events still arrive.
        document.addEventListener('touchstart', (e) => e.preventDefault(), opts);
        document.addEventListener('touchmove', (e) => e.preventDefault(), opts);
        document.addEventListener('gesturestart', (e) => e.preventDefault(), opts); // iOS pinch

        this._bindButton(this.pauseBtn, () => { input.pauseToggled = true; }, null);
        this._bindButton(this.shellBtn, () => { input._touchDemo = true; }, () => { input._touchDemo = false; });
    }

    _bindButton(el, onDown, onUp) {
        if (!el) return;
        el.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            this._noteTouch(e);
            el.classList.add('down');
            onDown();
        });
        const release = () => {
            el.classList.remove('down');
            if (onUp) onUp();
        };
        el.addEventListener('pointerup', release);
        el.addEventListener('pointercancel', release);
        el.addEventListener('pointerleave', release);
    }

    /** Record that touch is in use; reveal the touch UI on the first one. */
    _noteTouch(e) {
        if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return false;
        this.input.lastDevice = 'touch';
        this.input.lastTouchTime = performance.now();
        if (!this.enabled) {
            this.enabled = true;
            document.body.classList.add('touch');
            document.body.classList.toggle('touch-playing', this.playing);
        }
        return true;
    }

    /** Screen point -> the game's logical 800x600 coordinates */
    _toLogical(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (CONFIG.view.width / rect.width),
            y: (e.clientY - rect.top) * (CONFIG.view.height / rect.height),
        };
    }

    _down(e) {
        const onButton = e.target && e.target.closest && e.target.closest('.touch-btn');
        if (onButton) return; // the button's own handler deals with it

        // Any press (finger or mouse) may be a tap on a menu item; game.js checks it against the HUD's hit areas
        this.input.tap = this._toLogical(e);

        if (!this._noteTouch(e)) return;
        e.preventDefault();
        if (!this.playing) return;

        const left = e.clientX < window.innerWidth / 2;
        if (left && !this.move) {
            this.move = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
            this._show(this.moveEl, this.move, 0, 0);
            this._hideHint('hint-move');
        } else if (!left && !this.aim) {
            this.aim = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
            this.input.aimSource = 'touch';
            this._show(this.aimEl, this.aim, 0, 0);
            this._hideHint('hint-aim');
        }
    }

    _moveEvent(e) {
        const cfg = CONFIG.touch;
        const input = this.input;

        if (this.move && e.pointerId === this.move.id) {
            e.preventDefault();
            let dx = e.clientX - this.move.ox;
            let dy = e.clientY - this.move.oy;
            let d = Math.hypot(dx, dy);

            // A thumb that travels far drags the stick's center along, so reversing direction is quick
            const maxReach = cfg.stickRadius * cfg.followAt;
            if (d > maxReach) {
                this.move.ox += dx / d * (d - maxReach);
                this.move.oy += dy / d * (d - maxReach);
                dx = e.clientX - this.move.ox;
                dy = e.clientY - this.move.oy;
                d = maxReach;
            }

            if (d > cfg.moveDeadzone) {
                const mag = Math.min(1, (d - cfg.moveDeadzone) / (cfg.stickRadius - cfg.moveDeadzone));
                input._touchX = dx / d * mag;
                input._touchY = dy / d * mag;
            } else {
                input._touchX = 0;
                input._touchY = 0;
            }
            input._touchBoost = d > cfg.stickRadius * cfg.boostAt;
            this.moveEl.classList.toggle('boost', input._touchBoost);
            this._show(this.moveEl, this.move, dx, dy);
            input.lastTouchTime = performance.now();

        } else if (this.aim && e.pointerId === this.aim.id) {
            e.preventDefault();
            const dx = e.clientX - this.aim.ox;
            const dy = e.clientY - this.aim.oy;
            const d = Math.hypot(dx, dy);
            if (d > cfg.aimDeadzone) {
                input._touchAiming = true;
                input._touchAngle = Math.atan2(dy, dx);
                input._touchFire = true;   // auto-fire while aiming
                input.aimSource = 'touch';
            }
            // Clamp the knob to the ring
            const k = d > cfg.stickRadius ? cfg.stickRadius / d : 1;
            this._show(this.aimEl, this.aim, dx * k, dy * k);
            input.lastTouchTime = performance.now();
        }
    }

    _up(e) {
        if (this.move && e.pointerId === this.move.id) this._releaseMove();
        if (this.aim && e.pointerId === this.aim.id) this._releaseAim();

        // Lifting a finger from a menu is the moment browsers accept a fullscreen request
        if ((e.pointerType === 'touch' || e.pointerType === 'pen') && !this.playing) this._goFullscreen();
    }

    /**
     * Ask for fullscreen and landscape. Each browser supports a different
     * subset (iPhone Safari supports neither); refusals are expected and ignored.
     */
    _goFullscreen() {
        const doc = document;
        if (doc.fullscreenElement || doc.webkitFullscreenElement) return;
        if (window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches) return; // launched from the home screen
        const root = doc.documentElement;
        const request = root.requestFullscreen || root.webkitRequestFullscreen;
        if (!request) return;
        try {
            const result = request.call(root, { navigationUI: 'hide' });
            const lock = () => {
                if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
            };
            if (result && result.then) result.then(lock).catch(() => {});
            else lock();
        } catch (err) { /* not allowed here; play on in the browser window */ }
    }

    /** Keep the screen from dimming during play (where the browser allows it). */
    async _holdWakeLock(hold) {
        try {
            if (hold && !this._wakeLock && navigator.wakeLock) {
                this._wakeLock = await navigator.wakeLock.request('screen');
                this._wakeLock.addEventListener('release', () => { this._wakeLock = null; });
            } else if (!hold && this._wakeLock) {
                await this._wakeLock.release();
            }
        } catch (err) { /* unsupported or refused: harmless */ }
    }

    /** Short vibration for feedback (Android; iOS has no web vibration). */
    buzz(ms) {
        if (this.enabled && navigator.vibrate) {
            try { navigator.vibrate(ms); } catch (err) { /* ignore */ }
        }
    }

    _releaseMove() {
        this.move = null;
        this.input._touchX = 0;
        this.input._touchY = 0;
        this.input._touchBoost = false;
        this.moveEl.classList.remove('active', 'boost');
    }

    _releaseAim() {
        this.aim = null;
        this.input._touchAiming = false; // the turret keeps its last angle
        this.input._touchFire = false;
        this.aimEl.classList.remove('active');
    }

    /** Place a stick at its origin with the knob offset by (kx, ky) px. */
    _show(el, stick, kx, ky) {
        el.style.left = stick.ox + 'px';
        el.style.top = stick.oy + 'px';
        el.classList.add('active');
        el.firstElementChild.style.transform = `translate(${kx}px, ${ky}px)`;
    }

    _hideHint(id) {
        const el = document.getElementById(id);
        if (el) el.classList.add('used');
    }

    /**
     * Called by game.js every frame: sticks exist only while playing, and the
     * shell button shows the current count.
     */
    sync(playing, shells) {
        if (playing !== this.playing) {
            this.playing = playing;
            if (!playing) {
                this._releaseMove();
                this._releaseAim();
                this.input._touchDemo = false;
            }
            if (this.enabled) {
                document.body.classList.toggle('touch-playing', playing);
                this._holdWakeLock(playing);
            }
        }
        if (this.enabled && shells !== this._shells) {
            this._shells = shells;
            this.shellCount.textContent = shells > 0 ? 'x' + shells : '';
            this.shellBtn.classList.toggle('empty', shells <= 0);
        }
    }

    /** Lines for the ?debug=1 overlay */
    debugLines() {
        const i = this.input;
        return [
            `Touch: ${this.enabled ? 'on' : 'not used yet'}  playing=${this.playing}`,
            `move ${this.move ? 'down' : '-'} (${i._touchX.toFixed(2)}, ${i._touchY.toFixed(2)}) boost=${i._touchBoost}`,
            `aim ${this.aim ? 'down' : '-'} angle=${i._touchAngle.toFixed(2)} fire=${i._touchFire} shell=${i._touchDemo}`,
        ];
    }
}
