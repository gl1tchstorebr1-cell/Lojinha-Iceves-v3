export function attachTilt3D(card: HTMLElement | null, maxDeg = 24): () => void {
  if (!card || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  const move = (e: PointerEvent) => {
    const r = card.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    card.style.transition = 'transform 80ms linear';
    card.style.transform = `perspective(900px) rotateX(${(-py * maxDeg * 2).toFixed(2)}deg) rotateY(${(px * maxDeg * 2).toFixed(2)}deg) scale3d(1.02,1.02,1.02)`;
  };
  const leave = () => {
    card.style.transition = 'transform 500ms cubic-bezier(0.16, 1, 0.3, 1)';
    card.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)';
  };
  card.addEventListener('pointermove', move);
  card.addEventListener('pointerleave', leave);
  return () => {
    card.removeEventListener('pointermove', move);
    card.removeEventListener('pointerleave', leave);
  };
}
