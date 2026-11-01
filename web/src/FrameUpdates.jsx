import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, Monitor } from 'lucide-react';
import { useText, Button, ErrorNotice } from './ui';

export default function FrameUpdates() {
  const t = useText();
  const [release, setRelease] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
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
      <p>{t('Chaque cadre vérifie à minuit, à son heure locale configurée, et télécharge les nouveautés. La confirmation d’installation se fait sur le cadre.', 'Each frame checks at midnight in its configured time zone and downloads updates. Installation is confirmed on the frame.')}</p></div></div>
    <ErrorNotice error={error}/>
    {release && <p><strong>{t('Dernière version : ', 'Latest version: ')}{release.versionName}</strong> · {(release.bytes / 1048576).toFixed(1)} {t('Mo', 'MB')}</p>}
    <div className="update-actions">
      {release && <a className="button" href={release.path} download><Download size={20}/>{t('Télécharger la dernière version du cadre', 'Download latest frame version')}</a>}
      <Button className="secondary" icon={RefreshCw} busy={busy} onClick={check}>{t('Vérifier les mises à jour', 'Check for updates')}</Button>
    </div>
    <p className="hint">{t('Ce fichier sert aux cadres Android. Sur ton cell, Mosa se met à jour à la réouverture de l’app.', 'This file is for Android frames. On your phone, Mosa updates when you reopen the app.')}</p>
  </section>;
}
