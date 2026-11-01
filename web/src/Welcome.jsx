import React, { useRef, useState } from 'react';
import { Copy, Check, LogIn, ShieldCheck } from 'lucide-react';
import { useText, Button, Mascot, ErrorNotice } from './ui';
import { invitationUrl } from './connection';

function IphoneGuide({ invitation, onContinue }) {
  const t = useText(); const field = useRef(); const [copied, setCopied] = useState(false);
  const link = invitationUrl(location.origin, invitation);
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); }
    catch { field.current?.focus(); field.current?.select(); }
  }
  return <section className="connection-guide">
    <h2>{t('Connectons Mosa sur ton iPhone', 'Let’s connect Mosa on your iPhone')}</h2>
    <p>{t('Ton lien est prêt. Pour garder ta connexion dans l’app, utilise-le depuis l’icône Mosa.', 'Your link is ready. To stay signed in to the app, use it from the Mosa icon.')}</p>
    <ol>
      <li>{t('Si Mosa n’est pas encore installée : dans Safari, touche Partager, puis « Sur l’écran d’accueil ».', 'If Mosa is not installed yet: in Safari, tap Share, then “Add to Home Screen”.')}</li>
      <li>{t('Copie ton lien avec le bouton ci-dessous.', 'Copy your link using the button below.')}</li>
      <li>{t('Ouvre l’icône Mosa sur ton iPhone. Colle le lien dans « Mon lien personnel », puis touche « Me connecter ».', 'Open the Mosa icon on your iPhone. Paste the link into “My personal link”, then tap “Sign in”.')}</li>
    </ol>
    <label>{t('Ton lien à copier', 'Your link to copy')}<textarea ref={field} readOnly value={link} rows={2} autoCapitalize="none" spellCheck={false} onFocus={e => e.target.select()}/></label>
    <Button className="full-width" icon={copied ? Check : Copy} onClick={copy}>{copied ? t('Lien copié !', 'Link copied!') : t('Copier mon lien', 'Copy my link')}</Button>
    <p className="hint">{t('Mosa n’utilise pas le lien sur cet écran. Colle-le dans l’app pour te connecter.', 'Mosa does not use the link on this screen. Paste it into the app to sign in.')}</p>
    <details><summary>{t('Je préfère utiliser Safari', 'I prefer to use Safari')}</summary><p className="hint">{t('La connexion restera dans Safari. Pour connecter ensuite l’app installée, il faudra un nouveau lien.', 'You will be signed in to Safari. Signing in to the installed app afterward will require a new link.')}</p><Button className="secondary full-width" onClick={onContinue}>{t('Me connecter dans Safari', 'Sign in to Safari')}</Button></details>
  </section>;
}

export default function Welcome({ langButton, error, busy, ready, invitation, guideIos, onContinue, onConnect, onLogout, hasSession }) {
  const t = useText(); const [link, setLink] = useState('');
  return <div className="welcome-screen"><div className="welcome-top"><span className="wordmark">Mosa<span className="brand-dot">.</span></span>{langButton}</div>
    <div className="welcome-card"><Mascot/><h1>Mosa</h1><p className="slogan">Nos moments, chez vous.</p><p className="slogan english">Our moments, in your home.</p><div className="welcome-divider"/>
      <ErrorNotice error={error}/>
      {guideIos && invitation ? <IphoneGuide invitation={invitation} onContinue={onContinue}/> : busy ? <p role="status">{t('On prépare votre album…', 'Getting your album ready…')}</p> : <>
        <h2>{t('Bienvenue dans la famille', 'Welcome to the family')}</h2>
        <p>{t('Copie le lien personnel envoyé par Kev et colle-le ici. Aucun mot de passe à retenir.', 'Copy the personal link Kev sent you and paste it here. No password to remember.')}</p>
        <form className="connection-form" onSubmit={e => { e.preventDefault(); onConnect(link); }}>
          <label htmlFor="personal-link">{t('Mon lien personnel', 'My personal link')}</label>
          <textarea id="personal-link" value={link} onChange={e => setLink(e.target.value)} rows={3} maxLength={2048} autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} inputMode="url" placeholder={t('Colle ton lien ici', 'Paste your link here')} aria-describedby="personal-link-help" required/>
          <p className="hint" id="personal-link-help">{t('Sur iPhone : appuie longuement dans le champ, puis choisis « Coller ».', 'On iPhone: touch and hold inside the field, then choose “Paste”.')}</p>
          <Button icon={LogIn} className="full-width" disabled={!ready || !link.trim()}>{t('Me connecter', 'Sign in')}</Button>
        </form>
        <p className="hint">{t('Lien déjà utilisé ou expiré ? Demande un nouveau lien à Kev, puis colle-le ici dans Mosa.', 'Link already used or expired? Ask Kev for a new link, then paste it here in Mosa.')}</p>
        <details className="connection-install"><summary>{t('Installer Mosa sur mon téléphone', 'Install Mosa on my phone')}</summary><p className="hint">{t('Installe Mosa avant d’utiliser ton lien. Sur iPhone : Safari → Partager → Sur l’écran d’accueil. Ouvre ensuite l’icône Mosa et colle ton lien personnel ici.', 'Install Mosa before using your link. On iPhone: Safari → Share → Add to Home Screen. Then open the Mosa icon and paste your personal link here.')}</p><p className="hint">{t('Sur Android : menu du navigateur → Installer l’application.', 'On Android: browser menu → Install app.')}</p></details>
      </>}
      {hasSession && error && <Button className="secondary" onClick={onLogout}>{t('Se déconnecter', 'Sign out')}</Button>}
      {!ready && error && <Button className="secondary" onClick={() => location.reload()}>{t('Réessayer', 'Try again')}</Button>}
    </div><p className="welcome-foot"><ShieldCheck size={17}/>{t('Vos souvenirs restent entre vous.', 'Your memories stay between you.')}</p></div>;
}
