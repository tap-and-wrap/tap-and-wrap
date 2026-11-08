import { stickerStyle } from '../../../shared/gift-box/sticker-styles.mjs';
import { useEffect, useRef, useState } from 'react';
import { LETTERING_STYLES, ENGRAVING_COLORS, DEFAULT_ENGRAVING_COLOR, MAX_ENGRAVING_LINES, validateDraftEngraving, validateLocalPhotoBatch } from '../../../shared/gift-box/lettering-styles.mjs';

// This hook holds memory-only preview drafts. Never send File, object URL,
// customer engraving text, or a candidate style to existing v1 commerce APIs.
export function usePersonalDraft({ freePlacement = false, photoAspectRatios = false, presentationVersion, arrangementPositions = null, onPosition = null, hiddenPhotoIds = [], onRemovePhoto = null, onRestorePhoto = null } = {}) {
  const [sticker, setSticker] = useState({ enabled: false, text: '', styleId: 'sticker-rochester-v1', colorId: 'black', optionId: null });
  const [photos, setPhotos] = useState([]);
  const [engravings, setEngravings] = useState([{ id: 'line-1', text: '', styleId: null, colorId: DEFAULT_ENGRAVING_COLOR }]);
  const [notice, setNotice] = useState('');
  const [photoPositions, setPhotoPositions] = useState({});
  const objectUrls = useRef(new Set());
  const photosRef = useRef([]);
  useEffect(() => { photosRef.current = photos; }, [photos]);
  useEffect(() => () => {
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
    objectUrls.current.clear();
  }, []);
  function createPhoto(file, id = crypto.randomUUID()) {
    const url = URL.createObjectURL(file);objectUrls.current.add(url);
    const photo = { id, file, fileKey: `${file.name}\u0000${file.size}\u0000${file.lastModified}`, name:file.name,url,dimensionsPending:true };
    const image = new Image();
    image.onload = () => {
      if (!objectUrls.current.has(url)) return;
      const aspectRatio=image.naturalWidth/image.naturalHeight;
      if (!Number.isFinite(aspectRatio) || image.naturalWidth > 12000 || image.naturalHeight > 12000 || image.naturalWidth*image.naturalHeight > 40000000) { setNotice('Choose a smaller supported photograph.'); return; }
      setPhotos(current=>current.map(item=>item.id === id && item.url === url ? {...item,aspectRatio,dimensionsPending:false} : item));
    };
    image.onerror = () => { if (objectUrls.current.has(url)) setNotice('This photo could not be opened. Remove it and choose another image.'); };
    image.src=url;return photo;
  }
  function replacePhoto(id, file) {
    const old = photosRef.current.find(photo=>photo.id===id);if (!old || !file) return;
    const others = photosRef.current.filter(photo=>photo.id!==id), problem = validateLocalPhotoBatch(others.map(p=>p.file),[file]);
    if (problem) {setNotice(problem);return;}
    if (others.some(photo=>photo.fileKey===`${file.name}\u0000${file.size}\u0000${file.lastModified}`)) {setNotice('Each photo can only be added once.');return;}
    const replacement=createPhoto(file,id);objectUrls.current.delete(old.url);URL.revokeObjectURL(old.url);
    photosRef.current=photosRef.current.map(photo=>photo.id===id?replacement:photo);setPhotos(photosRef.current);setNotice('');
  }
  function addPhotos(fileList) {
    let candidates = Array.from(fileList || []);
    // Deleted photos remain memory-only while they are undoable. Re-selecting
    // the same file restores its existing local preview instead of duplicating it.
    if (onRestorePhoto) candidates = candidates.filter(file => {
      const key = `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
      const existing = photosRef.current.find(photo => photo.fileKey === key && hiddenPhotoIds.includes(photo.id));
      if (!existing) return true;
      onRestorePhoto(existing.id); return false;
    });
    if (!candidates.length) return;
    const problem = validateLocalPhotoBatch(photosRef.current.map(photo => photo.file), candidates);
    if (problem) { setNotice(problem); return; }
    const existing = new Set(photosRef.current.map(photo => photo.fileKey));
    const seen = new Set();
    for (const file of candidates) {
      const key = `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
      if (existing.has(key) || seen.has(key)) { setNotice('Each photo can only be added once.'); return; }
      seen.add(key);
    }
    const additions = candidates.map(file => createPhoto(file));
    // Synchronize the ref immediately so two quick file-picker changes cannot
    // bypass the aggregate byte/count budget before useEffect runs.
    photosRef.current = [...photosRef.current, ...additions];
    setPhotos(current => [...current, ...additions]);
    setNotice('');
  }
  function removePhoto(id) {
    const removed = photosRef.current.find(photo => photo.id === id);
    if (!removed) return;
    if (onRemovePhoto) { onRemovePhoto(id); setNotice(''); return; }
    objectUrls.current.delete(removed.url);
    URL.revokeObjectURL(removed.url);
    photosRef.current = photosRef.current.filter(photo => photo.id !== id);
    setPhotos(current => current.filter(photo => photo.id !== id));
    setPhotoPositions(current => { const next={...current}; delete next[id]; return next; });
    setNotice('');
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
    if (Object.hasOwn(patch, 'colorId') && !ENGRAVING_COLORS.some(color => color.id === patch.colorId)) return;
    setEngravings(current => current.map(line => line.id === id ? { ...line, ...patch } : line));
    setNotice('');
  }
  function addEngraving() {
    // Return the new ID so the UI opens the new entry immediately. Drafts stay local.
    const id = crypto.randomUUID();
    setEngravings(current => current.length >= MAX_ENGRAVING_LINES ? current
      : [...current, { id, text: '', styleId: null, colorId: DEFAULT_ENGRAVING_COLOR }]);
    return id;
  }
  function removeEngraving(id) {
    if (id === 'line-1') return;
    setEngravings(current => current.filter(line => line.id !== id));
  }
  // Coordinates never leave this in-memory hook and never enter estimateSelection.
  function placePhoto(boxId, id, position) {
    if (!boxId || !photosRef.current.some(photo => photo.id === id) || !['inside', 'beside'].includes(position?.placementZone)
      || ![position.x,position.y].every(Number.isFinite)) return;
    if (onPosition) onPosition(id,position);
    else setPhotoPositions(current => ({ ...current, [id]: { x: position.x, y: position.y, placementZone: position.placementZone } }));
  }
  function resetPhotoPositions() { setPhotoPositions({}); }
  function updateSticker(patch) {
    if (patch.text !== undefined && !validateDraftEngraving(patch.text)) { setNotice('Use up to 80 characters without unsupported control characters.'); return; }
    if (patch.styleId !== undefined && !stickerStyle(patch.styleId)) return;
    if (patch.colorId !== undefined && !ENGRAVING_COLORS.some(color => color.id === patch.colorId)) return;
    setSticker(current => ({ ...current, ...patch })); setNotice('');
  }
  const visiblePhotos = photos.filter(photo => !hiddenPhotoIds.includes(photo.id));
  const hasContent = visiblePhotos.length > 0 || (freePlacement ? sticker.enabled : engravings.some(line => line.text.trim().length > 0));
  function reset() {
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
    objectUrls.current.clear();photosRef.current=[];setPhotos([]);setPhotoPositions({});setNotice('');
    setSticker({enabled:false,text:'',styleId:'sticker-rochester-v1',colorId:'black',optionId:null});
    setEngravings([{id:'line-1',text:'',styleId:null,colorId:DEFAULT_ENGRAVING_COLOR}]);
  }
  return { freePlacement, photoAspectRatios, presentationVersion, sticker, updateSticker, photos: visiblePhotos, engravings, notice, hasContent, photoPositions: arrangementPositions || photoPositions, placePhoto, resetPhotoPositions, addPhotos, replacePhoto, removePhoto, movePhoto, updateEngraving, addEngraving, removeEngraving,reset };
}
