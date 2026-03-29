import { CONFIG } from './config.js';

export class Calibration {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.homography = null;
        this.camPoints = [];
        this.currentPoint = 0;
        this.active = false;
        this._boundOnClick = this._onClick.bind(this);
    }

    _getProjPoints() {
        return [
            { x: CONFIG.PROJECTION_WIDTH * 0.2, y: CONFIG.PROJECTION_HEIGHT * 0.2 },
            { x: CONFIG.PROJECTION_WIDTH * 0.8, y: CONFIG.PROJECTION_HEIGHT * 0.2 },
            { x: CONFIG.PROJECTION_WIDTH * 0.8, y: CONFIG.PROJECTION_HEIGHT * 0.8 },
            { x: CONFIG.PROJECTION_WIDTH * 0.2, y: CONFIG.PROJECTION_HEIGHT * 0.8 },
        ];
    }

    start() {
        this.canvas.style.display = 'block';
        this.canvas.width = CONFIG.PROJECTION_WIDTH;
        this.canvas.height = CONFIG.PROJECTION_HEIGHT;
        this.projPoints = this._getProjPoints();
        this.camPoints = [];
        this.currentPoint = 0;
        this.active = true;
        this._drawPoint(this.currentPoint);
        this.canvas.addEventListener('click', this._boundOnClick);
        console.log('[calibration] Click the projected dots in the camera feed...');
    }

    _onClick(e) {
        if (!this.active) return;

        const rect = this.canvas.getBoundingClientRect();
        const clickX = ((e.clientX - rect.left) / rect.width) * CONFIG.CAMERA_WIDTH;
        const clickY = ((e.clientY - rect.top) / rect.height) * CONFIG.CAMERA_HEIGHT;

        this.camPoints.push({ x: clickX, y: clickY });
        this.currentPoint++;

        if (this.currentPoint >= CONFIG.CALIBRATION_POINTS) {
            this._computeHomography();
            this.active = false;
            this.canvas.style.display = 'none';
            this.canvas.removeEventListener('click', this._boundOnClick);
        } else {
            this._drawPoint(this.currentPoint);
        }
    }

    _drawPoint(index) {
        this.ctx.fillStyle = CONFIG.BACKGROUND_COLOR;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.beginPath();
        const p = this.projPoints[index];
        this.ctx.arc(p.x, p.y, CONFIG.CALIBRATION_DOT_RADIUS, 0, Math.PI * 2);
        this.ctx.fillStyle = CONFIG.CALIBRATION_DOT_COLOR;
        this.ctx.fill();
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '24px monospace';
        this.ctx.fillText(`Click dot ${index + 1}/${CONFIG.CALIBRATION_POINTS} in camera view`, 40, 40);
    }

    _computeHomography() {
        const srcArray = [];
        const dstArray = [];
        for (let i = 0; i < this.camPoints.length; i++) {
            srcArray.push(this.camPoints[i].x, this.camPoints[i].y);
            dstArray.push(this.projPoints[i].x, this.projPoints[i].y);
        }

        const srcMat = cv.matFromArray(4, 1, cv.CV_32FC2, srcArray);
        const dstMat = cv.matFromArray(4, 1, cv.CV_32FC2, dstArray);

        this.homography = cv.findHomography(srcMat, dstMat);

        srcMat.delete();
        dstMat.delete();
        console.log('[calibration] Homography computed successfully.');
    }

    transformPoint(point) {
        if (!this.homography) {
            return {
                x: (point.x / CONFIG.CAMERA_WIDTH) * CONFIG.PROJECTION_WIDTH,
                y: (point.y / CONFIG.CAMERA_HEIGHT) * CONFIG.PROJECTION_HEIGHT
            };
        }

        const src = cv.matFromArray(1, 1, cv.CV_32FC2, [point.x, point.y]);
        const dst = new cv.Mat();
        cv.perspectiveTransform(src, dst, this.homography);
        const result = { x: dst.data32F[0], y: dst.data32F[1] };
        src.delete();
        dst.delete();
        return result;
    }
}
