# Tap & Wrap — Phase 6B.4b.3: Photo inspection and review clarity

Base: feature/gift-box-builder-v2 at 8d41db4bb3ba8a86ae120921318bbaa56d1c6b5c. Development-only patch.

## Scope
- Selecting a photo print reveals a larger *original image* inspection panel under the canvas. This does **not** change the print footprint, scene, drag rules, physical scale, storage, or price.
- The final review explicitly separates selected components, the existing server-provided component estimate, and unpriced/unsubmitted personal drafts.
- Browser coverage with a synthetic contrast photo tests 320/390/768/1440px and 320px at 200% text, no horizontal overflow, no repricing from photo actions, and closed submission.

## Restrictions
No database schema or writes, uploads, order/checkout flags, remote calls, deployment, production approval, or owner settings changes. Do not claim physical fit or photo/engraving pricing. Box-1 artwork still blocks production readiness; owner packing, fonts, and fulfillment reviews remain pending.

## Validation
Run the configured Playwright browser suite, client lint/build, asset audit, backend tests/check, and git diff --check. Review screenshots. No commit until validation passes.
