# Publicação e verificação das proteções

Registro da publicação e proteção anterior à implementação dos scripts de banco. O estado posterior de PostgreSQL está no [documento 15](15-postgresql-operacoes.md). Estado verificado em 2026-10-16 no [repositório api-na-porta](https://github.com/portifolio-vinicius/api-na-porta). Configuração efetiva das regras no [documento 09](09-ci-e-seguranca.md); procedimento de trabalho no [documento 06](06-fluxo-de-desenvolvimento.md). Os documentos 12 e a seção histórica do 13 descrevem etapas anteriores, sem substituir este registro posterior.

## Publicação

- Remoto `origin`: `https://github.com/portifolio-vinicius/api-na-porta.git`.
- Branch padrão: `master`; `develop` criada a partir da mesma base.
- Commit inicial publicado nas duas branches: [`763efbd`](https://github.com/portifolio-vinicius/api-na-porta/commit/763efbd00e53ed1e5b14515df79bf5f0862f0ca9).
- A publicação inicial ocorreu antes da ativação do ruleset. Esse bootstrap não constitui uma aplicação aprovada para produção nem autoriza novos pushes diretos.

## Execuções reais do GitHub Actions

| Evidência | Resultado observado |
| --- | --- |
| [CI de master](https://github.com/portifolio-vinicius/api-na-porta/actions/runs/38932449901) | Concluída com falha |
| [CI de develop](https://github.com/portifolio-vinicius/api-na-porta/actions/runs/38932504418) | Concluída com falha |
| `make pipelineCheck` no runner de master | 58 verificações aprovadas, incluindo fixtures de Git/worktree |
| `make docsCheck` no runner de master | Aprovado na versão inicial publicada |
| Gitleaks no runner de master | Arquivos e histórico aprovados, sem segredos detectados |
| Qualidade e integração | Reprovadas por ausência de `backend/package.json` e lockfile |
| Outros scanners | Auditoria sem lockfile; SAST sem `backend/src`; scan de container sem `backend/Dockerfile` |
| Documentação/observabilidade | Job reprovado por ausência das métricas de integração; não significa que o check de links falhou |
| `backend-merge-gate` | Reprovado pelas falhas dos jobs obrigatórios |

Não há confirmação de build, integração funcional, aprovação de merge ou deploy. A CI mantém a reprovação enquanto os pré-requisitos não forem implementados. Um PR somente documental também executa os gates e, no estado atual, permanece impedido de merge.

## Fluxo com worktrees e remoto real

Foram realizadas 17 verificações no checkout publicado, usando `origin/develop` real. Passaram: criação da feature em worktree; validação da feature limpa para develop; isolamento de arquivos; bloqueio de árvore suja; bloqueio de feature para master; bloqueio de destino inválido; documentação do checkout; plano com merge-base real; as 58 verificações das esteiras; reprovação do pré-merge por CI inválida; criação do worktree de develop; validação de develop para master; bloqueio de develop para develop; remoção dos dois worktrees; remoção da feature temporária sem commits exclusivos; preservação de master e árvore limpa.

O pré-merge reprovado é um teste de bloqueio aprovado, não uma CI aprovada. As 17 verificações incluem a execução do conjunto de 58; não são 75 cenários independentes. Elas usaram comandos Git manuais, pois `startTask` não existe. O registro JSON local foi gravado em `artifacts/development-flow-results.json`, ignorado pelo Git; sua disponibilidade depende do checkout original.

## Proteção remota exercitada

O ruleset `25253537` foi ativado após a publicação inicial, com enforcement `active` e lista de bypass vazia. As consultas às branches passaram a indicar `protected: true` em master e develop.

Foi criado um commit vazio de teste, sem trocar a branch local nem alterar arquivos. Tentativas reais de push desse commit para master e develop foram rejeitadas pelo GitHub com `GH013`, incluindo as mensagens:

```text
Changes must be made through a pull request.
Required status check "backend-merge-gate" is expected.
```

Os hashes remotos foram comparados antes/depois e permaneceram iguais. O usuário autenticado tinha permissão administrativa; a rejeição comprova que ele também não tinha bypass. O registro JSON local está em `artifacts/branch-protection-results.json`, ignorado pelo Git.

Bloqueio de force push, exclusão e método de merge foi confirmado pela configuração remota, sem tentar excluir ou reescrever branches. Não houve teste de merge bem-sucedido de PR, porque o gate atual está reprovado.

## Pendências no momento desse registro histórico

- Backend, schema, migrations, Compose e instrumentação HTTP não implementados.
- Rollback de estrutura, backup e restauração não implementados nem validados com dados reais.
- `startTask` e recuperação de falhas na criação de worktree não implementados.
- Revisão humana prevista no processo, mas zero aprovações exigidas pelo ruleset atual.
- Origem do PR e nomenclatura da tarefa conferidas pelo fluxo local; sem job remoto específico que imponha esses requisitos.
- Teste de integração/merge aprovado e deploy pendentes; não flexibilizar o gate para aprovar sua ausência.
