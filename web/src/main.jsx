import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Home, Images, Plus, Monitor, ShieldCheck, LogOut, ArrowRight, WifiOff, Heart, CheckCircle2, Menu } from 'lucide-react';
import '@fontsource/nunito-sans/400.css';
import '@fontsource/nunito-sans/600.css';
import '@fontsource/nunito-sans/700.css';
import '@fontsource/nunito-sans/800.css';
import '@fontsource/fredoka/600.css';
import { initializeSession, redeemInvitation, logout, request } from './api';
import { LanguageContext, useText, Button, Mascot, ErrorNotice, Empty } from './ui';
import Gallery, { PhotoGrid, PhotoDetail } from './Gallery';
import Upload from './Upload';
import Frames from './Frames';
import Admin from './Admin';
import './style.css';

const initialInvitation = new URLSearchParams(location.hash.slice(1)).get('invitation');
if (initialInvitation) history.replaceState(null, '', location.pathname);
function App() {
  const [lang, setLang] = useState(localStorage.getItem('mosa-language') || 'fr');
  return <LanguageContext.Provider value={lang}><Mosa lang={lang} setLang={value => { localStorage.setItem('mosa-language', value); document.documentElement.lang = value; setLang(value); }}/></LanguageContext.Provider>;
}
function Mosa({ lang, setLang }) {
  const t = useText(); const [session, setSession] = useState(undefined); const [profile, setProfile] = useState(null); const [config, setConfig] = useState(null); const [error, setError] = useState(null); const [tab, setTab] = useState('home'); const [claimed, setClaimed] = useState(false); const [revision, setRevision] = useState(0); const [online, setOnline] = useState(navigator.onLine); const [installPrompt, setInstallPrompt] = useState(null);
  const [invitation, setInvitation] = useState(initialInvitation);
  useEffect(() => {
    let stop; initializeSession((user, cfg) => { setConfig(cfg); setSession(user); if (!user) setProfile(null); else request('/me').then(setProfile).catch(setError); }).then(s => { stop = s; }).catch(setError);
    const network = () => setOnline(navigator.onLine);
    const appDisplayMode = window.matchMedia('(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen), (display-mode: window-controls-overlay)');
    const isInApp = () => appDisplayMode.matches || navigator.standalone === true;
    let installed = isInApp();
    const appInstalled = () => { installed = true; setInstallPrompt(null); };
    const displayModeChanged = () => { if (isInApp()) appInstalled(); };
    const install = e => { e.preventDefault(); if (!installed && !isInApp()) setInstallPrompt(e); };
    const invitationChange = () => { const token = new URLSearchParams(location.hash.slice(1)).get('invitation'); if (token) { history.replaceState(null, '', location.pathname); setInvitation(token); setClaimed(false); setError(null); } };
    window.addEventListener('online', network); window.addEventListener('offline', network); window.addEventListener('beforeinstallprompt', install);
    window.addEventListener('hashchange', invitationChange);
    window.addEventListener('appinstalled', appInstalled);
    appDisplayMode.addEventListener('change', displayModeChanged);
    document.documentElement.lang = lang;
    if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => { stop?.(); window.removeEventListener('online', network); window.removeEventListener('offline', network); window.removeEventListener('beforeinstallprompt', install); window.removeEventListener('hashchange', invitationChange); window.removeEventListener('appinstalled', appInstalled); appDisplayMode.removeEventListener('change', displayModeChanged); };
  }, []);
  const installApp = async () => {
    if (!installPrompt) return;
    // The browser prompt can only be used once, including when dismissed.
    setInstallPrompt(null);
    try { await installPrompt.prompt(); } catch (error) { setError(error); }
  };
  useEffect(() => { if (session !== undefined && invitation && !claimed) { setClaimed(true); setError(null); redeemInvitation(invitation).then(() => setInvitation(null)).catch(setError); } }, [session, claimed, invitation]);
  const langButton = <div className="language-toggle" aria-label="Langue / Language"><button className={lang === 'fr' ? 'selected' : ''} onClick={() => setLang('fr')} aria-label="Français">FR</button><button className={lang === 'en' ? 'selected' : ''} onClick={() => setLang('en')} aria-label="English">EN</button></div>;
  if (!profile) return <div className="welcome-screen"><div className="welcome-top"><span className="wordmark">Mosa<span className="brand-dot">.</span></span>{langButton}</div><div className="welcome-card"><Mascot/><h1>Mosa</h1><p className="slogan">Nos moments, chez vous.</p><p className="slogan english">Our moments, in your home.</p><div className="welcome-divider"/><ErrorNotice error={error}/>{(session === undefined || session || invitation) && !error ? <p>{t('On prépare votre album…', 'Getting your album ready…')}</p> : <><h2>{t('La famille, juste ici.', 'Family, right here.')}</h2><p>{t('Ouvre ton lien personnel pour retrouver les souvenirs de la famille. Besoin d’un nouveau lien ? Demande à Kev.', 'Open your personal link to find your family memories. Need a new link? Ask Kev.')}</p><div className="install-tip">{t('Sur iPhone : ouvre Mosa dans Safari, puis Partager → Sur l’écran d’accueil. Sur Android : menu du navigateur → Installer l’application.', 'On iPhone: open Mosa in Safari, then Share → Add to Home Screen. On Android: browser menu → Install app.')}</div></>}{session && error && <Button className="secondary" onClick={() => { logout(); setError(null); }}>{t('Se déconnecter', 'Sign out')}</Button>}</div><p className="welcome-foot"><ShieldCheck size={17}/>{t('Vos souvenirs restent entre vous.', 'Your memories stay between you.')}</p></div>;
  const navigation = [ ['home', Home, t('Accueil', 'Home')], ['upload', Plus, t('Ajouter', 'Add photos')], ['gallery', Images, t('Notre album', 'Our album')], ['frames', Monitor, t('Notre cadre', 'Our frame')] ];
  if (profile.member.role === 'admin') navigation.push(['admin', ShieldCheck, t('Administration', 'Administration')]);
  return <div className="app-shell"><aside className="sidebar"><a className="brand" href="#" onClick={e => { e.preventDefault(); setTab('home'); }}><Mascot/><span className="wordmark">Mosa<span className="brand-dot">.</span></span></a><div className="sidebar-household"><span className="tiny-label">{t('CHEZ NOUS', 'OUR HOME')}</span><strong>{profile.household.name}</strong><span className="family-label">{profile.household.branches.length === 2 ? t('Viel & Côté réunis', 'Viel & Côté together') : profile.household.branches[0] === 'viel' ? t('Famille Viel', 'Viel family') : t('Famille Côté', 'Côté family')}</span></div><nav aria-label={t('Navigation principale', 'Main navigation')}>{navigation.map(([id, Icon, label]) => <button key={id} className={`nav-item ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}><Icon size={22}/><span>{label}</span></button>)}</nav><div className="sidebar-bottom"><p><Heart size={16}/>{t('Un petit coucou fait du bien.', 'A little hello goes a long way.')}</p><button className="text-button" onClick={logout}><LogOut size={17}/>{t('Se déconnecter', 'Sign out')}</button></div></aside><div className="main-column"><header className="topbar"><span className="mobile-wordmark wordmark">Mosa<span className="brand-dot">.</span></span><div className="topbar-greeting">{t('Bienvenue chez vous', 'Welcome home')} <span aria-hidden="true">✦</span></div><div className="topbar-right">{config?.local && <span className="test-badge">{t('Version d’essai', 'Test version')}</span>}{langButton}<div className="avatar" title={profile.member.name}>{profile.member.name.slice(0, 1)}</div></div></header>{!online && <div className="offline-banner"><WifiOff size={19}/>{t('Tu es hors ligne. Ton cadre continue avec les photos déjà reçues.', 'You are offline. Your frame keeps showing the photos it already received.')}</div>}<main className="main-content">{tab === 'home' && <HomePage profile={profile} onTab={setTab} revision={revision} installPrompt={installPrompt} onInstall={installApp}/>} {tab === 'upload' && <Upload profile={profile} onDone={() => { setRevision(v => v + 1); setTab('gallery'); }}/>} {tab === 'gallery' && <Gallery onAdd={() => setTab('upload')} refreshKey={revision}/>} {tab === 'frames' && <Frames/>} {tab === 'admin' && profile.member.role === 'admin' && <Admin/>}</main><footer className="app-footer">Mosa <span>·</span> {t('Nos moments, chez vous.', 'Our moments, in your home.')}</footer></div><nav className="mobile-nav" aria-label={t('Navigation mobile', 'Mobile navigation')}>{navigation.map(([id, Icon, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}><Icon size={22}/><span>{id === 'admin' ? 'Admin' : label}</span></button>)}</nav></div>;
}
function HomePage({ profile, onTab, revision, installPrompt, onInstall }) {
  const t = useText(); const [data, setData] = useState(null); const [frames, setFrames] = useState([]); const [error, setError] = useState(null); const [photo, setPhoto] = useState(null);
  const load = () => Promise.all([request('/photos'), request('/frames')]).then(([p, f]) => { setData(p); setFrames(f); }).catch(setError);
  useEffect(() => { load(); }, [revision]);
  const activeFrames = frames.filter(f => f.active); const connected = activeFrames.some(f => f.lastSeen && Date.now() - f.lastSeen < 25 * 60000);
  return <><section className="hero"><div className="hero-copy"><p className="eyebrow">{t('LE BONHEUR SE PARTAGE', 'HAPPINESS IS FOR SHARING')}</p><h1>{t(`Allô ${profile.member.name} !`, `Hello ${profile.member.name}!`)}<br/>{t('Un souvenir à partager ?', 'A memory to share?')}</h1><p>{t('Un sourire, une sortie, un petit moment ordinaire. Fais-en profiter la famille.', 'A smile, a day out, an ordinary little moment. Let the family enjoy it too.')}</p><Button icon={Plus} onClick={() => onTab('upload')}>{t('Ajouter des photos', 'Add photos')}</Button><span className="hero-note"><ShieldCheck size={16}/>{t('Seulement les foyers que tu choisis.', 'Only the households you choose.')}</span></div><div className="hero-art"><span className="doodle star-one">✦</span><Mascot/><span className="doodle star-two">✧</span><span className="hero-sticker">{t('Coucou, la famille !', 'Hey there, family!')}</span></div></section><ErrorNotice error={error}/><div className="stats-grid"><button className="stat-card" onClick={() => onTab('gallery')}><span className="stat-icon peach"><Images/></span><div><strong>{data?.total ?? '—'}</strong><span>{t('souvenirs chez nous', 'memories at home')}</span></div><ArrowRight size={20}/></button><button className="stat-card" onClick={() => onTab('frames')}><span className="stat-icon sage"><Monitor/></span><div><strong>{connected ? t('Tout roule', 'All good') : activeFrames.length ? t('En attente', 'Waiting') : t('Bientôt prêt', 'Ready soon')}</strong><span>{connected ? t('Votre cadre est connecté', 'Your frame is connected') : t('Votre cadre familial', 'Your family frame')}</span></div><ArrowRight size={20}/></button></div><div className="section-heading"><div><p className="eyebrow">{t('LES DERNIERS PETITS BONHEURS', 'THE LATEST LITTLE JOYS')}</p><h2>{t('Tout juste arrivés', 'Fresh memories')}</h2></div><button className="text-button" onClick={() => onTab('gallery')}>{t('Tout voir', 'See all')}<ArrowRight size={18}/></button></div>{data?.photos.length ? <PhotoGrid photos={data.photos.slice(0, 6)} onOpen={setPhoto}/> : <div className="home-empty"><Images size={34}/><div><h3>{t('L’album attend vos premières photos.', 'Your album is waiting for its first photos.')}</h3><p>{t('Les dix photos de bienvenue seront choisies avec Kev.', 'Kev will choose the ten welcome photos.')}</p></div></div>}<section className="privacy-note"><Heart size={24}/><div><strong>{t('Chaque souvenir trouve sa place.', 'Every memory finds its home.')}</strong><p>{t('Tu choisis les foyers à chaque envoi. Les albums Viel et Côté restent séparés.', 'Choose the households for each upload. Viel and Côté albums stay separate.')}</p></div></section>{installPrompt && <Button className="secondary" onClick={onInstall}>{t('Ajouter Mosa à mon téléphone', 'Add Mosa to my phone')}</Button>}{photo && <PhotoDetail photo={photo} onClose={() => setPhoto(null)} onChanged={load}/>}</>;
}
const root = import.meta.hot?.data.root || createRoot(document.getElementById('root'));
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<App/>);
