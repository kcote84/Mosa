import { branchName } from '../../functions/src/families.js';
export { BRANCHES, branchName } from '../../functions/src/families.js';
export function familyLabel(branches, t) {
  const names = branches.map(branchName);
  return names.length === 1 ? t(`Famille ${names[0]}`, `${names[0]} family`) : names.join(' · ');
}
