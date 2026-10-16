# naPorta — desafio e esteiras

Documentação de uma Web API de pedidos consumida por um portal web. O desafio prevê entrega em repositório público no GitHub, em três dias corridos a partir do recebimento do e-mail. A data de recebimento não foi informada; não há prazo absoluto calculado.

**Etapa atual: esteiras e infraestrutura implementadas; aplicação pendente.** Há Makefile, scripts de validação e workflow GitHub Actions. Migrations e operações PostgreSQL estão implementadas, com Compose do banco. Backend executável e dependências da aplicação permanecem pendentes. Os gates falham quando seus pré-requisitos estão ausentes. Veja [execução das esteiras](docs/13-esteiras-executaveis.md).

O [repositório público](https://github.com/portifolio-vinicius/api-na-porta) usa `master` como padrão e `develop` como base das tarefas. Ambas aceitam alterações somente por merge de PR com gate aprovado; push direto, force push e exclusão estão bloqueados, sem bypass. Configuração no [documento 09](docs/09-ci-e-seguranca.md) e evidências no [documento 14](docs/14-publicacao-e-protecao.md). A base inicial ainda não representa uma aplicação aprovada para produção.

## Organização

- `backend/`: futura API Node.js; instruções em [backend/AGENTS.md](backend/AGENTS.md).
- `database/`: migrations SQL, seed e operações PostgreSQL; instruções em [database/AGENTS.md](database/AGENTS.md).
- `docs/`: requisitos e decisões; índice em [docs/README.md](docs/README.md).
- [AGENTS.md](AGENTS.md): instruções gerais e coordenação do trabalho.

Os três arquivos `AGENTS.md` são complementares. As regras comuns ficam na raiz e as regras específicas ficam somente no respectivo componente.

## Tecnologias propostas

Backend em Node.js com NestJS, banco PostgreSQL e ORM Prisma, alinhados às preferências do desafio. O projeto contém somente backend nesta entrega. Organização por feature folders, tipos/interfaces e IDs integer internos/UUIDs públicos estão definidos em [arquitetura](docs/04-arquitetura-e-dados.md), incluindo replicação e escalabilidade. A CI fixa Node.js 24.21.0; PostgreSQL 18 usa imagem por digest. Versões de NestJS e Prisma serão fixadas na implementação da API.

## Execução

Infraestrutura adicionada: Nginx com HTTPS, réplicas de backend no Docker Swarm e permissões PostgreSQL. Consulte [infraestrutura e acessos](docs/16-infraestrutura-e-acessos.md). A aplicação continua pendente.


Para validar as próprias esteiras, execute `make pipelineCheck`; para documentação, `make docsCheck`; para operações reais do banco, `make dbIntegration`. Configuração e comandos em [operações PostgreSQL](docs/15-postgresql-operacoes.md). A experiência de ambiente planejada é `make up`, com Docker Compose para banco, migrations, API e volume de cache em arquivos. `make preMerge TARGET=develop` prepara a validação local; GitHub Actions executa os gates obrigatórios de integração e segurança antes do merge. Os alvos de CI e banco estão implementados; o ambiente completo com API continua planejado. Veja [o catálogo e a ordem dos comandos](docs/07-scripts-e-ambiente.md). As instruções executáveis, variáveis definitivas e portas efetivas deverão ser atualizadas neste README quando a implementação existir.

Planejamento da [esteira eficiente](docs/10-eficiencia-e-documentacao.md) e da [performance por rota](docs/11-performance-das-rotas.md), com [inventário ainda não medido](docs/performance/rotas.md). Scripts e workflow de CI existem; a coleta HTTP depende da implementação do backend.

## Entrega

O repositório já está público. Antes da entrega da aplicação: validar o fluxo completo, registrar a execução real, revisar segredos/dados pessoais e conferir a licença dos arquivos. A CI atual reprova por ausência da aplicação; isso impede novos merges nas branches protegidas. O envio do link por e-mail será realizado pelo responsável pela entrega. Serverless fica fora do escopo inicial.
