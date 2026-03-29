import { CONFIG } from './config.js';
import { PhysicsWorld } from './physics.js';
import { Bridge } from './bridge.js';
import { Calibration } from './calibration.js';
import { BodyTracker } from './tracking.js';

let physics, vision, bridge, calibration, tracker;
let cvReady = false;
let spawnTimer = null;
let cameraBgActive = false;
let cameraBgCanvas, cameraBgCtx;
let detectMode = 'hands';
let videoEl;

const STORAGE_KEY = 'snb_settings';

// ── Settings persistence (URL params > localStorage) ──

function gatherSettings() {
    const s = {};
    for (const el of document.querySelectorAll('#settings-panel [id^="opt-"]')) {
        const key = el.id.replace('opt-', '');
        if (el.type === 'checkbox') s[key] = el.checked ? '1' : '0';
        else s[key] = el.value;
    }
    return s;
}

function loadSettings() {
    const url = new URL(location.href);
    const hasUrlParams = [...url.searchParams.keys()].some(k => k !== '');

    if (hasUrlParams) {
        const s = {};
        for (const [key, val] of url.searchParams) {
            s['opt-' + key] = val;
        }
        return s;
    }

    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function applyLoadedSettings(saved) {
    if (!saved) return;

    const url = new URL(location.href);
    const fromUrl = [...url.searchParams.keys()].some(k => k !== '');

    for (const [id, rawVal] of Object.entries(saved)) {
        const el = document.getElementById(id);
        if (!el) continue;

        if (fromUrl) {
            if (el.type === 'checkbox') el.checked = (rawVal === '1' || rawVal === 'true');
            else el.value = rawVal;
        } else {
            if (el.type === 'checkbox') el.checked = rawVal;
            else el.value = rawVal;
        }
    }
}

function saveSettings() {
    const s = gatherSettings();

    const obj = {};
    for (const el of document.querySelectorAll('#settings-panel [id^="opt-"]')) {
        if (el.type === 'checkbox') obj[el.id] = el.checked;
        else obj[el.id] = el.value;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));

    const url = new URL(location.href);
    url.search = '';
    for (const [key, val] of Object.entries(s)) {
        url.searchParams.set(key, val);
    }
    history.replaceState(null, '', url);
}

// ── Camera background rendering ──

function startCameraBg() {
    cameraBgActive = true;
    drawCameraBg();
}

function stopCameraBg() {
    cameraBgActive = false;
}

function drawCameraBg() {
    if (!cameraBgActive || !videoEl) return;
    cameraBgCtx.drawImage(videoEl, 0, 0, cameraBgCanvas.width, cameraBgCanvas.height);
    requestAnimationFrame(drawCameraBg);
}

// ── Spawn timer management ──

function restartSpawnTimer() {
    if (spawnTimer) clearInterval(spawnTimer);
    spawnTimer = setInterval(() => physics.spawnBall(), CONFIG.BALL_SPAWN_INTERVAL_MS);
}

// ── Detection loop ──

let loopInterval = null;
let trackingIntervalMs = 66;

const TRACKING_MODES = new Set(['hands', 'face', 'hands+face']);

function startTrackingLoop() {
    stopDetectionLoop();
    loopInterval = setInterval(() => {
        if (!TRACKING_MODES.has(detectMode) || !tracker || !tracker.ready) return;
        const detected = tracker.detect();
        if (detected) bridge.update(detected);
    }, trackingIntervalMs);
}

function startCVLoop() {
    stopDetectionLoop();
    loopInterval = setInterval(() => {
        if (!vision) return;
        const detected = vision.processFrame();
        if (detected) bridge.update(detected);
    }, CONFIG.CV_FRAME_INTERVAL_MS);
}

function stopDetectionLoop() {
    if (loopInterval) { clearInterval(loopInterval); loopInterval = null; }
}

async function ensureOpenCV() {
    if (cvReady && vision) return true;

    const statusEl = document.getElementById('tracking-status');
    statusEl.textContent = 'Loading OpenCV…';
    statusEl.style.color = '#ff6644';

    if (!cvReady) {
        await new Promise((resolve, reject) => {
            if (typeof cv !== 'undefined' && cv.getBuildInformation) {
                cvReady = true; resolve(); return;
            }
            const script = document.querySelector('script[src*="opencv"]');
            if (!script) {
                const s = document.createElement('script');
                s.src = 'lib/opencv.js';
                s.async = true;
                document.body.appendChild(s);
            }
            const check = setInterval(() => {
                if (typeof cv !== 'undefined') {
                    if (cv.getBuildInformation) {
                        clearInterval(check); cvReady = true; resolve();
                    } else if (cv.onRuntimeInitialized === undefined) {
                        cv['onRuntimeInitialized'] = () => {
                            clearInterval(check); cvReady = true; resolve();
                        };
                    }
                }
            }, 200);
            setTimeout(() => { clearInterval(check); reject(new Error('OpenCV load timeout')); }, 60000);
        });
    }

    if (!vision) {
        const { VisionPipeline } = await import('./vision.js');
        vision = new VisionPipeline('webcam', 'debug-canvas');
        await vision.startCamera();
    }

    statusEl.textContent = 'OpenCV ready';
    statusEl.style.color = '#5c5';
    return true;
}

function switchDetectionMode(mode) {
    detectMode = mode;
    if (bridge) { bridge.tracked = []; }
    if (physics) { physics.clearStickyBodies(); }

    if (TRACKING_MODES.has(mode)) {
        if (tracker) {
            tracker.trackHands = (mode === 'hands' || mode === 'hands+face');
            tracker.trackFaces = (mode === 'face' || mode === 'hands+face');
        }
        startTrackingLoop();
    } else {
        ensureOpenCV().then(() => {
            if (mode === 'bg-sub') vision.useBgSubtraction = true;
            else vision.useBgSubtraction = false;
            startCVLoop();
        }).catch(err => {
            console.error('[main] Could not load OpenCV:', err);
            detectMode = 'hands';
            document.getElementById('opt-detect-mode').value = 'hands';
            startTrackingLoop();
        });
    }
}

// ── Settings panel wiring ──

function initSettings() {
    const overlay = document.getElementById('settings-overlay');

    let clickTimes = [];
    document.addEventListener('click', (e) => {
        if (overlay.classList.contains('open')) return;
        const now = Date.now();
        clickTimes.push(now);
        clickTimes = clickTimes.filter(t => now - t < 600);
        if (clickTimes.length >= 3) {
            clickTimes = [];
            overlay.classList.add('open');
            document.body.classList.add('settings-open');
        }
    });

    function closeSettings() {
        overlay.classList.remove('open');
        document.body.classList.remove('settings-open');
    }

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeSettings();
    });

    document.getElementById('btn-close-settings').addEventListener('click', closeSettings);
    document.getElementById('btn-clear-balls').addEventListener('click', () => {
        physics.removeAllBalls();
    });

    // ── Camera Background ──
    const optCameraBg = document.getElementById('opt-camera-bg');
    const optCameraOpacity = document.getElementById('opt-camera-opacity');
    const optMirror = document.getElementById('opt-mirror');

    function applyCameraBg() {
        const on = optCameraBg.checked;
        cameraBgCanvas.style.display = on ? 'block' : 'none';
        physics.setBackground(on ? 'transparent' : CONFIG.BACKGROUND_COLOR);
        if (on) startCameraBg(); else stopCameraBg();
    }
    function applyCameraOpacity() {
        const v = optCameraOpacity.value;
        document.getElementById('val-camera-opacity').textContent = v + '%';
        cameraBgCanvas.style.opacity = v / 100;
    }
    function applyMirror() {
        const on = optMirror.checked;
        cameraBgCanvas.style.transform = on ? 'scaleX(-1)' : '';
        if (bridge) bridge.mirrorX = on;
    }

    optCameraBg.addEventListener('change', () => { applyCameraBg(); saveSettings(); });
    optCameraOpacity.addEventListener('input', () => { applyCameraOpacity(); saveSettings(); });
    optMirror.addEventListener('change', () => { applyMirror(); saveSettings(); });

    // ── Physics ──
    const optGravity = document.getElementById('opt-gravity');
    const optBallRadius = document.getElementById('opt-ball-radius');
    const optSpawnRate = document.getElementById('opt-spawn-rate');
    const optMaxBalls = document.getElementById('opt-max-balls');
    const optRestitution = document.getElementById('opt-restitution');

    function applyGravity() {
        const v = optGravity.value / 100;
        document.getElementById('val-gravity').textContent = v.toFixed(1);
        physics.engine.gravity.y = v;
    }
    function applyBallRadius() {
        document.getElementById('val-ball-radius').textContent = optBallRadius.value;
        CONFIG.BALL_RADIUS = +optBallRadius.value;
    }
    function applySpawnRate() {
        const v = +optSpawnRate.value;
        document.getElementById('val-spawn-rate').textContent = v + 'ms';
        CONFIG.BALL_SPAWN_INTERVAL_MS = v;
        restartSpawnTimer();
    }
    function applyMaxBalls() {
        document.getElementById('val-max-balls').textContent = optMaxBalls.value;
        CONFIG.MAX_BALLS = +optMaxBalls.value;
    }
    function applyRestitution() {
        const v = optRestitution.value / 100;
        document.getElementById('val-restitution').textContent = v.toFixed(1);
        CONFIG.BALL_RESTITUTION = v;
    }

    optGravity.addEventListener('input', () => { applyGravity(); saveSettings(); });
    optBallRadius.addEventListener('input', () => { applyBallRadius(); saveSettings(); });
    optSpawnRate.addEventListener('input', () => { applySpawnRate(); saveSettings(); });
    optMaxBalls.addEventListener('input', () => { applyMaxBalls(); saveSettings(); });
    optRestitution.addEventListener('input', () => { applyRestitution(); saveSettings(); });

    // ── Ball Colors ──
    function applyBallColors() {
        for (let i = 0; i < 5; i++) {
            const colorEl = document.getElementById(`opt-ball-color-${i}`);
            const enabledEl = document.getElementById(`opt-ball-color-on-${i}`);
            if (colorEl) CONFIG.BALL_COLORS[i] = colorEl.value;
            if (enabledEl) CONFIG.BALL_COLORS_ENABLED[i] = enabledEl.checked;
        }
    }
    for (let i = 0; i < 5; i++) {
        const colorEl = document.getElementById(`opt-ball-color-${i}`);
        const enabledEl = document.getElementById(`opt-ball-color-on-${i}`);
        if (colorEl) colorEl.addEventListener('input', () => { applyBallColors(); saveSettings(); });
        if (enabledEl) enabledEl.addEventListener('change', () => { applyBallColors(); saveSettings(); });
    }

    // ── Detection Mode ──
    const optDetectMode = document.getElementById('opt-detect-mode');
    const trackingControls = document.getElementById('tracking-controls');
    const optHandPadding = document.getElementById('opt-hand-padding');
    const optTrackingFps = document.getElementById('opt-tracking-fps');

    const handControls = document.getElementById('hand-controls');
    const optShowOverlay = document.getElementById('opt-show-overlay');
    const optFingerThickness = document.getElementById('opt-finger-thickness');

    function applyDetectMode() {
        const mode = optDetectMode.value;
        trackingControls.style.display = 'block';
        handControls.style.display = (mode === 'hands' || mode === 'hands+face') ? 'block' : 'none';
        switchDetectionMode(mode);
    }
    function applyShowOverlay() {
        physics.setOverlayVisible(optShowOverlay.checked);
    }
    function applyFingerThickness() {
        const v = +optFingerThickness.value;
        document.getElementById('val-finger-thickness').textContent = v + 'px';
        if (tracker) tracker.fingerThickness = v;
    }

    const optMaxHands = document.getElementById('opt-max-hands');
    function applyMaxHands() {
        const v = +optMaxHands.value;
        document.getElementById('val-max-hands').textContent = v;
        if (tracker) tracker.setNumHands(v);
    }

    optShowOverlay.addEventListener('change', () => { applyShowOverlay(); saveSettings(); });
    optFingerThickness.addEventListener('input', () => { applyFingerThickness(); saveSettings(); });
    optMaxHands.addEventListener('input', () => { applyMaxHands(); saveSettings(); });

    function applyHandPadding() {
        const v = +optHandPadding.value;
        document.getElementById('val-hand-padding').textContent = v + 'px';
        if (tracker) tracker.handPadding = v;
    }
    function applyTrackingFps() {
        const v = +optTrackingFps.value;
        document.getElementById('val-tracking-fps').textContent = v;
        trackingIntervalMs = Math.round(1000 / v);
        if (TRACKING_MODES.has(detectMode)) startTrackingLoop();
    }

    optDetectMode.addEventListener('change', () => { applyDetectMode(); saveSettings(); });
    optHandPadding.addEventListener('input', () => { applyHandPadding(); saveSettings(); });
    optTrackingFps.addEventListener('input', () => { applyTrackingFps(); saveSettings(); });

    // ── Projection Size Override ──
    const optAutoSize = document.getElementById('opt-auto-size');
    const manualControls = document.getElementById('manual-size-controls');
    const optProjW = document.getElementById('opt-proj-width');
    const optProjH = document.getElementById('opt-proj-height');

    function applyAutoSize() {
        const auto = optAutoSize.checked;
        manualControls.style.display = auto ? 'none' : 'block';
        if (auto) {
            physics.resize(window.innerWidth, window.innerHeight);
        } else {
            applyManualSize();
        }
    }
    function applyManualSize() {
        const w = Math.max(320, +optProjW.value || 1920);
        const h = Math.max(240, +optProjH.value || 1080);
        physics.resize(w, h);
        if (bridge) { bridge.tracked = []; }
        physics.clearStickyBodies();
    }

    optAutoSize.addEventListener('change', () => { applyAutoSize(); saveSettings(); });
    optProjW.addEventListener('change', () => { if (!optAutoSize.checked) { applyManualSize(); saveSettings(); } });
    optProjH.addEventListener('change', () => { if (!optAutoSize.checked) { applyManualSize(); saveSettings(); } });

    // ── Restore saved settings (URL params take priority over localStorage) ──
    const saved = loadSettings();
    applyLoadedSettings(saved);

    applyCameraBg();
    applyCameraOpacity();
    applyMirror();
    applyGravity();
    applyBallRadius();
    applySpawnRate();
    applyMaxBalls();
    applyRestitution();
    applyBallColors();
    applyHandPadding();
    applyFingerThickness();
    applyMaxHands();
    applyShowOverlay();
    applyTrackingFps();
    applyAutoSize();
    applyDetectMode();

    saveSettings();
}

// ── Bootstrap — starts immediately, no OpenCV dependency ──

async function boot() {
    videoEl = document.getElementById('webcam');

    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            width: { ideal: CONFIG.CAMERA_WIDTH },
            height: { ideal: CONFIG.CAMERA_HEIGHT },
            facingMode: CONFIG.CAMERA_FACING_MODE
        }
    });
    videoEl.srcObject = stream;
    await new Promise(r => { videoEl.onloadedmetadata = () => { videoEl.play(); r(); }; });

    cameraBgCanvas = document.getElementById('camera-bg');
    cameraBgCtx = cameraBgCanvas.getContext('2d');
    cameraBgCanvas.width = videoEl.videoWidth;
    cameraBgCanvas.height = videoEl.videoHeight;

    calibration = new Calibration('calibration-canvas');
    physics = new PhysicsWorld('projection-canvas');
    bridge = new Bridge(physics, calibration);
    bridge.cameraWidth = videoEl.videoWidth;
    bridge.cameraHeight = videoEl.videoHeight;

    tracker = new BodyTracker(videoEl);
    const statusEl = document.getElementById('tracking-status');

    tracker.init().then(() => {
        statusEl.textContent = 'Tracking ready ✓';
        statusEl.style.color = '#5c5';
        if (TRACKING_MODES.has(detectMode)) switchDetectionMode(detectMode);
    }).catch(err => {
        console.error('[tracking] Failed to load:', err);
        statusEl.textContent = 'Failed — try another mode';
        statusEl.style.color = '#ff6644';
    });

    restartSpawnTimer();
    initSettings();

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const autoEl = document.getElementById('opt-auto-size');
            if (!autoEl || autoEl.checked) {
                physics.resize(window.innerWidth, window.innerHeight);
                if (bridge) { bridge.tracked = []; }
                physics.clearStickyBodies();
            }
        }, 150);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'r' || e.key === 'R') physics.removeAllBalls();
        if (e.key === 's' || e.key === 'S') { if (vision) vision.captureReference(); }
        if (e.key === 'c' || e.key === 'C') calibration.start();
    });

    console.log('[main] Ready. Triple-click to open settings.');
}

boot();
