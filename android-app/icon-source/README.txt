MONIVRA — Android icon assets (vector source + PNG)

Concept: clean flat financial-flow mark, graphite ascending bars + amber arrow, neutral backgrounds.

Files:
- monivra_symbol.svg/png: transparent symbol master.
- monivra_adaptive_foreground.svg/png and *_432.png: transparent foreground for Android adaptive launcher icon.
- monivra_monochrome.svg/png and *_432.png: monochrome artwork for Android themed icons.
- monivra_icon_white.svg/png: white background fallback/preview.
- monivra_icon_dark.svg/png: optional dark alternative.
- monivra_play_512.png: 512px square candidate for Play Store (verify final Play policies before release).
- preview.png: visual comparison.

Android developer instructions:
Use adaptive icon layers: foreground image and a separately defined #FFFFFF background color; let Android mask the icon shape. Use monochrome asset for themed icons. Do NOT use a baked rounded-square image as adaptive foreground. Keep symbol within center safe area. Generate mipmap assets and XML using Android tooling. Preserve original vector SVG as design master.

Note: This is a custom vector redraw of the agreed concept, not a pixel-for-pixel vectorization of the previous AI raster. Validate visually on the device at actual launcher size before final approval.
