import { CONFIG } from './config.js';

const { Engine, Render, Runner, Bodies, Body, Composite, Events } = Matter;

export class PhysicsWorld {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.balls = [];
        this.stickyBodies = [];
        this.showOverlay = true;

        this.engine = Engine.create({
            gravity: CONFIG.GRAVITY
        });

        this.render = Render.create({
            canvas: this.canvas,
            engine: this.engine,
            options: {
                width: CONFIG.PROJECTION_WIDTH,
                height: CONFIG.PROJECTION_HEIGHT,
                wireframes: CONFIG.SHOW_WIREFRAMES,
                background: CONFIG.BACKGROUND_COLOR,
                pixelRatio: 'auto'
            }
        });
        Render.run(this.render);

        this.runner = Runner.create();
        Runner.run(this.runner, this.engine);

        this._createBoundaries();

        Events.on(this.engine, 'afterUpdate', () => this._cleanupBalls());
    }

    _createBoundaries() {
        const W = CONFIG.PROJECTION_WIDTH;
        const H = CONFIG.PROJECTION_HEIGHT;
        const T = 50;

        const walls = [
            Bodies.rectangle(W / 2, H + T + 100, W + 200, T, { isStatic: true, render: { visible: false } }),
            Bodies.rectangle(-T / 2, H / 2, T, H * 2, { isStatic: true, render: { visible: false } }),
            Bodies.rectangle(W + T / 2, H / 2, T, H * 2, { isStatic: true, render: { visible: false } }),
        ];

        Composite.add(this.engine.world, walls);
    }

    spawnBall() {
        if (this.balls.length >= CONFIG.MAX_BALLS) {
            const oldest = this.balls.shift();
            Composite.remove(this.engine.world, oldest);
        }

        const spread = CONFIG.PROJECTION_WIDTH * CONFIG.BALL_SPAWN_SPREAD;
        const offset = (CONFIG.PROJECTION_WIDTH - spread) / 2;
        const x = offset + Math.random() * spread;

        const ball = Bodies.circle(x, -CONFIG.BALL_RADIUS * 2, CONFIG.BALL_RADIUS, {
            restitution: CONFIG.BALL_RESTITUTION,
            friction: CONFIG.BALL_FRICTION,
            density: CONFIG.BALL_DENSITY,
            render: { fillStyle: CONFIG.BALL_FILL_STYLE },
            label: 'ball'
        });

        Composite.add(this.engine.world, ball);
        this.balls.push(ball);
    }

    _cleanupBalls() {
        const limit = CONFIG.PROJECTION_HEIGHT + 100;
        for (let i = this.balls.length - 1; i >= 0; i--) {
            if (this.balls[i].position.y > limit) {
                Composite.remove(this.engine.world, this.balls[i]);
                this.balls.splice(i, 1);
            }
        }
    }

    removeAllBalls() {
        this.balls.forEach(b => Composite.remove(this.engine.world, b));
        this.balls = [];
    }

    clearStickyBodies() {
        this.stickyBodies.forEach(b => Composite.remove(this.engine.world, b));
        this.stickyBodies = [];
    }

    setWireframes(on) {
        this.render.options.wireframes = on;
    }

    setBackground(color) {
        this.render.options.background = color;
    }

    addStickyBody(x, y, width, height, angleRad) {
        const body = Bodies.rectangle(x, y, width, height, {
            isStatic: true,
            angle: angleRad,
            restitution: CONFIG.STICKY_RESTITUTION,
            friction: CONFIG.STICKY_FRICTION,
            render: {
                fillStyle: 'rgba(255, 255, 0, 0.4)',
                strokeStyle: '#ffff00',
                lineWidth: 2
            },
            label: 'sticky'
        });
        Composite.add(this.engine.world, body);
        this.stickyBodies.push(body);
        return body;
    }

    addShapedBody(cx, cy, vertices, kind) {
        const renderOpts = kind === 'face'
            ? { fillStyle: 'rgba(100, 180, 255, 0.35)', strokeStyle: '#64b4ff', lineWidth: 2 }
            : { fillStyle: 'rgba(255, 220, 80, 0.35)', strokeStyle: '#ffdc50', lineWidth: 2 };

        if (!this.showOverlay) renderOpts.visible = false;

        const body = Bodies.fromVertices(cx, cy, [vertices], {
            isStatic: true,
            restitution: CONFIG.STICKY_RESTITUTION,
            friction: CONFIG.STICKY_FRICTION,
            render: renderOpts,
            label: kind
        });

        if (!body) return null;

        Body.setPosition(body, { x: cx, y: cy });
        Composite.add(this.engine.world, body);
        this.stickyBodies.push(body);
        return body;
    }

    setOverlayVisible(on) {
        this.showOverlay = on;
        for (const b of this.stickyBodies) {
            b.render.visible = on;
        }
    }
}
