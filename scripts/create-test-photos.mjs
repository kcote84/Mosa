import { readFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
if (!process.argv[2]) throw new Error('Fournir le fichier HTML de démonstration comme argument.');
const html = await readFile(process.argv[2], 'utf8');
await mkdir('qa', { recursive: true });
const images = [...html.matchAll(/<svg[\s\S]*?<\/svg>/g)];
await Promise.all(images.map((match, i) => sharp(Buffer.from(match[0].replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))).resize(1600, 1000).jpeg({ quality: 85 }).toFile(`qa/illustration-test-${i + 1}.jpg`)));
console.log(`${images.length} illustrations de test prêtes.`);
