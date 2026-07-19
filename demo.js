/**
 * Post Trade Labs — marketing product demos
 * Canvas candle engine + hero loop + scroll-triggered feature scenes
 */
(() => {
  'use strict';

  const COLORS = {
    bg: '#0D0D0D',
    grid: 'rgba(255,255,255,0.045)',
    bull: '#22C55E',
    bear: '#F87171',
    mint: '#4ADEB8',
    stop: '#FF5C7A',
    exit: '#EF5350',
    accent: '#A855F7',
    accentBright: '#C084FC',
    ink: '#F5F5F7',
    muted: 'rgba(245,245,247,0.55)',
    faint: 'rgba(245,245,247,0.28)',
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // —— Math helpers ——
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

  /** Deterministic OHLC path: grind → entry → runner → late exit */
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
      const wickUp = rand() * 0.45;
      const wickDn = rand() * 0.4;
      const high = Math.max(open, close) + wickUp;
      const low = Math.min(open, close) - wickDn;
      candles.push({ open, high, low, close, t: i });
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
  const PNL = Math.round((EXIT_PRICE - ENTRY_PRICE) * 200); // ~2 contracts fantasy

  // —— Candle chart renderer ——
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
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha * pop;
      const tw = ctx.measureText(label).width;
      const bx = w - pad.r - tw - 14;
      const by = y - 10;
      ctx.fillStyle = 'rgba(13,13,13,0.75)';
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

      // subtle depth wash
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, 'rgba(168,85,247,0.04)');
      g.addColorStop(0.5, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(74,222,184,0.03)');
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
        const x = state.pad.l + i * step;
        drawCandle(ctx, SERIES[i], x, bw, lo, hi);
      }
      ctx.globalAlpha = 1;

      // playhead
      if (state.playhead > 0.01) {
        const pi = clamp(state.playhead, 0, SERIES.length - 1);
        const x = state.pad.l + pi * step;
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
        ctx.strokeStyle = `rgba(168,85,247,${0.55 * p})`;
        ctx.lineWidth = 2 + 6 * (1 - p);
        ctx.strokeRect(8, 8, w - 16, h - 16);
        const rg = ctx.createRadialGradient(w * 0.5, h * 0.55, 10, w * 0.5, h * 0.55, w * 0.45);
        rg.addColorStop(0, `rgba(168,85,247,${0.12 * p})`);
        rg.addColorStop(1, 'rgba(168,85,247,0)');
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
        ctx.fillText('NVDA · 1m', state.pad.l, 18);
        ctx.restore();
      }
    }

    return { state, resize, draw };
  }

  // —— Hero timeline (~12s loop) ——
  function runHero(chart) {
    const LOOP_MS = 12000;
    let start = performance.now();
    let raf = 0;
    let running = true;

    function frame(now) {
      if (!running) return;
      const t = ((now - start) % LOOP_MS) / LOOP_MS;
      const s = chart.state;

      // 0–0.28 paint candles
      if (t < 0.28) {
        const u = easeInOutCubic(t / 0.28);
        s.visible = lerp(8, SERIES.length, u);
        s.playhead = s.visible - 1;
        s.showMarks = false;
        s.markPop = 0;
        s.coachPulse = 0;
        s.pnlFlash = 0;
      }
      // 0.28–0.55 scrub focus around trade
      else if (t < 0.55) {
        const u = easeInOutCubic((t - 0.28) / 0.27);
        s.visible = SERIES.length;
        s.playhead = lerp(ENTRY_I - 2, EXIT_I + 1, u);
        s.showMarks = u > 0.15;
        s.markPop = easeOutBack(clamp((u - 0.15) / 0.35, 0, 1));
        s.coachPulse = 0;
        s.pnlFlash = 0;
      }
      // 0.55–0.78 coach freeze
      else if (t < 0.78) {
        const u = (t - 0.55) / 0.23;
        s.visible = SERIES.length;
        s.playhead = EXIT_I;
        s.showMarks = true;
        s.markPop = 1;
        s.coachPulse = u < 0.25 ? easeOutBack(u / 0.25) : u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25;
        s.pnlFlash = 0;
      }
      // 0.78–1.0 P&L flash + hold
      else {
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

    function startLoop() {
      if (raf) cancelAnimationFrame(raf);
      running = true;
      start = performance.now();
      raf = requestAnimationFrame(frame);
    }

    function stopLoop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function showStatic() {
      stopLoop();
      const s = chart.state;
      s.visible = SERIES.length;
      s.playhead = EXIT_I;
      s.showMarks = true;
      s.markPop = 1;
      s.coachPulse = 0;
      s.pnlFlash = 0.85;
      chart.draw();
    }

    return { startLoop, stopLoop, showStatic };
  }

  // —— Feature: replay canvas scrub ——
  function runReplayScene(chart, root) {
    const scrub = root.querySelector('[data-scrub]');
    const thumb = root.querySelector('[data-thumb]');
    const clock = root.querySelector('[data-clock]');
    let raf = 0;
    let running = false;
    let t0 = 0;
    const DUR = 6500;

    function setUI(progress) {
      const pct = `${(progress * 100).toFixed(2)}%`;
      if (scrub) scrub.style.width = pct;
      if (thumb) thumb.style.left = pct;
      if (clock) {
        const mins = 9 * 60 + 42 + Math.floor(progress * (EXIT_I - ENTRY_I + 8));
        const hh = String(Math.floor(mins / 60)).padStart(2, '0');
        const mm = String(mins % 60).padStart(2, '0');
        clock.textContent = `${hh}:${mm}`;
      }
    }

    function frame(now) {
      if (!running) return;
      const u = ((now - t0) % DUR) / DUR;
      const scrubU = easeInOutCubic(u);
      const s = chart.state;
      s.visible = lerp(ENTRY_I + 2, SERIES.length, scrubU);
      s.playhead = lerp(ENTRY_I, EXIT_I + 2, scrubU);
      s.showMarks = scrubU > 0.12;
      s.markPop = clamp((scrubU - 0.12) / 0.2, 0, 1);
      s.coachPulse = 0;
      s.pnlFlash = 0;
      setUI(scrubU);
      chart.draw();
      raf = requestAnimationFrame(frame);
    }

    return {
      start() {
        if (reduceMotion) {
          chart.state.visible = SERIES.length;
          chart.state.playhead = EXIT_I;
          chart.state.showMarks = true;
          chart.state.markPop = 1;
          setUI(1);
          chart.draw();
          return;
        }
        running = true;
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

  // —— Feature: coach typewriter ——
  function runCoachScene(chart, root) {
    const sheet = root.querySelector('[data-coach-sheet]');
    const line = root.querySelector('[data-coach-line]');
    const message =
      'You moved the stop farther after the first red bar. That is revenge sizing — not the plan.';
    let raf = 0;
    let running = false;
    let t0 = 0;
    const FREEZE_AT = 0.35;
    const TYPE_START = 0.42;
    const LOOP = 9000;

    function frame(now) {
      if (!running) return;
      const u = ((now - t0) % LOOP) / LOOP;
      const s = chart.state;

      if (u < FREEZE_AT) {
        const p = easeInOutCubic(u / FREEZE_AT);
        s.visible = lerp(20, EXIT_I + 1, p);
        s.playhead = s.visible - 1;
        s.showMarks = p > 0.4;
        s.markPop = clamp((p - 0.4) / 0.3, 0, 1);
        s.coachPulse = 0;
        if (sheet) sheet.classList.remove('is-open', 'is-typing');
        if (line) line.textContent = '';
      } else {
        s.visible = EXIT_I + 1;
        s.playhead = EXIT_I;
        s.showMarks = true;
        s.markPop = 1;
        const freezeAge = (u - FREEZE_AT) / (1 - FREEZE_AT);
        s.coachPulse = freezeAge < 0.2 ? easeOutBack(freezeAge / 0.2) : 0.55 + 0.2 * Math.sin(now / 400);

        if (sheet) {
          sheet.classList.add('is-open');
          if (u >= TYPE_START) {
            sheet.classList.add('is-typing');
            const typeU = clamp((u - TYPE_START) / 0.35, 0, 1);
            const n = Math.floor(typeU * message.length);
            if (line) line.textContent = message.slice(0, n);
            if (typeU >= 1) sheet.classList.remove('is-typing');
          }
        }
      }

      chart.draw();
      raf = requestAnimationFrame(frame);
    }

    return {
      start() {
        if (reduceMotion) {
          chart.state.visible = EXIT_I + 1;
          chart.state.playhead = EXIT_I;
          chart.state.showMarks = true;
          chart.state.markPop = 1;
          chart.state.coachPulse = 0.6;
          if (sheet) {
            sheet.classList.add('is-open');
            sheet.classList.remove('is-typing');
          }
          if (line) line.textContent = message;
          chart.draw();
          return;
        }
        running = true;
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

  // —— Journal + debrief DOM scenes ——
  function animateCount(el, to, prefix, dur) {
    if (!el) return;
    if (reduceMotion) {
      el.textContent = `${prefix}${to}`;
      return;
    }
    const t0 = performance.now();
    function tick(now) {
      const u = clamp((now - t0) / dur, 0, 1);
      const v = Math.round(lerp(0, to, easeOutBack(Math.min(1, u))));
      el.textContent = `${prefix}${v}`;
      if (u < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function runJournalScene(section) {
    const pnl = section.querySelector('[data-pnl]');
    const time = section.querySelector('[data-entry-time]');
    let started = false;
    return {
      start() {
        if (started && !reduceMotion) return;
        started = true;
        if (time) time.textContent = '09:42 → 10:18';
        animateCount(pnl, PNL, '+$', 1100);
      },
      stop() {},
      reset() {
        started = false;
        if (pnl) pnl.textContent = '+$0';
        if (time) time.textContent = '09:42 → —';
      },
    };
  }

  function runDebriefScene(section) {
    const pnl = section.querySelector('[data-debrief-pnl]');
    const takes = section.querySelectorAll('[data-take]');
    let started = false;
    return {
      start() {
        if (started && !reduceMotion) {
          // still replay count on re-enter after long leave — allow restart when inactive
        }
        started = true;
        animateCount(pnl, PNL, '+$', 1200);
        takes.forEach((li, i) => {
          li.classList.remove('is-in');
          window.setTimeout(() => li.classList.add('is-in'), reduceMotion ? 0 : 400 + i * 280);
        });
      },
      stop() {},
      reset() {
        started = false;
        if (pnl) pnl.textContent = '+$0';
        takes.forEach((li) => li.classList.remove('is-in'));
      },
    };
  }

  // —— Boot ——
  function boot() {
    const heroCanvas = document.getElementById('hero-canvas');
    const replayCanvas = document.getElementById('replay-canvas');
    const coachCanvas = document.getElementById('coach-canvas');

    const heroChart = heroCanvas ? createChart(heroCanvas, { pad: { t: 36, r: 24, b: 40, l: 24 } }) : null;
    const replayChart = replayCanvas ? createChart(replayCanvas, { watermark: true }) : null;
    const coachChart = coachCanvas ? createChart(coachCanvas, { watermark: true }) : null;

    const hero = heroChart ? runHero(heroChart) : null;
    const replaySection = document.querySelector('[data-scene="replay"]');
    const coachSection = document.querySelector('[data-scene="coach"]');
    const journalSection = document.querySelector('[data-scene="journal"]');
    const debriefSection = document.querySelector('[data-scene="debrief"]');

    const replayCtrl =
      replayChart && replaySection ? runReplayScene(replayChart, replaySection) : null;
    const coachCtrl =
      coachChart && coachSection ? runCoachScene(coachChart, coachSection) : null;
    const journalCtrl = journalSection ? runJournalScene(journalSection) : null;
    const debriefCtrl = debriefSection ? runDebriefScene(debriefSection) : null;

    function resizeAll() {
      heroChart?.resize();
      replayChart?.resize();
      coachChart?.resize();
      heroChart?.draw();
      replayChart?.draw();
      coachChart?.draw();
    }

    resizeAll();
    window.addEventListener('resize', resizeAll);

    // Hero visibility
    if (heroChart && hero) {
      if (reduceMotion) {
        hero.showStatic();
      } else {
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

    // Feature sections
    const controllers = new Map();
    if (journalSection) controllers.set(journalSection, journalCtrl);
    if (replaySection) controllers.set(replaySection, replayCtrl);
    if (coachSection) controllers.set(coachSection, coachCtrl);
    if (debriefSection) controllers.set(debriefSection, debriefCtrl);

    const featureIO = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const ctrl = controllers.get(e.target);
          if (!ctrl) continue;
          if (e.isIntersecting) {
            e.target.classList.add('is-active');
            ctrl.start();
          } else {
            e.target.classList.remove('is-active');
            ctrl.stop();
            if (typeof ctrl.reset === 'function') ctrl.reset();
          }
        }
      },
      { threshold: 0.35 },
    );

    controllers.forEach((_, el) => featureIO.observe(el));

    // Initial sizes after fonts
    if (document.fonts?.ready) {
      document.fonts.ready.then(resizeAll);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
