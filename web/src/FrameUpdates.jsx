import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, Monitor, Radio } from 'lucide-react';
import { useText, Button, ErrorNotice, Modal } from './ui';
import { request } from './api';

export default function FrameUpdates({ frames = [], onRefresh }) {
  const t = useText();
  const [release, setRelease] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [target, setTarget] = useState('all');
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const active = frames.filter(f => f.active);
  const eligible = active.filter(f => f.remoteUpdates);
  const selected = eligible.filter(f => target === 'all' || target === f.id);
  const pending = active.some(f => f.remoteUpdate && ['queued', 'received', 'checking', 'downloading', 'installing'].includes(f.remoteUpdate.state) && f.remoteUpdate.expiresAt > Date.now());
  useEffect(() => { if (!pending || !onRefresh) return; const timer = setInterval(onRefresh, 10000); return () => clearInterval(timer); }, [pending, onRefresh]);
  async function push() {
    setSending(true); setError(null); setSent(false);
    try { await request('/admin/frame-updates', { method: 'POST', body: { frameIds: selected.map(f => f.id) } }); setSent(true); setConfirm(false); await onRefresh?.(); }
    catch (e) { setError(e); setConfirm(false); }
    finally { setSending(false); }
  }
  function updateStatus(frame) {
    const command = frame.remoteUpdate;
    if (!command) return frame.remoteUpdates ? t('Prêt pour les mises à jour à distance', 'Ready for remote updates') : t('Première mise à jour à lancer sur le cadre', 'Start the first update on the frame');
    const state = command.state === 'queued' && command.expiresAt < Date.now() ? 'expired' : command.state;
    const labels = {
      queued: ['En attente du cadre', 'Waiting for the frame'], received: ['Demande reçue', 'Request received'],
      checking: ['Vérification en cours', 'Checking'], downloading: ['Téléchargement en cours', 'Downloading'], installing: ['Installation en cours', 'Installing'],
      installed: ['Version installée', 'Version installed'], error: ['Échec — réessayer', 'Failed — try again'],
      retry_required: ['À relancer', 'Retry needed'], manual_required: ['Confirmation requise sur le cadre', 'Confirmation needed on the frame'], expired: ['Demande expirée — relancer', 'Request expired — send again']
    };
    return `${t(...(labels[state] || labels.queued))} · ${command.targetName}`;
  }
  async function check() {
    setBusy(true); setError(null);
    try {
      const response = await fetch('/updates/frame.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('update_unavailable');
      const value = await response.json();
      if (value.packageName !== 'app.mosa.frame' || !Number.isSafeInteger(value.versionCode) || value.versionCode < 1
        || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(value.versionName) || !/^[a-f0-9]{64}$/.test(value.sha256)
        || value.path !== `/updates/mosa-frame-${value.versionCode}-${value.sha256}.apk`) throw new Error('update_unavailable');
      setRelease(value);
    } catch { setRelease(null); setError(new Error('update_unavailable')); }
    finally { setBusy(false); }
  }
  useEffect(() => { check(); }, []);
  return <section className="panel update-panel">
    <div className="section-heading"><div><h2><Monitor size={23}/> {t('Mises à jour des cadres', 'Frame updates')}</h2>
      <p>{t('Chaque cadre vérifie à minuit. Les cadres préparés pour les mises à jour automatiques installent les nouveautés et relancent Mosa pendant la nuit. Les autres demandent une confirmation sur le cadre.', 'Each frame checks at midnight. Frames prepared for automatic updates install new versions and restart Mosa during the night. Other frames ask for confirmation on the frame.')}</p></div></div>
    <ErrorNotice error={error}/>
    {release && <p><strong>{t('Dernière version : ', 'Latest version: ')}{release.versionName}</strong> · {(release.bytes / 1048576).toFixed(1)} {t('Mo', 'MB')}</p>}
    <div className="update-actions">
      {release && <a className="button" href={release.path} download><Download size={20}/>{t('Télécharger la dernière version du cadre', 'Download latest frame version')}</a>}
      <Button className="secondary" icon={RefreshCw} busy={busy} onClick={check}>{t('Vérifier les mises à jour', 'Check for updates')}</Button>
    </div>
    <div className="remote-update-controls">
      <h3>{t('Mise à jour immédiate par Wi-Fi', 'Update now over Wi-Fi')}</h3>
      <p>{t('Pour une urgence, déclenche l’installation sans attendre minuit. Le cadre redémarre brièvement et garde ses photos.', 'For an urgent fix, start installation without waiting for midnight. The frame briefly restarts and keeps its photos.')}</p>
      <label>{t('Cadres à mettre à jour', 'Frames to update')}<select value={target} onChange={e => { setTarget(e.target.value); setSent(false); }} disabled={sending}>
        <option value="all">{t('Tous les cadres compatibles', 'All compatible frames')}</option>
        {eligible.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
      </select></label>
      <Button icon={Radio} disabled={!release || !selected.length} busy={sending} onClick={() => setConfirm(true)}>{t('Mettre à jour maintenant', 'Update now')}</Button>
      {sent && <p className="notice success" role="status">{t('Demande envoyée. Un cadre hors ligne la recevra à son retour sur Internet, pendant 7 jours.', 'Request sent. An offline frame will receive it when it reconnects, for up to 7 days.')}</p>}
      <ul className="remote-update-status">{active.map(f => <li key={f.id}><strong>{f.label}</strong><span>{f.appVersion ? `Mosa ${f.appVersion} · ` : ''}{updateStatus(f)}</span></li>)}</ul>
      {active.some(f => !f.remoteUpdates) && <p className="hint">{t('Une seule fois sur les anciens cadres : Mises à jour → Rechercher maintenant → Installer. Dès Mosa 0.4.1, les prochaines mises à jour pourront être déclenchées ici.', 'Once on older frames: Updates → Check now → Install. From Mosa 0.4.1 onward, future updates can be started here.')}</p>}
    </div>
    <p className="hint">{t('Ce fichier sert aux cadres Android. Sur ton cell, Mosa se met à jour à la réouverture de l’app.', 'This file is for Android frames. On your phone, Mosa updates when you reopen the app.')}</p>
    {confirm && <Modal title={t('Mettre les cadres à jour maintenant ?', 'Update the frames now?')} onClose={() => !sending && setConfirm(false)}>
      <p>{t('La dernière version Mosa sera installée sur :', 'The latest Mosa version will be installed on:')}</p>
      <ul>{selected.map(f => <li key={f.id}>{f.label}</li>)}</ul>
      <p>{t('L’affichage sera interrompu brièvement pendant le redémarrage. Les photos restent en place.', 'The display will pause briefly during the restart. Photos stay in place.')}</p>
      <div className="button-row"><Button icon={Radio} busy={sending} onClick={push}>{t('Lancer la mise à jour', 'Start update')}</Button><Button className="secondary" disabled={sending} onClick={() => setConfirm(false)}>{t('Annuler', 'Cancel')}</Button></div>
    </Modal>}
  </section>;
}
