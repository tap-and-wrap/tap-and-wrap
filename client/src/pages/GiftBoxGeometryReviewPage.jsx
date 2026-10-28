import { useReducer, useState } from 'react';
import { Link } from 'react-router-dom';
import { ASSET_ISSUES, FIXED_COMPONENTS, GEOMETRY_VERSION } from '../../../shared/gift-box/definitions.mjs';
import { BOX_PLACEMENT_DEFINITIONS, footprintInRegion, reviewPlacement, validRegion } from '../../../shared/gift-box/geometry.mjs';
import { arrangementReducer, initialArrangement, STUDY_SIZES } from '../gift-box/state.mjs';
import ArrangementCanvas from '../gift-box/ArrangementCanvas.jsx';
import DraftGeometryOverlay from '../gift-box/DraftGeometryOverlay.jsx';
import { DRAFT_GEOMETRY_VERSION, getDraftGeometry } from '../../../shared/gift-box/geometry-drafts.mjs';
import { studyAnchor } from '../gift-box/placement-study.mjs';
import '../gift-box/gift-box.css';

const proposedDraft = id => ({...structuredClone(getDraftGeometry(id)),itemScales:{...STUDY_SIZES}});
export default function GiftBoxGeometryReviewPage() {
  const [boxId, setBoxId] = useState('box-2'), [drafts, setDrafts] = useState({});
  const [zone, setZone] = useState('inside'), [type, setType] = useState('polygon'), [trace, setTrace] = useState([]);
  const [shape, setShape] = useState({ x: '0.1', y: '0.1', width: '0.8', height: '0.8' });
  const [error, setError] = useState(''), [sample, setSample] = useState('rose-red');
  const [showBeside,setShowBeside]=useState(false);
  const [history, dispatch] = useReducer(arrangementReducer, null, () => ({ present: { ...initialArrangement(), boxId: 'box-2' }, past: [] }));
  const definition = BOX_PLACEMENT_DEFINITIONS.find(item => item.boxId === boxId);
  const assetIssue = ASSET_ISSUES.find(issue => issue.componentId === boxId && issue.blocksDevelopmentCopy);
  const draft = drafts[boxId] || proposedDraft(boxId), regionKey = zone === 'inside' ? 'regions' : 'besideRegions';
  const components = FIXED_COMPONENTS.map(item => ({ componentId: item.id, category: item.category, displayName: null }));
  function update(next) { setDrafts(current => ({ ...current, [boxId]: next })); }
  function addRegion(event) {
    event.preventDefault();
    if (assetIssue) { setError('Correct and review the artwork before tracing its boundaries.'); return; }
    const region = type === 'polygon' ? { type, points: trace } : { type, ...Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, Number(value)])) };
    if (!validRegion(region)) { setError('Use a valid normalized region. Polygons need at least three distinct points and cannot cross themselves.'); return; }
    update({ ...draft, [regionKey]: [...draft[regionKey], {...region,id:`manual-${regionKey}-${draft[regionKey].length+1}`,layerBase:20}] }); setTrace([]); setError('');
  }
  const output = {...draft,boxId,version:DRAFT_GEOMETRY_VERSION,authoritativeGeometryVersion:GEOMETRY_VERSION,reviewStatus:'unreviewed',physicalDimensions:null,capacity:null,productionApproved:false};
  return <main className="gb-page gb-geometry"><header className="gb-heading"><p className="gb-eyebrow">Local development · geometry review</p><h1>Review the space inside</h1><p>Trace draft regions against the original artwork. Nothing here approves geometry, changes the fixed registry, or writes a database.</p><Link to="/customize/gift-box">Back to gift builder</Link></header>
    <label>Review box<select value={boxId} onChange={event => { setBoxId(event.target.value); dispatch({ type: 'box', id: event.target.value }); setTrace([]); setError(''); }}>{BOX_PLACEMENT_DEFINITIONS.map(item => <option key={item.boxId} value={item.boxId}>{item.boxId} · {item.observedShape}</option>)}</select></label>
    <div className="gb-workspace"><section><p>Current registry: {definition.reviewStatus}; {definition.regions.length} interior regions, {definition.besideRegions.length} beside regions. Physical dimensions and capacity are unknown.</p>
      {assetIssue && <p role="alert">{assetIssue.description} Boundary tracing is blocked for this artwork.</p>}
      <ArrangementCanvas state={history.present} dispatch={dispatch} components={components} study extendedScene={showBeside} onTrace={!assetIssue && type === 'polygon' ? point => setTrace(points => [...points, point]) : undefined} overlay={scene=><DraftGeometryOverlay draft={draft} scene={scene} trace={trace}/>}/>
      <p className="gb-help">Rose = proposed floor. Dashed brown = beside proposal in an extended scene. Orange = foreground wall/rim proposal. Source aspect ratio is preserved. Movement follows the proposed item anchor; this is not a measured physical footprint.</p>
      <ul>{history.present.instances.map(item => <li key={item.id}>{item.componentId}: anchor {item.x===null?'unplaced':studyAnchor(item).map(value=>value.toFixed(3)).join(', ')}; artwork rectangle {item.x!==null&&draft.regions.some(region=>footprintInRegion({x:item.x,y:item.y,width:item.width,height:item.height},region))?'within proposed floor':'extends beyond proposed floor'}; authoritative result: {reviewPlacement(boxId, {}).code}</li>)}</ul>
    </section><section className="gb-geometry-tools"><h2>Draft regions</h2><p>Trace heart wells as polygons, round wells as ellipses, and separate compartments individually. Basket dimensions, foreground rims and oversized toys need explicit owner review. Beside zones must be drawn separately; they do not imply physical capacity.</p>
      <form onSubmit={addRegion}><label>Placement zone<select value={zone} onChange={event => setZone(event.target.value)}><option value="inside">Inside</option><option value="beside">Beside</option></select></label><label>Region shape<select value={type} onChange={event => { setType(event.target.value); setTrace([]); }}><option value="polygon">Trace polygon / heart</option><option value="ellipse">Ellipse / round</option><option value="rectangle">Rectangle</option></select></label>
        {type === 'polygon' ? <><p>Click or tap the artwork to trace vertices ({trace.length}). Then add the region.</p><button type="button" onClick={() => setTrace(points => points.slice(0, -1))} disabled={!trace.length}>Undo last vertex</button></> : <div className="gb-region-fields">{Object.keys(shape).map(key => <label key={key}>{key}<input type="number" min="0" max="1" step="0.01" required value={shape[key]} onChange={event => setShape(current => ({ ...current, [key]: event.target.value }))}/></label>)}</div>}
        <button className="button button-primary" type="submit" disabled={Boolean(assetIssue)}>Add draft region</button>{error && <p role="alert">{error}</p>}
      </form>
      <button type="button" onClick={() => update(proposedDraft(boxId))}>Reset this box&apos;s draft regions and scales</button>
      <label className="gb-check"><input type="checkbox" checked={showBeside} onChange={event=>setShowBeside(event.target.checked)}/>Show extended beside proposal</label>
      <ul className="gb-geometry-notes">{draft.notes.map(note=><li key={note}>{note}</li>)}</ul><p className="gb-help">{draft.regions.length} proposed floor regions; {draft.foregroundMasks.length} foreground/layering proposals. All remain unreviewed.</p>
      <h2>Illustrative item scales</h2><p className="gb-help">Longest visible side as a fraction of the proposed floor width. Applies to the next sample; no physical dimensions are implied.</p>{Object.entries(draft.itemScales).map(([category, scale]) => <label key={category}>{category} study size<input type="number" min="0.02" max="0.8" step="0.01" value={scale} onChange={event => { const size = Number(event.target.value); if (size >= 0.02 && size <= 0.8) update({ ...draft, itemScales: { ...draft.itemScales, [category]: size } }); }}/></label>)}
      <label>Review sample<select value={sample} onChange={event => setSample(event.target.value)}>{FIXED_COMPONENTS.filter(item => ['flower', 'plush', 'chocolate'].includes(item.category)).map(item => <option key={item.id}>{item.id}</option>)}</select></label>
      <button type="button" onClick={() => {
        const item = FIXED_COMPONENTS.find(entry => entry.id === sample), id = crypto.randomUUID();
        // This review-only sample size is never copied into the immutable geometry.
        dispatch({ type: 'add', id: sample, instanceId: id, study: true, reviewSize: draft.itemScales[item.category] });
      }}>Add study sample</button><button type="button" disabled={!history.present.instances.length} onClick={() => dispatch({ type: 'clear' })}>Clear study samples</button>
      <p className="gb-help">Scale drafts are recorded below for review; changing them does not approve or alter customer placement.</p>
      <h2>Copy review draft</h2><p>Copy this text for review. It contains no price, approved capacity or approval state. Reloading this page discards drafts.</p><textarea aria-label="Geometry review draft JSON" readOnly rows={12} value={JSON.stringify(output, null, 2)}/>
    </section></div>
  </main>;
}
