/**
 * Post Trade Labs — hero candle chart + light section motion
 */
(() => {
  'use strict';

  const COLORS = {
    grid: 'rgba(255,255,255,0.045)',
    bull: '#22C55E',
    bear: '#F87171',
    mint: '#2DD4A0',
    stop: '#FF5C7A',
    exit: '#EF5350',
    accent: '#1FA87A',
    accentSoft: 'rgba(31,168,122,0.45)',
    faint: 'rgba(238,245,242,0.28)',
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildSeries(count, seed) {
    const rand = mulberry32(seed);
    const candles = [];
    let price = 118.4;
    for (let i = 0; i < count; i++) {
      let drift = 0;
      if (i < 10) drift = (rand() - 0.55) * 0.35;
      else if (i < 18) drift = (rand() - 0.35) * 0.55;
      else if (i < 36) drift = 0.12 + (rand() - 0.3) * 0.7;
      else if (i < 44) drift = (rand() - 0.45) * 0.5;
      else drift = -0.05 + (rand() - 0.55) * 0.45;

      const open = price;
      const close = open + drift;
      const high = Math.max(open, close) + rand() * 0.45;
      const low = Math.min(open, close) - rand() * 0.4;
      candles.push({ open, high, low, close });
      price = close;
    }
    return candles;
  }

  const SERIES = buildSeries(56, 0x50c4a11);
  const ENTRY_I = 14;
  const STOP_PRICE = SERIES[ENTRY_I].low - 0.55;
  const EXIT_I = 42;
  const ENTRY_PRICE = SERIES[ENTRY_I].close;
  const EXIT_PRICE = SERIES[EXIT_I].close;
  const PNL = Math.round((EXIT_PRICE - ENTRY_PRICE) * 200);

  function createChart(canvas, opts = {}) {
    const state = {
      canvas,
      ctx: canvas.getContext('2d'),
      w: 0,
      h: 0,
      dpr: 1,
      visible: 1,
      playhead: 0,
      showMarks: false,
      markPop: 0,
      coachPulse: 0,
      pnlFlash: 0,
      pad: opts.pad || { t: 28, r: 18, b: 28, l: 18 },
      watermark: opts.watermark !== false,
    };

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      state.dpr = dpr;
      state.w = Math.max(1, Math.floor(rect.width));
      state.h = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(state.w * dpr);
      canvas.height = Math.floor(state.h * dpr);
      state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function priceRange(end) {
      const slice = SERIES.slice(0, Math.max(1, Math.ceil(end)));
      let lo = Infinity;
      let hi = -Infinity;
      for (const c of slice) {
        lo = Math.min(lo, c.low);
        hi = Math.max(hi, c.high);
      }
      if (state.showMarks) {
        lo = Math.min(lo, STOP_PRICE);
        hi = Math.max(hi, ENTRY_PRICE, EXIT_PRICE);
      }
      const pad = (hi - lo) * 0.12 || 1;
      return { lo: lo - pad, hi: hi + pad };
    }

    function yFor(price, lo, hi) {
      const { t, b } = state.pad;
      const plotH = state.h - t - b;
      return t + ((hi - price) / (hi - lo)) * plotH;
    }

    function drawGrid(ctx) {
      const { w, h, pad } = state;
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      for (let i = 1; i < 5; i++) {
        const y = pad.t + ((h - pad.t - pad.b) * i) / 5;
        ctx.beginPath();
        ctx.moveTo(pad.l, y);
        ctx.lineTo(w - pad.r, y);
        ctx.stroke();
      }
    }

    function drawCandle(ctx, c, x, bw, lo, hi) {
      const yO = yFor(c.open, lo, hi);
      const yC = yFor(c.close, lo, hi);
      const yH = yFor(c.high, lo, hi);
      const yL = yFor(c.low, lo, hi);
      const up = c.close >= c.open;
      const color = up ? COLORS.bull : COLORS.bear;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(x, yH);
      ctx.lineTo(x, yL);
      ctx.stroke();
      const top = Math.min(yO, yC);
      const body = Math.max(2, Math.abs(yC - yO));
      ctx.fillRect(x - bw / 2, top, bw, body);
    }

    function drawHLine(ctx, price, lo, hi, color, label, alpha, pop) {
      const y = yFor(price, lo, hi);
      const { pad, w } = state;
      ctx.save();
      ctx.globalAlpha = alpha * (0.55 + 0.45 * pop);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '600 11px Inter, system-ui, sans-serif';
      const tw = ctx.measureText(label).width;
      const bx = w - pad.r - tw - 14;
      const by = y - 10;
      ctx.globalAlpha = alpha * pop;
      ctx.fillStyle = 'rgba(5,5,5,0.75)';
      ctx.fillRect(bx - 6, by - 2, tw + 12, 16);
      ctx.fillStyle = color;
      ctx.fillText(label, bx, by + 10);
      ctx.restore();
    }

    function draw() {
      const ctx = state.ctx;
      const { w, h } = state;
      if (!w || !h) return;

      ctx.clearRect(0, 0, w, h);
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, 'rgba(31,168,122,0.05)');
      g.addColorStop(0.55, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(45,212,160,0.04)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      drawGrid(ctx);

      const end = clamp(state.visible, 1, SERIES.length);
      const { lo, hi } = priceRange(end);
      const plotW = w - state.pad.l - state.pad.r;
      const step = plotW / Math.max(SERIES.length - 1, 1);
      const bw = Math.max(2.5, step * 0.55);

      for (let i = 0; i < end; i++) {
        const frac = clamp(end - i, 0, 1);
        ctx.globalAlpha = 0.25 + 0.75 * frac;
        drawCandle(ctx, SERIES[i], state.pad.l + i * step, bw, lo, hi);
      }
      ctx.globalAlpha = 1;

      if (state.playhead > 0.01) {
        const x = state.pad.l + clamp(state.playhead, 0, SERIES.length - 1) * step;
        ctx.strokeStyle = 'rgba(245,245,247,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, state.pad.t);
        ctx.lineTo(x, h - state.pad.b);
        ctx.stroke();
      }

      if (state.showMarks) {
        const pop = clamp(state.markPop, 0, 1);
        drawHLine(ctx, ENTRY_PRICE, lo, hi, COLORS.mint, 'Entry', 1, pop);
        drawHLine(ctx, STOP_PRICE, lo, hi, COLORS.stop, 'Stop', 0.95, pop);
        if (end > EXIT_I) {
          drawHLine(ctx, EXIT_PRICE, lo, hi, COLORS.exit, 'Exit', 1, pop);
        }
      }

      if (state.coachPulse > 0.01) {
        const p = state.coachPulse;
        ctx.save();
        ctx.strokeStyle = `rgba(45,212,160,${0.45 * p})`;
        ctx.lineWidth = 2 + 6 * (1 - p);
        ctx.strokeRect(8, 8, w - 16, h - 16);
        const rg = ctx.createRadialGradient(w * 0.5, h * 0.55, 10, w * 0.5, h * 0.55, w * 0.45);
        rg.addColorStop(0, `rgba(31,168,122,${0.12 * p})`);
        rg.addColorStop(1, 'rgba(31,168,122,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      if (state.pnlFlash > 0.01) {
        const p = state.pnlFlash;
        const label = `+$${PNL}`;
        ctx.save();
        ctx.globalAlpha = p;
        ctx.font = '700 28px Inter, system-ui, sans-serif';
        ctx.fillStyle = COLORS.bull;
        ctx.shadowColor = 'rgba(34,197,94,0.45)';
        ctx.shadowBlur = 18;
        const tw = ctx.measureText(label).width;
        ctx.fillText(label, w - state.pad.r - tw, state.pad.t + 28);
        ctx.restore();
      }

      if (state.watermark) {
        ctx.save();
        ctx.font = '600 13px Inter, system-ui, sans-serif';
        ctx.fillStyle = COLORS.faint;
        ctx.fillText('NVDA', state.pad.l, 18);
        ctx.restore();
      }
    }

    return { state, resize, draw };
  }

  function runHero(chart) {
    const LOOP_MS = 12000;
    let start = performance.now();
    let raf = 0;
    let running = true;

    function frame(now) {
      if (!running) return;
      const t = ((now - start) % LOOP_MS) / LOOP_MS;
      const s = chart.state;

      if (t < 0.28) {
        const u = easeInOutCubic(t / 0.28);
        s.visible = lerp(8, SERIES.length, u);
        s.playhead = s.visible - 1;
        s.showMarks = false;
        s.markPop = 0;
        s.coachPulse = 0;
        s.pnlFlash = 0;
      } else if (t < 0.55) {
        const u = easeInOutCubic((t - 0.28) / 0.27);
        s.visible = SERIES.length;
        s.playhead = lerp(ENTRY_I - 2, EXIT_I + 1, u);
        s.showMarks = u > 0.15;
        s.markPop = easeOutBack(clamp((u - 0.15) / 0.35, 0, 1));
        s.coachPulse = 0;
        s.pnlFlash = 0;
      } else if (t < 0.78) {
        const u = (t - 0.55) / 0.23;
        s.visible = SERIES.length;
        s.playhead = EXIT_I;
        s.showMarks = true;
        s.markPop = 1;
        s.coachPulse = u < 0.25 ? easeOutBack(u / 0.25) : u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25;
        s.pnlFlash = 0;
      } else {
        const u = (t - 0.78) / 0.22;
        s.visible = SERIES.length;
        s.playhead = EXIT_I;
        s.showMarks = true;
        s.markPop = 1;
        s.coachPulse = 0;
        s.pnlFlash = u < 0.3 ? easeOutBack(u / 0.3) : u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      }

      chart.draw();
      raf = requestAnimationFrame(frame);
    }

    return {
      startLoop() {
        if (raf) cancelAnimationFrame(raf);
        running = true;
        start = performance.now();
        raf = requestAnimationFrame(frame);
      },
      stopLoop() {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      },
      showStatic() {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        const s = chart.state;
        s.visible = SERIES.length;
        s.playhead = EXIT_I;
        s.showMarks = true;
        s.markPop = 1;
        s.coachPulse = 0;
        s.pnlFlash = 0.85;
        chart.draw();
      },
    };
  }

  function createTape(canvas) {
    const ctx = canvas.getContext('2d');
    let w = 0;
    let h = 0;
    let points = [];
    let t0 = 0;
    let running = false;
    let raf = 0;
    let calloutShown = false;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      points = [];
      let y = h * 0.62;
      for (let i = 0; i < 80; i++) {
        const x = (i / 79) * w;
        if (i < 35) y += Math.sin(i * 0.35) * 3 + (i % 5 === 0 ? -4 : 1.2);
        else if (i < 48) y -= 2.8 + Math.sin(i * 0.5);
        else if (i < 58) y += 5.5;
        else y += Math.sin(i * 0.4) * 1.5;
        points.push({ x, y: Math.max(28, Math.min(h - 28, y)) });
      }
    }

    function draw(progress) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#0c0c0c';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(31,168,122,0.06)';
      for (let i = 1; i < 5; i++) {
        const y = (h * i) / 5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      const end = Math.max(2, Math.floor(points.length * progress));
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(238,245,242,0.85)';
      ctx.lineWidth = 1.75;
      for (let i = 0; i < end; i++) {
        if (i === 0) ctx.moveTo(points[i].x, points[i].y);
        else ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      const markI = Math.min(end - 1, 52);
      if (progress > 0.55 && points[markI]) {
        const p = points[markI];
        ctx.beginPath();
        ctx.fillStyle = '#2DD4A0';
        ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function frame(now) {
      if (!running) return;
      const u = Math.min(1, (now - t0) / 4200);
      draw(0.15 + u * 0.85);
      if (u > 0.62 && !calloutShown) {
        calloutShown = true;
        document.getElementById('detect-callout')?.classList.add('is-on');
      }
      if (u < 1) raf = requestAnimationFrame(frame);
      else {
        setTimeout(() => {
          if (!running) return;
          calloutShown = false;
          document.getElementById('detect-callout')?.classList.remove('is-on');
          t0 = performance.now();
          raf = requestAnimationFrame(frame);
        }, 2200);
      }
    }

    return {
      resize,
      start() {
        if (reduceMotion) {
          draw(1);
          document.getElementById('detect-callout')?.classList.add('is-on');
          return;
        }
        running = true;
        calloutShown = false;
        t0 = performance.now();
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(frame);
      },
      stop() {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      },
    };
  }

  function boot() {
    const heroCanvas = document.getElementById('hero-canvas');
    const heroChart = heroCanvas
      ? createChart(heroCanvas, { pad: { t: 36, r: 24, b: 40, l: 24 } })
      : null;
    const hero = heroChart ? runHero(heroChart) : null;

    const tapeCanvas = document.getElementById('tape-canvas');
    const tape = tapeCanvas ? createTape(tapeCanvas) : null;

    function resizeAll() {
      heroChart?.resize();
      tape?.resize();
      heroChart?.draw();
    }
    resizeAll();
    window.addEventListener('resize', resizeAll);

    if (heroChart && hero) {
      if (reduceMotion) hero.showStatic();
      else {
        const heroEl = document.querySelector('.hero');
        const io = new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              if (e.isIntersecting) hero.startLoop();
              else hero.stopLoop();
            }
          },
          { threshold: 0.2 },
        );
        if (heroEl) io.observe(heroEl);
        else hero.startLoop();
      }
    }

    const detect = document.getElementById('detect');
    const engine = document.getElementById('engine');
    const featureIO = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.target === detect) {
            if (e.isIntersecting) tape?.start();
            else tape?.stop();
          }
          if (e.target === engine) {
            if (e.isIntersecting) e.target.classList.add('is-on');
            else if (!reduceMotion) e.target.classList.remove('is-on');
          }
        }
      },
      { threshold: 0.35 },
    );
    if (detect) featureIO.observe(detect);
    if (engine) featureIO.observe(engine);

    // Scroll pop-ins (phones + sections)
    const reveals = document.querySelectorAll('[data-reveal]');
    if (reduceMotion) {
      reveals.forEach((el) => el.classList.add('is-in'));
    } else {
      const revealIO = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const delay = Number(e.target.getAttribute('data-delay') || 0);
            window.setTimeout(() => {
              e.target.classList.add('is-in');
            }, delay);
            revealIO.unobserve(e.target);
          }
        },
        { threshold: 0.18, rootMargin: '0px 0px -8% 0px' },
      );
      reveals.forEach((el) => revealIO.observe(el));
    }

    if (document.fonts?.ready) document.fonts.ready.then(resizeAll);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
