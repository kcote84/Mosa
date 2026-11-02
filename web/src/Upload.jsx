import React, { useEffect, useRef, useState } from 'react';
import { Plus, UploadCloud, Check, Crop, X, Send, CheckCircle2, Users, ImagePlus } from 'lucide-react';
import { request } from './api';
import { readSharedPhotos, removeSharedPhotos } from './share';
import { decodePhoto, renderCrop } from './photos';
import { branchName, familyLabel } from './families';
import { useText, Button, Mascot, Modal, ErrorNotice } from './ui';
const MAX_PHOTOS_PER_UPLOAD = 50;
function CropEditor({ photo, onSave, onClose }) {
  const t = useText(); const [settings, setSettings] = useState(photo.crop || { mode: 'contain', zoom: 1, x: 50, y: 50 }); const [preview, setPreview] = useState(photo.base); const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; renderCrop(photo.base, settings, 720).then(data => { if (active) setPreview(data); }); return () => { active = false; }; }, [settings]);
  const update = (key, value) => setSettings(old => ({ ...old, [key]: value }));
  return <Modal title={t('Juste le bon cadrage', 'Just the right framing')} onClose={onClose} wide><p>{t('Voici l’aperçu sur un cadre horizontal.', 'Here is the preview on a landscape frame.')}</p><div className="crop-preview"><img src={preview} alt={t('Aperçu du cadrage', 'Crop preview')}/></div><div className="segmented"><button className={settings.mode === 'contain' ? 'active' : ''} onClick={() => update('mode', 'contain')}>{t('Photo entière', 'Whole photo')}</button><button className={settings.mode === 'cover' ? 'active' : ''} onClick={() => update('mode', 'cover')}>{t('Remplir le cadre', 'Fill the frame')}</button></div>{settings.mode === 'cover' && <div className="crop-controls"><label>Zoom<input type="range" min="1" max="3" step="0.05" value={settings.zoom} onChange={e => update('zoom', Number(e.target.value))}/></label><label>{t('Gauche / droite', 'Left / right')}<input type="range" min="0" max="100" value={settings.x} onChange={e => update('x', Number(e.target.value))}/></label><label>{t('Haut / bas', 'Up / down')}<input type="range" min="0" max="100" value={settings.y} onChange={e => update('y', Number(e.target.value))}/></label></div>}<Button className="full-width" busy={busy} icon={Check} onClick={async () => { setBusy(true); const data = await renderCrop(photo.base, settings); onSave({ ...photo, data, crop: settings }); }}>{t('Garder ce cadrage', 'Keep this framing')}</Button></Modal>;
}
export default function Upload({ profile, onDone, shared, onShareHandled }) {
  const t = useText(); const input = useRef(); const [households, setHouseholds] = useState([]); const [selected, setSelected] = useState([]); const [photos, setPhotos] = useState([]); const [editor, setEditor] = useState(null); const [busy, setBusy] = useState(false); const [reading, setReading] = useState(Boolean(shared?.id)); const [error, setError] = useState(null); const [progress, setProgress] = useState(0); const [done, setDone] = useState(0); const [audience, setAudience] = useState('all');
  const processing = useRef(false);
  const [sharedCount, setSharedCount] = useState(0);
  const [skipped, setSkipped] = useState(0);
  useEffect(() => { request('/households').then(setHouseholds).catch(setError); }, []);
  async function prepareFiles(list, available, cancelled = () => false) {
    const all = [...list], files = all.slice(0, available), added = [];
    let rejected = all.length - files.length;
    for (const file of files) {
      if (cancelled()) return { added: [], rejected: 0 };
      try {
        if (file.size > 40 * 1024 * 1024) throw new Error('image_too_large');
        const photo = await decodePhoto(file);
        added.push({ id: crypto.randomUUID(), name: file.name || 'Photo', base: photo.data, data: photo.data, caption: '', crop: { mode: 'contain', zoom: 1, x: 50, y: 50 } });
      } catch { rejected++; }
    }
    return { added, rejected };
  }
  useEffect(() => {
    if (!shared) return;
    if (shared.error) { setError(new Error(shared.error)); onShareHandled(); return; }
    let cancelled = false;
    processing.current = true; setReading(true); setError(null);
    (async () => {
      try {
        const files = await readSharedPhotos(shared.id);
        const { added, rejected } = await prepareFiles(files, MAX_PHOTOS_PER_UPLOAD, () => cancelled);
        if (cancelled) return;
        setPhotos(added); setSelected([]); setSkipped(rejected); setSharedCount(added.length);
        if (!added.length) setError(new Error('invalid_image'));
        // Acknowledge only after decoding; navigation/sign-in must not consume the inbox.
        await removeSharedPhotos(shared.id).catch(() => {});
      } catch (error) { if (!cancelled) setError(error); }
      finally { if (!cancelled) { processing.current = false; setReading(false); onShareHandled(); } }
    })();
    return () => { cancelled = true; };
  }, [shared?.id, shared?.error]);
  async function addFiles(list) {
    if (processing.current) return;
    processing.current = true;
    setReading(true); setError(null);
    try {
      const { added, rejected } = await prepareFiles(list, Math.max(0, MAX_PHOTOS_PER_UPLOAD - photos.length));
      setPhotos(old => [...old, ...added]); setSkipped(rejected);
    } catch (e) { setError(e); } finally { processing.current = false; setReading(false); if (input.current) input.current.value = ''; }
  }
  function chooseAudience(branch) {
    setAudience(branch);
    // Filtering never selects a new recipient or leaves a hidden family selected.
    const visible = new Set(households.filter(h => branch === 'all' || h.branches.includes(branch)).map(h => h.id));
    setSelected(old => old.filter(id => visible.has(id)));
  }
  function selectEveryone() { setAudience('all'); setSelected(households.map(h => h.id)); }
  function toggle(id) { setSelected(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]); }
  async function upload() {
    if (!selected.length) return setError(new Error('choose_recipients'));
    setBusy(true); setError(null); setProgress(0); let sent = 0;
    const prevent = e => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', prevent);
    try {
      for (const photo of photos) {
        await request('/photos', { method: 'POST', body: { image: photo.data, recipientIds: selected, caption: photo.caption, fit: photo.crop.mode } });
        sent++; setProgress(sent); setPhotos(old => old.filter(p => p.id !== photo.id));
      }
      setDone(sent);
    } catch (e) { setError(e); } finally { setBusy(false); window.removeEventListener('beforeunload', prevent); }
  }
  if (done) return <div className="upload-success"><Mascot/><span className="success-check"><CheckCircle2 size={28}/></span><p className="eyebrow">{t('ENVOYÉ AVEC LE SOURIRE', 'SENT WITH A SMILE')}</p><h1>{t('Hop ! Les souvenirs sont en route.', 'Off they go! Memories are on their way.')}</h1><p>{done} {t('photo(s) pour', 'photo(s) for')} {selected.length} {t('foyer(s). Les cadres les recevront à leur prochaine connexion.', 'household(s). Their frames will receive them when they next connect.')}</p><Button onClick={onDone}>{t('Retour à l’album', 'Back to the album')}</Button></div>;
  const visibleHouseholds = households.filter(h => audience === 'all' || h.branches.includes(audience));
  return <><div className="page-heading"><div><p className="eyebrow">{t('UN PETIT COUCOU EN IMAGES', 'A LITTLE HELLO IN PICTURES')}</p><h1>{t('On partage quoi ?', 'What shall we share?')}</h1><p>{t('Choisis tes photos. Mosa s’occupe de les alléger.', 'Choose your photos. Mosa takes care of making them lighter.')}</p></div><span className="step-pill">1 · 2 · 3</span></div><ErrorNotice error={error}/>{sharedCount > 0 && <div className="notice" role="status"><CheckCircle2 size={20}/><span>{t(`${sharedCount} photo(s) reçues depuis ta galerie. Choisis les foyers, puis envoie tes souvenirs.`, `${sharedCount} photo(s) received from your gallery. Choose the households, then send your memories.`)}</span></div>}{skipped > 0 && <div className="notice error" role="alert"><span>{t(`${skipped} photo(s) n’ont pas été ajoutées : fichier illisible, trop volumineux ou limite de 50 atteinte. Vérifie les aperçus avant l’envoi.`, `${skipped} photo(s) were not added: unreadable file, too large, or the limit of 50 was reached. Check the previews before sending.`)}</span></div>}<div className="upload-layout"><div><section className="panel"><div className="panel-title"><span className="step-number">1</span><h2>{t('Tes photos', 'Your photos')}</h2></div><input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple hidden onChange={e => addFiles(e.target.files)} disabled={busy || reading}/><button className={`dropzone ${photos.length ? 'compact' : ''}`} disabled={busy || reading || photos.length >= MAX_PHOTOS_PER_UPLOAD} onClick={() => input.current.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!busy && !reading) addFiles(e.dataTransfer.files); }}><span className="dropzone-icon"><ImagePlus size={32}/></span><strong>{reading ? t('On prépare les photos…', 'Preparing your photos…') : photos.length ? t('Ajouter d’autres photos', 'Add more photos') : t('Choisir des photos', 'Choose photos')}</strong><span>{t(`Jusqu’à ${MAX_PHOTOS_PER_UPLOAD} photos à la fois · iPhone et Android`, `Up to ${MAX_PHOTOS_PER_UPLOAD} photos at a time · iPhone and Android`)}</span></button>{photos.length > 0 && <div className="upload-photo-list">{photos.map(photo => <div className="upload-photo" key={photo.id}><div className="upload-preview"><img src={photo.data} alt={photo.name} loading="lazy" decoding="async"/><button className="remove-photo" disabled={busy} onClick={() => setPhotos(old => old.filter(p => p.id !== photo.id))} aria-label={t('Retirer cette photo', 'Remove this photo')}><X size={17}/></button><button className="crop-button" disabled={busy} onClick={() => setEditor(photo)}><Crop size={16}/>{t('Recadrer', 'Crop')}</button></div><label><span className="sr-only">{t('Légende', 'Caption')}</span><input type="text" maxLength={280} disabled={busy} placeholder={t('Un petit mot ? (facultatif)', 'A little note? (optional)')} value={photo.caption} onChange={e => setPhotos(old => old.map(p => p.id === photo.id ? { ...p, caption: e.target.value } : p))}/></label></div>)}</div>}</section></div><aside className="upload-recipients"><section className="panel"><div className="panel-title"><span className="step-number">2</span><h2>{t('Pour qui ?', 'For whom?')}</h2></div><p className="muted">{t('Personne n’est coché au départ. Choisis les foyers qui recevront tes photos.', 'No one is selected to start. Choose the households that will receive your photos.')}</p>{profile.household.branches.length > 1 && <><p className="hint">{t('Afficher les foyers :', 'Show households:')}</p><div className="segmented small family-filter"><button className={audience === 'all' ? 'active' : ''} onClick={() => chooseAudience('all')} disabled={busy}>{t('Toutes', 'All')}</button>{profile.household.branches.map(branch => <button key={branch} className={audience === branch ? 'active' : ''} onClick={() => chooseAudience(branch)} disabled={busy}>{branchName(branch)}</button>)}</div></>}<div className="recipient-actions"><Button className="secondary full-width" icon={Users} disabled={busy || !households.length} onClick={selectEveryone}>{t('Tout le monde', 'Everyone')}</Button><button className="text-button" disabled={busy || !selected.length} onClick={() => setSelected([])}>{t('Tout décocher', 'Clear selection')}</button></div><div className="recipient-list">{visibleHouseholds.map(h => <label className={`recipient ${selected.includes(h.id) ? 'checked' : ''}`} key={h.id}><input type="checkbox" checked={selected.includes(h.id)} onChange={() => toggle(h.id)} disabled={busy}/><span className="recipient-avatar">{h.name.slice(0, 1)}</span><span><strong>{h.name}</strong><small>{familyLabel(h.branches, t)}</small></span></label>)}</div><p className="hint">{t('Un foyer décoché ne verra pas ces photos, ni dans son app ni sur son cadre.', 'An unchecked household will not see these photos in its app or on its frame.')}</p></section><section className="send-panel"><div className="panel-title"><span className="step-number">3</span><h2>{t('C’est parti !', 'Ready to go!')}</h2></div><p>{photos.length} {t('photo(s)', 'photo(s)')} · {selected.length} {t('foyer(s)', 'household(s)')}</p><Button icon={Send} busy={busy} disabled={!photos.length || !selected.length || reading} className="full-width" onClick={upload}>{busy ? t(`Envoi… ${progress} terminée(s)`, `Sending… ${progress} complete`) : t('Envoyer les souvenirs', 'Send the memories')}</Button><p className="hint">{t('Même un cadre pas encore branché recevra les photos à sa première connexion.', 'Even a frame that has not been set up will receive the photos when it first connects.')}</p></section></aside></div>{editor && <CropEditor photo={editor} onClose={() => setEditor(null)} onSave={updated => { setPhotos(old => old.map(p => p.id === updated.id ? updated : p)); setEditor(null); }}/>}</>;
}
