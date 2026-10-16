# Replicação PostgreSQL

O perfil [Compose](../database/replication/compose.yml) executa PostgreSQL 18 fixado pelo digest do projeto, em dois volumes separados e uma rede interna sem portas publicadas. Replicação física assíncrona usa usuário dedicado `naporta_replication`, autenticação SCRAM e `pg_basebackup`. Não há promoção automática, sincronismo garantido, slot permanente ou roteamento HTTP neste perfil.

## Operação local, teste e demonstração

Exportar `ENV=local|test|demo`, `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE` conforme o documento 15. Fornecer `PGPASSWORD` e `REPLICATION_PASSWORD` privados, ambos com 24–128 caracteres URL-safe (`A-Z`, `a-z`, `0-9`, `_`, `-`). O projeto Compose deriva de `PGDATABASE` e usa volumes distintos do Compose simples.

```sh
python3 scripts/db/replication.py init
python3 scripts/db/replication.py status
python3 scripts/db/replication.py down
```

`init` espera prontidão por até 120 segundos; comandos têm limite de 180 segundos. Não executar `docker compose config` resolvido em logs. O wrapper sanitiza falhas e não mostra credenciais. Senhas são passadas por ambiente; operadores com acesso ao daemon Docker podem inspecioná-las. O passfile de replicação fica no volume de dados do standby, modo 0600, e não pertence aos artefatos publicados.

A inicialização faz base backup somente em diretório vazio. Volume parcialmente inicializado ou sem `standby.signal` é recusado; não há remoção automática. Reiniciar reutiliza os volumes. `down` preserva todos os dados. Credenciais existentes não são rotacionadas ao mudar variáveis: rotação exige procedimento explícito no banco/passfile.

Migrations e seed executam uma vez no serviço `primary` e são propagados. Para os scripts nativos existentes, usar `DB_CONTAINER` correspondente ao container do serviço `primary` (`docker compose ... ps -q primary`) e conexão interna `PGHOST=127.0.0.1`, `PGPORT=5432`. Autenticação, transações e todas as leituras HTTP permanecem no primário. Este grupo não modifica o roteamento da aplicação.

## Atraso, indisponibilidade e reconstrução

`status` valida papéis e conexão streaming e emite JSON sanitizado: `state`, `syncState` e `lagBytes` calculado no primário. Um `lagBytes` nulo é desconhecido, nunca zero. Ausência de conexão ou papel inesperado reprova o comando. Esse sinal não define sozinho elegibilidade para leitura; não há limite operacional aprovado. Leituras imediatas requerem primário ou barreira de replay do LSN da escrita com timeout/fallback explícitos.

`wal_keep_size=128MB` retém WAL por tamanho; não há slot permanente que possa crescer sem limite durante indisponibilidade. Uma réplica afastada por tempo suficiente pode perder WAL necessário e exigir novo base backup. O script não destrói o volume para reconstruí-la. Parar a réplica não impede escritas no primário; perder o primário impede escritas. A réplica mantém seu papel e dados já reproduzidos. Replicação não substitui backup.

Recuperação: restaurar conectividade e iniciar o mesmo primário; confirmar seus dados, papel e streaming antes de liberar tráfego. Se WAL necessário foi removido, preservar o volume antigo para diagnóstico, criar volume vazio separado e executar base backup novamente. Promoção fica fora da automação: requer isolar o primário antigo, plano de reconexão e decisão de RPO/RTO para evitar dois primários.

## Validação

```sh
python3 backend/test/integration/postgresReplication.py
```

A integração cria projeto/volumes exclusivos, credenciais efêmeras fictícias e remove somente seus próprios recursos ao terminar. Verifica papéis, barreira WAL, propagação, rejeição de escrita no standby, replay pausado e atraso, retomada, disponibilidade do primário sem réplica, recuperação de standby existente e ausência de promoção na perda do primário. O relatório sanitizado fica em `artifacts/replication-integration.json`. Resultado real e limitações da execução ficam na [tarefa 007](tasks/007.md).
