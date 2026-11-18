# Documentação Técnica e Guia de Implantação — LOJINHA ICEVES (PDV & Gestão de Consumo)

## 1. Visão Geral da Arquitetura

O sistema **Lojinha Iceves — PDV & Gestão de Consumo** é uma aplicação Web Full-Stack e **Progressive Web App (PWA)** construída com:

- **Frontend**: React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + Recharts + Lucide Icons + `vite-plugin-pwa` (Workbox).
- **Backend API**: Express (`server.ts`) servindo rotas `/api/*`, middlewares de segurança (`securityHeaders.ts`), motor transacional (`src/server/db.ts`) com persistência local atômica (`/data/base44_db.json`) e sincronização opcional bidirecional com **Supabase PostgreSQL**.
- **Pagamentos**: Pix BACEN estático/dinâmico + Checkout Transparente e Webhooks **Mercado Pago**.
- **IA Analítica (Somente Leitura)**: **ICEVES Inteligência** via SDK oficial `@google/genai` executado exclusivamente no servidor (`POST /api/ai/assistant`).
- **Localização e Padrões**: Português do Brasil (`pt-BR`), moeda `BRL (R$)`, fuso horário `America/Sao_Paulo`.

---

## 2. Variáveis de Ambiente

Crie ou configure as variáveis abaixo no ambiente de produção (ou painel de Secrets):

| Variável | Obrigatória | Descrição |
|---|---|---|
| `GEMINI_API_KEY` | Sim (para IA) | Chave da API Gemini usada no servidor pelo módulo `ICEVES Inteligência`. Nunca exposta no navegador. |
| `APP_URL` | Recomendada | URL pública da aplicação em produção (usada em callbacks e webhooks). |
| `SUPABASE_URL` | Opcional/Prod | URL do projeto Supabase (`https://xxx.supabase.co`). |
| `SUPABASE_ANON_KEY` | Opcional/Prod | Chave pública anônima do Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | Opcional/Prod | Chave de serviço do Supabase (apenas backend). |
| `MERCADO_PAGO_ACCESS_TOKEN` | Opcional/Prod | Token de acesso Mercado Pago (`APP_USR-...` ou `TEST-...`). |
| `MERCADO_PAGO_PUBLIC_KEY` | Opcional/Prod | Chave pública Mercado Pago. |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Opcional/Prod | Segredo para validação da assinatura `x-signature` nos webhooks Mercado Pago. |

Consulte `/ .env.example` como modelo base (sem nunca versionar segredos reais).

---

## 3. Banco de Dados Supabase (PostgreSQL)

1. Acesse **Supabase Dashboard → SQL Editor**.
2. Copie e execute integralmente o script `/supabase_schema.sql` (também acessível em **Configurações → Integração Supabase → Copiar Script Completo**).
3. O script cria e atualiza de forma idempotente:
   - `settings`, `users`, `guardians`, `students`, `products`, `stock_movements`, `sales`, `invoices`, `pix_payments`, `whatsapp_notifications`, `audit_logs`, `passeios`
   - `cash_registers`, `cash_movements`, `customer_account_movements`
   - Índices de desempenho para relatórios, fechamento e auditoria e políticas RLS.

---

## 4. Integração Mercado Pago

1. No painel de desenvolvedores do Mercado Pago, gere o `Access Token` e a `Public Key`.
2. Configure o Webhook apontando para:
   ```text
   https://SEU-DOMINIO/api/mercadopago/webhook
   ```
3. Utilize a tela **Configurações → Mercado Pago** para testar a conexão em tempo real, inspecionar logs de requisições e confirmar aprovações instantâneas no Checkout Transparente.

---

## 5. IA Analítica Server-Side (`ICEVES Inteligência`)

- Endpoint: `POST /api/ai/assistant`
- Modelo: `gemini-4-hydrogen` via `@google/genai` exclusivamente no backend (`/src/server/aiAssistant.ts`).
- **Segurança por Perfil (RBAC)**:
  - `STUDENT` e `GUARDIAN` visualizam exclusivamente compras, saldo e faturas do seu escopo.
  - `STOCKIST` recebe apenas indicadores de catálogo, estoque baixo e giro de produtos (sem dívidas de alunos).
  - `ADMIN`, `MANAGER`, `CASHIER` e `VIEWER` têm visão consolidada de vendas, faturamento, estoque, consumo individual e caixa.
- **Modo Somente Leitura**: O assistente não altera saldos, estoque, vendas ou fechamento de caixa; toda consulta fica registrada em `audit_logs` (`CONSULTA_IA`).

---

## 6. Instalação como Aplicativo (PWA)

O sistema inclui manifesto web (`/manifest.webmanifest`), Service Worker Workbox (`vite-plugin-pwa`), ícones oficiais (`192x192`, `512x512`, maskable `512x512`, `apple-touch-icon` `180x180`), página offline (`/offline.html`) e cache de leitura offline (`offlineSnapshotCache.ts`).

### Como Instalar
- **Computador (Chrome / Edge)**: Clique no botão **INSTALAR APLICATIVO** na barra superior, menu lateral, tela de login ou em **Configurações**, e confirme no prompt nativo.
- **Android (Chrome)**: Toque em **INSTALAR APLICATIVO** (dispara `beforeinstallprompt` nativo) ou no menu do navegador em *"Instalar aplicativo"*.
- **iPhone / iPad (Safari)**: Toque em **INSTALAR APLICATIVO** para abrir o guia passo a passo — use o botão **Compartilhar** do Safari e selecione **"Adicionar à Tela de Início"**.
- **Uso Offline**: Quando sem internet, o sistema entra em modo leitura com o último snapshot sincronizado e bloqueia vendas no PDV, ajustes de estoque e confirmações financeiras para evitar divergências de saldo.

---

## 7. Perfis de Acesso (RBAC)

| Perfil | Permissões Principais |
|---|---|
| `ADMIN` | Acesso integral, configurações do sistema, aprovação de faturas, auditoria e exclusões controladas. |
| `MANAGER` | Operação comercial completa: PDV (inclusive descontos), caixa, estoque, alunos/créditos e relatórios gerenciais. |
| `CASHIER` | Operação do PDV (6 formas de pagamento), abertura/movimentação/fechamento de caixa e consulta operacional. |
| `STOCKIST` | Gestão de catálogo, margens de lucro, entrada/ajuste e registro de perda/avaria no estoque. |
| `VIEWER` | Consulta somente leitura em dashboards, catálogo, faturas e relatórios exportáveis. |
| `STUDENT` | Portal do aluno (extrato, consumo em aberto, faturas e pagamentos Pix/Cartão). |
| `GUARDIAN` | Portal do responsável financeiro (exclusivamente alunos vinculados). |

---

## 8. Relatórios, Backup Offline e Testes

- **Central de Relatórios**: Filtros por período com exportação imediata em **CSV (UTF-8 com BOM)**, **Excel (`.xls`)** e **PDF (`window.print()`)** para Vendas, Produtos, Estoque, Consumo Individual, Clientes, Financeiro, Pagamentos, Lucro Estimado e Movimentações de Caixa.
- **Testes Automatizados**:
  ```bash
  npx tsx tests/critical-operations.test.ts
  ```
- **Build & Start em Produção**:
  ```bash
  npm run lint
  npm run build
  npm start
  ```
