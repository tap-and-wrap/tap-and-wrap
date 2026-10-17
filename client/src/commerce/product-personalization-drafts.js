import { subscribeSession, sessionSnapshot } from '../auth/session.js';
const drafts = new Map();
const newDraft = () => ({ values: {}, complete: false, uploads: new Map(), listeners: new Set(), version: 0, touchedAt: Date.now() });
export function notifyProductDraft(draft) { draft.version++; for (const listener of draft.listeners) listener(); }
let generation = sessionSnapshot().generation;
subscribeSession(() => {
  if (sessionSnapshot().generation !== generation) { drafts.clear(); generation = sessionSnapshot().generation; }
});

// Memory only: no photos, instructions or private upload identifiers enter web
// storage. Navigation can restore a draft; a reload deliberately clears it.
export function productDraft(key) {
  for (const [id, draft] of drafts) if (Date.now() - draft.touchedAt > 30 * 60000 && !draft.request && !draft.busy) drafts.delete(id);
  if (!drafts.has(key)) {
    if (drafts.size >= 4) {
      const oldest = [...drafts].find(([, draft]) => !draft.request && !draft.busy);
      if (oldest) drafts.delete(oldest[0]);
      else return newDraft(); // Do not evict uncertain writes.
    }
    drafts.set(key, newDraft());
  }
  const draft = drafts.get(key); draft.touchedAt = Date.now(); return draft;
}
