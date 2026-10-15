import { app } from './app.js';
import { runMigrations } from './db.js';

const PORT = Number(process.env.PORT) || 3001;

try {
  console.log('Executando migrações do banco de dados SQLite...');
  runMigrations();
  console.log('Banco de dados inicializado com sucesso.');

  app.listen(PORT, () => {
    console.log(`🚀 Servidor backend rodando em http://localhost:${PORT}`);
  });
} catch (error) {
  console.error('Falha ao iniciar o servidor:', error);
  process.exit(1);
}

