import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import PersonalizationEditor from '../../../src/gift-box/PersonalizationEditor.jsx';
import { usePersonalDraft } from '../../../src/gift-box/usePersonalDraft.js';
import { STICKER_STYLES } from '../../../../shared/gift-box/sticker-styles.mjs';
import '../../../src/styles.css';
import '../../../src/design-system.css';
import '../../../src/gift-box/gift-box.css';
import '../../../src/gift-box/sticker-fonts.css';
const boxes=Array.from({length:12},(_,i)=>`box-${i+1}`);
const options=[{optionId:'sticker',kind:'box_sticker',displayName:'Sticker',enabled:true,available:true,pricePiastres:2000,boxIds:boxes,approvedStyleIds:STICKER_STYLES.map(s=>s.id),approvedColorIds:['black','white','red','gold','yellow']}];
function Harness(){const personal=usePersonalDraft({freePlacement:true}),[boxId,setBox]=useState('box-1'),[open,setOpen]=useState(true);return <main style={{maxWidth:700,margin:'auto',padding:16}}><h1>Your box sticker</h1><label>Fixture selected box<select value={boxId} onChange={e=>{setBox(e.target.value);setOpen(true);}}>{boxes.map(id=><option key={id}>{id}</option>)}</select></label><button type="button" onClick={()=>setOpen(false)}>Finishing Touches</button><button type="button" onClick={()=>setOpen(true)}>Make It Personal</button>{open&&<PersonalizationEditor boxId={boxId} personal={personal} options={options} printSelections={{}} onPrintSelection={()=>{}} onRemovePhoto={()=>{}}/>}</main>;}
createRoot(document.getElementById('root')).render(<Harness/>);
