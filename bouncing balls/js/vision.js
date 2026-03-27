import { CONFIG } from './config.js';

export class VisionPipeline {
    constructor(videoId, debugCanvasId) {
        this.video = document.getElementById(videoId);
        this.debugCanvas = document.getElementById(debugCanvasId);
        this.debugCtx = this.debugCanvas.getContext('2d');
        this.streaming = false;

        this.useBgSubtraction = false;
        this.referenceFrame = null;
        this.diffThreshold = 30;
        this.diffBlur = 11;
        this.dilateSize = 9;
        this.useAdaptive = true;
        this.adaptiveBlockSize = 25;
        this.adaptiveC = 8;
        this.refLearnRate = 0;
        this.maxAspectRatio = 5;
    }

    async startCamera() {
        if (!this.video.srcObject) {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: CONFIG.CAMERA_WIDTH },
                    height: { ideal: CONFIG.CAMERA_HEIGHT },
                    facingMode: CONFIG.CAMERA_FACING_MODE
                }
            });
            this.video.srcObject = stream;
            await new Promise(resolve => {
                this.video.onloadedmetadata = () => { this.video.play(); resolve(); };
            });
        }
        this.streaming = true;

        this._captureCanvas = document.createElement('canvas');
        this._captureCanvas.width = this.video.videoWidth;
        this._captureCanvas.height = this.video.videoHeight;
        this._captureCtx = this._captureCanvas.getContext('2d', { willReadFrequently: true });

        this.debugCanvas.width = this.video.videoWidth;
        this.debugCanvas.height = this.video.videoHeight;
        console.log(`[vision] OpenCV vision pipeline ready: ${this.video.videoWidth}x${this.video.videoHeight}`);
    }

    _grabFrame() {
        this._captureCtx.drawImage(this.video, 0, 0);
        return cv.imread(this._captureCanvas);
    }

    toggleDebug() {
        const d = this.debugCanvas;
        d.style.display = d.style.display === 'none' ? 'block' : 'none';
    }

    captureReference() {
        if (!this.streaming) return false;

        if (this.referenceFrame) this.referenceFrame.delete();

        const frame = this._grabFrame();

        this.referenceFrame = new cv.Mat();
        cv.cvtColor(frame, this.referenceFrame, cv.COLOR_RGBA2GRAY);
        const bs = this._ensureOdd(this.diffBlur);
        cv.GaussianBlur(this.referenceFrame, this.referenceFrame, new cv.Size(bs, bs), 0);
        frame.delete();

        console.log('[vision] Reference frame captured');
        return true;
    }

    hasReference() {
        return this.referenceFrame !== null;
    }

    clearReference() {
        if (this.referenceFrame) {
            this.referenceFrame.delete();
            this.referenceFrame = null;
        }
    }

    processFrame() {
        if (!this.streaming) return [];

        if (this.useBgSubtraction && this.referenceFrame) {
            return this._processFrameBgSub();
        }
        return this._processFrameHSV();
    }

    _ensureOdd(v) {
        v = Math.max(1, Math.round(v));
        return v % 2 === 0 ? v + 1 : v;
    }

    _isDebugVisible() {
        return CONFIG.DEBUG_MODE || this.debugCanvas.style.display !== 'none';
    }

    _filterContour(cnt) {
        const area = cv.contourArea(cnt);
        if (area < CONFIG.MIN_CONTOUR_AREA) return null;

        const rotatedRect = cv.minAreaRect(cnt);
        const w = rotatedRect.size.width;
        const h = rotatedRect.size.height;
        const longer = Math.max(w, h);
        const shorter = Math.min(w, h);

        if (shorter < 1) return null;
        if (longer / shorter > this.maxAspectRatio) return null;

        let angle = rotatedRect.angle;
        if (w < h) angle = angle - 90;

        return {
            center: { x: rotatedRect.center.x, y: rotatedRect.center.y },
            size: { width: w, height: h },
            angle: angle
        };
    }

    _drawContourOverlay(binaryMask, detectedNotes) {
        if (!this._isDebugVisible()) return;

        cv.imshow(this.debugCanvas, binaryMask);

        const ctx = this.debugCtx;
        const scaleX = this.debugCanvas.width / binaryMask.cols;
        const scaleY = this.debugCanvas.height / binaryMask.rows;

        for (const note of detectedNotes) {
            const cx = note.center.x * scaleX;
            const cy = note.center.y * scaleY;
            const w = note.size.width * scaleX;
            const h = note.size.height * scaleY;
            const rad = (note.angle * Math.PI) / 180;

            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(rad);
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            ctx.strokeRect(-w / 2, -h / 2, w, h);

            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.arc(0, 0, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        ctx.fillStyle = '#00ff00';
        ctx.font = '12px monospace';
        ctx.fillText(`Objects: ${detectedNotes.length}`, 6, 14);
    }

    _processFrameBgSub() {
        const frame = this._grabFrame();

        const detectedNotes = [];
        let gray = null, blurred = null, diff = null, thresh = null;
        let kernel = null, dilateKernel = null;
        let contours = null, hierarchy = null;

        try {
            gray = new cv.Mat();
            cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);

            const bs = this._ensureOdd(this.diffBlur);
            blurred = new cv.Mat();
            cv.GaussianBlur(gray, blurred, new cv.Size(bs, bs), 0);

            // Running average: slowly blend current frame into reference
            if (this.refLearnRate > 0) {
                cv.addWeighted(
                    this.referenceFrame, 1 - this.refLearnRate,
                    blurred, this.refLearnRate,
                    0, this.referenceFrame
                );
            }

            diff = new cv.Mat();
            cv.absdiff(this.referenceFrame, blurred, diff);

            thresh = new cv.Mat();
            if (this.useAdaptive) {
                const blockSize = this._ensureOdd(Math.max(3, this.adaptiveBlockSize));
                cv.adaptiveThreshold(
                    diff, thresh, 255,
                    cv.ADAPTIVE_THRESH_GAUSSIAN_C,
                    cv.THRESH_BINARY,
                    blockSize,
                    -this.adaptiveC
                );
            } else {
                cv.threshold(diff, thresh, this.diffThreshold, 255, cv.THRESH_BINARY);
            }

            // Morphological cleanup
            const ks = this._ensureOdd(CONFIG.MORPH_KERNEL_SIZE);
            kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(ks, ks));
            cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, kernel);
            cv.morphologyEx(thresh, thresh, cv.MORPH_OPEN, kernel);

            // Dilate to fill gaps in detected regions
            if (this.dilateSize > 0) {
                const ds = this._ensureOdd(this.dilateSize);
                dilateKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(ds, ds));
                cv.dilate(thresh, thresh, dilateKernel);
            }

            contours = new cv.MatVector();
            hierarchy = new cv.Mat();
            cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

            for (let i = 0; i < contours.size(); i++) {
                const cnt = contours.get(i);
                const note = this._filterContour(cnt);
                if (note) detectedNotes.push(note);
                cnt.delete();
            }

            this._drawContourOverlay(thresh, detectedNotes);

        } finally {
            frame.delete();
            if (gray) gray.delete();
            if (blurred) blurred.delete();
            if (diff) diff.delete();
            if (thresh) thresh.delete();
            if (kernel) kernel.delete();
            if (dilateKernel) dilateKernel.delete();
            if (contours) contours.delete();
            if (hierarchy) hierarchy.delete();
        }

        return detectedNotes;
    }

    _processFrameHSV() {
        const frame = this._grabFrame();

        const detectedNotes = [];
        let rgb = null, hsv = null, mask = null, combinedMask = null, kernel = null;
        let contours = null, hierarchy = null;

        try {
            rgb = new cv.Mat();
            cv.cvtColor(frame, rgb, cv.COLOR_RGBA2RGB);
            hsv = new cv.Mat();
            cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);

            combinedMask = cv.Mat.zeros(frame.rows, frame.cols, cv.CV_8UC1);

            for (const color of CONFIG.STICKY_COLORS) {
                mask = new cv.Mat();
                const low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), color.low);
                const high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), color.high);
                cv.inRange(hsv, low, high, mask);
                cv.bitwise_or(combinedMask, mask, combinedMask);
                low.delete();
                high.delete();
                mask.delete();
                mask = null;
            }

            const ks = this._ensureOdd(CONFIG.MORPH_KERNEL_SIZE);
            kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(ks, ks));
            cv.morphologyEx(combinedMask, combinedMask, cv.MORPH_CLOSE, kernel);
            cv.morphologyEx(combinedMask, combinedMask, cv.MORPH_OPEN, kernel);

            contours = new cv.MatVector();
            hierarchy = new cv.Mat();
            cv.findContours(combinedMask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

            for (let i = 0; i < contours.size(); i++) {
                const cnt = contours.get(i);
                const note = this._filterContour(cnt);
                if (note) detectedNotes.push(note);
                cnt.delete();
            }

            this._drawContourOverlay(combinedMask, detectedNotes);

        } finally {
            frame.delete();
            if (rgb) rgb.delete();
            if (hsv) hsv.delete();
            if (combinedMask) combinedMask.delete();
            if (kernel) kernel.delete();
            if (contours) contours.delete();
            if (hierarchy) hierarchy.delete();
        }

        return detectedNotes;
    }
}
