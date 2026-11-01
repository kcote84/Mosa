import React, { useEffect, useRef, useState } from 'react';
import { EyeOff, Trash2, RefreshCw } from 'lucide-react';
import { request } from './api';
import { PhotoGrid, PrivateImage } from './Gallery';
import { useText, Button, Modal, Empty, ErrorNotice, DateLabel } from './ui';

const MAX_SELECTION = 200;
export default function HouseholdPhotos({ household, frameCount }) {
  const t = useText();
  const [photos, setPhotos] = useState([]), [total, setTotal] = useState(null), [nextOffset, setNextOffset] = useState(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(null), [notice, setNotice] = useState('');
  const [selected, setSelected] = useState(null), [action, setAction] = useState(null), [acting, setActing] = useState(false), [actionError, setActionError] = useState(null);
  const [checkedIds, setCheckedIds] = useState([]), [bulkConfirm, setBulkConfirm] = useState(false);
  const pending = useRef();
  async function load(offset = '') {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setLoading(true); setError(null);
    try {
      const query = new URLSearchParams({ scope: 'admin', householdId: household.id, offset });
      const data = await request(`/photos?${query}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setPhotos(old => offset ? [...old, ...data.photos.filter(p => !old.some(existing => existing.id === p.id))] : data.photos); setTotal(data.total); setNextOffset(data.nextOffset);
      if (!offset) setCheckedIds([]);
    } catch (e) { if (!controller.signal.aborted) setError(e); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => { load(); return () => pending.current?.abort(); }, [household.id]);
  function open(photo) { setSelected(photo); setAction(null); setActionError(null); setNotice(''); }
  function close() { if (!acting) { setSelected(null); setAction(null); } }
  function togglePhoto(id) {
    setCheckedIds(old => old.includes(id) ? old.filter(value => value !== id) : old.length < MAX_SELECTION ? [...old, id] : old);
  }
  async function removeSelection() {
    if (acting || !checkedIds.length) return;
    setActing(true); setActionError(null);
    try {
      const result = await request(`/admin/households/${household.id}/photos/hide`, { method: 'POST', body: { photoIds: checkedIds } });
      setPhotos(old => old.filter(p => !checkedIds.includes(p.id))); setTotal(old => Math.max(0, old - result.removed));
      setCheckedIds([]); setBulkConfirm(false);
      setNotice(t(`Sélection retirée du foyer ${household.name}. Les autres foyers conservent leurs photos.`, `Selection removed from ${household.name}’s household. Other households keep their photos.`));
      await load();
    } catch (e) { setActionError(e); }
    finally { setActing(false); }
  }
  async function remove() {
    if (acting || !selected || !action) return;
    setActing(true); setActionError(null);
    try {
      await request(action === 'household' ? `/admin/households/${household.id}/photos/${selected.id}/hide` : `/photos/${selected.id}`,
        { method: action === 'household' ? 'POST' : 'DELETE' });
      setPhotos(old => old.filter(p => p.id !== selected.id)); setTotal(old => Math.max(0, old - 1));
      setNotice(action === 'household' ? t(`Photo retirée du foyer ${household.name}.`, `Photo removed from ${household.name}’s household.`)
        : t('Photo supprimée de tous les foyers.', 'Photo deleted from every household.'));
      setSelected(null); setAction(null); await load();
    } catch (e) { setActionError(e); }
    finally { setActing(false); }
  }
  return <>
    <div className="page-heading"><div><p className="eyebrow">{t('PHOTOS DU FOYER', 'HOUSEHOLD PHOTOS')}</p><h1>{household.name}</h1>
      <p>{t(`Les photos attribuées au foyer ${household.name}, y compris celles en attente de téléchargement.`, `Photos assigned to ${household.name}’s household, including photos waiting to download.`)}</p></div>
      <Button className="secondary" icon={RefreshCw} busy={loading} disabled={acting} onClick={() => load()}>{t('Actualiser', 'Refresh')}</Button></div>
    {frameCount === 0 && <p className="notice">{t('Ce foyer n’a pas encore de cadre associé. Tu peux déjà retirer les photos en attente : son futur cadre ne les recevra pas.', 'This household has no frame assigned yet. You can already remove waiting photos: its future frame will not receive them.')}</p>}
    {frameCount > 1 && <p className="notice">{t('Ce foyer possède plusieurs cadres. Ils partagent le même album : un retrait du foyer concerne tous ses cadres.', 'This household has several frames. They share an album: removing a photo from the household affects all its frames.')}</p>}
    <ErrorNotice error={error}/>{notice && <p className="notice success" role="status">{notice}</p>}
    <p className="muted gallery-count">{total ?? '—'} {total === 1 ? t('photo attribuée', 'assigned photo') : t('photos attribuées', 'assigned photos')}</p>
    {photos.length > 0 && <div className="photo-selection-tools">
      <p>{t('Coche les photos à retirer de ce foyer.', 'Check the photos to remove from this household.')}</p>
      <div className="button-row"><Button className="secondary" disabled={loading || acting} onClick={() => setCheckedIds(photos.slice(0, MAX_SELECTION).map(p => p.id))}>{t('Tout cocher (photos affichées)', 'Select all (shown photos)')}</Button>
        <button className="text-button" disabled={loading || acting || !checkedIds.length} onClick={() => setCheckedIds([])}>{t('Tout décocher', 'Clear selection')}</button></div>
      {checkedIds.length >= MAX_SELECTION && <p className="hint">{t(`Maximum ${MAX_SELECTION} photos à la fois.`, `Maximum ${MAX_SELECTION} photos at a time.`)}</p>}
    </div>}
    {photos.length ? <PhotoGrid photos={photos} moderation onOpen={open} checkedIds={checkedIds} onToggle={togglePhoto} selectionDisabled={acting || loading} selectionLimit={MAX_SELECTION}/> : loading ? <p role="status">{t('On rassemble les photos du foyer…', 'Getting the household’s photos…')}</p>
      : !error && <Empty title={t('Aucune photo pour ce foyer', 'No photos for this household')} description={t('Les photos envoyées à ce foyer apparaîtront ici.', 'Photos sent to this household will appear here.')}/>}
    {nextOffset !== null && <Button className="secondary load-more" busy={loading} disabled={acting} onClick={() => load(nextOffset)}>{t('Voir plus de photos', 'See more photos')}</Button>}
    {checkedIds.length > 0 && <div className="photo-bulk-bar"><strong role="status">{checkedIds.length} {t('photo(s) cochée(s)', 'photo(s) selected')}</strong>
      <Button className="danger" icon={EyeOff} disabled={acting || loading} onClick={() => { setActionError(null); setBulkConfirm(true); }}>{t('Retirer la sélection', 'Remove selection')}</Button></div>}
    {bulkConfirm && <Modal title={t(`Retirer ${checkedIds.length} photo(s) de ${household.name} ?`, `Remove ${checkedIds.length} photo(s) from ${household.name}?`)} onClose={() => { if (!acting) setBulkConfirm(false); }}>
      <p>{t('Ces photos seront retirées de l’album et des cadres de ce foyer seulement. Les autres foyers les garderont. Les photos encore en attente ne seront pas téléchargées par son futur cadre.', 'These photos will be removed only from this household’s album and frames. Other households will keep them. Photos still waiting will not be downloaded by its future frame.')}</p>
      <ErrorNotice error={actionError}/><div className="button-row"><Button className="secondary" disabled={acting} onClick={() => setBulkConfirm(false)}>{t('Annuler', 'Cancel')}</Button>
        <Button className="danger" busy={acting} onClick={removeSelection}>{t('Confirmer le retrait de ce foyer', 'Confirm removal from this household')}</Button></div>
    </Modal>}
    {selected && <Modal title={selected.caption || t('Un beau moment', 'A lovely moment')} onClose={close} wide>
      <div className="detail-photo"><PrivateImage photo={selected} full moderation/></div>
      <p className="muted">{selected.ownerName} · <DateLabel value={selected.createdAt}/></p>
      <p><strong>{t('Foyer sélectionné : ', 'Selected household: ')}{household.name}</strong></p>
      <ErrorNotice error={actionError}/>
      {action ? <section className="photo-removal-confirm" aria-label={t('Confirmer le retrait', 'Confirm removal')}>
        <h3>{action === 'household' ? t(`Retirer cette photo de ${household.name} ?`, `Remove this photo from ${household.name}?`) : t('Supprimer cette photo partout ?', 'Delete this photo everywhere?')}</h3>
        <p>{action === 'household' ? t('Elle sera retirée de l’album et des cadres de ce foyer. Si elle est encore en attente, son cadre ne la téléchargera pas. Les autres foyers la garderont.', 'It will be removed from this household’s album and frames. If it is still waiting, its frame will not download it. Other households will keep it.')
          : t('Elle disparaîtra de tous les albums et cadres destinataires dans Mosa. Cette suppression est définitive.', 'It will disappear from every recipient album and frame in Mosa. This deletion is permanent.')}</p>
        <div className="button-row"><Button className="secondary" disabled={acting} onClick={() => { setAction(null); setActionError(null); }}>{t('Annuler', 'Cancel')}</Button>
          <Button className="danger" busy={acting} onClick={remove}>{action === 'household' ? t('Confirmer le retrait de ce foyer', 'Confirm removal from this household') : t('Confirmer la suppression partout', 'Confirm deletion everywhere')}</Button></div>
      </section> : <div className="button-row">
        <Button className="secondary" icon={EyeOff} onClick={() => setAction('household')}>{t('Retirer de ce foyer', 'Remove from this household')}</Button>
        <Button className="danger" icon={Trash2} onClick={() => setAction('everywhere')}>{t('Supprimer partout', 'Delete everywhere')}</Button>
      </div>}
      <p className="hint">{t('Le retrait est transmis immédiatement aux cadres connectés. Un cadre hors ligne l’appliquera à sa reconnexion.', 'The removal is sent immediately to connected frames. An offline frame applies it when it reconnects.')}</p>
    </Modal>}
  </>;
}
