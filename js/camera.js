/**
 * YOLO - Camera System
 * Smoothly follows a target position within the game world
 */

class Camera {
    constructor(canvasWidth, canvasHeight) {
        // Current camera position (top-left corner of viewport)
        this.x = 0;
        this.y = 0;

        // Target position to follow
        this.targetX = 0;
        this.targetY = 0;

        // Smoothing factor (0.0 - 1.0, lower = smoother/slower)
        this.smoothFactor = 0.08;

        // Canvas dimensions
        this.width = canvasWidth;
        this.height = canvasHeight;

        // World bounds
        this.worldWidth = 0;
        this.worldHeight = 0;

        // Screen shake state
        this.shakeIntensity = 0;
        this.shakeDuration = 0;
        this.shakeElapsed = 0;
        this.shakeOffsetX = 0;
        this.shakeOffsetY = 0;
    }

    /**
     * Set world bounds for camera clamping
     */
    setWorldBounds(worldWidth, worldHeight) {
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;
    }

    /**
     * Set the target position for the camera to follow
     * The target should be the center point (e.g., player tank position)
     */
    setTarget(targetX, targetY) {
        // Center the camera on the target
        this.targetX = targetX - this.width / 2;
        this.targetY = targetY - this.height / 2;

        // Clamp to world bounds
        this.targetX = Math.max(0, Math.min(this.targetX, this.worldWidth - this.width));
        this.targetY = Math.max(0, Math.min(this.targetY, this.worldHeight - this.height));
    }

    /**
     * Update camera position with smooth interpolation
     * @param {number} scale - Delta-time scale (1.0 = 60fps baseline)
     */
    update(scale = 1) {
        // Interpolate toward target; the exponent keeps follow speed the same at any frame rate
        const t = 1 - Math.pow(1 - this.smoothFactor, scale);
        this.x += (this.targetX - this.x) * t;
        this.y += (this.targetY - this.y) * t;

        // Snap if very close to avoid micro-jitter
        if (Math.abs(this.x - this.targetX) < 0.5) this.x = this.targetX;
        if (Math.abs(this.y - this.targetY) < 0.5) this.y = this.targetY;

        // Update screen shake (scaled by delta time)
        if (this.shakeElapsed < this.shakeDuration) {
            this.shakeElapsed += scale;
            // Decay intensity over duration
            const progress = this.shakeElapsed / this.shakeDuration;
            const currentIntensity = this.shakeIntensity * (1 - progress);
            // Generate random offsets clamped by current intensity
            this.shakeOffsetX = (Math.random() - 0.5) * 2 * currentIntensity;
            this.shakeOffsetY = (Math.random() - 0.5) * 2 * currentIntensity;
        } else {
            this.shakeOffsetX = 0;
            this.shakeOffsetY = 0;
        }
    }

    /**
     * Trigger a screen shake effect.
     * @param {number} intensity - Maximum shake offset in pixels
     * @param {number} duration - Duration in frames
     */
    shake(intensity, duration) {
        this.shakeIntensity = intensity;
        this.shakeDuration = duration;
        this.shakeElapsed = 0;
    }

    /**
     * Get the visible world bounds (which tiles are on screen)
     * Returns tile coordinates, not pixel coordinates
     */
    getVisibleBounds(tileSize) {
        const startCol = Math.floor(this.x / tileSize);
        const endCol = Math.ceil((this.x + this.width) / tileSize);
        const startRow = Math.floor(this.y / tileSize);
        const endRow = Math.ceil((this.y + this.height) / tileSize);

        return {
            startCol,
            endCol,
            startRow,
            endRow,
        };
    }

    /**
     * Convert world pixel coordinates to screen (canvas) coordinates
     */
    worldToScreen(worldX, worldY) {
        return {
            x: worldX - this.x,
            y: worldY - this.y,
        };
    }

    /**
     * Apply camera transform to canvas context (including shake offset).
     * Call before rendering world objects.
     */
    applyTransform(ctx) {
        ctx.save();
        ctx.translate(-this.x + this.shakeOffsetX, -this.y + this.shakeOffsetY);
    }

    /**
     * Reset canvas transform after rendering
     * Call after rendering world objects
     */
    resetTransform(ctx) {
        ctx.restore();
    }

    /**
     * Reset camera to origin (for initial placement)
     */
    reset(x, y) {
        this.x = x;
        this.y = y;
        this.targetX = x;
        this.targetY = y;
    }
}

export default Camera;