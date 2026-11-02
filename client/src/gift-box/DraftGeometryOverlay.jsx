export default function DraftGeometryOverlay({ draft, scene, trace=[] }) {
  const draw=(region,props)=>region.type==='polygon'?<polygon {...props} points={region.points.map(point=>point.join(',')).join(' ')}/>:region.type==='ellipse'?<ellipse {...props} cx={region.x+region.width/2} cy={region.y+region.height/2} rx={region.width/2} ry={region.height/2}/>:<rect {...props} x={region.x} y={region.y} width={region.width} height={region.height}/>;
  return <svg className="gb-region-overlay" viewBox={`${scene.x} ${scene.y} ${scene.width} ${scene.height}`} preserveAspectRatio="none" aria-label="Unreviewed draft boundaries">
    {draft.foregroundMasks.map(mask=>mask.rimEdge?<polyline key={mask.id} points={mask.rimEdge.map(point=>point.join(',')).join(' ')} className="gb-region-mask" fill="none" vectorEffect="non-scaling-stroke"/>:draw(mask,{key:mask.id,className:'gb-region-mask',vectorEffect:'non-scaling-stroke'}))}
    {[...draft.regions.map(region=>({...region,zone:'inside'})),...draft.besideRegions.map(region=>({...region,zone:'beside'}))].map(region=><g key={region.id}>{draw(region,{className:`gb-region-${region.zone}`,vectorEffect:'non-scaling-stroke'})}</g>)}
    {trace.length>0&&<polyline points={trace.map(point=>point.join(',')).join(' ')} fill="none" stroke="var(--tw-button)" strokeWidth="2" vectorEffect="non-scaling-stroke"/>}
  </svg>;
}
