/**
 * YOLO - Unified Input Handler
 * Keyboard + mouse and gamepad (twin-stick), exposed as one set of axes, buttons and one-shot flags.
 *
 * Gamepad layout (standard mapping):
 *   Left stick / D-pad  drive          Right stick  aim
 *   RT or RB            fire           Start        start / pause / confirm initials
 *   LB                  boost          LT           demolition shell
 *   A                   start, restart, accept      B  delete (initials), How to Play      Y  music
 *   X                   high scores (title screen)
 */

import { CONFIG } from './config.js';
import { TouchControls } from './touch.js';

// Standard-mapping button indices
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

class InputHandler {
    constructor() {
        // Normalized movement axes (-1 to 1), keyboard and left stick combined
        this.axisX = 0;
        this.axisY = 0;

        // Mouse position (canvas coordinates) and button
        this.mouseX = 0;
        this.mouseY = 0;
        this._mouseFire = false;
        this._mouseDemo = false;   // right button: demolition shell
        this._boostKey = false;    // Shift
        this._demoKey = false;     // Space

        // Touch (filled in by TouchControls)
        this._touchX = 0;
        this._touchY = 0;
        this._touchBoost = false;
        this._touchDemo = false;
        this._touchFire = false;
        this._touchAiming = false;
        this._touchAngle = 0;
        this.lastTouchTime = -Infinity; // performance.now() of the latest touch
        this.tap = null;                // one-shot: { x, y } in logical view coordinates of the latest press (finger or mouse)

        this._keyStates = { up: false, down: false, left: false, right: false };

        // One-shot flags, consumed by game.js
        this.enterPressed = false;
        this.musicToggled = false;
        this.pauseToggled = false;
        this.restartPressed = false;

        // Last key pressed (one-shot, for initials entry). Gamepad presses appear
        // here as 'PadUp', 'PadDown', 'PadLeft', 'PadRight', 'PadAccept', 'Backspace' or 'Enter'.
        this._lastKey = null;

        // Gamepad state
        this.lastDevice = 'kbm';   // 'kbm', 'pad' or 'touch': whichever was used most recently (drives HUD prompts)
        this.aimSource = 'mouse';  // 'mouse', 'pad' or 'touch': whichever aimed most recently
        this._padX = 0;
        this._padY = 0;
        this._padFire = false;
        this._padBoost = false;
        this._padDemo = false;
        this._stickAiming = false;
        this._stickAngle = 0;
        this._prev = {};           // previous frame's digital states, for edge detection
        this._pads = [];           // every connected controller the browser reports
        this._seen = {};           // last state signature per controller index
        this._activeIndex = null;  // index of the controller being read, once one has shown input
        this.padStatus = { count: 0, activeId: null, standard: false };

        this.keyMap = {
            'ArrowUp': 'up', 'ArrowDown': 'down', 'ArrowLeft': 'left', 'ArrowRight': 'right',
            'w': 'up', 'W': 'up',
            's': 'down', 'S': 'down',
            'a': 'left', 'A': 'left',
            'd': 'right', 'D': 'right',
        };

        this.bindEvents();
        this.touch = new TouchControls(this);
    }

    bindEvents() {
        const canvas = document.getElementById('gameCanvas');

        // Mouse position, remapped to native canvas coordinates (handles CSS scaling)
        // Phones follow a touch with imitation mouse events; ignore the mouse for a moment after any touch
        const fromTouch = () => performance.now() - this.lastTouchTime < 1000;

        window.addEventListener('mousemove', (e) => {
            if (fromTouch()) return;
            const rect = canvas.getBoundingClientRect();
            this.mouseX = (e.clientX - rect.left) * (CONFIG.view.width / rect.width);
            this.mouseY = (e.clientY - rect.top) * (CONFIG.view.height / rect.height);
            this.aimSource = 'mouse';
            this.lastDevice = 'kbm';
        });

        window.addEventListener('mousedown', (e) => {
            if (fromTouch()) return;
            if (e.button === 0) this._mouseFire = true;
            if (e.button === 2) this._mouseDemo = true;
            this.aimSource = 'mouse';
            this.lastDevice = 'kbm';
        });

        // Right button fires demolition shells, so no browser menu over the game
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) this._mouseFire = false;
            if (e.button === 2) this._mouseDemo = false;
        });

        window.addEventListener('keydown', (e) => {
            this._lastKey = e.key;
            if (e.key === 'Shift') this._boostKey = true;
            if (e.key === ' ') {
                this._demoKey = true;
                e.preventDefault(); // keep the page from scrolling
            }
            this.lastDevice = 'kbm';

            const direction = this.keyMap[e.key];
            if (direction) {
                this._keyStates[direction] = true;
                e.preventDefault();
            }
            if (e.key === 'Enter') {
                this.enterPressed = true;
                e.preventDefault();
            }
            if (e.key === 'm' || e.key === 'M') this.musicToggled = true;
            if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') this.pauseToggled = true;
            if (e.key === 'r' || e.key === 'R') this.restartPressed = true;
        });

        window.addEventListener('keyup', (e) => {
            const direction = this.keyMap[e.key];
            if (direction) this._keyStates[direction] = false;
            if (e.key === 'Shift') this._boostKey = false;
            if (e.key === ' ') this._demoKey = false;
        });
    }

    /**
     * Poll the gamepad. Call once per frame, before reading anything else.
     */
    update() {
        const pad = this._selectGamepad();
        if (!pad) {
            this._padX = 0;
            this._padY = 0;
            this._padFire = false;
            this._padBoost = false;
            this._padDemo = false;
            this._stickAiming = false;
            this._prev = {};
            return;
        }

        const cfg = CONFIG.gamepad;
        const pressed = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
        const value = (i) => (pad.buttons[i] ? pad.buttons[i].value : 0);
        let active = false;

        // --- Left stick: drive (radial dead zone, rescaled so speed ramps from zero) ---
        const lx = pad.axes[0] || 0;
        const ly = pad.axes[1] || 0;
        const lMag = Math.hypot(lx, ly);
        if (lMag > cfg.moveDeadzone) {
            const scaled = Math.min(1, (lMag - cfg.moveDeadzone) / (1 - cfg.moveDeadzone));
            this._padX = lx / lMag * scaled;
            this._padY = ly / lMag * scaled;
            active = true;
        } else {
            this._padX = 0;
            this._padY = 0;
        }

        // D-pad drives at full speed
        const dx = (pressed(BTN.RIGHT) ? 1 : 0) - (pressed(BTN.LEFT) ? 1 : 0);
        const dy = (pressed(BTN.DOWN) ? 1 : 0) - (pressed(BTN.UP) ? 1 : 0);
        if (dx !== 0 || dy !== 0) {
            this._padX = dx;
            this._padY = dy;
            active = true;
        }

        // --- Right stick: aim ---
        const rx = pad.axes[2] || 0;
        const ry = pad.axes[3] || 0;
        this._stickAiming = Math.hypot(rx, ry) > cfg.aimDeadzone;
        if (this._stickAiming) {
            this._stickAngle = Math.atan2(ry, rx);
            this.aimSource = 'pad';
            active = true;
        }

        // --- Fire ---
        this._padFire = value(BTN.RT) > cfg.triggerThreshold || pressed(BTN.RB);
        this._padBoost = pressed(BTN.LB);
        this._padDemo = value(BTN.LT) > cfg.triggerThreshold;
        if (this._padFire || this._padBoost || this._padDemo) active = true;

        // --- Buttons: act on the frame they go down ---
        const now = {
            a: pressed(BTN.A), b: pressed(BTN.B), x: pressed(BTN.X), y: pressed(BTN.Y), start: pressed(BTN.START),
            up: dy < 0 || ly < -0.6, down: dy > 0 || ly > 0.6,
            left: dx < 0 || lx < -0.6, right: dx > 0 || lx > 0.6,
        };
        const went = (name) => now[name] && !this._prev[name];

        if (went('start')) {
            this.enterPressed = true;
            this.pauseToggled = true;
            this._lastKey = 'Enter';
        }
        if (went('a')) {
            this.enterPressed = true;
            this.restartPressed = true;
            this._lastKey = 'PadAccept';
        }
        if (went('y')) this.musicToggled = true;
        if (went('b')) this._lastKey = 'Backspace';
        if (went('x')) this._lastKey = 'PadX';
        if (went('left')) this._lastKey = 'PadLeft';
        if (went('right')) this._lastKey = 'PadRight';
        if (went('up')) this._lastKey = 'PadUp';
        if (went('down')) this._lastKey = 'PadDown';

        if (now.a || now.b || now.x || now.y || now.start) active = true;
        this._prev = now;

        if (active) this.lastDevice = 'pad';
    }

    /**
     * Choose which connected controller to read.
     *
     * The browser can list several game-controller devices (virtual devices,
     * wheels, flight sticks...), and the real pad is not always first. So no
     * device is used until its buttons or sticks actually change, and the one
     * that changed most recently is the active one. Devices with the standard
     * button layout are preferred; others are only considered when no
     * standard-layout device is connected. A device that never changes (even
     * one resting with an axis pinned off-center) can neither block nor steer.
     */
    _selectGamepad() {
        const all = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
        const pads = all.filter(p => p && p.connected);
        this._pads = pads;

        const anyStandard = pads.some(p => p.mapping === 'standard');
        const eligible = anyStandard ? pads.filter(p => p.mapping === 'standard') : pads;

        // Has any eligible device changed since last frame?
        const seen = {};
        let changed = null;
        for (const p of eligible) {
            const sig = this._signature(p);
            const before = this._seen[p.index];
            seen[p.index] = sig;
            if (before !== undefined && before !== sig && p.index !== this._activeIndex && !changed) {
                changed = p;
            }
        }
        this._seen = seen;

        let active = eligible.find(p => p.index === this._activeIndex) || null;
        if (changed) {
            active = changed;
            this._prev = {}; // the press that woke this pad counts as a fresh press
        }
        this._activeIndex = active ? active.index : null;

        this.padStatus = {
            count: pads.length,
            activeId: active ? active.id : null,
            standard: active ? active.mapping === 'standard' : false,
        };
        return active;
    }

    /**
     * Coarse snapshot of a pad's state. Axes are quantized so the small jitter
     * of a resting stick does not register as input.
     */
    _signature(pad) {
        let sig = '';
        for (const b of pad.buttons) sig += (b.pressed || b.value > 0.25) ? '1' : '0';
        for (const a of pad.axes) sig += ',' + Math.round(a * 4);
        return sig;
    }

    /**
     * Text lines describing every controller the browser reports and the live
     * state of the active one, for the ?debug=1 overlay.
     */
    padDebugLines() {
        const lines = [`Controllers reported by browser: ${this._pads.length}`];
        for (const p of this._pads) {
            const mark = p.index === this._activeIndex ? '>' : ' ';
            lines.push(`${mark}[${p.index}] ${p.id.slice(0, 44)} (${p.mapping || 'non-standard'})`);
        }
        const active = this._pads.find(p => p.index === this._activeIndex);
        if (active) {
            lines.push('axes: ' + Array.from(active.axes).map(a => a.toFixed(2)).join(' '));
            const down = [];
            active.buttons.forEach((b, i) => { if (b.pressed || b.value > 0.05) down.push(`${i}:${b.value.toFixed(1)}`); });
            lines.push('buttons down: ' + (down.join(' ') || '-'));
        } else if (this._pads.length) {
            lines.push('none active yet - press a button');
        }
        return lines;
    }

    /**
     * Movement direction from keyboard plus left stick. Length is at most 1;
     * a partly tilted stick gives a shorter vector (slower driving).
     * @returns {{x: number, y: number}}
     */
    getDirection() {
        let x = (this._keyStates.right ? 1 : 0) - (this._keyStates.left ? 1 : 0) + this._padX + this._touchX;
        let y = (this._keyStates.down ? 1 : 0) - (this._keyStates.up ? 1 : 0) + this._padY + this._touchY;
        const len = Math.hypot(x, y);
        if (len > 1) {
            x /= len;
            y /= len;
        }
        this.axisX = x;
        this.axisY = y;
        return { x, y };
    }

    /**
     * Turret angle from whichever device aimed last.
     * Mouse: toward the cursor. Stick: the stick's direction, held when released.
     *
     * @param {number} tankScreenX - tank position in canvas coordinates
     * @param {number} tankScreenY
     * @param {number} currentAngle - the turret's current angle
     */
    getAimAngle(tankScreenX, tankScreenY, currentAngle) {
        if (this.aimSource === 'touch') {
            return this._touchAiming ? this._touchAngle : currentAngle;
        }
        if (this.aimSource === 'pad') {
            return this._stickAiming ? this._stickAngle : currentAngle;
        }
        return Math.atan2(this.mouseY - tankScreenY, this.mouseX - tankScreenX);
    }

    /** True while boost is held: Shift or the pad's left bumper */
    get boostHeld() {
        return this._boostKey || this._padBoost || this._touchBoost;
    }

    /** True while the demolition-shell trigger is held: right mouse button, Space, or the pad's left trigger */
    get demoHeld() {
        return this._mouseDemo || this._demoKey || this._padDemo || this._touchDemo;
    }

    /** True while fire is held on the mouse or the gamepad */
    get fireHeld() {
        return this._mouseFire || this._padFire || this._touchFire;
    }

    /**
     * Get and clear the last key pressed (one-shot), for initials entry.
     * @returns {string|null}
     */
    getLastKey() {
        const key = this._lastKey;
        this._lastKey = null;
        return key;
    }
}

const input = new InputHandler();
export default input;
