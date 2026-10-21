// Gerenciador e executor de Migrações do KanbanFlow.
// Uso:
//   node scripts/migrate.mjs             -> Executa todas as migrações pendentes
//   node scripts/migrate.mjs --status    -> Exibe status de cada migração (aplicada/pendente)
//   node scripts/migrate.mjs --create <nome> -> Cria um novo arquivo de migração sequencial

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const migrationsDir = path.join(rootDir, 'server', 'migrations');
const dbPath = path.join(dataDir, 'kanbanflow.db');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(migrationsDir)) {
  fs.mkdirSync(migrationsDir, { recursive: true });
}

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

// Garante tabela de controle de migrações
db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    executed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const args = process.argv.slice(2);

// --- Subcomando: --create <nome> ---
if (args[0] === '--create') {
  const rawName = args[1];
  if (!rawName) {
    console.error('❌ Erro: informe o nome da migração. Exemplo: node scripts/migrate.mjs --create add_tags');
    process.exit(1);
  }
  const sanitized = rawName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  let nextNum = 1;
  if (files.length > 0) {
    const lastFile = files[files.length - 1];
    const match = lastFile.match(/^(\d+)_/);
    if (match) {
      nextNum = parseInt(match[1], 10) + 1;
    } else {
      nextNum = files.length + 1;
    }
  }
  const prefix = String(nextNum).padStart(3, '0');
  const fileName = `${prefix}_${sanitized}.sql`;
  const filePath = path.join(migrationsDir, fileName);

  const template = `-- ${fileName}
-- Descrição: ${rawName}
-- Criado em: ${new Date().toISOString()}

-- Escreva suas instruções SQL aqui (DDL / DML):
-- ALTER TABLE ... ADD COLUMN ...;
`;
  fs.writeFileSync(filePath, template, 'utf-8');
  console.log(`✔ Arquivo de migração criado com sucesso: server/migrations/${fileName}`);
  process.exit(0);
}

// Helper para ler migrações aplicadas
function getExecutedMigrations() {
  const rows = db.prepare('SELECT name, executed_at FROM _migrations ORDER BY id ASC').all();
  const map = new Map();
  for (const r of rows) {
    map.set(r.name, r.executed_at);
  }
  return map;
}

// --- Subcomando: --status ---
if (args[0] === '--status') {
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  const executed = getExecutedMigrations();

  console.log('\n📦 Status das Migrações - KanbanFlow');
  console.log('='.repeat(70));
  console.log(`${'Arquivo'.padEnd(35)} | ${'Status'.padEnd(12)} | Data/Hora`);
  console.log('-'.repeat(70));

  let appliedCount = 0;
  let pendingCount = 0;

  for (const f of files) {
    const execDate = executed.get(f);
    if (execDate) {
      appliedCount++;
      console.log(`${f.padEnd(35)} | \x1b[32mAPLICADA\x1b[0m     | ${execDate}`);
    } else {
      pendingCount++;
      console.log(`${f.padEnd(35)} | \x1b[33mPENDENTE\x1b[0m     | -`);
    }
  }

  console.log('='.repeat(70));
  console.log(`Total: ${files.length} | Aplicadas: ${appliedCount} | Pendentes: ${pendingCount}\n`);
  process.exit(0);
}

// --- Execução padrão: rodar migrações pendentes ---
function runAllMigrations() {
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  const executed = getExecutedMigrations();
  let executedInRun = 0;

  console.log('\n🚀 Iniciando execução de migrações...');

  for (const file of files) {
    if (!executed.has(file)) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      db.exec('BEGIN TRANSACTION;');
      try {
        for (const statement of statements) {
          try {
            db.exec(statement + ';');
          } catch (e) {
            // Ignora se coluna ou tabela já existir (compatibilidade idempotente)
            if (
              !e.message?.includes('duplicate column name') &&
              !e.message?.includes('already exists')
            ) {
              throw e;
            }
          }
        }
        db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
        db.exec('COMMIT;');
        console.log(`  \x1b[32m✔\x1b[0m Aplicada: ${file}`);
        executedInRun++;
      } catch (err) {
        db.exec('ROLLBACK;');
        console.error(`  \x1b[31m✖ Falha ao aplicar ${file}:\x1b[0m`, err.message);
        process.exit(1);
      }
    }
  }

  if (executedInRun === 0) {
    console.log('✨ Banco de dados já está totalmente atualizado (nenhuma migração pendente).');
  } else {
    console.log(`\n🎉 Concluído: ${executedInRun} migração(ões) aplicada(s) com sucesso!`);
  }
}

runAllMigrations();
