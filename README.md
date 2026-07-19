# Full Snap — Full-Page Screenshot & Annotate

Amber UI. Scroll-stitches the active page, opens an annotator (pen / highlight / box / eraser), downloads PNG.

## Load
`chrome://extensions` → **Load unpacked** → this folder.

## Notes
- Uses `activeTab` + `captureVisibleTab` + scroll stitching
- Caps very long pages (~16k CSS px) for stability
