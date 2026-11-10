import { useRef, useState } from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Minus, Plus, RotateCcw, Undo2, Redo2 } from 'lucide-react';
import { TextArtwork } from '../engraving/visual/VisualEngravingEditor.jsx';
import ConfirmationDialog from '../components/ConfirmationDialog.jsx';
import { boundStickerPlacement, defaultStickerPlacement, stickerProof, STICKER_PROOFS } from '../../../shared/gift-box/sticker-placement.mjs';
import { stickerStyle } from '../../../shared/gift-box/sticker-styles.mjs';
import { getEngravingColor } from '../../../shared/gift-box/lettering-styles.mjs';
import './sticker-workspace.css';

export function StickerProof({ sticker, placement }) {
  const proof = stickerProof(placement?.boxId, placement?.view);
  if (!proof) return null;
  return <div className="sticker-proof-image" style={{ aspectRatio: proof.width / proof.height }}>
    <img src={`/assets/gift-box/stickers/v1/${proof.file}`} width={proof.width} height={proof.height} alt={`Box ${placement.boxId.slice(4)}, ${placement.view} sticker view`} draggable="false"/>
    <StickerText sticker={sticker} placement={placement}/>
  </div>;
}
function StickerText({ sticker, placement, children }) {
  const proof = stickerProof(placement.boxId, placement.view), ratio = placement.width * proof.width / (placement.height * proof.height);
  const text = sticker.text || 'With love', words = text.split(/\s+/), lines = [];
  let line = '';
  for (const word of words) { if (line && (line + ' ' + word).length > 24) { lines.push(line); line = word; } else line += (line ? ' ' : '') + word; } lines.push(line);
  return <div className="sticker-position" style={{ left: `${placement.x * 100}%`, top: `${placement.y * 100}%`, width: `${placement.width * 100}%`, height: `${placement.height * 100}%` }}>
    <TextArtwork layer={{ text: lines.join('\n'), aspectRatio: ratio }} font={{id: sticker.styleId, family:stickerStyle(sticker.styleId)?.fontFamily}} appearance={getEngravingColor(sticker.colorId).hex}/>{children}
  </div>;
}
export default function StickerWorkspace({ boxId, personal }) {
  const placement = personal.sticker.placements?.[boxId] || defaultStickerPlacement(boxId);
  const [preview, setPreview] = useState(null), [zoom, setZoom] = useState(1), [reset, setReset] = useState(null);
  const board = useRef(null), active = useRef(null), points = useRef(new Map());
  const shown = preview || placement, proof = stickerProof(boxId, shown.view);
  function commit(next) { setPreview(null); personal.updateSticker({ placements: { ...personal.sticker.placements, [boxId]: boundStickerPlacement(next) } }); }
  function patch(values) { commit({ ...placement, ...values }); }
  function point(event) { const rect = board.current.getBoundingClientRect(); return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }; }
  function cancel() { active.current = null; points.current.clear(); setPreview(null); }
  function down(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault(); board.current.setPointerCapture(event.pointerId); points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (points.current.size === 2) { const [a, b] = [...points.current.values()]; active.current = { kind: 'pinch', zoom, distance: Math.hypot(a.x - b.x, a.y - b.y) }; setPreview(null); return; }
    if (points.current.size > 2) return;
    active.current = { kind: event.target.closest('[data-sticker-resize]') ? 'resize' : event.target.closest('.sticker-position') ? 'drag' : 'place', start: point(event), placement, moved: false };
  }
  function move(event) {
    if (!points.current.has(event.pointerId) || !active.current) return;
    points.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); const g = active.current;
    if (g.kind === 'pinch') { if (points.current.size === 2) { const [a, b] = [...points.current.values()]; setZoom(Math.max(1, Math.min(3, g.zoom * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, g.distance)))); } return; }
    const p = point(event), dx = p.x - g.start.x, dy = p.y - g.start.y;
    if (g.kind === 'place') { if (Math.abs(dx) + Math.abs(dy) > .02) g.moved = true; return; }
    const scale = Math.max(.1, 1 + dx / g.placement.width);
    setPreview(boundStickerPlacement({ ...g.placement, ...(g.kind === 'resize' ? { width: g.placement.width * scale, height: g.placement.height * scale } : { x: g.placement.x + dx, y: g.placement.y + dy }) }));
  }
  function end(event) {
    const g = active.current; if (!points.current.has(event.pointerId)) return;
    points.current.delete(event.pointerId);
    if (g?.kind === 'place' && !g.moved) commit({ ...g.placement, ...g.start }); else if (g?.kind !== 'pinch' && preview) commit(preview);
    active.current = null; if (board.current.hasPointerCapture(event.pointerId)) board.current.releasePointerCapture(event.pointerId);
  }
  function size(scale) { patch({ width: placement.width * scale, height: placement.height * scale }); }
  const arrows = [[ArrowUp, 'Move sticker up', 0, -.02], [ArrowLeft, 'Move sticker left', -.02, 0], [ArrowRight, 'Move sticker right', .02, 0], [ArrowDown, 'Move sticker down', 0, .02]];
  return <section className="sticker-workspace" aria-label="Sticker placement editor">
    {Object.keys(STICKER_PROOFS[boxId]).length > 1 && <div className="sticker-side-options" role="group" aria-label="Sticker side">{['left', 'right'].map(view => <button type="button" key={view} aria-pressed={placement.view === view} onClick={() => commit({ ...placement, view })}>{view === 'left' ? 'Left side' : 'Right side'}</button>)}</div>}
    <div className="sticker-toolbar"><div role="group" aria-label="Sticker history"><button type="button" aria-label="Undo sticker change" disabled={!personal.canUndoSticker} onClick={personal.undoSticker}><Undo2 size={18}/></button><button type="button" aria-label="Redo sticker change" disabled={!personal.canRedoSticker} onClick={personal.redoSticker}><Redo2 size={18}/></button><button type="button" aria-label="Reset sticker placement" onClick={event => setReset(event.currentTarget)}><RotateCcw size={18}/></button></div><div role="group" aria-label="Sticker workspace zoom"><button type="button" aria-label="Zoom out sticker workspace" disabled={zoom === 1} onClick={() => setZoom(value => Math.max(1, value - .25))}><Minus size={18}/></button><output>{Math.round(zoom * 100)}%</output><button type="button" aria-label="Zoom in sticker workspace" disabled={zoom === 3} onClick={() => setZoom(value => Math.min(3, value + .25))}><Plus size={18}/></button></div></div>
    <div className="sticker-viewport"><div style={{ width: `${zoom * 100}%` }}><div ref={board} className="sticker-proof-image is-editable" style={{ aspectRatio: proof.width / proof.height }} onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel} onLostPointerCapture={event => { if (points.current.has(event.pointerId)) cancel(); }}>
      <img src={`/assets/gift-box/stickers/v1/${proof.file}`} width={proof.width} height={proof.height} alt={`Box ${boxId.slice(4)}, ${shown.view} sticker view`} draggable="false"/>
      <StickerText sticker={personal.sticker} placement={shown}><button type="button" className="sticker-text-target" aria-label="Move sticker text" onKeyDown={event => { const delta = event.shiftKey ? .05 : .01, dirs = { ArrowUp: [0, -delta], ArrowDown: [0, delta], ArrowLeft: [-delta, 0], ArrowRight: [delta, 0] }; if (dirs[event.key]) { event.preventDefault(); patch({ x: placement.x + dirs[event.key][0], y: placement.y + dirs[event.key][1] }); } }}/><button type="button" data-sticker-resize className="sticker-resize" aria-label="Resize sticker text" onKeyDown={event => { if (['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(event.key)) { event.preventDefault(); size(['ArrowUp','ArrowRight'].includes(event.key) ? 1.08 : .92); } }}><Plus size={14}/></button></StickerText>
    </div></div></div>
    <p className="sticker-help">Tap to place. Drag to move. Use the corner to resize, or the controls below.</p>
    <div className="sticker-toolbar"><div role="group" aria-label="Sticker movement">{arrows.map(([Icon, label, dx, dy]) => <button type="button" key={label} aria-label={label} onClick={() => patch({ x: placement.x + dx, y: placement.y + dy })}><Icon size={18}/></button>)}</div><div role="group" aria-label="Sticker text size"><button type="button" aria-label="Smaller sticker text" onClick={() => size(.9)}><Minus size={18}/></button><button type="button" aria-label="Larger sticker text" onClick={() => size(1.1)}><Plus size={18}/></button></div></div>
    {reset && <ConfirmationDialog title="Reset sticker placement?" description="Your text, lettering and color stay the same." returnFocus={reset} onCancel={() => setReset(null)} onConfirm={() => { commit(defaultStickerPlacement(boxId, placement.view)); setReset(null); }} confirmLabel="Reset placement" cancelLabel="Keep editing"/>}
  </section>;
}
