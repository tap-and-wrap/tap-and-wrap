import { z } from 'zod';
import { FONT_REGISTRY } from '../../../shared/engraving/definitions.mjs';
import { validateDesign } from '../../../shared/engraving/visual-design.mjs';
import { productArtworkIds } from '../../../shared/product-engraving.mjs';
import { isSafeImageReference } from '../catalog/fields.js';
const label = z.string().trim().min(1).max(120), id = z.string().regex(/^[a-f0-9]{24}$/i);
export const productEngravingConfigurationInput = z.object({ imageKey: z.string().max(500).refine(isSafeImageReference), width: z.number().int().min(1).max(12000), height: z.number().int().min(1).max(12000), fontIds: z.array(z.enum(FONT_REGISTRY.map(font => font.id))).min(1).max(12), materials: z.array(label).min(1).max(20), placements: z.array(label).max(20) }).strict().refine(c => c.width / c.height >= .05 && c.width / c.height <= 20 && new Set(c.fontIds).size === c.fontIds.length && new Set(c.materials).size === c.materials.length && new Set(c.placements).size === c.placements.length, 'Choose distinct options and a supported surface image.');
export const productEngravingDesignInput = z.object({ contractVersion: z.literal('product-engraving-v1'), designKey: z.uuid(), configurationVersion: z.number().int().positive(), material: label, placement: z.string().max(120), design: z.unknown().transform((value, context) => { try { return validateDesign(value); } catch { context.addIssue({ code: 'custom', message: 'A valid visual design is required.' }); return z.NEVER; } }) }).strict().superRefine((spec, ctx) => {
  const layers = spec.design?.layers;
  if (!spec.design?.surface || !layers?.length || productArtworkIds(spec).length > 10 || layers.some(layer => layer.type === 'text' && !layer.text.trim()) || productArtworkIds(spec).some(value => !id.safeParse(value).success) || new Set(productArtworkIds(spec)).size !== productArtworkIds(spec).length) ctx.addIssue({ code: 'custom', message: 'Add text or separate private artwork to the product surface.' });
});
export const productEngravingCartInput = productEngravingDesignInput.safeExtend({ reviewFingerprint: z.string().regex(/^[a-f0-9]{64}$/) });

export function validProductEngravingSnapshots(lines) {
  return Array.isArray(lines) && lines.every(line => {
    const snapshot = line.productEngraving;
    if (snapshot === undefined) return true;
    const spec = snapshot?.specification, configuration = snapshot?.configuration;
    return line.kind === 'product' && snapshot.snapshotVersion === 'product-engraving-order-v1'
      && productEngravingCartInput.safeParse(spec).success && String(line.productId) === snapshot.productId && (line.variantKey || null) === snapshot.variantKey
      && configuration?.version === spec.configurationVersion && configuration.surface?.id === spec.design.surface.assetId
      && Number.isSafeInteger(snapshot.basePricePiastres) && snapshot.basePricePiastres > 0
      && Number.isSafeInteger(snapshot.surchargePiastres) && snapshot.surchargePiastres >= 0
      && line.unitPricePiastres === snapshot.basePricePiastres + snapshot.surchargePiastres
      && line.lineTotalPiastres === line.unitPricePiastres * line.quantity;
  });
}
