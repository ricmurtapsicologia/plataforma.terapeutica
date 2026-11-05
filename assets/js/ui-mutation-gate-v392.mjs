/**
 * Global UI observer should decorate only on structural changes.
 *
 * The clock and status cards are live displays, not navigation changes.
 * Watching every childList mutation causes redundant full-card redraws,
 * particularly once per second when the clock updates.
 *
 * Pure function: DOM elements are inspected only; no data is read or written.
 */
const UI_OWNED_SUBTREES = [
  '#clock-chip',
  '#rm-v3-platform-health',
  '#rm-gemini-clinical',
  '#rm-secure-sync-panel',
  '#rm-agenda-health-v330',
  '#rm-clinical-value-settings-v390',
  '#rm-clinical-value-v390'
].join(',');

const STRUCTURAL_TARGETS = [
  '#app',
  '#patient-workspace',
  '#patient-tab-content',
  '.tabs',
  '.top-actions',
  '.patient-context'
].join(',');

const STRUCTURAL_NODES = [
  '.app-shell',
  '#main-content',
  '#patient-workspace',
  '#patient-tab-content',
  '.tabs',
  '.top-actions',
  '.patient-context'
].join(',');

function elementOf(node) {
  if (!node) return null;
  if (node.nodeType === 1) return node;
  return node.parentElement || null;
}

function isStructuralNode(node) {
  if (node?.nodeType !== 1) return false;
  return Boolean(node.matches?.(STRUCTURAL_NODES) || node.querySelector?.(STRUCTURAL_NODES));
}

export function shouldDecorateAfterMutations(records) {
  for (const record of records || []) {
    if (record?.type !== 'childList') continue;
    const target = elementOf(record.target);
    if (!target || target.closest?.(UI_OWNED_SUBTREES)) continue;
    if (target.matches?.(STRUCTURAL_TARGETS)) return true;
    const changedNodes = [...(record.addedNodes || []), ...(record.removedNodes || [])];
    if (changedNodes.some(isStructuralNode)) return true;
  }
  return false;
}
