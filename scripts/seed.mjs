// Seed de demonstração do KanbanFlow.
// Uso: node scripts/seed.mjs   (a partir da raiz do projeto)
// Idempotente: remove e recria tudo com prefixo "seed-".
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../server/package.json', import.meta.url));
const bcrypt = require('bcryptjs');

const db = new DatabaseSync('data/kanbanflow.db');
db.exec('PRAGMA foreign_keys = ON;');

const PASSWORD = 'senha123';
const hash = bcrypt.hashSync(PASSWORD, 10);
const ADMIN_PASSWORD = 'admin123';
const adminHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

// ---------- Limpeza ----------
db.exec('BEGIN');
try {
  db.prepare("DELETE FROM workspaces WHERE id LIKE 'seed-%'").run();
  db.prepare("DELETE FROM users WHERE id LIKE 'seed-%'").run();

  // ---------- Usuários ----------
  const users = [
    { id: 'seed-user-admin', name: 'Admin Master', email: 'admin@admin.com', passwordHash: adminHash, role: 'OWNER', team: 'produto' },
    { id: 'seed-user-admin-alt', name: 'Admin Master', email: 'admin@kanbanflow.dev', passwordHash: adminHash, role: 'OWNER', team: 'produto' },
    { id: 'seed-user-ana', name: 'Ana Souza', email: 'ana@kanbanflow.dev', passwordHash: hash, role: 'ADMIN', team: 'produto' },
    { id: 'seed-user-bruno', name: 'Bruno Lima', email: 'bruno@kanbanflow.dev', passwordHash: hash, role: 'ADMIN', team: 'backend' },
    { id: 'seed-user-carla', name: 'Carla Mendes', email: 'carla@kanbanflow.dev', passwordHash: hash, role: 'MEMBER', team: 'frontend' },
    { id: 'seed-user-diego', name: 'Diego Rocha', email: 'diego@kanbanflow.dev', passwordHash: hash, role: 'MEMBER', team: 'backend' },
    { id: 'seed-user-elisa', name: 'Elisa Prado', email: 'elisa@kanbanflow.dev', passwordHash: hash, role: 'MEMBER', team: 'qa' },
    { id: 'seed-user-fabio', name: 'Fábio Nunes', email: 'fabio@kanbanflow.dev', passwordHash: hash, role: 'GUEST', team: null },
  ];
  const insUser = db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)');
  for (const u of users) {
    db.prepare('DELETE FROM users WHERE email = ?').run(u.email);
    insUser.run(u.id, u.email, u.passwordHash, u.name);
  }

  // ---------- Workspace ----------
  const ws = 'seed-ws-demo';
  db.prepare('INSERT INTO workspaces (id, name, billing_email) VALUES (?, ?, ?)').run(ws, 'Acme Commerce', 'financeiro@acme.dev');
  const insMember = db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)');
  for (const u of users) insMember.run(ws, u.id, u.role);
  // Inclui usuários reais já existentes como ADMIN para enxergarem o seed
  for (const real of db.prepare("SELECT id FROM users WHERE id NOT LIKE 'seed-%'").all()) {
    insMember.run(ws, real.id, 'ADMIN');
  }

  const insCap = db.prepare(
    'INSERT INTO workspace_member_capacities (id, workspace_id, user_id, weekly_capacity_hours, sprint_capacity_points) VALUES (?, ?, ?, ?, ?)'
  );
  users.filter((u) => u.role !== 'GUEST').forEach((u, i) => insCap.run(`seed-cap-${i}`, ws, u.id, u.role === 'OWNER' ? 40 : 35, 20));

  // ---------- Equipes ----------
  const teams = { produto: 'Produto', backend: 'Backend', frontend: 'Frontend', qa: 'Qualidade' };
  for (const [key, name] of Object.entries(teams)) {
    db.prepare('INSERT INTO workspace_teams (id, workspace_id, name) VALUES (?, ?, ?)').run(`seed-team-${key}`, ws, name);
  }
  for (const u of users.filter((u) => u.team)) {
    db.prepare('INSERT INTO workspace_team_members (team_id, user_id) VALUES (?, ?)').run(`seed-team-${u.team}`, u.id);
  }

  // ---------- Quadro e colunas ----------
  const board = 'seed-board-ecommerce';
  db.prepare("INSERT INTO boards (id, workspace_id, user_id, title, visibility, estimate_type) VALUES (?, ?, ?, ?, 'WORKSPACE', 'POINTS')")
    .run(board, ws, 'seed-user-admin', 'Plataforma E-commerce');
  db.prepare('INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)').run(board, 'seed-user-admin', 'OWNER');
  db.prepare('INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)').run(board, 'seed-user-admin-alt', 'OWNER');
  db.prepare('INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)').run(board, 'seed-user-ana', 'ADMIN');
  db.prepare('INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)').run(board, 'seed-user-fabio', 'VIEWER');

  const cols = {
    backlog: ['Backlog', null],
    todo: ['A Fazer', null],
    doing: ['Em Andamento', 4],
    review: ['Em Revisão', 3],
    done: ['Concluído', null],
  };
  Object.entries(cols).forEach(([key, [title, wip]], i) => {
    db.prepare('INSERT INTO columns (id, board_id, title, position, wip_limit) VALUES (?, ?, ?, ?, ?)')
      .run(`seed-col-${key}`, board, title, (i + 1) * 1000, wip);
  });

  // ---------- Sprints ----------
  db.prepare("INSERT INTO sprints (id, board_id, name, goal, start_date, end_date, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?)")
    .run('seed-sprint-1', board, 'Sprint 1', 'Fundação de catálogo e autenticação', day(-28), day(-15), day(-28), day(-15));
  db.prepare("INSERT INTO sprints (id, board_id, name, goal, start_date, end_date, status, started_at) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?)")
    .run('seed-sprint-2', board, 'Sprint 2', 'Checkout com PIX em produção', day(-7), day(7), day(-7));
  db.prepare("INSERT INTO sprints (id, board_id, name, goal, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?, 'PLANNING')")
    .run('seed-sprint-3', board, 'Sprint 3', 'Pós-venda e notificações', day(8), day(21));

  // ---------- Cartões ----------
  // [id, col, parent, type, title, priority, tag, assigneeName, estimate, due, sprint, description]
  const cards = [
    // Épicos
    ['epic-checkout', 'doing', null, 'EPIC', 'Checkout e Pagamentos', 'HIGH', 'Pagamentos', 'Ana Souza', '40', day(14), null, 'Suporte a múltiplos meios de pagamento e checkout transparente.'],
    ['epic-catalogo', 'done', null, 'EPIC', 'Catálogo de Produtos', 'MEDIUM', 'Catálogo', 'Ana Souza', '26', day(-15), null, 'Listagem, busca e página de detalhes de produtos.'],
    ['epic-posvenda', 'backlog', null, 'EPIC', 'Pós-venda e Notificações', 'LOW', 'CRM', 'Ana Souza', '30', day(30), null, 'Rastreio de pedido, e-mails transacionais e devoluções.'],

    // Histórias
    ['story-pix', 'doing', 'epic-checkout', 'STORY', 'Como comprador, quero pagar via PIX', 'HIGH', 'PIX', 'Bruno Lima', '13', day(5), 'seed-sprint-2', 'QR Code e Copia e Cola com confirmação instantânea.'],
    ['story-cartao', 'todo', 'epic-checkout', 'STORY', 'Como comprador, quero pagar com cartão parcelado', 'MEDIUM', 'Cartão', 'Diego Rocha', '8', day(7), 'seed-sprint-2', 'Parcelamento em até 12x com tokenização.'],
    ['story-cupom', 'backlog', 'epic-checkout', 'STORY', 'Como comprador, quero aplicar cupom de desconto', 'LOW', 'Promoções', null, '5', null, 'seed-sprint-3', ''],
    ['story-busca', 'done', 'epic-catalogo', 'STORY', 'Como visitante, quero buscar produtos por nome', 'MEDIUM', 'Busca', 'Carla Mendes', '8', day(-18), 'seed-sprint-1', 'Busca com autocomplete e tolerância a erros.'],
    ['story-rastreio', 'backlog', 'epic-posvenda', 'STORY', 'Como cliente, quero rastrear meu pedido', 'MEDIUM', 'Logística', null, '8', null, 'seed-sprint-3', ''],

    // Tarefas
    ['task-pix-api', 'doing', 'story-pix', 'TASK', 'Integrar API PIX do gateway', 'HIGH', 'Backend', 'Bruno Lima', '5', day(2), 'seed-sprint-2', 'Credenciais mTLS e emissão de cobrança imediata.'],
    ['task-pix-ui', 'review', 'story-pix', 'TASK', 'Tela de QR Code com contador de expiração', 'MEDIUM', 'Frontend', 'Carla Mendes', '3', day(3), 'seed-sprint-2', ''],
    ['task-webhook', 'todo', 'story-pix', 'TASK', 'Webhook de confirmação de pagamento', 'HIGH', 'Backend', 'Diego Rocha', '3', day(4), 'seed-sprint-2', 'Validar assinatura HMAC e idempotência.'],
    ['task-token', 'todo', 'story-cartao', 'TASK', 'Tokenização de cartão no front', 'MEDIUM', 'Frontend', 'Carla Mendes', '3', day(6), 'seed-sprint-2', ''],
    ['task-indice', 'done', 'story-busca', 'TASK', 'Criar índice full-text de produtos', 'MEDIUM', 'Backend', 'Diego Rocha', '3', day(-20), 'seed-sprint-1', ''],
    ['task-docs', 'backlog', null, 'TASK', 'Documentar variáveis de ambiente', 'LOW', 'DevOps', 'Admin Master', '1', null, null, 'Tarefa avulsa documentada pelo time.'],
    ['task-ci', 'done', null, 'TASK', 'Configurar pipeline de CI/CD', 'HIGH', 'DevOps', 'Admin Master', '2', day(-25), 'seed-sprint-1', 'Integração contínua e automações.'],

    // Bugs
    ['bug-qr', 'doing', 'story-pix', 'BUG', 'QR Code não renderiza no Safari iOS', 'HIGH', 'Frontend', 'Carla Mendes', '2', day(1), 'seed-sprint-2', 'Canvas retorna em branco no iOS 17.'],
    ['bug-busca', 'done', 'story-busca', 'BUG', 'Busca ignora acentuação', 'MEDIUM', 'Busca', 'Elisa Prado', '1', day(-16), 'seed-sprint-1', '"cafe" não encontra "café".'],
    ['bug-frete', 'todo', null, 'BUG', 'Frete calculado em dobro para CEPs do Norte', 'HIGH', 'Logística', 'Diego Rocha', '2', day(-1), 'seed-sprint-2', 'Atrasado: impacta pedidos em produção.'],
    ['bug-layout', 'backlog', null, 'BUG', 'Rodapé sobrepõe botão em telas pequenas', 'LOW', 'Frontend', null, '1', null, null, ''],

    // Subtarefas (cartões)
    ['sub-mtls', 'done', 'task-pix-api', 'SUBTASK', 'Gerar certificados mTLS', 'MEDIUM', 'Backend', 'Bruno Lima', '1', day(-3), 'seed-sprint-2', ''],
    ['sub-cobranca', 'doing', 'task-pix-api', 'SUBTASK', 'Endpoint de criação de cobrança', 'HIGH', 'Backend', 'Bruno Lima', '2', day(2), 'seed-sprint-2', ''],
    ['sub-timer', 'review', 'task-pix-ui', 'SUBTASK', 'Componente de contagem regressiva', 'LOW', 'Frontend', 'Carla Mendes', '1', day(3), 'seed-sprint-2', ''],
    ['sub-repro', 'done', 'bug-qr', 'SUBTASK', 'Reproduzir em BrowserStack', 'MEDIUM', 'QA', 'Elisa Prado', '1', day(-1), 'seed-sprint-2', ''],
    ['sub-hmac', 'todo', 'task-webhook', 'SUBTASK', 'Validar assinatura HMAC', 'HIGH', 'Backend', 'Diego Rocha', '1', day(4), 'seed-sprint-2', ''],
  ];

  const insCard = db.prepare(`
    INSERT INTO cards (id, column_id, parent_id, type, title, description, priority, tag, assignee, estimate, due_date, sprint_id, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insItem = db.prepare(
    'INSERT INTO sprint_items (sprint_id, card_id, planned, initial_estimate, completed, completed_at) VALUES (?, ?, 1, ?, ?, ?)'
  );
  const posByCol = {};
  for (const [id, col, parent, type, title, prio, tag, who, est, due, sprint, desc] of cards) {
    posByCol[col] = (posByCol[col] ?? 0) + 1000;
    insCard.run(`seed-${id}`, `seed-col-${col}`, parent ? `seed-${parent}` : null, type, title, desc, prio, tag, who, est, due, sprint, posByCol[col]);
    if (sprint) {
      const done = col === 'done';
      insItem.run(sprint, `seed-${id}`, est, done ? 1 : 0, done ? due : null);
    }
  }

  // ---------- Checklists ----------
  const checklist = {
    'task-pix-ui': [['Layout mobile', 1], ['Botão copiar código', 1], ['Estado de expirado', 0]],
    'task-webhook': [['Rota POST /webhooks/pix', 0], ['Testes de idempotência', 0]],
    'bug-frete': [['Identificar tabela de faixas', 1], ['Corrigir cálculo', 0], ['Teste de regressão', 0]],
    'task-docs': [['README', 0], ['.env.example', 0]],
  };
  const insSub = db.prepare('INSERT INTO subtasks (id, card_id, title, done, position) VALUES (?, ?, ?, ?, ?)');
  for (const [card, items] of Object.entries(checklist)) {
    items.forEach(([t, done], i) => insSub.run(`seed-chk-${card}-${i}`, `seed-${card}`, t, done, (i + 1) * 1000));
  }

  // ---------- Comentários ----------
  const insComment = db.prepare('INSERT INTO card_comments (id, card_id, user_id, content) VALUES (?, ?, ?, ?)');
  [
    ['task-pix-api', 'seed-user-admin', 'Ambiente de homologação validado e liberado para os testes do time.'],
    ['bug-qr', 'seed-user-elisa', 'Reproduzido no iPhone 13 com iOS 17.2. Anexei o vídeo.'],
    ['bug-qr', 'seed-user-carla', 'Vou trocar o canvas por SVG, deve resolver.'],
    ['task-pix-api', 'seed-user-ana', 'Prioridade máxima da sprint, qualquer bloqueio me avisem.'],
    ['bug-frete', 'seed-user-bruno', 'Parece ser a faixa de CEP 69000-69999 duplicada na tabela.'],
  ].forEach(([card, user, text], i) => insComment.run(`seed-cmt-${i}`, `seed-${card}`, user, text));

  // ---------- Horas lançadas ----------
  const insLog = db.prepare('INSERT INTO card_time_logs (id, card_id, user_id, duration_seconds, notes, log_date) VALUES (?, ?, ?, ?, ?, ?)');
  [
    ['task-ci', 'seed-user-admin', 3 * 3600, 'Pipeline de CI/CD e automações', day(-25)],
    ['task-pix-api', 'seed-user-bruno', 4 * 3600, 'Setup do gateway', day(-3)],
    ['sub-mtls', 'seed-user-bruno', 2 * 3600, 'Certificados', day(-4)],
    ['task-pix-ui', 'seed-user-carla', 5 * 3600, 'Layout e testes', day(-2)],
    ['bug-qr', 'seed-user-carla', 1.5 * 3600, 'Investigação', day(-1)],
    ['task-indice', 'seed-user-diego', 6 * 3600, '', day(-20)],
  ].forEach(([card, user, secs, notes, date], i) => insLog.run(`seed-log-${i}`, `seed-${card}`, user, secs, notes, date));

  // ---------- Retrospectiva da Sprint 1 ----------
  const insRetro = db.prepare('INSERT INTO sprint_retrospectives (id, sprint_id, author_id, category, content, votes) VALUES (?, ?, ?, ?, ?, ?)');
  [
    ['WENT_WELL', 'seed-user-carla', 'Busca entregue antes do prazo', 4],
    ['TO_IMPROVE', 'seed-user-elisa', 'Bugs chegando tarde para QA', 3],
    ['ACTION_ITEM', 'seed-user-ana', 'Incluir QA no refinamento', 5],
  ].forEach(([cat, user, text, votes], i) => insRetro.run(`seed-retro-${i}`, 'seed-sprint-1', user, cat, text, votes));

  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
}

console.log('\n✔ Seed concluído com sucesso!');
console.log('='.repeat(65));
console.log('👑 USUÁRIO ADMIN PADRÃO (Acesso Total):');
console.log('   E-mail:    admin@admin.com  (ou admin@kanbanflow.dev)');
console.log(`   Senha:     ${ADMIN_PASSWORD}`);
console.log('   Papel:     OWNER (Dono do Workspace e do Quadro)');
console.log('-'.repeat(65));
console.log(`👥 Usuários da Equipe (senha "${PASSWORD}"):`);
console.log('   ana@kanbanflow.dev    (ADMIN - Produto)');
console.log('   bruno@kanbanflow.dev  (ADMIN - Backend)');
console.log('   carla@kanbanflow.dev  (MEMBER - Frontend)');
console.log('   diego@kanbanflow.dev  (MEMBER - Backend)');
console.log('   elisa@kanbanflow.dev  (MEMBER - QA)');
console.log('   fabio@kanbanflow.dev  (GUEST - Convidado/Viewer)');
console.log('-'.repeat(65));
console.log('🏢 Workspace: "Acme Commerce" › Quadro: "Plataforma E-commerce"');
console.log('='.repeat(65) + '\n');
