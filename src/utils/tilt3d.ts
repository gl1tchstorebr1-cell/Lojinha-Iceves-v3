export function attachTilt3D(card: HTMLElement | null, maxDeg = 24): () => void {
  if (!card || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};

  let rect: DOMRect | null = null;
  let rafId = 0;
  let lastX = 0;
  let lastY = 0;

  const enter = () => {
    rect = card.getBoundingClientRect();
  };

  const applyTransform = () => {
    rafId = 0;
    if (!rect || !rect.width || !rect.height) return;
    const px = (lastX - rect.left) / rect.width - 0.5;
    const py = (lastY - rect.top) / rect.height - 0.5;
    card.style.transition = 'transform 90ms ease-out';
    card.style.transform = `perspective(900px) rotateX(${(-py * maxDeg * 2).toFixed(2)}deg) rotateY(${(px * maxDeg * 2).toFixed(2)}deg) scale3d(1.015,1.015,1.015)`;
  };

  const move = (e: PointerEvent) => {
    if (!rect) rect = card.getBoundingClientRect();
    lastX = e.clientX;
    lastY = e.clientY;
    if (!rafId) {
      rafId = requestAnimationFrame(applyTransform);
    }
  };

  const leave = () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    rect = null;
    card.style.transition = 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)';
    card.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)';
  };

  card.addEventListener('pointerenter', enter, { passive: true });
  card.addEventListener('pointermove', move, { passive: true });
  card.addEventListener('pointerleave', leave, { passive: true });

  return () => {
    if (rafId) cancelAnimationFrame(rafId);
    card.removeEventListener('pointerenter', enter);
    card.removeEventListener('pointermove', move);
    card.removeEventListener('pointerleave', leave);
  };
}
