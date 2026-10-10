/** Pure game state. Versioned independently from assets and presentation. */
export const STORAGE_KEY = 'stepa-fox-prototype-v1';
export const TYPES = ['subject', 'attribute', 'action', 'preposition'];
export const STAGES = ['subject', 'attributes', 'actions', 'sentence'];
export const fresh = () => ({ version: 1, cycle: 1, completedIds: [], activeRound: null, settings: { sound: true, reducedMotion: false } });
export const round = cardId => ({ cardId, stage: 0, unlocked: 0, answers: { subject: false, attributes: false }, revealedLabels: [], selectedAttribute: null, selectedAction: null, scheme: [], undo: [] });
export function remaining(cards, completedIds) { return cards.filter(c => !completedIds.includes(c.id)); }
export function pick(cards, completedIds, random = Math.random) {
  const pool = remaining(cards, completedIds);
  return pool.length ? pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))].id : null;
}
export function begin(state, cards) {
  if (state.activeRound) return state;
  const id = pick(cards, state.completedIds);
  return id ? { ...state, activeRound: round(id) } : state;
}
export function advance(state) {
  const r = state.activeRound;
  if (!r || (r.stage === 0 && !r.answers.subject) || (r.stage === 1 && !r.answers.attributes) || r.stage >= 3) return state;
  const stage = r.stage + 1;
  return { ...state, activeRound: { ...r, stage, unlocked: Math.max(r.unlocked, stage) } };
}
export function visit(state, stage) {
  const r = state.activeRound;
  return r && Number.isInteger(stage) && stage >= 0 && stage <= r.unlocked ? { ...state, activeRound: { ...r, stage } } : state;
}
export function editScheme(state, scheme) {
  const r = state.activeRound;
  if (!r) return state;
  return { ...state, activeRound: { ...r, scheme, undo: [...r.undo, r.scheme].slice(-40) } };
}
export function undoScheme(state) {
  const r = state.activeRound;
  return r?.undo.length ? { ...state, activeRound: { ...r, scheme: r.undo.at(-1), undo: r.undo.slice(0, -1) } } : state;
}
export function insert(scheme, type, index, instanceId) {
  if (!TYPES.includes(type) || scheme.some(x => x.instanceId === instanceId)) return scheme;
  const result = [...scheme]; result.splice(Math.max(0, Math.min(index, result.length)), 0, { type, instanceId }); return result;
}
export function move(scheme, from, to) {
  if (from < 0 || from >= scheme.length || to < 0 || to >= scheme.length) return scheme;
  const result = [...scheme]; const [item] = result.splice(from, 1); result.splice(to, 0, item); return result;
}
export function finish(state) {
  const r = state.activeRound;
  if (!r || r.stage !== 3 || !r.scheme.length) return state;
  return { ...state, completedIds: [...new Set([...state.completedIds, r.cardId])], activeRound: null };
}
export function nextCycle(state) { return { ...state, cycle: state.cycle + 1, completedIds: [], activeRound: null }; }
export function validateState(value, cards) {
  if (!value || value.version !== 1) throw new Error('Неподдерживаемая версия сохранения');
  const ids = new Set(cards.map(c => c.id));
  const isScheme = a => Array.isArray(a) && a.every(x => x && TYPES.includes(x.type) && typeof x.instanceId === 'string' && x.instanceId.length > 0) && new Set(a.map(x => x.instanceId)).size === a.length;
  if (!Number.isInteger(value.cycle) || value.cycle < 1 || !Array.isArray(value.completedIds) || value.completedIds.some(id => !ids.has(id)) || new Set(value.completedIds).size !== value.completedIds.length) throw new Error('Повреждён список карточек');
  if (!value.settings || typeof value.settings.sound !== 'boolean' || typeof value.settings.reducedMotion !== 'boolean') throw new Error('Повреждены настройки');
  const r = value.activeRound;
  if (r !== null) {
    const card = cards.find(c => c.id === r?.cardId);
    const validLabel = id => /^(subject|attribute-[0-2]|action-[0-2]|context)$/.test(id);
    if (!card || value.completedIds.includes(r.cardId) || !Number.isInteger(r.stage) || !Number.isInteger(r.unlocked) || r.stage < 0 || r.unlocked > 3 || r.stage > r.unlocked || !r.answers || typeof r.answers.subject !== 'boolean' || typeof r.answers.attributes !== 'boolean' || (r.unlocked >= 1 && !r.answers.subject) || (r.unlocked >= 2 && !r.answers.attributes) || !Array.isArray(r.revealedLabels) || !r.revealedLabels.every(validLabel) || !isScheme(r.scheme) || !Array.isArray(r.undo) || !r.undo.every(isScheme) || (r.selectedAttribute !== null && !card.attributes.some(a => a.word === r.selectedAttribute)) || (r.selectedAction !== null && !card.actions.includes(r.selectedAction))) throw new Error('Повреждено незавершённое задание');
  }
  return value;
}
export function restore(raw, cards) { return raw === null ? fresh() : validateState(JSON.parse(raw), cards); }
