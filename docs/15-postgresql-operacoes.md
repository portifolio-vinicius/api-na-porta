# Operações PostgreSQL

Implementação de 2026-10-16. Os scripts usam clientes nativos PostgreSQL e Python 3.9+, sem driver Python adicional. O transporte pode ser local (`psql`, `pg_dump`, `pg_restore` instalados) ou `docker exec` em `DB_CONTAINER`. A imagem PostgreSQL 18 está fixada por digest em [config/postgres-image.txt](../config/postgres-image.txt); a execução local confirmou PostgreSQL 18.6.

## Configuração e banco local

Variáveis obrigatórias: `ENV=local|test|demo`, `PGHOST`, `PGPORT`, `PGUSER` e `PGDATABASE`. O nome do banco segue `naporta_<ENV>` ou `naporta_<ENV>_<sufixo>`. `PGPASSWORD` ou um `PGPASSFILE` privado fornecem autenticação aos clientes. `dbUp` exige `PGPASSWORD` para inicializar o servidor.

Com `PGPASSWORD` já definido no ambiente privado, este exemplo usa os clientes do próprio container:

```sh
export ENV=local
export PGHOST=127.0.0.1
export PGPORT=5432
export PGUSER=postgres
export PGDATABASE=naporta_local
export DB_CONTAINER=naporta-local-db
make dbUp
make migrate
make dbStatus
make seed
make backup BACKUP_FILE=artifacts/backups/local-001.dump
make dbDown
```

`dbUp` usa [database/compose.yml](../database/compose.yml), publica PostgreSQL somente em `127.0.0.1` e aguarda prontidão TCP. `DB_PORT` define a porta publicada no host; o padrão é 5432. Com transporte `DB_CONTAINER`, `PGHOST` e `PGPORT` referem-se ao servidor visto de dentro do container, normalmente `127.0.0.1:5432`. Com clientes nativos, referem-se ao endereço/porta do host.

O projeto Compose deriva de `PGDATABASE`, isolando volumes por banco. O nome padrão do container é `naporta-<PGDATABASE com hífens>-db`; `DB_CONTAINER` permite nome explícito. `dbDown` preserva o volume. Repetir `dbUp` reutiliza os dados; credenciais e banco de inicialização só são aplicados pelo entrypoint a um volume vazio. O Compose atual sobe somente o banco, sem API ou réplica.

Os scripts exigem conexão explícita, validam ambiente/nome do banco e mantêm senhas fora dos argumentos e logs. Esses checks validam a configuração informada; o responsável também mantém credenciais e permissões separadas por ambiente. Produção fica fora dos destinos permitidos por essas rotinas.

## Comandos

| Alvo Make | Operação |
| --- | --- |
| `dbUp` / `dbDown` | Iniciar e parar PostgreSQL local, preservando volume |
| `dbStatus` | Listar migrations aplicadas; consulta sem criar histórico |
| `migrate` | Validar histórico/checksums e aplicar migrations pendentes em transação |
| `seed` | Inserir um pedido fictício com cliente, endereço e item, de forma idempotente |
| `backup BACKUP_FILE=...dump` | Exportar banco em formato custom, com manifesto e SHA-256 |
| `rollback MIGRATION=... DB_CONFIRM=... BACKUP_FILE=...dump` | Reverter somente a última migration aplicada, com plano e backup compatível |
| `restore DB_CONFIRM=... BACKUP_FILE=...dump` | Restaurar backup confiável em banco de destino vazio |
| `dbIntegration` | Exercitar essas operações em PostgreSQL real descartável |

`ENV`, `PG*`, `DB_CONTAINER`, `BACKUP_FILE`, `DB_CONFIRM`, `MIGRATION` e `DB_PORT` podem ser fornecidos no ambiente ou como variáveis Make. `MIGRATIONS_DIR` permite diretório alternativo para integrações e operações controladas; o padrão é `database/prisma/migrations`. Scripts shell aceitam `--help`.

## Modelagem e migrations

A migration inicial cria `users`, `orders`, `order_customers`, `order_addresses`, `order_items`, `cache_versions`, enum de status, constraints e índices previstos no documento 04. IDs internos são integer; IDs públicos são UUID sem default, fornecidos pelo futuro backend. O banco preserva números como texto e preços `numeric(12,2)`. Regras de transição, UUID público imutável, quantidade mínima de itens e limites de entrada continuam sob responsabilidade do backend ainda pendente.

A fonte executável atual são os arquivos SQL em `database/prisma/migrations/<timestamp>_<descricao>/migration.sql`. Cada versão pode fornecer `rollback.sql`. O ledger `public._naporta_migrations` guarda nome, checksum de ambos os arquivos e data de aplicação. Alterações em arquivos já aplicados, versões desconhecidas ou histórico fora de ordem reprovam a execução.

O executor nativo aplica o lote pendente atomicamente e usa advisory lock para serializar operações. Os arquivos SQL contêm somente comandos transacionais; o executor controla abertura e fechamento da transação. Operações como `CREATE INDEX CONCURRENTLY`, comandos psql e mudanças que exigem execução fora de transação não pertencem a esse formato. DDL que falha deixa schema e ledger anteriores preservados.

**Decisão de implementação:** o executor PostgreSQL é o único executor de migrations nesta etapa. Prisma continua planejado para o ORM; `schema.prisma` e Prisma Migrate ainda não existem. A futura integração deve mapear o schema existente e definir baseline compatível antes de trocar executor. Executar dois mecanismos sobre o mesmo histórico não faz parte do fluxo atual.

O seed não cria usuário de login nem senha. Ele mantém registros existentes, inclusive dados externos ao conjunto fictício. Seed completo de autenticação e cenários do backend permanece pendente.

## Backup, reversão e recuperação

O backup mantém um lock de schema compartilhado pelas operações deste conjunto enquanto `pg_dump` exporta seu snapshot consistente. O dump e o manifesto são publicados sem sobrescrita, com permissões 0600. O manifesto contém origem técnica, histórico de migrations, tamanho e SHA-256. Falha interrompe a operação e remove somente os arquivos temporários criados por ela. Outros clientes que executam DDL sem o mesmo lock ficam fora dessa coordenação; mudanças de schema devem passar pelo executor.

Os arquivos `.dump` e `.dump.json` são privados e ignorados pelo Git. Contêm dados do banco; os artefatos de CI publicados incluem somente resultados técnicos sanitizados. O formato custom e sua restauração seguem os [clientes oficiais PostgreSQL](https://www.postgresql.org/docs/18/backup-dump.html).

Para rollback:

```sh
make backup BACKUP_FILE=artifacts/backups/antes-reversao.dump
make rollback MIGRATION=20261016000100_initial DB_CONFIRM=naporta_local BACKUP_FILE=artifacts/backups/antes-reversao.dump
```

`DB_CONFIRM` deve corresponder exatamente a `PGDATABASE`. O script exige backup com checksum/tamanho válidos, da mesma conexão e com o mesmo histórico aplicado. A migration indicada deve ser a última aplicada e fornecer plano reverso versionado. Cada novo plano reverso deve definir como trata dados potencialmente perdidos. O plano inicial recusa remoção de estrutura que contenha usuários ou pedidos. Um backup não torna automaticamente qualquer SQL reverso seguro.

Para restauração, criar previamente um banco vazio no destino autorizado e mudar `PGDATABASE`/`DB_CONFIRM` para ele. O script verifica integridade do arquivo, converte o dump com `pg_restore` e executa a asserção de destino vazio e a restauração em uma única transação com lock. Destino ocupado ou erro de execução reprovam a operação. A ferramenta não cria, limpa ou substitui automaticamente bancos existentes. A entrada é um backup de origem confiável; SHA-256 verifica integridade, não autenticidade de um arquivo desconhecido.

O backup atual cobre um único banco. Roles globais, tablespaces, PITR/WAL, criptografia externa, retenção, agendamento e replicação permanecem fora dessa implementação. Os clientes usam timeout de conexão de 5 segundos, lock de 5 segundos, instrução de 60 segundos e processo de operação de 120 segundos. Operações maiores exigem revisão desses limites antes de uso. O responsável define uma janela operacional para rollback e confirma dados/schema restaurados antes de usar um destino recuperado.

## Validação real e CI

`make dbIntegration` executa casos sequenciais em container descartável, sem portas no host, com credenciais fictícias aleatórias e armazenamento temporário. Testes de Compose usam projeto, container, volume e porta exclusivos. A limpeza remove somente recursos da execução.

A suíte fica em [backend/test/integration/databaseOperations.py](../backend/test/integration/databaseOperations.py), como integração de infraestrutura do backend. `make integration` executa essa suíte antes de validar os pré-requisitos da API. O GitHub Actions publica somente `artifacts/database-integration.json`, sem dumps, credenciais ou corpos HTTP. A ausência do backend continua reprovando o job completo e o gate.

Casos exercitados: criação/repetição de schema, consulta de histórico, seed idempotente, preservação de dados externos, alteração incremental e reversão com dados preservados, recusa de plano destrutivo, reaplicação, checksum de migration alterada, DDL parcialmente executado, backup custom real e permissões, backup incompatível/corrompido, restauração de dados/estrutura/precisão/relações, zeros iniciais, destino ocupado, confirmações/ambientes inválidos, serialização concorrente, falha de conexão, reversão inicial vazia e persistência após parada/reinício do Compose. A execução local aprovou 57 verificações PostgreSQL. `make pipelineCheck` aprovou 67 verificações das esteiras; são conjuntos diferentes. O resultado JSON informa os cenários efetivamente aprovados.
