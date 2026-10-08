/** Fly an already-added product image to the live cart button. */
export function animateToCart(source) {
  if (!source || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const target = document.querySelector('[data-cart-anchor]');
  if (!target) return;
  const start = source.getBoundingClientRect();
  const end = target.getBoundingClientRect();
  if (!start.width || !end.width) return;
  const image = source.cloneNode(true);
  const size = Math.min(start.width, 68);
  Object.assign(image.style, {
    position: 'fixed', left: `${start.left + start.width / 2 - size / 2}px`,
    top: `${start.top + start.height / 2 - size / 2}px`, width: `${size}px`, height: `${size}px`,
    objectFit: 'cover', borderRadius: '10px', zIndex: '10000', pointerEvents: 'none',
    boxShadow: '0 8px 24px rgb(98 72 63 / 18%)',
  });
  image.setAttribute('aria-hidden', 'true');
  image.removeAttribute('id');
  document.body.append(image);
  const dx = end.left + end.width / 2 - start.left - start.width / 2;
  const dy = end.top + end.height / 2 - start.top - start.height / 2;
  const direction = dx >= 0 ? 1 : -1;
  const motion = image.animate([
    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    { transform: `translate(${dx * .22 - 30 * direction}px, ${dy * .22 - 28}px) rotate(-8deg) scale(.9)`, opacity: 1, offset: .25 },
    { transform: `translate(${dx * .48 + 25 * direction}px, ${dy * .48 + 8}px) rotate(8deg) scale(.7)`, opacity: 1, offset: .5 },
    { transform: `translate(${dx * .75 - 15 * direction}px, ${dy * .75 - 12}px) rotate(-5deg) scale(.5)`, opacity: .9, offset: .75 },
    { transform: `translate(${dx}px, ${dy}px) scale(.15)`, opacity: 0 },
  ], { duration: 720, easing: 'ease-in-out' });
  motion.finished.catch(() => {}).finally(() => image.remove());
}
