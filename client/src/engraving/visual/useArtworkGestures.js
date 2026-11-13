import { useRef } from 'react';

export const normalizedAngle = angle => ((angle + 180) % 360 + 360) % 360 - 180;
const pair = points => {
  const [a, b = a] = [...points.values()];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI };
};

// Rebase at each finger-count transition, retaining one original value until all
// pointers lift. Preview is synchronous in this ref so pointerup never saves a
// stale React render; cancellation never commits a partial transformation.
export default function useArtworkGestures({ board, read, fit, onPreview, onCommit }) {
  const points = useRef(new Map()), gesture = useRef(null);
  function rebase() {
    const g = gesture.current;
    if (g) { g.base = g.next; g.start = pair(points.current); g.lastAngle = g.start.angle; g.twist = 0; }
  }
  function cancel() { points.current.clear(); gesture.current = null; onPreview(null); }
  return {
    cancel,
    onPointerDown(event) {
      if (event.pointerType === 'mouse' && event.button !== 0 || points.current.size >= 2) return;
      const value = gesture.current?.next || read(event);
      if (!value) return;
      event.preventDefault();
      board.current.setPointerCapture(event.pointerId);
      points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      gesture.current ||= { original: value, next: value };
      rebase();
    },
    onPointerMove(event) {
      const g = gesture.current;
      if (!g || !points.current.has(event.pointerId)) return;
      event.preventDefault();
      points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const p = pair(points.current), rect = board.current.getBoundingClientRect();
      if (points.current.size === 2) { g.twist += normalizedAngle(p.angle - g.lastAngle); g.lastAngle = p.angle; }
      const scale = points.current.size === 2 ? p.distance / Math.max(1, g.start.distance) : 1;
      g.next = fit({ ...g.base, x: g.base.x + (p.x - g.start.x) / rect.width, y: g.base.y + (p.y - g.start.y) / rect.height,
        width: g.base.width * scale, ...(g.base.height !== undefined ? { height: g.base.height * scale } : {}),
        ...(points.current.size === 2 ? { rotation: normalizedAngle((g.base.rotation ?? 0) + g.twist) } : {}) });
      onPreview(g.next);
    },
    onPointerUp(event) {
      if (!points.current.has(event.pointerId)) return;
      points.current.delete(event.pointerId);
      if (points.current.size) rebase();
      else { const next = gesture.current.next; gesture.current = null; onPreview(null); onCommit(next); }
      if (board.current.hasPointerCapture(event.pointerId)) board.current.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: cancel,
    onLostPointerCapture(event) { if (points.current.has(event.pointerId)) cancel(); },
  };
}
