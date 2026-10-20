import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/kanbanflow.db');
const id = 'f4008c4b-7fab-4cb4-abb2-d39b762ddfdf';
const allCards = db.prepare(`
  SELECT c.id, c.title, COALESCE(c.type, 'TASK') as type, c.column_id, col.title as column_title,
         c.assignee, c.estimate, c.parent_id, c.position
  FROM cards c
  JOIN columns col ON col.id = c.column_id
  WHERE col.board_id = ? AND (c.is_archived = 0 OR c.is_archived IS NULL)
  ORDER BY c.position ASC
`).all(id);

const map = new Map();
allCards.forEach(c => map.set(c.id, { ...c, children: [] }));
const roots = [];
allCards.forEach(c => {
  const node = map.get(c.id);
  if (c.parent_id && map.has(c.parent_id)) {
    map.get(c.parent_id).children.push(node);
  } else {
    roots.push(node);
  }
});
const mockEpic = roots.find(r => r.id === 'mock-epic-001');

function printNode(node, level = 0) {
  const indent = '  '.repeat(level);
  console.log(`${indent}[${node.type}] ${node.title} (${node.column_title} | ${node.estimate || '-'} | ${node.assignee || 'Sem resp.'})`);
  for (const child of node.children) {
    printNode(child, level + 1);
  }
}

console.log('--- ESTRUTURA HIERÁRQUICA DO ÉPICO MOCK ---');
printNode(mockEpic);

