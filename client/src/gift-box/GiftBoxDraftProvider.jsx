import { createContext,useContext,useEffect,useReducer,useRef,useState } from 'react';
import { sessionOwner } from '../auth/session.js';
import { arrangementReducer,initialArrangement } from './state.mjs';
import { usePersonalDraft } from './usePersonalDraft.js';
import { giftBoxPersonalDraftSignature } from './personalization-submission.mjs';

const DraftContext=createContext(null);
const initialHistory=()=>({present:{...initialArrangement(),freePlacement:true},past:[]});
const reducer=(history,action)=>action.type === 'reset' ? initialHistory() : arrangementReducer(history,action);

// Lives above the route/error boundaries. Files and receipts never enter storage.
export function GiftBoxDraftProvider({ownerKey,children}) {
  return <OwnedGiftBoxDraft key={ownerKey} ownerKey={ownerKey}>{children}</OwnedGiftBoxDraft>;
}
function OwnedGiftBoxDraft({ownerKey,children}) {
  const [history,dispatch]=useReducer(reducer,null,initialHistory);
  const [step,setStep]=useState(0),[review,setReview]=useState(false),[revealed,setRevealed]=useState({});
  const [reached,setReached]=useState(0),[selectedId,setSelectedId]=useState(null);
  const [printOptionsByPhoto,setPrintOptionsByPhoto]=useState({});
  const [surfaceOptionsByEngraving]=useState({});
  const [photoAspectRatios,setPhotoAspectRatios]=useState(false),[addingGift,setAddingGift]=useState(false);
  const uploadCache=useRef(new Map()),uploadIds=useRef([]),pendingGiftOperation=useRef(null),active=useRef(true);
  const personal=usePersonalDraft({freePlacement:true,photoAspectRatios,presentationVersion:history.present.presentationVersion,
    arrangementPositions:history.present.photoPositions || {},hiddenPhotoIds:history.present.hiddenPhotoIds || [],
    onPosition:(id,position)=>dispatch({type:'photo-move',id,position}),
    onRemovePhoto:id=>dispatch({type:'photo-remove',id}),onRestorePhoto:id=>dispatch({type:'photo-restore',id})});
  const latest=useRef(null);
  const draftSignature=giftBoxPersonalDraftSignature(history.present.boxId,personal,printOptionsByPhoto,surfaceOptionsByEngraving);
  const arrangementSignature=JSON.stringify(history.present);
  latest.current={ownerKey,draftSignature,arrangementSignature,sourceSignature:`${ownerKey}:${arrangementSignature}:${draftSignature}`};
  useEffect(()=>{const cache=uploadCache.current;active.current=true;return()=>{active.current=false;cache.clear();uploadIds.current=[];pendingGiftOperation.current=null;};},[]);
  function resetDraft() {
    personal.reset();dispatch({type:'reset'});setStep(0);setReview(false);setRevealed({});setReached(0);setSelectedId(null);setPrintOptionsByPhoto({});
    uploadCache.current.clear();uploadIds.current=[];pendingGiftOperation.current=null;
  }
  return <DraftContext.Provider value={{history,dispatch,personal,step,setStep,review,setReview,revealed,setRevealed,reached,setReached,selectedId,setSelectedId,
    printOptionsByPhoto,setPrintOptionsByPhoto,surfaceOptionsByEngraving,setPhotoAspectRatios,addingGift,setAddingGift,uploadCache,uploadIds,pendingGiftOperation,latest,
    isCurrent:()=>active.current && sessionOwner() === ownerKey,resetDraft}}>{children}</DraftContext.Provider>;
}
export function useGiftBoxDraft() {
  const draft=useContext(DraftContext);
  if (!draft) throw new Error('Gift Box draft provider is required.');
  return draft;
}
