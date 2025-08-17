"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Obstacle = {
    x: number;
    width: number;
    height: number;
    img?: HTMLImageElement;
};

type Cloud = {
    x: number;
    y: number;
    speed: number;
    scale: number;
};

export default function DinoGame() {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const [isGameOver, setIsGameOver] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [showMenu, setShowMenu] = useState(true);
    const [showLeaderboard, setShowLeaderboard] = useState(false);
    const [topScores, setTopScores] = useState<number[]>([]);
    const [score, setScore] = useState(0);
    const [highScore, setHighScore] = useState(0);

    const playerYRef = useRef(0);
    const playerVyRef = useRef(0);
    const isOnGroundRef = useRef(true);

    const speedRef = useRef(260); // px/s
    const gravityRef = useRef(1350); // px/s^2 (slightly stronger)
    const jumpVelocityRef = useRef(-560); // px/s (slightly higher)

    const obstaclesRef = useRef<Obstacle[]>([]);
    const spawnTimerRef = useRef(0);
    const cloudsRef = useRef<Cloud[]>([]);
    const cloudSpawnTimerRef = useRef(0);
    const lastTimeRef = useRef<number | null>(null);

    const PLAYER_WIDTH = 56;
    const PLAYER_HEIGHT = 64;

    // sprite + assets
    const RUN_FRAMES = 4;
    const RUN_FPS = 10;
    const runFrameRef = useRef(0);
    const runFrameTimerRef = useRef(0);
    const groundScrollRef = useRef(0);

    type Assets = {
        ground: HTMLImageElement | null;
        cloud: HTMLImageElement | null;
        tree1: HTMLImageElement | null;
        tree2: HTMLImageElement | null;
        character: HTMLImageElement | null;
    };
    const imagesRef = useRef<Assets>({
        ground: null,
        cloud: null,
        tree1: null,
        tree2: null,
        character: null,
    });
    const assetsReadyRef = useRef(false);

    useEffect(() => {
        try {
            const saved = localStorage.getItem("dinoHighScore");
            if (saved) setHighScore(Number(saved));
        } catch { }
    }, []);

    // load assets
    useEffect(() => {
        const sources = {
            ground: "/ground.png",
            cloud: "/cloud.png",
            tree1: "/tree1.png",
            tree2: "/tree2.png",
            character: "/character.png",
        } as const;
        let loaded = 0;
        const total = Object.keys(sources).length;
        const loadImage = <K extends keyof Assets>(key: K, src: string) => {
            const img = new Image();
            img.onload = () => {
                loaded += 1;
                if (loaded >= total) assetsReadyRef.current = true;
            };
            img.src = src;
            imagesRef.current[key] = img;
        };
        for (const [k, v] of Object.entries(sources) as [keyof Assets, string][]) {
            loadImage(k, v);
        }
    }, []);

    const resetGame = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        setIsGameOver(false);
        setScore(0);
        speedRef.current = 260;
        obstaclesRef.current = [];
        spawnTimerRef.current = 0;
        cloudsRef.current = [];
        cloudSpawnTimerRef.current = 0;
        lastTimeRef.current = null;
        isOnGroundRef.current = true;
        playerVyRef.current = 0;
        const groundTopY = Math.floor(canvas.height / 2);
        playerYRef.current = groundTopY - PLAYER_HEIGHT;
        runFrameRef.current = 0;
        runFrameTimerRef.current = 0;
        groundScrollRef.current = 0;
        setIsRunning(true);
    }, []);

    const endGame = useCallback(() => {
        setIsGameOver(true);
        setIsRunning(false);
        setHighScore((prev) => {
            const next = Math.max(prev, score);
            try {
                localStorage.setItem("dinoHighScore", String(next));
            } catch { }
            return next;
        });
        try {
            const raw = localStorage.getItem("dinoScores");
            const arr: number[] = raw ? JSON.parse(raw) : [];
            arr.push(score);
            arr.sort((a, b) => b - a);
            localStorage.setItem("dinoScores", JSON.stringify(arr.slice(0, 10)));
            setTopScores(arr.slice(0, 10));
        } catch { }
    }, [score]);

    const jump = useCallback(() => {
        if (isOnGroundRef.current && isRunning && !isGameOver) {
            isOnGroundRef.current = false;
            playerVyRef.current = jumpVelocityRef.current;
        }
    }, [isGameOver, isRunning]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (showMenu || showLeaderboard) return;
            if (e.code === "Space" || e.code === "ArrowUp") {
                e.preventDefault();
                if (!isRunning && isGameOver) {
                    resetGame();
                } else {
                    jump();
                }
            }
        };
        const handlePointer = () => {
            if (showMenu || showLeaderboard) return;
            if (!isRunning && isGameOver) {
                resetGame();
            } else {
                jump();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("pointerdown", handlePointer);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("pointerdown", handlePointer);
        };
    }, [isRunning, isGameOver, jump, resetGame, showMenu, showLeaderboard]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const resize = () => {
            const parent = canvas.parentElement;
            const parentWidth = parent ? parent.clientWidth : window.innerWidth;
            const parentHeight = parent ? parent.clientHeight : window.innerHeight;
            const aspect = 9 / 16; // portrait
            const height = parentHeight;
            const widthByHeight = Math.floor(height * aspect);
            const width = Math.min(parentWidth, widthByHeight);
            canvas.width = width;
            canvas.height = height;
            const groundTopY = Math.floor(canvas.height / 2);
            playerYRef.current = groundTopY - PLAYER_HEIGHT;
        };

        resize();
        const observer = new ResizeObserver(resize);
        if (canvas.parentElement) observer.observe(canvas.parentElement);

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!isRunning && !showMenu) return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;

        const step = (time: number) => {
            if (!lastTimeRef.current) lastTimeRef.current = time;
            const dt = Math.min(0.032, (time - lastTimeRef.current) / 1000);
            lastTimeRef.current = time;

            if (isRunning) {
                setScore((s) => s + Math.floor(dt * 100));
            }
            speedRef.current = Math.min(560, speedRef.current + dt * 8);

            playerVyRef.current += gravityRef.current * dt;
            playerYRef.current += playerVyRef.current * dt;

            const groundTopY = Math.floor(canvas.height / 2);
            const groundY = groundTopY - PLAYER_HEIGHT;
            if (playerYRef.current >= groundY) {
                playerYRef.current = groundY;
                playerVyRef.current = 0;
                isOnGroundRef.current = true;
            }

            spawnTimerRef.current -= dt;
            if (spawnTimerRef.current <= 0) {
                const useTree1 = Math.random() < 0.5;
                const img = useTree1 ? imagesRef.current.tree1 : imagesRef.current.tree2;
                const baseH = 48 + Math.floor(Math.random() * 28);
                if (img && img.width && img.height) {
                    const scale = baseH / img.height;
                    const w = Math.max(10, Math.floor(img.width * scale));
                    obstaclesRef.current.push({ x: canvas.width + 10, width: w, height: baseH, img });
                } else {
                    obstaclesRef.current.push({ x: canvas.width + 10, width: 18, height: baseH });
                }
                spawnTimerRef.current = 0.9 + Math.random() * 0.9;
            }

            for (const ob of obstaclesRef.current) {
                ob.x -= speedRef.current * dt;
            }
            obstaclesRef.current = obstaclesRef.current.filter(
                (o) => o.x + o.width > 0,
            );

            // clouds
            cloudSpawnTimerRef.current -= dt;
            if (cloudSpawnTimerRef.current <= 0) {
                const scale = 0.6 + Math.random() * 0.6;
                const y = 10 + Math.random() * Math.max(10, canvas.height * 0.25);
                const speed = Math.max(20, speedRef.current * 0.25 * (0.7 + Math.random() * 0.6));
                cloudsRef.current.push({ x: canvas.width + 20, y, speed, scale });
                cloudSpawnTimerRef.current = 2 + Math.random() * 3;
            }
            for (const c of cloudsRef.current) {
                c.x -= c.speed * dt;
            }
            cloudsRef.current = cloudsRef.current.filter((c) => c.x > -200);

            const px = Math.floor((canvas.width - PLAYER_WIDTH) / 2);
            const py = playerYRef.current;
            const pw = PLAYER_WIDTH;
            const ph = PLAYER_HEIGHT;

            // compute character draw rect (contain-fit) for precise collisions
            const charImgForBounds = imagesRef.current.character;
            let cdx = px, cdy = py, cdw = pw, cdh = ph;
            if (charImgForBounds && charImgForBounds.width && charImgForBounds.height) {
                const frameWb = Math.floor(charImgForBounds.width / RUN_FRAMES);
                const swb = frameWb;
                const shb = charImgForBounds.height;
                const scaleB = Math.min(pw / swb, ph / shb);
                cdw = Math.floor(swb * scaleB);
                cdh = Math.floor(shb * scaleB);
                cdx = Math.floor(px + (pw - cdw) / 2);
                cdy = Math.floor(py + (ph - cdh));
            }
            // shrink character hitbox slightly to match visible sprite better
            const charShrinkX = Math.floor(cdw * 0.12);
            const charShrinkY = Math.floor(cdh * 0.08);
            const cax = cdx + charShrinkX;
            const cay = cdy + charShrinkY;
            const caw = Math.max(1, cdw - charShrinkX * 2);
            const cah = Math.max(1, cdh - charShrinkY * 2);

            if (isRunning) {
                for (const o of obstaclesRef.current) {
                    const groundTopY2 = Math.floor(canvas.height / 2);
                    const oy = groundTopY2 - o.height;
                    const ox = o.x;
                    const ow = o.width;
                    const oh = o.height;
                    // shrink obstacle hitbox (trees often have transparent padding)
                    const obsShrinkX = Math.floor(ow * 0.15);
                    const obsShrinkY = Math.floor(oh * 0.05);
                    const oax = ox + obsShrinkX;
                    const oay = oy + obsShrinkY;
                    const oaw = Math.max(1, ow - obsShrinkX * 2);
                    const oah = Math.max(1, oh - obsShrinkY * 2);

                    const noOverlap = cax + caw <= oax || cax >= oax + oaw || cay + cah <= oay || cay >= oay + oah;
                    if (!noOverlap) {
                        endGame();
                        return;
                    }
                }
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // sky background
            ctx.fillStyle = "#a6cff9";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            // crisp rendering to reduce seams
            ctx.imageSmoothingEnabled = false;

            // Read theme colors from CSS variables to respect existing styling
            const computed = getComputedStyle(document.documentElement);
            const colorBorder = computed.getPropertyValue("--app-card-border").trim() || "#e5e7eb";
            const colorAccent = computed.getPropertyValue("--app-accent").trim() || "#0052FF";
            const colorForeground = computed.getPropertyValue("--app-foreground").trim() || "#111111";

            // clouds background
            const cloudImg = imagesRef.current.cloud;
            if (cloudImg && cloudImg.width && cloudImg.height) {
                for (const c of cloudsRef.current) {
                    const cw = cloudImg.width * c.scale;
                    const ch = cloudImg.height * c.scale;
                    ctx.globalAlpha = 0.9;
                    ctx.drawImage(cloudImg, c.x, c.y, cw, ch);
                    ctx.globalAlpha = 1;
                }
            }

            // ground texture with scroll: bottom half, contain-like (fit height, keep ratio) and tile horizontally
            const groundImg = imagesRef.current.ground;
            const groundTopY2 = Math.floor(canvas.height / 2);
            const groundHeight2 = canvas.height - groundTopY2;
            if (groundImg && groundImg.width && groundImg.height) {
                const scale = groundHeight2 / groundImg.height; // fit height (contain)
                const tileW = Math.ceil(groundImg.width * scale);
                const tileH = groundHeight2; // exact fit
                groundScrollRef.current = (groundScrollRef.current + speedRef.current * dt) % tileW;
                const offset = groundScrollRef.current;
                for (let x = -offset; x < canvas.width + tileW; x += tileW) {
                    const drawX = Math.floor(x);
                    ctx.drawImage(groundImg, drawX, groundTopY2, tileW + 1, tileH);
                }
            } else {
                ctx.fillStyle = colorBorder;
                ctx.fillRect(0, groundTopY2, canvas.width, groundHeight2);
            }

            // player
            const charImg = imagesRef.current.character;
            if (charImg && charImg.width && charImg.height) {
                runFrameTimerRef.current += dt;
                if (runFrameTimerRef.current >= 1 / RUN_FPS) {
                    runFrameTimerRef.current = 0;
                    runFrameRef.current = (runFrameRef.current + 1) % RUN_FRAMES;
                }
                const frameW = Math.floor(charImg.width / RUN_FRAMES);
                const sx = runFrameRef.current * frameW;
                const sy = 0;
                const sw = frameW;
                const sh = charImg.height;
                // contain fit inside (pw x ph), align bottom center
                const scale = Math.min(pw / sw, ph / sh);
                const dw = Math.floor(sw * scale);
                const dh = Math.floor(sh * scale);
                const dx = Math.floor(px + (pw - dw) / 2);
                const dy = Math.floor(py + (ph - dh));
                ctx.drawImage(charImg, sx, sy, sw, sh, dx, dy, dw, dh);
            } else {
                ctx.fillStyle = colorAccent;
                ctx.fillRect(px, py, pw, ph);
            }

            // obstacles
            for (const o of obstaclesRef.current) {
                const groundTopY = Math.floor(canvas.height / 2);
                const oy = groundTopY - o.height;
                if (o.img && o.img.width && o.img.height) {
                    ctx.drawImage(o.img, o.x, oy, o.width, o.height);
                } else {
                    ctx.fillStyle = colorForeground;
                    ctx.fillRect(o.x, oy, o.width, o.height);
                }
            }

            // score (Press Start 2P)
            ctx.fillStyle = colorForeground;
            ctx.textBaseline = "top";
            ctx.font = "14px 'Press Start 2P', monospace";
            ctx.fillText(`Score: ${score}`, 12, 12);
            ctx.fillText(`High: ${highScore}`, 12, 32);

            if (isRunning) requestAnimationFrame(step);
        };

        const raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [endGame, highScore, isRunning, score]);

    useEffect(() => {
        // preload leaderboard on mount
        try {
            const raw = localStorage.getItem("dinoScores");
            const arr: number[] = raw ? JSON.parse(raw) : [];
            setTopScores(arr.slice(0, 10));
        } catch { }
    }, []);

    return (
        <div className="w-full h-full">
            <div className="h-full flex justify-center">
                <div className="relative h-full border border-[var(--app-card-border)] rounded-lg overflow-hidden">
                    <canvas ref={canvasRef} className="h-full w-auto block" />
                    {showMenu && (
                        <div className="absolute inset-0 flex items-end justify-center pb-8">
                            <div
                                className="absolute inset-0"
                                style={{
                                    backgroundImage: "url('/bg.png')",
                                    backgroundSize: "cover",
                                    backgroundPosition: "center",
                                    pointerEvents: "none",
                                }}
                            />
                            <div className="w-full px-6 relative z-10">
                                <div className="mx-auto max-w-xs px-6 py-6 rounded-2xl bg-[var(--app-card-bg)] border-2 border-[var(--app-card-border)] text-center shadow-[0_6px_0_rgba(0,0,0,0.15)]">
                                    <div className="mb-4 text-[var(--app-foreground)]" style={{ fontFamily: "'Bangers', system-ui, sans-serif", fontSize: 30 }}>
                                        MENU
                                    </div>
                                    <div className="flex flex-col gap-3">
                                        <button
                                            type="button"
                                            onClick={() => { setShowMenu(false); resetGame(); }}
                                            className="relative inline-flex items-center justify-center rounded-full px-6 py-3 text-black border-2 border-[#19A8E2] border-b-4 border-b-[#1189BC] shadow-[0_4px_0_#1189BC] bg-[#23C3FF] active:translate-y-[2px] active:shadow-[0_2px_0_#1189BC]"
                                            style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 12 }}
                                        >
                                            START
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setShowLeaderboard(true); try { const raw = localStorage.getItem('dinoScores'); const arr: number[] = raw ? JSON.parse(raw) : []; setTopScores(arr.slice(0,10)); } catch {} }}
                                            className="relative inline-flex items-center justify-center rounded-full px-6 py-3 text-black border-2 border-[#C8A02A] border-b-4 border-b-[#A9851F] shadow-[0_4px_0_#A9851F] bg-[#FFD44D] active:translate-y-[2px] active:shadow-[0_2px_0_#A9851F]"
                                            style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 11 }}
                                        >
                                            LEADERBOARD
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {showLeaderboard && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-full px-6" onClick={() => setShowLeaderboard(false)}>
                                <div className="mx-auto max-w-xs px-6 py-6 rounded-2xl bg-[var(--app-background)] border-2 border-[var(--app-card-border)] text-center shadow-[0_6px_0_rgba(0,0,0,0.15)]" onClick={(e) => e.stopPropagation()}>
                                    <div className="mb-3 text-[var(--app-foreground)]" style={{ fontFamily: "'Bangers', system-ui, sans-serif", fontSize: 26 }}>LEADERBOARD</div>
                                    <ol className="text-left text-[var(--app-foreground)] mb-4" style={{ fontFamily: "'Manrope', system-ui, sans-serif", fontSize: 15 }}>
                                        {topScores.length === 0 && <li className="text-[var(--app-foreground-muted)]">No scores yet</li>}
                                        {topScores.map((s, i) => (
                                            <li key={i} className="flex items-center justify-between py-1">
                                                <span className="text-[var(--app-foreground-muted)]">#{i + 1}</span>
                                                <span>{s}</span>
                                            </li>
                                        ))}
                                    </ol>
                                    <button
                                        type="button"
                                        onClick={() => setShowLeaderboard(false)}
                                        className="relative inline-flex items-center justify-center rounded-full px-6 py-3 text-black border-2 border-[#19A8E2] border-b-4 border-b-[#1189BC] shadow-[0_4px_0_#1189BC] bg-[#23C3FF] active:translate-y-[2px] active:shadow-[0_2px_0_#1189BC]"
                                        style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 12 }}
                                    >
                                        CLOSE
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                    {isGameOver && (
                        <div className="absolute inset-0 flex items-start justify-center pt-14">
                            <div className="px-5 py-4 rounded-lg bg-[var(--app-card-bg)] border border-[var(--app-card-border)] text-center shadow-lg">
                                <div className="text-[var(--app-foreground)] mb-2 text-base" style={{ fontFamily: "'Bangers', system-ui, sans-serif" }}>GAME OVER</div>
                                <div className="text-[var(--app-foreground-muted)] text-sm mb-3" style={{ fontFamily: "'Manrope', system-ui, sans-serif" }}>Score {score} · High {highScore}</div>
                                <div className="flex gap-3 justify-center">
                                    <button
                                        type="button"
                                        onClick={() => { setShowMenu(false); resetGame(); }}
                                        className="relative inline-flex items-center justify-center rounded-full px-6 py-3 text-black border-2 border-[#19A8E2] border-b-4 border-b-[#1189BC] shadow-[0_4px_0_#1189BC] bg-[#23C3FF] active:translate-y-[2px] active:shadow-[0_2px_0_#1189BC]"
                                        style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 12 }}
                                    >
                                        PLAY AGAIN
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setIsGameOver(false); setIsRunning(false); setShowLeaderboard(false); setShowMenu(true); }}
                                        className="relative inline-flex items-center justify-center rounded-full px-6 py-3 text-black border-2 border-[#D455B3] border-b-4 border-b-[#B14693] shadow-[0_4px_0_#B14693] bg-[#FF6AD5] active:translate-y-[2px] active:shadow-[0_2px_0_#B14693]"
                                        style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 10 }}
                                    >
                                        MENU
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}


