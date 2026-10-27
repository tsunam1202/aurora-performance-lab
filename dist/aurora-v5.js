(function () {
  'use strict';
  // Folded curtains of field-aligned rays, inspired by NOAA auroral photographs.
  // This effect is drawn locally: no remote video, image or rendering dependency.
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const ambient = document.createElement('canvas');
  ambient.className = 'aurora-atmosphere';
  ambient.setAttribute('aria-hidden', 'true');
  document.body.prepend(ambient);
  let hero = null, sky = null, observer = null, heroVisible = true;
  let enabled = window.AuroraMotion?.enabled ?? !preference.matches;
  let animation = 0, previous = 0, time = 0, frames = 0, ambientTime = -1;
  let width = 0, height = 0;
  const stars = Array.from({length: 90}, (_, i) => ({
    x: ((i * 187.31 + 31) % 997) / 997,
    y: ((i * 71.17 + 11) % 271) / 271,
    r: .35 + (i % 5) * .13, a: .18 + (i % 7) * .07
  }));
  function size(canvas, w, h) {
    const scale = Math.min(1.25, devicePixelRatio || 1, 1500 / w);
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d').setTransform(scale, 0, 0, scale, 0, 0);
    canvas._width = w; canvas._height = h;
  }
  function resize() {
    width = innerWidth; height = innerHeight;
    size(ambient, width, height);
    if (sky && hero) size(sky, hero.clientWidth, hero.clientHeight);
    draw(true);
  }
  function base(u, t, band, h) {
    return h * (.275 + band * .071 + Math.sin(u * 5.1 + t * .21 + band) * .054
      + Math.sin(u * 12.1 - t * .16 + band * 2.3) * .023
      + Math.sin(u * 23.3 + t * .2) * .006);
  }
  function curtains(canvas, t, faint) {
    const ctx = canvas.getContext('2d'), w = canvas._width, h = canvas._height;
    ctx.clearRect(0, 0, w, h);
    if (!w || !h) return;
    ctx.save();
    if (!faint) {
      for (const s of stars) {
        const a = s.a * (.8 + .2 * Math.sin(t + s.x * 21));
        ctx.fillStyle = `rgba(210,244,233,${a})`;
        ctx.beginPath(); ctx.arc(s.x * w, s.y * h * .36, s.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = faint ? 'source-over' : 'lighter';
    const spacing = w < 700 ? 2.2 : 2.7;
    for (let band = 2; band >= 0; band--) {
      const alpha = faint ? .035 : [ .53, .25, .12 ][band];
      const topHue = band === 1 ? '54,194,240' : '36,206,151';
      for (let x = -w * .12; x < w * 1.12; x += spacing) {
        const u = x / w;
        const fold = Math.sin(u * 43 + t * .34 + Math.sin(u * 15 - t * .23) * 2.6 + band * 1.2);
        const fine = .56 + .44 * Math.sin(u * 341 + Math.sin(u * 46 + t * .32) * 3.5);
        const density = .12 + .88 * Math.pow((fold + 1) * .5, 3.5);
        const intensity = alpha * (.33 + .67 * fine) * density;
        const y = base(u, t, band, h);
        const length = h * (.19 + .09 * Math.sin(u * 3.2 + band + t * .1) ** 2) * (1 + density * .24);
        const lean = w * (.017 + .011 * Math.sin(u * 9 + t * .12 + band));
        const gradient = ctx.createLinearGradient(x - lean, y - length, x, y + 5);
        gradient.addColorStop(0, `rgba(${topHue},0)`);
        gradient.addColorStop(.20, `rgba(${topHue},${intensity * .1})`);
        gradient.addColorStop(.56, `rgba(18,227,122,${intensity * .45})`);
        gradient.addColorStop(.88, `rgba(39,255,116,${intensity})`);
        gradient.addColorStop(.97, `rgba(134,255,156,${intensity * .85})`);
        gradient.addColorStop(1, 'rgba(60,244,120,0)');
        ctx.strokeStyle = gradient;
        ctx.lineWidth = spacing * 1.45;
        ctx.beginPath(); ctx.moveTo(x - lean, y - length);
        ctx.bezierCurveTo(x - lean * .73, y - length * .66, x + lean * .16, y - length * .22, x, y + 5);
        ctx.stroke();
      }
      // A narrow luminous lower edge, softened by an atmospheric halo.
      ctx.beginPath();
      for (let x = -30; x <= w + 30; x += 4) {
        const y = base(x / w, t, band, h);
        if (x === -30) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = faint ? 'rgba(26,176,104,.05)' : `rgba(73,255,133,${alpha * .48})`;
      ctx.lineWidth = faint ? 2 : 1.4;
      ctx.shadowColor = '#16ff78'; ctx.shadowBlur = faint ? 12 : 17;
      ctx.stroke(); ctx.shadowBlur = 0;
    }
    ctx.restore();
  }
  function draw(force) {
    if (sky?.isConnected && (heroVisible || force)) curtains(sky, time, false);
    if (force || time - ambientTime > .14) { curtains(ambient, time * .64 + 1.4, true); ambientTime = time; }
  }
  function tick(now) {
    animation = requestAnimationFrame(tick);
    if (now - previous < (heroVisible ? 40 : 90)) return;
    time += Math.min(now - previous, 100) / 1000;
    previous = now; frames++; draw(false);
  }
  function start() {
    cancelAnimationFrame(animation);
    if (enabled && !document.hidden) { previous = performance.now(); animation = requestAnimationFrame(tick); }
  }
  function mount() {
    observer?.disconnect();
    hero = document.querySelector('.motion-hero'); sky = null;
    if (hero) {
      sky = document.createElement('canvas'); sky.className = 'aurora-curtain-sky';
      sky.setAttribute('aria-hidden', 'true'); hero.prepend(sky);
      observer = new IntersectionObserver(entries => { heroVisible = !!entries[0]?.isIntersecting; }, {rootMargin: '120px'});
      observer.observe(hero);
    } else heroVisible = false;
    resize(); start();
  }
  window.addEventListener('aurora-motionchange', e => { enabled = !!e.detail.enabled; start(); });
  window.addEventListener('aurora-page-rendered', mount);
  window.addEventListener('resize', resize, {passive: true});
  document.addEventListener('visibilitychange', start);
  window.AuroraSky = { inspect: () => ({enabled, frames, time, heroVisible, canvases: document.querySelectorAll('.aurora-curtain-sky').length, renderer: 'green-field-aligned-curtains'}) };
  mount();
})();
