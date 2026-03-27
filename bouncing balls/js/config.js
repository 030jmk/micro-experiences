export const CONFIG = {
    // --- Display ---
    PROJECTION_WIDTH: 1920,
    PROJECTION_HEIGHT: 1080,
    BACKGROUND_COLOR: '#000000',

    // --- Camera ---
    CAMERA_WIDTH: 1280,
    CAMERA_HEIGHT: 720,
    CAMERA_FACING_MODE: 'environment',

    // --- Physics ---
    GRAVITY: { x: 0, y: 1.0, scale: 0.001 },
    BALL_RADIUS: 8,
    BALL_RESTITUTION: 0.7,
    BALL_FRICTION: 0.05,
    BALL_DENSITY: 0.001,
    BALL_FILL_STYLE: '#ff6644',
    BALL_SPAWN_INTERVAL_MS: 200,
    BALL_SPAWN_SPREAD: 0.8,
    MAX_BALLS: 150,

    // --- Sticky Note Detection (HSV: H 0-180, S/V 0-255) ---
    STICKY_COLORS: [
        { name: 'yellow', low: [20, 80, 80, 0],  high: [35, 255, 255, 255] },
        { name: 'pink',   low: [140, 50, 80, 0],  high: [170, 255, 255, 255] },
        { name: 'green',  low: [35, 50, 80, 0],   high: [85, 255, 255, 255] },
        { name: 'blue',   low: [85, 50, 80, 0],   high: [130, 255, 255, 255] },
        { name: 'orange', low: [5, 100, 100, 0],   high: [20, 255, 255, 255] },
    ],
    MIN_CONTOUR_AREA: 2000,
    MORPH_KERNEL_SIZE: 5,

    // --- Vision / Physics Sync ---
    CV_FRAME_INTERVAL_MS: 66,
    SMOOTHING_ALPHA: 0.3,
    HYSTERESIS_FRAMES: 3,

    // --- Sticky Note Physics ---
    STICKY_RESTITUTION: 0.6,
    STICKY_FRICTION: 0.3,

    // --- Calibration ---
    CALIBRATION_POINTS: 4,
    CALIBRATION_DOT_RADIUS: 15,
    CALIBRATION_DOT_COLOR: '#00ff00',

    // --- Debug ---
    DEBUG_MODE: false,
    SHOW_WIREFRAMES: false,
};
