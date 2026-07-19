/**
 * Post Trade Labs — light motion for the lime landing
 * Status pulse (CSS) + hero bars + tape detection + metric reveals
 */
(() => {
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function bootBars() {
    const bars = document.getElementById('hero-bars');
    if (!bars) return;
    if (reduce) {
      bars.classList.add('is-on');
      return;
    }
    requestAnimationFrame(() => bars.classList.add('is-on'));
    // gentle hot-bar pulse
    const hot = bars.querySelector('.hot');
    if (!hot) return;
    let on = true;
    setInterval(() => {
      on = !on;
      hot.style.filter = on ? 'brightness(1.15)' : 'brightness(1)';
    }, 1600);
  }

  function createTape(canvas) {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let points = [];
    let t0 = 0;
    let running = false;
    let raf = 0;
    let calloutShown = false;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildPath();
    }

    function buildPath() {
      points = [];
      let y = h * 0.62;
      const n = 80;
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * w;
        if (i < 35) y += (Math.sin(i * 0.35) * 3 + (i % 5 === 0 ? -4 : 1.2));
        else if (i < 48) y -= 2.8 + Math.sin(i * 0.5);
        else if (i < 58) y += 5.5; // revenge dump
        else y += Math.sin(i * 0.4) * 1.5;
        points.push({ x, y: Math.max(28, Math.min(h - 28, y)) });
      }
    }

    function draw(progress) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#0c0c0c';
      ctx.fillRect(0, 0, w, h);

      // grid
      ctx.strokeStyle = 'rgba(200,245,66,0.05)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 5; i++) {
        const y = (h * i) / 5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const end = Math.max(2, Math.floor(points.length * progress));
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(244,244,240,0.85)';
      ctx.lineWidth = 1.75;
      for (let i = 0; i < end; i++) {
        const p = points[i];
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();

      // marker at detection
      const markI = Math.min(end - 1, 52);
      if (progress > 0.55 && points[markI]) {
        const p = points[markI];
        ctx.beginPath();
        ctx.fillStyle = '#c8f542';
        ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(200,245,66,0.35)';
        ctx.lineWidth = 1;
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        ctx.stroke();
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
        // hold then soft loop
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
        if (reduce) {
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
    bootBars();

    const canvas = document.getElementById('tape-canvas');
    const tape = canvas ? createTape(canvas) : null;
    tape?.resize();
    window.addEventListener('resize', () => tape?.resize());

    const detect = document.getElementById('detect');
    const engine = document.getElementById('engine');

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.target === detect) {
            if (e.isIntersecting) tape?.start();
            else tape?.stop();
          }
          if (e.target === engine) {
            if (e.isIntersecting) e.target.classList.add('is-on');
            else if (!reduce) e.target.classList.remove('is-on');
          }
        }
      },
      { threshold: 0.35 },
    );

    if (detect) io.observe(detect);
    if (engine) io.observe(engine);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
