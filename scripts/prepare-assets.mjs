import sharp from 'sharp';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
const source = 'web/public/assets/mosa-mascot.png';
await mkdir('design', { recursive: true });
try { await copyFile(source, 'design/mosa-mascot-source.png', 1); } catch (e) { if (e.code !== 'EEXIST') throw e; }
for (const size of [192, 512]) {
  const mascot = await sharp('design/mosa-mascot-source.png').resize(Math.round(size * .78), Math.round(size * .78), { fit: 'contain' }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: '#FFF8EF' } }).composite([{ input: mascot, gravity: 'centre' }]).png().toFile(`web/public/assets/icon-${size}.png`);
}
await mkdir('android/app/src/main/res/drawable', { recursive: true });
await sharp('design/mosa-mascot-source.png').resize(640, 640, { fit: 'contain' }).png().toFile('android/app/src/main/res/drawable/mascot.png');
await copyFile('web/public/assets/icon-192.png', 'android/app/src/main/res/drawable/app_icon.png');
console.log('Icônes PWA et Android prêtes.');
