import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { authGeneration } from '../services/api.js';
import { commerceError, commerceGet } from './api.js';
import { clearPrivateDraft, loadPrivateDraft, savePrivateDraft } from './private-draft-store.mjs';
import { prepareBackgroundCartItem } from './background-cart-processors.mjs';
import { PREPARATION_LIMIT, validPreparation, restoredPreparationStatus, uncertainCartFailure, canCancelPreparation, visiblePreparation } from './background-cart-contract.mjs';
import { privateQueryKey, sessionOwner } from '../auth/session.js';

const KIND = 'cart-preparations';
const QUEUED = 'queued';
const PENDING = new Set([QUEUED, 'preparing', 'uncertain', 'failed']);
const labelFor = kind => kind === 'gift_box_v2' ? 'Gift Box' : 'Laser Engraving';

/** A single owner-scoped queue lives above the React Router pages.
 * Persist full private snapshots/Blobs only in IndexedDB. Only status metadata
 * reaches React views; no private contents enter tracking or public URLs.
 */
export default function useBackgroundCartJobs(ownerContext) {
  const queryClient = useQueryClient();
  const [jobs, setJobs] = useState([]), [storageMessage, setStorageMessage] = useState(''), [ready, setReady] = useState(false);
  const entries = useRef([]), owner = useRef(null), epoch = useRef(0), active = useRef(null), running = useRef(false), readyRef = useRef(false);
  const scheduleRef = useRef(() => {});
  const live = useRef(true);
  const show = useCallback(() => setJobs(entries.current.map(visiblePreparation)), []);
  const persisted = useCallback(async (scope, list) => {
    // The shared store serializes writes to this exact owner. A resolved call
    // guarantees its durable record was written before a subsequent stage.
    await savePrivateDraft(KIND, scope, {jobs: list});
  }, []);
  const modify = useCallback((scope, epochValue, key, patch) => {
    if (owner.current !== scope || epoch.current !== epochValue) return null;
    const index = entries.current.findIndex(job => job.operationKey === key);
    if (index === -1) return null;
    const updated = { ...entries.current[index], ...patch };
    entries.current = entries.current.map((entry, i) => i === index ? updated : entry);
    show();
    return updated;
  }, [show]);
  const saveEntries = useCallback(async (scope, epochValue) => {
    if (scope !== owner.current || epochValue !== epoch.current) throw Error('Your cart owner changed.');
    const snapshot = entries.current.map(entry => ({...entry}));
    await persisted(scope, snapshot);
    if (scope !== owner.current || epochValue !== epoch.current) throw Error('Your cart owner changed.');
  }, [persisted]);
  const removeEntry = useCallback(async (scope, epochValue, key) => {
    if (scope !== owner.current || epochValue !== epoch.current) return;
    entries.current = entries.current.filter(entry => entry.operationKey !== key);
    show();
    await saveEntries(scope, epochValue);
  }, [saveEntries, show]);
  const refreshCart = useCallback(async () => {
    await queryClient.invalidateQueries({queryKey: privateQueryKey(sessionOwner(), 'cart')});
  }, [queryClient]);
  const complete = useCallback(async (scope, epochValue, entry, alreadyOrdered) => {
    if (scope !== owner.current || epochValue !== epoch.current) return;
    // Never claim a confirmed cart line before a server operation receipt.
    try { await refreshCart(); } catch { /* Server receipt already confirmed. */ }
    try { await removeEntry(scope, epochValue, entry.operationKey); }
    catch { setStorageMessage('A saved cart operation could not be cleared from browser storage. It will be reconciled next time.'); }
    if (scope !== owner.current || epochValue !== epoch.current) return;
    toast.success(alreadyOrdered ? `${entry.label} is already part of your order.` : `${entry.label} was added to your cart.`, {id: `cart-job-${entry.operationKey}`});
  }, [refreshCart, removeEntry]);
  const processNext = useCallback(async () => {
    if (running.current || !owner.current) return;
    const entry = entries.current.find(job => job.status === QUEUED);
    if (!entry) return;
    running.current = true;
    const scope = owner.current, epochValue = epoch.current, generation = authGeneration();
    const controller = new AbortController();
    active.current = { id: entry.operationKey, controller, scope };
    const isCurrent = () => !controller.signal.aborted && owner.current === scope && epoch.current === epochValue && authGeneration() === generation;
    const progress = message => {
      if (!isCurrent()) return;
      modify(scope, epochValue, entry.operationKey, {status: 'preparing', progress: message,
        stage: message.startsWith('Saving the verified') || message.startsWith('Confirming your saved') ? 'saving' : 'uploading'});
    };
    modify(scope, epochValue, entry.operationKey, {status: 'preparing', progress: 'Checking this private cart operation…', error: ''});
    try {
      const response = await prepareBackgroundCartItem(entry, {signal: controller.signal, generation, isCurrent, onProgress: progress,
        saveReceipt: async (key, id) => {
          if (!isCurrent()) throw Error('Your session changed during upload.');
          const current = entries.current.find(job => job.operationKey === entry.operationKey);
          modify(scope, epochValue, entry.operationKey, {receipts: {...current.receipts, [key]:id}});
          await saveEntries(scope, epochValue);
        },
        savePayload: async payload => {
          if (!isCurrent()) throw Error('Your session changed before the cart write.');
          modify(scope, epochValue, entry.operationKey, {payload, stage:'saving'});
          await saveEntries(scope, epochValue);
        },
      });
      if (isCurrent()) await complete(scope, epochValue, entry, response.alreadyOrdered || response.result?.alreadyOrdered);
    } catch (error) {
      if (isCurrent()) {
        const current = entries.current.find(job => job.operationKey === entry.operationKey);
        if (current) {
          const code = error.response?.data?.error?.code;
          const unknown = uncertainCartFailure(current, error);
          const definitiveReject = Boolean(current.payload && error.response && error.response.status >= 400 && error.response.status < 500
            && !['OPERATION_IN_PROGRESS','CART_OPERATION_CONFLICT'].includes(code));
          modify(scope, epochValue, entry.operationKey, {status: unknown || current.payload && !definitiveReject ? 'uncertain' : 'failed',
            definitiveReject, progress: '', error: commerceError(error)});
          try { await saveEntries(scope, epochValue); }
          catch { setStorageMessage('Your device could not save the current preparation status. Keep this tab open and review your cart.'); }
        }
      }
    } finally {
      if (active.current?.id === entry.operationKey) active.current = null;
      running.current = false;
      // An owner transition may load the new owner's queue while this aborted
      // worker is unwinding. Resume the current owner's queued tasks as soon
      // as the worker lock becomes free.
      if (live.current && owner.current && readyRef.current) queueMicrotask(() => scheduleRef.current());
    }
  }, [complete, modify, saveEntries]);
  scheduleRef.current = processNext;

  useEffect(() => {
    live.current = true;
    const scope = ownerContext || null;
    if (scope === owner.current) return;
    const previous = owner.current, epochValue = ++epoch.current;
    active.current?.controller.abort(); active.current = null;
    owner.current = scope;
    entries.current = []; readyRef.current = false; setReady(false); setJobs([]); setStorageMessage('');
    // A real owner transition removes the old private files; an initial page
    // load with no verified owner does not guess whose IndexedDB data to read.
    if (previous && previous !== scope) void clearPrivateDraft(KIND, previous).catch(() => {});
    if (!scope) return;
    // The epoch and live refs fence stale reads. Do not invalidate this read in
    // an effect cleanup: React StrictMode immediately replays mount effects,
    // and the same-owner early return would otherwise leave ready=false forever.
    void loadPrivateDraft(KIND, scope).then(saved => {
      if (!live.current || scope !== owner.current || epochValue !== epoch.current) return;
      entries.current = (Array.isArray(saved?.jobs) ? saved.jobs : []).filter(job =>
        validPreparation(job) && job.ownerContext === scope).slice(0, PREPARATION_LIMIT).map(job => ({ ...job,
          status: restoredPreparationStatus(job),
          progress: '', error: restoredPreparationStatus(job) === 'uncertain' ? 'The previous cart write may have completed. Check its status or retry the same operation.' : job.error || '',
        }));
      show(); readyRef.current = true; setReady(true);
      queueMicrotask(() => scheduleRef.current());
    }).catch(() => {
      if (live.current && scope === owner.current && epochValue === epoch.current) {
        readyRef.current = false; setReady(false);
        setStorageMessage('Your private pending cart items could not be restored. Do not repeat an uncertain cart action without checking.');
      }
    });
  }, [ownerContext, show]);
  useEffect(() => () => { live.current = false; active.current?.controller.abort(); }, []);

  const enqueue = useCallback(async (kind, source) => {
    const scope = owner.current;
    if (!scope || !readyRef.current || !['gift_box_v2','engraving_service_v2'].includes(kind)) throw Error('Please wait for your private cart session to finish loading.');
    if (entries.current.length >= PREPARATION_LIMIT) throw Error('Review your pending custom items in the cart before preparing more.');
    const epochValue = epoch.current;
    const operationKey = crypto.randomUUID();
    // structuredClone freezes source identity, including File/Blob byte copies.
    const snapshot = structuredClone(source);
    const entry = {kind, operationKey, ownerContext: scope, label: labelFor(kind), snapshot,
      receipts: {}, payload: null, status: QUEUED, stage: 'uploading', progress: '', error: '', createdAt: Date.now()};
    entries.current = [...entries.current, entry]; show();
    try { await saveEntries(scope, epochValue); }
    catch (error) {
      if (scope === owner.current && epochValue === epoch.current) {
        entries.current = entries.current.filter(item => item.operationKey !== operationKey);
        show();
      }
      throw Error(`Your browser could not securely save this private preparation. No upload was started. Free storage space and try again. (${commerceError(error)})`);
    }
    queueMicrotask(() => scheduleRef.current());
    return operationKey;
  }, [saveEntries, show]);
  const retry = useCallback(async key => {
    const scope = owner.current, epochValue = epoch.current;
    const current = entries.current.find(job => job.operationKey === key);
    if (!current || !['failed','uncertain'].includes(current.status)) return;
    modify(scope, epochValue, key, {status:QUEUED, error:'',progress:''});
    try { await saveEntries(scope, epochValue); queueMicrotask(() => scheduleRef.current()); }
    catch { modify(scope,epochValue,key,{status:'failed',error:'Browser storage is unavailable. Retry after freeing space.'}); }
  }, [modify, saveEntries]);
  const check = useCallback(async key => {
    const scope = owner.current, epochValue = epoch.current;
    const current = entries.current.find(job => job.operationKey === key);
    if (!current || !['failed','uncertain'].includes(current.status)) return;
    try {
      const response = await commerceGet(`/cart/operations/${key}`);
      if (scope !== owner.current || epochValue !== epoch.current) return;
      if (response.applied) await complete(scope,epochValue,current,response.alreadyOrdered);
      else {
        modify(scope,epochValue,key,{status:current.payload ? 'uncertain' : 'failed',error:current.payload ? 'The server has not confirmed this add. Retry this same operation, or check again before taking further action.' : 'Not yet added. Retry the preparation or cancel it.'});
        await saveEntries(scope,epochValue);
      }
    } catch (error) {
      if (scope !== owner.current || epochValue !== epoch.current) return;
      modify(scope,epochValue,key,{status:'uncertain',error:commerceError(error)});
      try { await saveEntries(scope,epochValue); }
      catch { setStorageMessage('Cart status could not be saved privately. Keep this tab open.'); }
    }
  }, [complete, modify, saveEntries]);
  const cancel = useCallback(async key => {
    const scope = owner.current, epochValue = epoch.current;
    const current = entries.current.find(job => job.operationKey === key);
    // A POST may have reached the server after a lost response. In that state,
    // removing the local key would make reconciliation/duplicate safety worse.
    if (!canCancelPreparation(current)) return false;
    if (current.payload) {
      let status;
      try { status = await commerceGet(`/cart/operations/${key}`); }
      catch (error) {
        // A failed status check cannot establish that a previous cart write
        // was rejected. Keep its immutable key available for reconciliation.
        modify(scope, epochValue, key, {status: 'uncertain', error: commerceError(error)});
        try { await saveEntries(scope, epochValue); } catch { setStorageMessage('Cart status was uncertain and could not be saved. Keep this tab open.'); }
        return false;
      }
      if (scope !== owner.current || epochValue !== epoch.current) return false;
      if (status.applied) { await complete(scope, epochValue, current, status.alreadyOrdered); return false; }
    }
    if (active.current?.id === key) active.current.controller.abort();
    await removeEntry(scope,epochValue,key);
    return true;
  }, [removeEntry, complete, modify, saveEntries]);
  return { jobs, storageMessage, ready, enqueue, retry, check, cancel,
    preparing: jobs.some(job => PENDING.has(job.status)), activeCount: jobs.filter(job => ['queued','preparing'].includes(job.status)).length };
}
