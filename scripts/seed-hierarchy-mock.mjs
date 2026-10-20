import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/kanbanflow.db');

const boardId = 'f4008c4b-7fab-4cb4-abb2-d39b762ddfdf';
const colTodo = '4df3ee41-ece9-44ec-a70c-5007a078ec47';
const colDoing = '8beb0c94-2efa-45d6-b9f4-7e6119f0770a';
const colDone = 'fa05b217-c0cd-470c-991c-edec8f1647d9';

const assignee = 'Leonardo Hora';

// Clean any previous mock cards with these IDs
const mockIds = [
  'mock-epic-001',
  'mock-story-001',
  'mock-task-001',
  'mock-subtask-001',
  'mock-subtask-002',
  'mock-bug-001',
  'mock-subtask-003',
  'mock-story-002',
  'mock-task-002',
  'mock-subtask-004',
  'mock-subtask-005',
];

const deleteStmt = db.prepare('DELETE FROM cards WHERE id = ?');
for (const id of mockIds) {
  deleteStmt.run(id);
}

// Também normaliza qualquer prioridade minúscula residual no banco
db.prepare("UPDATE cards SET priority = 'HIGH' WHERE priority IN ('high', 'urgent')").run();
db.prepare("UPDATE cards SET priority = 'MEDIUM' WHERE priority IN ('medium')").run();
db.prepare("UPDATE cards SET priority = 'LOW' WHERE priority IN ('low')").run();

const insertCard = db.prepare(`
  INSERT INTO cards (
    id, column_id, parent_id, type, title, description, priority, tag, position, assignee, estimate, is_archived, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
`);

// 1. Épico (Root)
insertCard.run(
  'mock-epic-001',
  colDoing,
  null,
  'EPIC',
  '💳 Sistema de Pagamentos e Checkout',
  'Iniciativa para suportar múltiplos meios de pagamento e checkout transparente.',
  'HIGH',
  'Fintech',
  1000,
  assignee,
  '40h'
);

// 2. História 1 (Filha do Épico)
insertCard.run(
  'mock-story-001',
  colDoing,
  'mock-epic-001',
  'STORY',
  'Como comprador, quero pagar via PIX para liberação instantânea do pedido',
  'Fluxo completo de pagamento instantâneo via QR Code e Copia e Cola.',
  'HIGH',
  'PIX',
  1010,
  assignee,
  '16h'
);

// 3. Tarefa 1 (Filha da História 1)
insertCard.run(
  'mock-task-001',
  colDoing,
  'mock-story-001',
  'TASK',
  'Integração com Gateway de Pagamento PIX (API Banco Central)',
  'Configuração de credenciais mTLS e chamadas de emissão de cobrança imediata.',
  'HIGH',
  'Backend',
  1011,
  assignee,
  '8h'
);

// 4. Subtarefas da Tarefa 1
insertCard.run(
  'mock-subtask-001',
  colDone,
  'mock-task-001',
  'SUBTASK',
  'Gerar payload e renderizar QR Code dinâmico na tela',
  'Renderização do SVG do QR Code e botão de copiar código.',
  'MEDIUM',
  'Frontend',
  1012,
  assignee,
  '3h'
);

insertCard.run(
  'mock-subtask-002',
  colDoing,
  'mock-task-001',
  'SUBTASK',
  'Implementar webhook de notificação de liquidação PIX',
  'Endpoint para receber callback do banco e atualizar status do pedido.',
  'HIGH',
  'Backend',
  1013,
  assignee,
  '5h'
);

// 5. Bug 1 (Filho da História 1)
insertCard.run(
  'mock-bug-001',
  colTodo,
  'mock-story-001',
  'BUG',
  'Timeout na checagem de status do PIX em conexões 3G/instáveis',
  'Polling falha e usuário fica sem feedback visual se o pagamento foi confirmado.',
  'HIGH',
  'Bug',
  1014,
  assignee,
  '2h'
);

// 6. Subtarefa do Bug 1
insertCard.run(
  'mock-subtask-003',
  colTodo,
  'mock-bug-001',
  'SUBTASK',
  'Implementar retry com backoff exponencial no client polling',
  'Adicionar retry automático de 3 tentativas antes de exibir erro.',
  'MEDIUM',
  'Frontend',
  1015,
  assignee,
  '1h'
);

// 7. História 2 (Filha do Épico)
insertCard.run(
  'mock-story-002',
  colTodo,
  'mock-epic-001',
  'STORY',
  'Como comprador, quero pagar com Cartão de Crédito parcelado',
  'Processamento com tokenização segura PCI-DSS e cálculo de parcelas com juros.',
  'MEDIUM',
  'Cartão',
  1020,
  assignee,
  '24h'
);

// 8. Tarefa 2 (Filha da História 2)
insertCard.run(
  'mock-task-002',
  colTodo,
  'mock-story-002',
  'TASK',
  'Formulário de captura de cartão e tokenização client-side',
  'Campos formatados para número, validade e CVV sem passar dados sensíveis pelo backend.',
  'MEDIUM',
  'Frontend',
  1021,
  assignee,
  '8h'
);

// 9. Subtarefas da Tarefa 2
insertCard.run(
  'mock-subtask-004',
  colTodo,
  'mock-task-002',
  'SUBTASK',
  'Validação de algoritmo de Luhn e detecção de bandeira (Visa/Master/Elo)',
  'Feedback visual da bandeira conforme usuário digita os primeiros dígitos.',
  'LOW',
  'Frontend',
  1022,
  assignee,
  '3h'
);

insertCard.run(
  'mock-subtask-005',
  colTodo,
  'mock-task-002',
  'SUBTASK',
  'Integração com SDK do Gateway para geração do CardToken',
  'Envio seguro para o tokenizador do gateway.',
  'HIGH',
  'Frontend',
  1023,
  assignee,
  '5h'
);

console.log('Mock hierarchy inserted successfully with valid uppercase priorities!');
console.log('Distinct priorities:', db.prepare('SELECT DISTINCT priority FROM cards').all());
