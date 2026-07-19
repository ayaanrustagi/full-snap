# Full Snap — Chrome Web Store listing (submit this)

## Single purpose (required)
Help users capture a webpage screenshot, redact sensitive on-screen data, annotate it, and export or copy it for sharing — entirely on-device.

## Short description (132 chars max)
Capture pages, auto-redact emails & secrets, mark steps, copy a report pack for Slack/Linear. Local-only — nothing uploads.

## Detailed description

Full Snap helps you share what you see on a webpage without leaking private details.

**Capture**
• Visible area (default “Ship a report” flow)
• Full page (scroll-stitch)
• Drag a region
• Click a single element (card, modal, table)

**Redact**
• Auto-covers emails, phone-like numbers, card-like digits, SSNs, JWTs, token strings
• Covers password and common payment fields before the shot
• Manual blur tool for anything left over

**Annotate**
• Pen, highlighter, arrow, box, numbered steps, text, eraser
• Undo / redo

**Ship**
• Copy image to clipboard
• “Ship pack” — image + short report text (URL, title, time, your note)
• Download PNG or JPG
• Optional URL + timestamp stamp on export

**Privacy**
• No Full Snap account
• No Full Snap servers
• Captures and annotations stay on your device
• Privacy policy: https://ayaanrustagi.github.io/full-snap/privacy.html

**Shortcuts**
• Alt+Shift+S — report capture
• Alt+Shift+E — element
• Alt+Shift+R — region

Not affiliated with GoFullPage or any other screenshot product.

## Category
Productivity

## Language
English

## Permission justifications (paste into dashboard)

| Permission | Why |
|------------|-----|
| **activeTab** | Read/capture only the tab you invoke the extension on. |
| **scripting** | Scroll the page for full-page stitch, inject region/element pickers, apply temporary redaction overlays, hide sticky headers during capture. |
| **storage** | Save your preferences (delay, redaction on/off, stamp) and a short local history of capture metadata. Session storage holds the in-progress capture for the editor tab only. |

No host_permissions. No remote code. No analytics SDKs.

## Privacy policy URL
https://ayaanrustagi.github.io/full-snap/privacy.html

## Support / homepage
https://ayaanrustagi.github.io/full-snap/

## Screenshots notes
1. Popup — Ship a report  
2. Editor — steps + ship pack rail  
3. Auto-redact black bars over email  
4. Element picker highlight  

## Reviewer notes
Extension never uploads page content. Redaction is best-effort pattern matching in the DOM before capture; users should still review images before sharing.
