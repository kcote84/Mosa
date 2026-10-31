import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(process.argv[2] || 'web/dist');
const release = JSON.parse(await readFile(resolve(root, 'updates/frame.json'), 'utf8'));
if (release.packageName !== 'app.mosa.frame' || !Number.isSafeInteger(release.versionCode) || release.versionCode < 1 || !/^[a-f0-9]{64}$/.test(release.sha256)
  || release.path !== `/updates/mosa-frame-${release.versionCode}-${release.sha256}.apk`) throw new Error('Publication du cadre invalide.');
const apk = await readFile(resolve(root, '.' + release.path));
if (apk.length !== release.bytes || createHash('sha256').update(apk).digest('hex') !== release.sha256) throw new Error('Fichier APK manquant ou différent du manifeste.');
console.log(`Publication du cadre ${release.versionName} vérifiée.`);
