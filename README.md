# naPorta — desafio e esteiras

Documentação de uma Web API de pedidos consumida por um portal web. O desafio prevê entrega em repositório público no GitHub, em três dias corridos a partir do recebimento do e-mail. A data de recebimento não foi informada; não há prazo absoluto calculado.

**Etapa atual: login e rotas de pedidos implementados; cache e integração HTTP pendentes.** A API NestJS verifica prontidão PostgreSQL, autentica com JWT e usa schema Prisma mapeado. Migrations SQL continuam com executor nativo. Faltam cache, Compose completo da API e suíte de integração HTTP; os gates não aprovam essas ausências. Veja [execução das esteiras](docs/13-esteiras-executaveis.md).

O [repositório público](https://github.com/portifolio-vinicius/api-na-porta) usa `master` como padrão e `develop` como base das tarefas. Ambas aceitam alterações somente por merge de PR com gate aprovado; push direto, force push e exclusão estão bloqueados, sem bypass. Configuração no [documento 09](docs/09-ci-e-seguranca.md) e evidências no [documento 14](docs/14-publicacao-e-protecao.md). A base inicial ainda não representa uma aplicação aprovada para produção.

## Organização

- `backend/`: API NestJS em implementação; instruções em [backend/AGENTS.md](backend/AGENTS.md).
- `database/`: migrations SQL, seed e operações PostgreSQL; instruções em [database/AGENTS.md](database/AGENTS.md).
- `docs/`: requisitos e decisões; índice em [docs/README.md](docs/README.md).
- [AGENTS.md](AGENTS.md): instruções gerais e coordenação do trabalho.

Os três arquivos `AGENTS.md` são complementares. As regras comuns ficam na raiz e as regras específicas ficam somente no respectivo componente.

## Tecnologias propostas

Backend em Node.js 24, NestJS 11, PostgreSQL 18 e Prisma ORM 7 com adapter `pg`. O lockfile fixa as dependências. Organização por feature folders, tipos/interfaces e IDs integer internos/UUIDs públicos estão definidos em [arquitetura](docs/04-arquitetura-e-dados.md), incluindo replicação e escalabilidade.

## Execução

Para compilar: `make check`. Para iniciar localmente, exporte `DATABASE_URL`, `JWT_SECRET` (mínimo 32 bytes), `JWT_ISSUER` e `JWT_AUDIENCE`; rode `npm --prefix backend run build && npm --prefix backend start`. `/health/ready` responde 200 somente quando o banco responde, caso contrário 503. Login: `POST /api/v1/auth/login`. O usuário fictício é criado com `ENV=local|demo`, `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD` e `DATABASE_URL` usando `naporta_migrator`, via `npm --prefix backend run seed:demo-user`. Pedidos: `POST`, `GET` (lista e detalhe), `PATCH` e `DELETE` em `/api/v1/orders`, com JWT Bearer; a exclusão é lógica. `make dbUp` prepara apenas PostgreSQL. A imagem pode ser construída com `docker build -f backend/Dockerfile -t naporta-backend:local .`. Compose completo, cache e métricas HTTP ainda não estão implementados.


Para validar documentação, execute `make docsCheck`; para operações reais do banco, `make dbIntegration`. Configuração do banco em [operações PostgreSQL](docs/15-postgresql-operacoes.md). `make up` para API, migrations e cache ainda está planejado. `make integration` continua bloqueado pela ausência da suíte HTTP; os endpoints implementados não são considerados integrados até a suíte obrigatória passar. Veja [o catálogo de comandos](docs/07-scripts-e-ambiente.md).

Planejamento da [esteira eficiente](docs/10-eficiencia-e-documentacao.md) e da [performance por rota](docs/11-performance-das-rotas.md), com [inventário ainda não medido](docs/performance/rotas.md). Scripts e workflow de CI existem; a coleta HTTP depende da implementação do backend.

## Entrega

O repositório já está público. Antes da entrega da aplicação: validar o fluxo completo, registrar a execução real, revisar segredos/dados pessoais e conferir a licença dos arquivos. A CI atual reprova por ausência da aplicação; isso impede novos merges nas branches protegidas. O envio do link por e-mail será realizado pelo responsável pela entrega. Serverless fica fora do escopo inicial.
