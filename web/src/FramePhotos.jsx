import React, { useEffect, useRef, useState } from 'react';
import { EyeOff, Trash2, RefreshCw } from 'lucide-react';
import { request } from './api';
import { PhotoGrid, PrivateImage } from './Gallery';
import { useText, Button, Modal, Empty, ErrorNotice, DateLabel } from './ui';

export default function FramePhotos({ frame, household, frameCount }) {
  const t = useText();
  const [photos, setPhotos] = useState([]), [total, setTotal] = useState(null), [nextOffset, setNextOffset] = useState(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(null), [notice, setNotice] = useState('');
  const [selected, setSelected] = useState(null), [action, setAction] = useState(null), [acting, setActing] = useState(false), [actionError, setActionError] = useState(null);
  const pending = useRef();
  async function load(offset = '') {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setLoading(true); setError(null);
    try {
      const query = new URLSearchParams({ scope: 'admin', frameId: frame.id, offset });
      const data = await request(`/photos?${query}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setPhotos(old => offset ? [...old, ...data.photos] : data.photos); setTotal(data.total); setNextOffset(data.nextOffset);
    } catch (e) { if (!controller.signal.aborted) setError(e); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => { load(); return () => pending.current?.abort(); }, [frame.id]);
  function open(photo) { setSelected(photo); setAction(null); setActionError(null); setNotice(''); }
  function close() { if (!acting) { setSelected(null); setAction(null); } }
  async function remove() {
    if (acting || !selected || !action) return;
    setActing(true); setActionError(null);
    try {
      await request(action === 'household' ? `/admin/frames/${frame.id}/photos/${selected.id}/hide` : `/photos/${selected.id}`,
        { method: action === 'household' ? 'POST' : 'DELETE' });
      setPhotos(old => old.filter(p => p.id !== selected.id)); setTotal(old => Math.max(0, old - 1));
      setNotice(action === 'household' ? t(`Photo retirée du foyer ${household.name}.`, `Photo removed from ${household.name}’s household.`)
        : t('Photo supprimée de tous les foyers.', 'Photo deleted from every household.'));
      setSelected(null); setAction(null); await load();
    } catch (e) { setActionError(e); }
    finally { setActing(false); }
  }
  return <>
    <div className="page-heading"><div><p className="eyebrow">{t('PHOTOS DU CADRE', 'FRAME PHOTOS')}</p><h1>{frame.label}</h1>
      <p>{t(`Les photos attribuées au foyer ${household.name}, y compris celles en attente de téléchargement.`, `Photos assigned to ${household.name}’s household, including photos waiting to download.`)}</p></div>
      <Button className="secondary" icon={RefreshCw} busy={loading} onClick={() => load()}>{t('Actualiser', 'Refresh')}</Button></div>
    {frameCount > 1 && <p className="notice">{t('Ce foyer possède plusieurs cadres. Ils partagent le même album : un retrait du foyer concerne tous ses cadres.', 'This household has several frames. They share an album: removing a photo from the household affects all its frames.')}</p>}
    <ErrorNotice error={error}/>{notice && <p className="notice success" role="status">{notice}</p>}
    <p className="muted gallery-count">{total ?? '—'} {total === 1 ? t('photo attribuée', 'assigned photo') : t('photos attribuées', 'assigned photos')}</p>
    {photos.length ? <PhotoGrid photos={photos} moderation onOpen={open}/> : loading ? <p role="status">{t('On rassemble les photos du cadre…', 'Getting the frame’s photos…')}</p>
      : !error && <Empty title={t('Aucune photo pour ce cadre', 'No photos for this frame')} description={t('Les photos envoyées à ce foyer apparaîtront ici.', 'Photos sent to this household will appear here.')}/>}
    {nextOffset !== null && <Button className="secondary load-more" busy={loading} onClick={() => load(nextOffset)}>{t('Voir plus de photos', 'See more photos')}</Button>}
    {selected && <Modal title={selected.caption || t('Un beau moment', 'A lovely moment')} onClose={close} wide>
      <div className="detail-photo"><PrivateImage photo={selected} full moderation/></div>
      <p className="muted">{selected.ownerName} · <DateLabel value={selected.createdAt}/></p>
      <p><strong>{t('Foyer sélectionné : ', 'Selected household: ')}{household.name}</strong></p>
      <ErrorNotice error={actionError}/>
      {action ? <section className="photo-removal-confirm" aria-label={t('Confirmer le retrait', 'Confirm removal')}>
        <h3>{action === 'household' ? t(`Retirer cette photo de ${household.name} ?`, `Remove this photo from ${household.name}?`) : t('Supprimer cette photo partout ?', 'Delete this photo everywhere?')}</h3>
        <p>{action === 'household' ? t('Elle sera retirée de l’album et des cadres de ce foyer. Les autres foyers la garderont.', 'It will be removed from this household’s album and frames. Other households will keep it.')
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
