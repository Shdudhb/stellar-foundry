import { useEffect, useRef } from 'preact/hooks';

interface Ember { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; hue: number; phase: number }

/** 星燼: slow embers drifting up behind the panels. Off when the player asks for reduced motion. */
export function Embers() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d');
    if (!ctx || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let w = 0;
    let h = 0;
    const embers: Ember[] = [];
    const spawn = (anywhere: boolean): Ember => {
      const max = 8 + Math.random() * 10;
      return {
        x: Math.random() * w,
        y: anywhere ? Math.random() * h : h + 10,
        vx: (Math.random() - 0.5) * 6,
        vy: -(8 + Math.random() * 22),
        r: 0.6 + Math.random() * 1.6,
        life: anywhere ? Math.random() * max : 0,
        max,
        hue: 18 + Math.random() * 26,
        phase: Math.random() * Math.PI * 2,
      };
    };
    const resize = () => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      w = innerWidth;
      h = innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const want = Math.min(70, Math.round((w * h) / 22000));
      while (embers.length < want) embers.push(spawn(true));
      embers.length = want;
    };
    resize();
    addEventListener('resize', resize);

    let raf = 0;
    let prev = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < embers.length; i++) {
        const e = embers[i];
        e.life += dt;
        e.x += (e.vx + Math.sin(e.life * 1.3 + e.phase) * 6) * dt;
        e.y += e.vy * dt;
        if (e.life > e.max || e.y < -10) {
          embers[i] = spawn(false);
          continue;
        }
        // Fade in, flicker, fade out
        const t = e.life / e.max;
        const a = Math.min(1, t * 6) * (1 - t) * (0.55 + 0.45 * Math.sin(e.life * 7 + e.phase));
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 5);
        g.addColorStop(0, `hsla(${e.hue}, 100%, 70%, ${a})`);
        g.addColorStop(0.3, `hsla(${e.hue}, 100%, 55%, ${a * 0.35})`);
        g.addColorStop(1, `hsla(${e.hue}, 100%, 50%, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(e.x - e.r * 5, e.y - e.r * 5, e.r * 10, e.r * 10);
      }
      raf = requestAnimationFrame(frame);
    };
    const onVisible = () => {
      cancelAnimationFrame(raf);
      if (document.visibilityState === 'visible') {
        prev = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return <canvas ref={ref} class="embers" aria-hidden="true" />;
}
