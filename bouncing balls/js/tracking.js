import { CONFIG } from './config.js';

const WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite';

const OVAL_SEGMENTS = 20;

// MediaPipe hand landmark connections for each finger + palm
const FINGER_CHAINS = [
    [0, 1, 2, 3, 4],       // thumb
    [0, 5, 6, 7, 8],       // index
    [0, 9, 10, 11, 12],    // middle
    [0, 13, 14, 15, 16],   // ring
    [0, 17, 18, 19, 20],   // pinky
];
const PALM_INDICES = [0, 1, 5, 9, 13, 17];

export class BodyTracker {
    constructor(videoEl) {
        this.video = videoEl;
        this.handLandmarker = null;
        this.faceDetector = null;
        this.ready = false;
        this.faceReady = false;
        this.trackHands = true;
        this.trackFaces = true;
        this.handPadding = 20;
        this.fingerThickness = 18;
        this.lastVideoTime = -1;
    }

    async init() {
        const { FilesetResolver, HandLandmarker } = await import(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34'
        );

        const vision = await FilesetResolver.forVisionTasks(WASM_PATH);

        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: HAND_MODEL, delegate: 'GPU' },
            runningMode: 'VIDEO',
            numHands: 4,
            minHandDetectionConfidence: 0.4,
            minTrackingConfidence: 0.4
        });

        this.ready = true;
        console.log('[tracking] Hand model loaded');

        this._initFace(vision);
    }

    async _initFace(visionFileset) {
        try {
            const { FaceDetector } = await import(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34'
            );
            this.faceDetector = await FaceDetector.createFromOptions(visionFileset, {
                baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'GPU' },
                runningMode: 'VIDEO',
                minDetectionConfidence: 0.5
            });
            this.faceReady = true;
            console.log('[tracking] Face model loaded');
        } catch (e) {
            console.warn('[tracking] Face model failed to load:', e);
        }
    }

    setNumHands(n) {
        if (this.handLandmarker) {
            this.handLandmarker.setOptions({ numHands: n });
        }
    }

    detect() {
        if (!this.ready) return [];

        const now = performance.now();
        if (this.video.currentTime === this.lastVideoTime) return [];
        this.lastVideoTime = this.video.currentTime;

        const vw = this.video.videoWidth;
        const vh = this.video.videoHeight;
        const results = [];

        if (this.trackHands) {
            const handResult = this.handLandmarker.detectForVideo(this.video, now);
            if (handResult.landmarks) {
                for (const hand of handResult.landmarks) {
                    const bodies = this._handToBodies(hand, vw, vh);
                    results.push(...bodies);
                }
            }
        }

        if (this.trackFaces && this.faceReady && this.faceDetector) {
            const faceResult = this.faceDetector.detectForVideo(this.video, now);
            if (faceResult.detections) {
                for (const face of faceResult.detections) {
                    const body = this._faceToBody(face, vw, vh);
                    if (body) results.push(body);
                }
            }
        }

        return results;
    }

    _handToBodies(landmarks, vw, vh) {
        const pts = landmarks.map(lm => ({ x: lm.x * vw, y: lm.y * vh }));
        const bodies = [];
        const half = this.fingerThickness / 2;

        // Finger segments: each bone pair becomes a thick rectangle
        for (const chain of FINGER_CHAINS) {
            for (let j = 1; j < chain.length; j++) {
                const a = pts[chain[j - 1]];
                const b = pts[chain[j]];
                const seg = this._segmentToRect(a, b, half + this.handPadding * 0.3);
                if (seg) bodies.push(seg);
            }
        }

        // Palm: convex hull of palm landmarks as one body
        const palmPts = PALM_INDICES.map(i => pts[i]);
        const hull = this._convexHull(palmPts);
        if (hull.length >= 3) {
            const padded = this._padPolygon(hull, this.handPadding);
            let cx = 0, cy = 0;
            for (const p of padded) { cx += p.x; cy += p.y; }
            cx /= padded.length;
            cy /= padded.length;
            bodies.push({
                kind: 'hand',
                id: 'palm',
                center: { x: cx, y: cy },
                vertices: padded.map(p => ({ x: p.x - cx, y: p.y - cy })),
                angle: 0
            });
        }

        return bodies;
    }

    _segmentToRect(a, b, halfWidth) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 4) return null;

        const nx = -dy / len * halfWidth;
        const ny = dx / len * halfWidth;

        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;

        const vertices = [
            { x: a.x + nx - cx, y: a.y + ny - cy },
            { x: b.x + nx - cx, y: b.y + ny - cy },
            { x: b.x - nx - cx, y: b.y - ny - cy },
            { x: a.x - nx - cx, y: a.y - ny - cy },
        ];

        return { kind: 'hand', id: 'finger', center: { x: cx, y: cy }, vertices, angle: 0 };
    }

    _faceToBody(detection, vw, vh) {
        const bb = detection.boundingBox;
        if (!bb) return null;

        const cx = bb.originX + bb.width / 2;
        const cy = bb.originY + bb.height / 2;
        const rx = bb.width * 0.7;
        const ry = bb.height * 0.75;

        const vertices = [];
        for (let i = 0; i < OVAL_SEGMENTS; i++) {
            const theta = (2 * Math.PI * i) / OVAL_SEGMENTS;
            vertices.push({ x: Math.cos(theta) * rx, y: Math.sin(theta) * ry });
        }

        return { kind: 'face', id: 'face', center: { x: cx, y: cy }, vertices, angle: 0 };
    }

    _convexHull(points) {
        if (points.length < 3) return points.slice();

        const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
        const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

        const lower = [];
        for (const p of sorted) {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
                lower.pop();
            lower.push(p);
        }

        const upper = [];
        for (let i = sorted.length - 1; i >= 0; i--) {
            const p = sorted[i];
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
                upper.pop();
            upper.push(p);
        }

        lower.pop();
        upper.pop();
        return lower.concat(upper);
    }

    _padPolygon(polygon, pad) {
        if (pad <= 0) return polygon;

        let cx = 0, cy = 0;
        for (const p of polygon) { cx += p.x; cy += p.y; }
        cx /= polygon.length;
        cy /= polygon.length;

        return polygon.map(p => {
            const dx = p.x - cx;
            const dy = p.y - cy;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            return { x: p.x + (dx / len) * pad, y: p.y + (dy / len) * pad };
        });
    }
}
