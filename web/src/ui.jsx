import React, { createContext, useContext, useEffect, useRef } from 'react';
import { X, LoaderCircle, AlertCircle } from 'lucide-react';
export const LanguageContext = createContext('fr');
export function useText() { const lang = useContext(LanguageContext); return (fr, en) => lang === 'en' ? en : fr; }
const errors = {
  expired_invitation: ['Ce lien a expiré ou a déjà été utilisé. Demande un nouveau lien à Kev.', 'This link has expired or was already used. Ask Kev for a new link.'],
  invalid_invitation: ['Ce lien de connexion est invalide.', 'This sign-in link is invalid.'],
  sign_in_required: ['Reconnecte-toi avec ton lien personnel.', 'Sign in again with your personal link.'],
  access_revoked: ['Cet accès a été désactivé. Contacte Kev.', 'This access has been disabled. Contact Kev.'],
  invalid_recipients: ['Un destinataire ne fait pas partie de ta famille.', 'A recipient is outside your family.'],
  choose_recipients: ['Choisis au moins un foyer.', 'Choose at least one household.'],
  unsupported_image: ['Choisis une photo JPEG, PNG, WebP ou HEIC.', 'Choose a JPEG, PNG, WebP or HEIC photo.'],
  invalid_image: ['Cette photo ne peut pas être ouverte. Essaie une autre image.', 'This photo could not be opened. Try another image.'],
  image_too_large: ['Cette photo est trop volumineuse.', 'This photo is too large.'],
  too_many_attempts: ['Un petit moment ! Réessaie dans quelques minutes.', 'One moment! Please try again in a few minutes.'],
  photo_not_found: ['Cette photo n’est plus disponible.', 'This photo is no longer available.'],
  cannot_disable_admin_household: ['Ton propre foyer administrateur doit rester actif.', 'Your own administrator household must stay active.'],
  cannot_disable_admin: ['Le compte administrateur doit rester actif.', 'The administrator account must remain active.'],
  not_configured: ['Mosa est en cours de préparation. Reviens bientôt !', 'Mosa is being prepared. Come back soon!']
};
export function ErrorNotice({ error }) {
  const t = useText(); if (!error) return null;
  const pair = errors[error.message || error] || ['La connexion n’a pas abouti. Vérifie Internet, puis réessaie.', 'Could not connect. Check your Internet connection and try again.'];
  return <div className="notice error" role="alert"><AlertCircle size={20}/><span>{t(...pair)}</span></div>;
}
export function Button({ children, icon: Icon, busy, disabled, className = '', ...props }) { return <button {...props} className={`button ${className}`} disabled={busy || disabled}>{busy ? <LoaderCircle size={20} className="spin"/> : Icon ? <Icon size={20}/> : null}{children}</button>; }
export function Mascot({ className = '' }) { return <img className={`mascot ${className}`} src="/assets/mosa-mascot.png" alt=""/>; }
export function Modal({ title, children, onClose, wide = false }) {
  const dialog = useRef(); const t = useText();
  useEffect(() => { dialog.current.showModal(); const node = dialog.current; const cancel = event => { event.preventDefault(); onClose(); }; node.addEventListener('cancel', cancel); return () => { node.removeEventListener('cancel', cancel); node.close(); }; }, []);
  return <dialog className={`modal ${wide ? 'wide' : ''}`} ref={dialog}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label={t('Fermer', 'Close')}><X/></button></div>{children}</dialog>;
}
export function Empty({ title, description, children }) { return <div className="empty"><Mascot/><h3>{title}</h3><p>{description}</p>{children}</div>; }
export function DateLabel({ value }) { const lang = useContext(LanguageContext); return value ? new Date(value).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA', { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }
