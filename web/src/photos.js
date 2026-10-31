export async function decodePhoto(file) {
  let blob = file;
  if (/\.hei[cf]$/i.test(file.name) || /image\/hei[cf]/i.test(file.type)) {
    const { heicTo } = await import('heic-to/csp');
    blob = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.9 });
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image(); img.src = url; await img.decode();
    if (img.naturalWidth * img.naturalHeight > 80_000_000) throw new Error('image_too_large');
    const scale = Math.min(1, 1920 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#FFF8EF'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL('image/jpeg', 0.9), width: canvas.width, height: canvas.height };
  } finally { URL.revokeObjectURL(url); }
}
export async function renderCrop(data, { mode = 'contain', zoom = 1, x = 50, y = 50 } = {}, maxWidth = 1920) {
  if (mode === 'contain') return data;
  const img = new Image(); img.src = data; await img.decode();
  const width = img.naturalWidth, height = img.naturalHeight;
  const cropWidth = Math.min(width, height * 1.6) / zoom, cropHeight = cropWidth / 1.6;
  const sx = (width - cropWidth) * x / 100, sy = (height - cropHeight) * y / 100;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(Math.min(maxWidth, cropWidth)); canvas.height = Math.round(canvas.width / 1.6);
  canvas.getContext('2d').drawImage(img, sx, sy, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.9);
}
