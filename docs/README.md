# Índice da documentação

| Documento | Fonte principal para |
| --- | --- |
| [01 — Escopo e premissas](01-escopo-e-premissas.md) | Origem, prioridades, decisões propostas e dúvidas |
| [02 — Requisitos](02-requisitos.md) | Requisitos funcionais e não funcionais identificados |
| [03 — Regras de negócio](03-regras-de-negocio.md) | Comportamentos e critérios do domínio |
| [04 — Arquitetura e dados](04-arquitetura-e-dados.md) | Separação dos componentes, feature folders, tipos, identificadores e replicação |
| [05 — API](05-api.md) | Contratos REST e autenticação JWT |
| [06 — Fluxo de desenvolvimento](06-fluxo-de-desenvolvimento.md) | Várias funcionalidades em worktrees paralelos e integração em develop |
| [07 — Scripts e ambiente](07-scripts-e-ambiente.md) | Contratos dos scripts, Docker Compose, seed e replicação do banco |
| [08 — Validação](08-validacao.md) | Integração no backend e critérios de aceite |
| [09 — CI e segurança](09-ci-e-seguranca.md) | GitHub Actions, scanners e bloqueio de merge |
| [10 — Eficiência e documentação](10-eficiencia-e-documentacao.md) | Contexto mínimo, consumo de tokens e atualização incremental |
| [11 — Performance das rotas](11-performance-das-rotas.md) | Coleta de latência, status HTTP, bytes e relatórios |
| [Análise de latência](performance/latencia-016.md) | Evidências de volume, planos SQL e prioridades de otimização |
| [Latência da listagem](performance/latencia-017.md) | Índices, cache de arquivos e leituras repetidas da listagem |
| [Inventário de rotas](performance/rotas.md) | Estado de medição e baseline por endpoint |
| [12 — Verificação das esteiras](12-verificacao-das-esteiras.md) | Execução sequencial dos comandos, bloqueios observados e cenários pendentes |
| [13 — Esteiras executáveis](13-esteiras-executaveis.md) | Comandos implementados, contrato de métricas, evidências e bloqueios atuais |
| [14 — Publicação e proteção](14-publicacao-e-protecao.md) | Estado publicado, CI remota, testes de worktree e rejeição de push direto |
| [15 — Operações PostgreSQL](15-postgresql-operacoes.md) | Configuração, migrations, seed, rollback, backup, restauração e integração real |
| [18 — Volume da API](18-volume-api.md) | Dados sintéticos em escala, concorrência, latências, erros e limites da medição local |
| [17 — Replicação PostgreSQL](17-replicacao.md) | Primário/standby isolados, propagação, lag e operação sem promoção automática |
| [16 — Infraestrutura e acessos](16-infraestrutura-e-acessos.md) | Nginx HTTPS, réplicas Swarm e permissões PostgreSQL |

## Convenções

`OBRIGATÓRIO` identifica exigência expressa no desafio ou nas instruções do usuário. `PROPOSTO` identifica uma decisão de projeto adicionada para tornar o planejamento concreto. `A CONFIRMAR` identifica informação ambígua ou ausente. Propostas não representam funcionalidades já implementadas.

Os requisitos ficam no documento 02, as regras no 03, os contratos no 05 e o fluxo de branches no 06. Os arquivos `AGENTS.md` apenas orientam a execução e apontam para essas fontes.

## Por onde começar

- Executar e entender os limites: [README da raiz](../README.md).
- Consumir a API: [contratos e envelopes](05-api.md).
- Entender implementação e dados: [arquitetura](04-arquitetura-e-dados.md).
- Validar o candidato: [esteiras executáveis](13-esteiras-executaveis.md).
- Consultar tempos históricos: [análise 016](performance/latencia-016.md).

Registros de tarefas e seções históricas comprovam o estado no commit/data informados. Não substituem o código atual nem demonstram aprovação dos gates de uma nova execução.
