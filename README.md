# KanbanFlow — Gestão Ágil de Projetos

Sistema Kanban completo e moderno migrado de arquivo único HTML para uma aplicação robusta com **React + Vite**, **Node.js + Express**, **TypeScript**, **SQLite** e **Autenticação de Usuários**.

---

## 🚀 Tecnologias Utilizadas

### Frontend (`web/`)
- **React 18** com **TypeScript** e **Vite**
- **Tailwind CSS** para estilização moderna e tema escuro
- **@dnd-kit** (`@dnd-kit/core`, `@dnd-kit/sortable`) para drag and drop fluído de cartões (inclusive reordenação dentro da mesma coluna e entre colunas)
- **Lucide React** para ícones modernos
- **Context API** para gerenciamento de autenticação com cookies seguros

### Backend (`server/`)
- **Node.js** com **Express** e **TypeScript**
- **SQLite** com `node:sqlite` nativo (rápido, sem dependências de compilação C++, com suporte a transações atômicas e WAL mode)
- **Bcrypt.js** para hash seguro de senhas
- **JSON Web Token (JWT)** em cookies `HttpOnly` com proteção contra XSS
- **Zod** para validação de esquemas e entradas da API
- **TSX** para desenvolvimento rápido com recarregamento a quente

---

## 📁 Estrutura do Projeto

```text
kanbanflow/
├── legacy/
│   └── index.html             # Arquivo HTML único original preservado
├── server/                    # Backend Express + SQLite + Auth
│   ├── migrations/            # Migrações SQL automáticas
│   │   └── 001_init.sql
│   ├── src/
│   │   ├── middleware/        # Autenticação e proteção de rotas
│   │   ├── routes/            # Rotas REST (/auth, /board, /columns, /cards, /subtasks)
│   │   ├── app.ts             # Configuração Express e arquivos estáticos
│   │   ├── db.ts              # Conexão e migrações SQLite
│   │   ├── index.ts           # Inicialização do servidor
│   │   └── types.ts           # Definições de tipos compartilhadas
│   ├── data/                  # Banco de dados local kanbanflow.db (ignorado no git)
│   └── package.json
├── web/                       # Frontend React + Vite + Tailwind
│   ├── src/
│   │   ├── api/               # Cliente HTTP centralizado
│   │   ├── components/        # Header, Column, CardItem, CardModal, ColumnModal, BoardView
│   │   ├── context/           # AuthContext (login, register, logout, me)
│   │   ├── pages/             # Login e Register
│   │   ├── types.ts           # Tipos TypeScript do frontend
│   │   ├── App.tsx            # Roteamento e inicialização
│   │   └── main.tsx
│   └── package.json
├── package.json               # Monorepo workspaces
└── README.md
```

---

## ⚡ Como Executar o Projeto

### Pré-requisitos
- **Node.js** 20+ ou 24+
- **npm** 10+

### 1. Instalar as dependências
Na raiz do projeto:
```bash
npm install
```

### 2. Rodar em modo de desenvolvimento (Front + Back simultâneos)
```bash
npm run dev
```
- **Frontend**: [http://localhost:5173](http://localhost:5173) (com proxy automático para a API)
- **Backend API**: [http://localhost:3001](http://localhost:3001)

### 3. Build e Execução em Produção
```bash
npm run build
npm start
```
O servidor Express servirá tanto a API quanto a interface React em [http://localhost:3001](http://localhost:3001).

---

## 🔐 Autenticação e Isolamento

- Cada usuário cadastrado possui seu próprio quadro isolado (`user_id`).
- Ao se registrar, um conjunto de colunas e tarefas de demonstração é criado automaticamente.
- Os tokens de sessão são mantidos em cookies `HttpOnly`, prevenindo acessos indevidos via JavaScript.
- Há um botão de **"Preencher com conta de teste demo"** na tela de login para testes rápidos com 1 clique (`test@example.com` / `password123`).

---

## 🎯 Funcionalidades

- **Arrastar e Soltar (@dnd-kit):** Movimentação fluida entre colunas e reordenação interna dentro de cada coluna com persistência imediata no SQLite.
- **Checklist de Subtarefas:** Acompanhamento de progresso com barra percentual e checkboxes marcáveis diretamente no cartão ou através do modal.
- **Filtros Dinâmicos:** Busca em tempo real por título, tag ou descrição, além de filtro por nível de prioridade (Alta, Média, Baixa).
- **Gestão de Colunas e Cartões:** Criação, edição e exclusão com diálogos de confirmação e feedback visual.
- **Prazos e Vencimentos:** Cálculo automático de dias restantes, alertas de atraso e formatação amigável.
- **Botão Resetar:** Restaura o quadro do usuário aos dados de exemplo originais a qualquer momento.

---

## ☁️ Preparação para Deploy Futuro

Como o SQLite atual utiliza arquivo local em `server/data/kanbanflow.db`, para hospedar na Netlify (que opera sob arquitetura serverless sem disco permanente):
- A camada de banco de dados foi isolada em `server/src/db.ts`.
- Para o deploy na Netlify, basta conectar a biblioteca **Turso (libSQL)** mantendo exatamente a mesma sintaxe SQL e esquemas de migração já existentes.

