import { mkdir, writeFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Keep this key: future installations must be signed by the same key to update in place.
const configPath = resolve('.local/android-signing.json');
const keyPath = resolve('.local/mosa-release.jks');
try { await access(configPath); console.log('Signature Mosa déjà préparée. Aucun changement.'); process.exit(0); } catch {}
try { await access(keyPath); throw new Error('Clé déjà présente sans configuration : restauration manuelle nécessaire.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir('.local', { recursive: true });
const password = randomBytes(36).toString('base64url');
const keytool = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool') : 'keytool';
execFileSync(keytool, ['-genkeypair', '-keystore', keyPath, '-storetype', 'PKCS12', '-alias', 'mosa', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-dname', 'CN=Mosa Frame', '-storepass:env', 'MOSA_SIGNING_PASSWORD', '-keypass:env', 'MOSA_SIGNING_PASSWORD'], { env: { ...process.env, MOSA_SIGNING_PASSWORD: password }, stdio: 'pipe' });
await writeFile(configPath, JSON.stringify({ storeFile: keyPath.replaceAll('\\', '/'), password }, null, 2), { mode: 0o600 });
console.log('Signature privée Mosa préparée dans .local. Sauvegarder ces deux fichiers hors de Git.');
