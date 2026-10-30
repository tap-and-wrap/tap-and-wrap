import { useEffect, useRef, useState } from 'react';
import { LETTERING_STYLES, MAX_GIFT_PHOTOS, MAX_ENGRAVING_LINES, validateDraftEngraving, validateLocalPhoto } from '../../../shared/gift-box/lettering-styles.mjs';

// This hook holds memory-only preview drafts. Never send File, object URL,
// customer engraving text, or a candidate style to existing v1 commerce APIs.
export function usePersonalDraft() {
  const [photos, setPhotos] = useState([]);
  const [engravings, setEngravings] = useState([{ id: 'line-1', text: '', styleId: null }]);
  const [notice, setNotice] = useState('');
  const [photoPositions, setPhotoPositions] = useState({});
  const objectUrls = useRef(new Set());
  const photosRef = useRef([]);
  useEffect(() => { photosRef.current = photos; }, [photos]);
  useEffect(() => () => {
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
    objectUrls.current.clear();
  }, []);
  function addPhotos(fileList) {
    const candidates = Array.from(fileList || []);
    if (!candidates.length) return;
    if (photosRef.current.length + candidates.length > MAX_GIFT_PHOTOS) {
      setNotice(`Choose no more than ${MAX_GIFT_PHOTOS} photos per gift.`); return;
    }
    const problem = candidates.map(validateLocalPhoto).find(Boolean);
    if (problem) { setNotice(problem); return; }
    const existing = new Set(photosRef.current.map(photo => photo.fileKey));
    const seen = new Set();
    for (const file of candidates) {
      const key = `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
      if (existing.has(key) || seen.has(key)) { setNotice('Each photo can only be added once.'); return; }
      seen.add(key);
    }
    const additions = candidates.map(file => {
      const url = URL.createObjectURL(file);
      objectUrls.current.add(url);
      return { id: crypto.randomUUID(), file, fileKey: `${file.name}\u0000${file.size}\u0000${file.lastModified}`, name: file.name, url };
    });
    setPhotos(current => [...current, ...additions]);
    setNotice(`${additions.length} local photo preview${additions.length===1?'':'s'} added. Photos have not been uploaded.`);
  }
  function removePhoto(id) {
    const removed = photosRef.current.find(photo => photo.id === id);
    if (!removed) return;
    objectUrls.current.delete(removed.url);
    URL.revokeObjectURL(removed.url);
    setPhotos(current => current.filter(photo => photo.id !== id));
    setPhotoPositions(current => { const next={...current}; delete next[id]; return next; });
    setNotice('Photo removed from this local preview.');
  }
  function movePhoto(id, delta) {
    setPhotos(current => {
      const index = current.findIndex(photo => photo.id === id), target = index + delta;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current]; [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  function updateEngraving(id, patch) {
    if (Object.hasOwn(patch, 'text') && !validateDraftEngraving(patch.text)) {
      setNotice('Each engraving may contain at most 80 characters and no unsupported control characters.');
      return;
    }
    if (Object.hasOwn(patch, 'styleId') && patch.styleId !== null && !LETTERING_STYLES.some(style => style.id === patch.styleId)) return;
    setEngravings(current => current.map(line => line.id === id ? { ...line, ...patch } : line));
    setNotice('');
  }
  function addEngraving() {
    setEngravings(current => current.length >= MAX_ENGRAVING_LINES ? current : [...current, { id: 'line-2', text: '', styleId: null }]);
  }
  function removeEngraving(id) {
    if (id === 'line-1') return;
    setEngravings(current => current.filter(line => line.id !== id));
  }
  // Coordinates never leave this in-memory hook and never enter estimateSelection.
  function placePhoto(boxId, id, position) {
    if (!boxId || !photosRef.current.some(photo => photo.id === id) || !['inside', 'beside'].includes(position?.placementZone)
      || ![position.x,position.y].every(Number.isFinite)) return;
    setPhotoPositions(current => ({ ...current, [id]: { x: position.x, y: position.y, placementZone: position.placementZone } }));
  }
  function resetPhotoPositions() { setPhotoPositions({}); }
  const hasContent = photos.length > 0 || engravings.some(line => line.text.trim().length > 0);
  return { photos, engravings, notice, hasContent, photoPositions, placePhoto, resetPhotoPositions, addPhotos, removePhoto, movePhoto, updateEngraving, addEngraving, removeEngraving };
}
