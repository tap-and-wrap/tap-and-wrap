import { useRef, useState } from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Minus, Plus, RotateCcw, RotateCw, Undo2, Redo2 } from 'lucide-react';
import { TextArtwork } from '../engraving/visual/VisualEngravingEditor.jsx';
import ConfirmationDialog from '../components/ConfirmationDialog.jsx';
import { boundStickerPlacement, defaultStickerPlacement, stickerProof, STICKER_PROOFS } from '../../../shared/gift-box/sticker-placement.mjs';
import { stickerStyle } from '../../../shared/gift-box/sticker-styles.mjs';
import { getEngravingColor } from '../../../shared/gift-box/lettering-styles.mjs';
import './sticker-workspace.css';
import useArtworkGestures, { normalizedAngle } from '../engraving/visual/useArtworkGestures.js';

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
  return <div className="sticker-position" style={{ left: `${placement.x * 100}%`, top: `${placement.y * 100}%`, width: `${placement.width * 100}%`, height: `${placement.height * 100}%`, transform: `translate(-50%, -50%) rotate(${placement.rotation ?? 0}deg)` }}>
    <TextArtwork layer={{ text: lines.join('\n'), aspectRatio: ratio }} font={{id: sticker.styleId, family:stickerStyle(sticker.styleId)?.fontFamily}} appearance={getEngravingColor(sticker.colorId).hex}/>{children}
  </div>;
}
export default function StickerWorkspace({ boxId, personal }) {
  const placement = personal.sticker.placements?.[boxId] || defaultStickerPlacement(boxId);
  const [preview, setPreview] = useState(null), [reset, setReset] = useState(null);
  const board = useRef(null);
  const shown = preview || placement, proof = stickerProof(boxId, shown.view);
  function commit(next) { setPreview(null); personal.updateSticker({ placements: { ...personal.sticker.placements, [boxId]: boundStickerPlacement(next) } }); }
  function patch(values) { commit({ ...placement, ...values }); }
  const { cancel: cancelGesture, ...gestures } = useArtworkGestures({ board, read: () => placement, fit: boundStickerPlacement, onPreview: setPreview, onCommit: commit });
  function size(scale) { patch({ width: placement.width * scale, height: placement.height * scale }); }
  const arrows = [[ArrowUp, 'Move sticker up', 0, -.02], [ArrowLeft, 'Move sticker left', -.02, 0], [ArrowRight, 'Move sticker right', .02, 0], [ArrowDown, 'Move sticker down', 0, .02]];
  return <section className="sticker-workspace" aria-label="Sticker placement editor">
    {Object.keys(STICKER_PROOFS[boxId]).length > 1 && <div className="sticker-side-options" role="group" aria-label="Sticker side">{['left', 'right'].map(view => <button type="button" key={view} aria-pressed={placement.view === view} onClick={() => commit({ ...placement, view })}>{view === 'left' ? 'Left side' : 'Right side'}</button>)}</div>}
    <div className="sticker-toolbar"><div role="group" aria-label="Sticker history"><button type="button" aria-label="Undo sticker change" disabled={!personal.canUndoSticker} onClick={() => { cancelGesture(); personal.undoSticker(); }}><Undo2 size={18}/></button><button type="button" aria-label="Redo sticker change" disabled={!personal.canRedoSticker} onClick={() => { cancelGesture(); personal.redoSticker(); }}><Redo2 size={18}/></button><button type="button" aria-label="Reset sticker placement" onClick={event => setReset(event.currentTarget)}><RotateCcw size={18}/></button></div></div>
    <div className="sticker-viewport"><div><div ref={board} className="sticker-proof-image is-editable" style={{ aspectRatio: proof.width / proof.height }} {...gestures}>
      <img src={`/assets/gift-box/stickers/v1/${proof.file}`} width={proof.width} height={proof.height} alt={`Box ${boxId.slice(4)}, ${shown.view} sticker view`} draggable="false"/>
      <StickerText sticker={personal.sticker} placement={shown}><button type="button" className="sticker-text-target" aria-label="Move sticker text" onKeyDown={event => { const delta = event.shiftKey ? .05 : .01, dirs = { ArrowUp: [0, -delta], ArrowDown: [0, delta], ArrowLeft: [-delta, 0], ArrowRight: [delta, 0] }; if (dirs[event.key]) { event.preventDefault(); patch({ x: placement.x + dirs[event.key][0], y: placement.y + dirs[event.key][1] }); } }}/></StickerText>
    </div></div></div>
    <div className="sticker-toolbar"><div role="group" aria-label="Sticker movement">{arrows.map(([Icon, label, dx, dy]) => <button type="button" key={label} aria-label={label} onClick={() => patch({ x: placement.x + dx, y: placement.y + dy })}><Icon size={18}/></button>)}</div><div role="group" aria-label="Sticker text size"><button type="button" aria-label="Smaller sticker text" onClick={() => size(.9)}><Minus size={18}/></button><button type="button" aria-label="Larger sticker text" onClick={() => size(1.1)}><Plus size={18}/></button></div></div>
    <div className="sticker-toolbar" role="group" aria-label="Sticker text rotation"><button type="button" aria-label="Rotate sticker text left" onClick={() => patch({ rotation: normalizedAngle((placement.rotation ?? 0) - 5) })}><RotateCcw size={18}/></button><output aria-label="Sticker text angle">{Math.round(placement.rotation ?? 0)}&deg;</output><button type="button" aria-label="Rotate sticker text right" onClick={() => patch({ rotation: normalizedAngle((placement.rotation ?? 0) + 5) })}><RotateCw size={18}/></button><button type="button" aria-label="Reset sticker text angle" disabled={!(placement.rotation ?? 0)} onClick={() => patch({ rotation: 0 })}>0&deg;</button></div>
    {reset && <ConfirmationDialog title="Reset sticker placement?" description="Your text, lettering and color stay the same." returnFocus={reset} onCancel={() => setReset(null)} onConfirm={() => { commit(defaultStickerPlacement(boxId, placement.view)); setReset(null); }} confirmLabel="Reset placement" cancelLabel="Keep editing"/>}
  </section>;
}
