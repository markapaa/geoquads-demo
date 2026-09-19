// A small confetti burst for winning. No libraries.
const COLORS = ["#7ddba3", "#6cb8ff", "#ffd45e", "#b99bff", "#ff6b81"];

export function launchConfetti(duration = 2400) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.getElementById("confetti");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.scale(dpr, dpr);

  const w = window.innerWidth;
  const pieces = Array.from({ length: 130 }, () => ({
    x: w / 2 + (Math.random() - 0.5) * 120,
    y: window.innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 12,
    vy: -Math.random() * 12 - 4,
    size: 6 + Math.random() * 6,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));

  const start = performance.now();
  function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, w, window.innerHeight);
    for (const p of pieces) {
      p.vy += 0.32; // gravity
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / duration);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (t < duration) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, w, window.innerHeight);
  }
  requestAnimationFrame(frame);
}
