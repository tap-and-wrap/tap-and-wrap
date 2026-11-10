import { FONT_REGISTRY } from '../../../../shared/engraving/definitions.mjs';
import { layerHeight } from './design.mjs';
import { TextArtwork, useAssetSources } from './VisualEngravingEditor.jsx';

/** Read-only rendering uses the editor's geometry, lettering and owned media. */
export default function VisualDesignPreview({ design, assets, ownerScope, label = 'Your engraving preview' }) {
  const [sources, rejectSource] = useAssetSources(assets, ownerScope);
  if (!design?.surface) return <div className="ve-preview-empty">Choose your surface photo to begin.</div>;
  return <div className="ve-composite" role="img" aria-label={label} style={{ aspectRatio: design.surface.aspectRatio, '--ve-surface-ratio': design.surface.aspectRatio }}>
    {sources[design.surface.assetId] ? <img className="ve-surface" src={sources[design.surface.assetId]} alt="" onError={() => rejectSource(design.surface.assetId)}/> : <span>Surface photo unavailable. Open or replace it.</span>}
    {design.layers.map(layer => <div key={layer.id} className="ve-layer" style={{ left: `${layer.x * 100}%`, top: `${layer.y * 100}%`, width: `${layer.width * 100}%`, height: `${layerHeight(layer, design.surface.aspectRatio) * 100}%` }}>
      {layer.type === 'text' ? <TextArtwork layer={layer} font={FONT_REGISTRY.find(font => font.id === layer.fontId)}/> : sources[layer.assetId] ? <img src={sources[layer.assetId]} alt="" onError={() => rejectSource(layer.assetId)}/> : <span>Artwork unavailable</span>}
    </div>)}
  </div>;
}
