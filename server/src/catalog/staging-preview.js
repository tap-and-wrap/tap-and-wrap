import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { mediaUrlForKey, publicProductDetail, categoryPresentation } from './public-presentation.js';

// This exception is available only in the disposable loopback test process.
function isolatedPreviewTest(connection) {
  return env.nodeEnv === 'test' && connection.name === 'tap_wrap_catalog_test' && connection.host === '127.0.0.1';
}

export function isStagingPreviewEnabled(connection = mongoose.connection) {
  return env.stagingPreviewEnabled === true && env.databaseTarget === 'staging' && connection.readyState === 1 &&
    (connection.name === 'tapandwrap_staging' || isolatedPreviewTest(connection));
}

export function isAdminPreviewEnabled(connection = mongoose.connection) {
  if (isStagingPreviewEnabled(connection)) return true;
  return env.nodeEnv === 'production' && env.databaseTarget === 'production' && env.productionDatabaseAuthorized === true &&
    connection.readyState === 1 && connection.name === 'tapandwrap_production';
}

export function requireAdminPreview(req, res, next) {
  if (!isAdminPreviewEnabled()) {
    return res.status(404).json({ ok: false, error: { code: 'ADMIN_PREVIEW_UNAVAILABLE', message: 'The authenticated preview is unavailable for this database target.' } });
  }
  next();
}

function previewCategory(category) {
  const value = categoryPresentation(category);
  return value ? { ...value, active: category.active === true } : null;
}

export function adminProductPreviewPresentation(product) {
  const detail = publicProductDetail(product);
  return {
    ...detail,
    pricePiastres: product.priceApproved && product.pricePiastres > 0 ? product.pricePiastres : null,
    externalCatalogId: product.externalCatalogId || null,
    catalogRole: product.catalogRole,
    status: product.status,
    sku: product.sku || '',
    category: previewCategory(product.categoryId),
    subcategory: previewCategory(product.subcategoryId),
    inventory: { ...detail.inventory, approved: product.inventory.approved === true, available: false },
    variants: detail.variants.map((variant, index) => ({
      ...variant,
      priceApproved: product.variants[index].pricePiastres == null ? product.priceApproved === true : product.variants[index].priceApproved === true,
      inventory: { ...variant.inventory, approved: product.variants[index].inventory.approved === true, available: false },
      orderingAvailable: false,
    })),
    gallerySlots: (product.galleryKeys || []).map((key, index) => ({ position: index + 1, url: mediaUrlForKey(key), isMain: key === product.mainImageKey })),
    orderingAvailable: false,
    relatedProducts: [],
    preview: { enabled: true, inventoryApproved: product.inventory.approved === true, reviewRequired: product.reviewRequired === true },
  };
}

// Compatibility for existing staging-only API tests.
export const stagingProductPresentation = adminProductPreviewPresentation;
export const requireStagingPreview = requireAdminPreview;
