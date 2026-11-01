export const BRANCHES = ['viel', 'cote', 'castonguay'];
const NAMES = { viel: 'Viel', cote: 'Côté', castonguay: 'Castonguay' };
export function branchName(branch) { return NAMES[branch] || branch; }
