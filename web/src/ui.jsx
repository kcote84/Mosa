import React, { createContext, useContext, useEffect, useRef } from 'react';
import { X, LoaderCircle, AlertCircle } from 'lucide-react';
export const LanguageContext = createContext('fr');
export function useText() { const lang = useContext(LanguageContext); return (fr, en) => lang === 'en' ? en : fr; }
const errors = {
  share_empty: ['Aucune photo reçue. Depuis ta galerie, partage les images elles-mêmes vers Mosa, plutôt qu’un lien. Tu peux aussi utiliser « Choisir des photos ».', 'No photos received. From your gallery, share the actual images to Mosa rather than a link. You can also use “Choose photos”.'],
  share_too_many: ['Partage au maximum 50 photos à la fois. Reprends une sélection plus petite dans ta galerie.', 'Share up to 50 photos at a time. Select a smaller batch in your gallery.'],
  share_too_large: ['Ce lot est trop volumineux pour le partage. Sélectionne moins de photos à la fois dans ta galerie.', 'This batch is too large to share. Select fewer photos at a time in your gallery.'],
  share_storage_full: ['Le téléphone ne peut pas garder ce lot. Termine les autres partages ouverts dans Mosa, ou utilise « Choisir des photos ».', 'Your phone cannot keep this batch. Finish other shares open in Mosa, or use “Choose photos”.'],
  share_expired: ['Ce partage a déjà été ouvert ou a expiré. Sélectionne de nouveau les photos dans ta galerie, puis Partager → Mosa.', 'This share has already been opened or has expired. Select the photos again in your gallery, then Share → Mosa.'],
  share_unavailable: ['Mosa n’a pas pu récupérer les photos. Mets Mosa à jour depuis l’accueil, puis réessaie le partage depuis ta galerie.', 'Mosa could not retrieve the photos. Update Mosa from Home, then share again from your gallery.'],
  paste_invitation: ['Colle le lien personnel Mosa au complet, tel que Kev te l’a envoyé.', 'Paste the complete personal Mosa link exactly as Kev sent it.'],
  choose_frames: ['Choisis au moins un cadre.', 'Choose at least one frame.'],
  update_bootstrap_required: ['Ce cadre doit recevoir une première mise à jour depuis son menu Mises à jour.', 'This frame needs its first update from its Updates menu.'],
  phone_update_unavailable: ['La mise à jour de Mosa n’a pas abouti. Vérifie Internet, puis réessaie.', 'Mosa could not update. Check your Internet connection and try again.'],
  update_unavailable: ['La version du cadre est indisponible pour le moment. Réessaie avec une connexion Internet.', 'The frame release is currently unavailable. Please try again with an Internet connection.'],
  used_invitation: ['Ce lien a déjà servi à une connexion, par exemple dans Safari. Demande un nouveau lien à Kev et colle-le directement dans Mosa depuis son icône.', 'This link has already been used to sign in, for example in Safari. Ask Kev for a new link and paste it directly into Mosa from its icon.'],
  replaced_invitation: ['Un lien plus récent remplace celui-ci. Copie le dernier lien envoyé par Kev.', 'A newer link replaced this one. Copy the latest link Kev sent you.'],
  expired_invitation: ['Ce lien a dépassé sa durée de validité de 48 heures. Demande un nouveau lien à Kev.', 'This link has passed its 48-hour validity period. Ask Kev for a new link.'],
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
  frame_not_found: ['Ce cadre n’est plus disponible. Actualise la liste des cadres.', 'This frame is no longer available. Refresh the frame list.'],
  household_not_found: ['Ce foyer n’est plus disponible. Actualise l’administration.', 'This household is no longer available. Refresh administration.'],
  choose_photos: ['Coche de 1 à 200 photos à retirer.', 'Select 1 to 200 photos to remove.'],
  photo_selection_changed: ['Une photo de la sélection n’est plus disponible dans ce foyer. Annule, actualise la liste et réessaie. Aucune photo de ce lot n’a été retirée.', 'A selected photo is no longer available in this household. Cancel, refresh the list and try again. No photos in this batch were removed.'],
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
