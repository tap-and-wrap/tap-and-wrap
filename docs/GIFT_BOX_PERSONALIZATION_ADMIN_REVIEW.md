# Tap & Wrap — Gift Box personalization admin UI

This patch adds a protected page at `/admin/gift-box/personalization-options` in the existing admin menu, and read-only personalization details to the order detail UI. It does **not** enable checkout, grant font licenses, approve physical packing or create any database collections.

## Merchant workflow

1. The owner first configures the guarded `GiftBoxPersonalizationOption` schema and enables the separate backend feature. Until then, the page displays the normal unavailable state.
2. Create a permanent lowercase option ID and choose **Photo print** or **Engraving surface**. New options start unpublished and unpriced.
3. Select eligible box IDs. For engraving also select code-owned lettering style and color IDs; check the license confirmation **only** after independent rights review. Preview artwork is not a license.
4. Enter exact EGP pricing, explicitly confirm zero-cost options, then enable and mark available only after all data is reviewed. Backend validation and revision fences remain authoritative.
5. Staff can view saved Gift Box print and engraving instructions on admin orders. Photo blobs must be loaded explicitly through the existing authenticated Private Files viewer; no direct public storage URLs are generated.

The new order display is read-only and preserves historical saved prices; changing option settings never rewrites old orders. The admin option list has a server-side 100-record limit. There is no option deletion flow. The backend feature flag and schema provisioning must remain off until independently validated. **Real checkout remains closed.**
