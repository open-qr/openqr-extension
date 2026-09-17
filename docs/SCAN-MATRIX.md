# Scan acceptance matrix (run before store submission)

Machine verification covers rendering (jsQR byte-exact against the production
renderer in e2e) and payload wire format (35-case parity against the server's
builder). It cannot prove a phone camera reads a small print. This matrix is
the manual pass; use the scanlab harness (site repo) for the device rows.

Produce each artefact from the extension itself: popup export at each size,
both a plain URL and the Wi-Fi/vCard cases.

| # | Artefact | Check on iPhone + Android camera | Pass |
|---|---|---|---|
| 1 | URL code, PNG 512, printed at 25 mm | Both cameras open the URL | ☐ |
| 2 | URL code, PNG 512, printed at 15 mm | Both cameras open the URL (small-print floor) | ☐ |
| 3 | URL code from an ordinary office printer, 80 gsm | Both cameras read on first try | ☐ |
| 4 | Long URL (150+ chars, dense modules) at 512/1024 | Both cameras read | ☐ |
| 5 | Wi-Fi code | Device offers to join the network, password accepted | ☐ |
| 6 | vCard | Device offers to save the contact, all fields present | ☐ |
| 7 | Emoji + non-Latin text | Bytes render exactly in any scanner app | ☐ |
| 8 | SVG exported and printed | Reads identically to the PNG | ☐ |
| 9 | Dark UI screenshot of the code vs export | Preview matches export (white plate) | ☐ |
| 10 | Quiet zone check: exported PNG margin | 8-module quiet zone visible on all four sides | ☐ |

Failure notes per row, with the artefact and device, go in this file's history
(commit) so a regression after a renderer change can be compared.
