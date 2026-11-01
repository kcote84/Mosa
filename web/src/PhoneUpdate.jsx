import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useText, Button, ErrorNotice } from './ui';

export default function PhoneUpdate() {
  const t = useText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function update() {
    setBusy(true); setError(null);
    try {
      const response = await fetch('/', { cache: 'no-store' });
      if (!response.ok) throw new Error('offline');
      const registration = await navigator.serviceWorker?.getRegistration();
      if (registration) await registration.update();
      location.reload();
    } catch { setError(new Error('phone_update_unavailable')); setBusy(false); }
  }
  return <div className="phone-update"><ErrorNotice error={error}/>
    <Button className="secondary" icon={RefreshCw} busy={busy} onClick={update}>{t('Mettre à jour Mosa sur ce téléphone', 'Update Mosa on this phone')}</Button>
  </div>;
}
