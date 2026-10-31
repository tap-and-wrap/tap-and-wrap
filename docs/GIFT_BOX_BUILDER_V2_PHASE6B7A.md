# Tap & Wrap Gift Box V2 — Phase 6B.7A: Beside-Box Commerce Contract Alignment

**Status:** Development integration only. No merchant packing policy, production publication or checkout authorization.

## Why this patch exists

The validated development layout already lets customers move a plush toy or retail chocolate beside a box and return it inside. However, the **direct-cart** browser serializer and server commerce contract rejected chocolate beside, while the policy contract prohibited a merchant from reviewing it as an explicitly allowed region. This made a perfectly valid *draft* position impossible to represent in the future direct-cart flow.

## Changes

- Preserve the strict, versioned `gift-box-commerce-v1` shape and existing canonical identity semantics; this backward-compatible extension permits `chocolate` or `plush` in a structurally valid `beside` region, but never `flower`. No previously valid configuration changes meaning.
- The browser sends only normalized coordinates, region labels, component IDs and the existing immutable selections. No client-supplied prices, stock, policy approvals or claims of physical fit.
- The strict `gift-box-fulfillment-policy-v1` allows an administrator to *explicitly* list a beside region for an individual chocolate component. That region remains **denied by default**. Plush-only oversized flags are still forbidden for chocolates, roses, ribbons or gift cards.
- Existing physical-policy status, per-component quantities, aggregate and mixed-content limits, unique regions, two BOX-11 inside compartments, policy content hashes and withdrawal remain enforced. Only synthetic unit-test policies are populated; the live policy registry remains empty.
- The legacy V2 **request** contract and its existing legacy beside-plush rule remain untouched because this work is scoped to the separate future **direct-cart** contract. Public request submission, Add to Cart, mixed checkout, file uploads, service accounts and production remain closed.

## What this deliberately does NOT do

This is **not** a claim that every chocolate may physically sit beside any of the twelve boxes or can be shipped beside the box. It does not invent dimensions, quantity ceilings, approved item arrangements, merchant attestations, or box-specific region geometry. The existing development beside region remains a photo-based proposal. The owner-approved overall packing *direction* does not itself supply detailed physical rules; those still require evidence before an operational policy may be approved.

## Validation

Run the full server test suite and server check, then frontend lint/build and the gift-box browser suite on the local machine, after the guarded dry-run/apply installer. Focused tests cover server contract, browser serializer, administrative policy rules, explicit region approval, denial without approval, withdrawal, oversized safeguards, category limits and unaffected BOX-11 policy tests.

No persistent database writes, media upload, Cloudflare, Render, MongoDB Atlas operations, checkout changes, or production deployment are part of this phase.

**Next:** 6B.7B should encode and test the remaining *verified*, box-specific physical policies, including actual compartment handling and mixed content. It must not convert provisional visual positions into measured physical certification or invent 25/2/6 category limits.
