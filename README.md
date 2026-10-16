# naPorta — desafio e esteiras

Documentação de uma Web API de pedidos consumida por um portal web. O desafio prevê entrega em repositório público no GitHub, em três dias corridos a partir do recebimento do e-mail. A data de recebimento não foi informada; não há prazo absoluto calculado.

**Etapa atual: esteiras implementadas; aplicação pendente.** Há Makefile, scripts de validação e workflow GitHub Actions. Ainda não há backend executável, dependências da aplicação, migrations ou Docker Compose. Os gates falham quando seus pré-requisitos estão ausentes. Veja [execução das esteiras](docs/13-esteiras-executaveis.md).

## Organização

- `backend/`: futura API Node.js; instruções em [backend/ag.md](backend/ag.md).
- `database/`: futura organização de migrations, seed e operações do banco; instruções em [database/ag.md](database/ag.md).
- `docs/`: requisitos e decisões; índice em [docs/README.md](docs/README.md).
- [ag.md](ag.md): instruções gerais e coordenação do trabalho.

Os três arquivos `ag.md` são complementares. As regras comuns ficam na raiz e as regras específicas ficam somente no respectivo componente.

## Tecnologias propostas

Backend em Node.js com NestJS, banco PostgreSQL e ORM Prisma, alinhados às preferências do desafio. O projeto contém somente backend nesta entrega. Organização por feature folders, tipos/interfaces e IDs integer internos/UUIDs públicos estão definidos em [arquitetura](docs/04-arquitetura-e-dados.md), incluindo replicação e escalabilidade. Versões suportadas serão selecionadas e fixadas no início da implementação.

## Execução

Para validar as próprias esteiras, execute `make pipelineCheck`; para documentação, `make docsCheck`. A experiência de ambiente planejada é `make up`, com Docker Compose para banco, migrations, API e volume de cache em arquivos. `make preMerge TARGET=develop` prepara a validação local; GitHub Actions executa os gates obrigatórios de integração e segurança antes do merge. Os alvos de CI estão implementados; os alvos de ambiente e banco continuam planejados. Veja [o catálogo e a ordem dos comandos](docs/07-scripts-e-ambiente.md). As instruções executáveis, variáveis definitivas e portas efetivas deverão ser atualizadas neste README quando a implementação existir.

Planejamento da [esteira eficiente](docs/10-eficiencia-e-documentacao.md) e da [performance por rota](docs/11-performance-das-rotas.md), com [inventário ainda não medido](docs/performance/rotas.md). Scripts e workflow de CI existem; a coleta HTTP depende da implementação do backend.

## Entrega

Antes de publicar: validar o fluxo completo, documentar a execução real, remover segredos e dados pessoais, conferir a licença dos arquivos e tornar o repositório público. O envio do link por e-mail será realizado pelo responsável pela entrega. Serverless fica fora do escopo inicial.
