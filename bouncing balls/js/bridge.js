import { CONFIG } from './config.js';

export class Bridge {
    constructor(physicsWorld, calibration) {
        this.physics = physicsWorld;
        this.calibration = calibration;
        this.tracked = [];
        this._framesEmpty = 0;
        this.mirrorX = false;
        this.cameraWidth = CONFIG.CAMERA_WIDTH;
        this.cameraHeight = CONFIG.CAMERA_HEIGHT;
    }

    update(detectedBodies) {
        const projW = CONFIG.PROJECTION_WIDTH;
        const projH = CONFIG.PROJECTION_HEIGHT;
        const camW = this.cameraWidth;
        const camH = this.cameraHeight;
        const scaleX = projW / camW;
        const scaleY = projH / camH;
        const mirror = this.mirrorX;

        const projected = detectedBodies.map(d => {
            let cx = d.center.x;
            let cy = d.center.y;
            if (mirror) cx = camW - cx;

            const projCenter = this._cameraToProjection(cx, cy, camW, camH, projW, projH);

            const projVerts = d.vertices
                ? d.vertices.map(v => ({
                    x: v.x * scaleX * (mirror ? -1 : 1),
                    y: v.y * scaleY
                }))
                : null;

            return {
                kind: d.kind || 'sticky',
                center: projCenter,
                vertices: projVerts,
                size: d.size ? { width: d.size.width * scaleX, height: d.size.height * scaleY } : null,
                angle: d.angle || 0
            };
        });

        if (projected.length === 0) {
            this._framesEmpty++;
            if (this._framesEmpty > CONFIG.HYSTERESIS_FRAMES) {
                this._clearAll();
            }
            return;
        }
        this._framesEmpty = 0;

        this._clearAll();
        for (const note of projected) {
            const body = this._createBody(note);
            if (body) this.tracked.push(body);
        }
    }

    _clearAll() {
        for (const b of this.tracked) {
            Matter.Composite.remove(this.physics.engine.world, b);
            const si = this.physics.stickyBodies.indexOf(b);
            if (si >= 0) this.physics.stickyBodies.splice(si, 1);
        }
        this.tracked = [];
    }

    _createBody(note) {
        if (note.vertices) {
            return this.physics.addShapedBody(
                note.center.x, note.center.y, note.vertices, note.kind
            );
        }
        if (note.size) {
            return this.physics.addStickyBody(
                note.center.x, note.center.y,
                Math.max(note.size.width, note.size.height),
                Math.min(note.size.width, note.size.height),
                (note.angle * Math.PI) / 180
            );
        }
        return null;
    }

    _cameraToProjection(cx, cy, camW, camH, projW, projH) {
        if (this.calibration && this.calibration.homography) {
            return this.calibration.transformPoint({ x: cx, y: cy });
        }
        return {
            x: (cx / camW) * projW,
            y: (cy / camH) * projH
        };
    }
}
