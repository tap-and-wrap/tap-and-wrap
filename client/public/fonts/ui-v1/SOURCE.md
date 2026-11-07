# Website UI fonts

Retrieved 2026-11-07 from the official Google Fonts CSS API and fonts.gstatic.com.
Unmodified WOFF2 subsets; no build-time or runtime Google Fonts requests.

Kalam by Indian Type Foundry, version 18 delivery, SIL OFL 1.1 (Kalam-OFL.txt):

- 300 Latin: https://fonts.gstatic.com/s/kalam/v18/YA9Qr0Wd4kDdMtD6GjLMkiQ.woff2
- 400 Latin: https://fonts.gstatic.com/s/kalam/v18/YA9dr0Wd4kDdMthROCc.woff2
- 700 Latin: https://fonts.gstatic.com/s/kalam/v18/YA9Qr0Wd4kDdMtDqHTLMkiQ.woff2
- Official specimen: https://fonts.google.com/specimen/Kalam
- License source: https://github.com/google/fonts/blob/main/ofl/kalam/OFL.txt

Amiri, an existing licensed personalization family in this repository, supplies
Arabic UI fallback through an independent CSS alias. Its existing artwork files
and family identities are untouched. Optimized Arabic-only version 30 delivery,
SIL OFL 1.1 (Amiri-OFL.txt):

- 400 Arabic: https://fonts.gstatic.com/s/amiri/v30/J7aRnpd8CGxBHpUrtLMA7w.woff2
- 700 Arabic: https://fonts.gstatic.com/s/amiri/v30/J7acnpd8CGxBHp2VkaY6zp5yGw.woff2
- License source: https://github.com/google/fonts/blob/main/ofl/amiri/OFL.txt

CSS unicode ranges isolate Latin and Arabic; Arabic never requests Kalam.
Only the regular Latin face is preloaded. Other faces load when used.
The immutable `ui-v1` path must be versioned if bytes change in a later release.
