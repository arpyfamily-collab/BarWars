/**
 * One-page "BarWars at the door" card a bar prints for its door staff (Brian, Sep 28).
 * Plain HTML in a print window: bar name, a QR that opens Door Mode, the steps, and what each result means.
 */
import QRCode from 'qrcode'

export async function printDoorCard(barName: string) {
  const doorUrl = 'https://app.barwars.app/door'
  const qr = await QRCode.toDataURL(doorUrl, { width: 260, margin: 1 })
  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(`<!doctype html><html><head><title>BarWars at the door · ${esc(barName)}</title><style>
    @page { size: letter; margin: 0.5in }
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; margin: 0 }
    .top { display: flex; align-items: center; gap: 24px; border-bottom: 3px solid #111; padding-bottom: 14px }
    h1 { font-size: 30px; margin: 0; letter-spacing: 1px } .bar { font-size: 18px; color: #444; margin-top: 4px }
    .qr { text-align: center; font-size: 11px; color: #444 } .qr img { width: 150px; height: 150px; display: block }
    h2 { font-size: 16px; text-transform: uppercase; letter-spacing: 1.5px; margin: 18px 0 8px }
    ol { margin: 0; padding-left: 22px; font-size: 15px; line-height: 1.55 }
    .res { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 4px }
    .box { border-radius: 10px; padding: 12px 14px; font-size: 14px; line-height: 1.45 }
    .g { border: 3px solid #1f9d55; background: #eafaf0 } .r { border: 3px solid #d63031; background: #fdeeee }
    .box .h { font-size: 18px; font-weight: 700; display: block; margin-bottom: 4px }
    ul { margin: 6px 0 0; padding-left: 18px } li { margin: 2px 0 }
    .tips { font-size: 14px; line-height: 1.55 } .foot { margin-top: 18px; font-size: 12px; color: #555; border-top: 1px solid #ccc; padding-top: 8px }
  </style></head><body>
    <div class="top">
      <div style="flex:1"><h1>BarWars at the door</h1><div class="bar">${esc(barName)}</div></div>
      <div class="qr"><img src="${qr}" alt="Door Mode"/>Scan to open Door Mode</div>
    </div>

    <h2>Checking a bracelet</h2>
    <ol>
      <li>Open <b>app.barwars.app/door</b> and sign in with your door-staff account (the link your manager sent you).</li>
      <li>Ask the guest to open <b>My Bracelets</b> and tap <b>Show at door</b>.</li>
      <li>Tap <b>Scan bracelet</b> and point your camera at the QR on their phone.</li>
      <li>Read the screen: <b>green = let them in on the offer</b>, red = no.</li>
    </ol>

    <h2>What the screen tells you</h2>
    <div class="res">
      <div class="box g"><span class="h">✓ Green</span>The bracelet is valid tonight at this bar. It's now used; honor the offer shown (for example "No cover").
        <ul><li>Drink offer? It says <b>21+: check ID</b>. Check it.</li></ul></div>
      <div class="box r"><span class="h">✕ Red</span>Don't honor it. The screen says why:
        <ul><li><b>Already used</b> (with the time)</li><li><b>Wrong bar</b>: it's for another bar</li>
            <li><b>Not valid yet</b> or <b>Expired</b>: it's for a different night</li><li><b>Code expired</b>: ask them to reopen it and scan again</li></ul></div>
    </div>

    <h2>Good to know</h2>
    <div class="tips">
      • <b>Screenshots don't work.</b> The code changes every 30 seconds, so it has to be live on their phone.<br/>
      • <b>Camera struggling in the dark?</b> Type the 6-character code shown under their QR and tap Check.<br/>
      • <b>The wristband itself isn't the ticket.</b> Only the voucher in their app counts.<br/>
      • <b>Each bracelet works once,</b> for the night printed on it in the app.<br/>
      • <b>Problem or argument?</b> Don't let it hold the line: send them to the manager, and they can take it up in the app.
    </div>

    <div class="foot">Door staff accounts only work Door Mode; they can't open the Bar Command Center. Lost your login? Ask your manager for a new link.</div>
  </body></html>`)
  w.document.close(); w.focus()
  setTimeout(() => w.print(), 300)
}
