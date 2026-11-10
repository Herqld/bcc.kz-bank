// Brightens the user's dark screenshot and splits it into readable halves.
// Run: node tools/_screenshot.js
const sharp = require('sharp');
const src = 'C:/Users/Hp/Desktop/WhatsApp Image 2026-11-06 at 15.43.19.jpeg';
const base = 'C:/Users/Hp/Desktop/bcc.kz/CODDY 2.2/';
(async () => {
  const meta = await sharp(src).metadata();
  const w = meta.width, h = meta.height;
  const cw = Math.ceil(w / 2);
  for (let c = 0; c < 2; c++) {
    await sharp(src)
      .extract({ left: c * cw, top: 0, width: Math.min(cw, w - c * cw), height: h })
      .linear(3.2, -12)                     // exposure boost x3.2
      .normalize()
      .resize({ width: 660 })
      .png({ quality: 92 })
      .toFile(base + 'user_bright_' + c + '.png');
  }
  console.log('ok', w + 'x' + h);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });