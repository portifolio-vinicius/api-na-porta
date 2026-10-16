# Fluxo de desenvolvimento e orchestrator

Este documento define o processo futuro. Não cria repositório, branches, agentes nem automações nesta etapa.

## Branches

```text
master                         Código aprovado para produção
  └── develop                  Integração contínua das funcionalidades
        ├── feature/123-criar-pedido
        ├── feature/124-filtros-pedidos
        ├── feature/125-cache-arquivos
        └── fix/126-periodo-invertido

feature/* ou fix/* → PR para develop → PR de develop para master
```

Feature folders definem a organização de código dentro de cada componente, conforme `04-arquitetura-e-dados.md`. São independentes das branches `feature/*`. A branch `feature/124-filtros-pedidos` é apenas um exemplo de funcionalidade de filtros.

Na implementação, o orchestrator cria `master` com a base inicial e `develop` a partir dela caso ainda não existam. Não renomear branches de um repositório existente sem avaliar seu histórico. Cada tarefa parte de `origin/develop` atualizado e usa ticket e descrição curtos.

Sem commits diretos em `master` ou `develop`. Proteção obrigatória: PR, revisão, branch atualizada e checks GitHub Actions aprovados, conforme `09-ci-e-seguranca.md`. YAML sozinho não bloqueia merge: configurar ruleset/proteção no GitHub. Se indisponível, registrar o impedimento antes de considerar o gate operacional. Correções urgentes também partem de `develop`; não há fluxo paralelo de hotfix previsto.

## Coordenação assíncrona

O orchestrator é o coordenador do trabalho, não um serviço de runtime. É responsável por:

1. Ler requisitos e decompor cada entrega em tarefas pequenas, com dependências, aceite e responsável.
2. Definir contratos compartilhados antes de delegar API, infraestrutura ou banco.
3. Registrar cada tarefa em `docs/tasks/<ticket>.md` quando o desenvolvimento começar: branch, base, responsável, arquivos sob responsabilidade, dependências, status, validação e PR.
4. Delegar tarefas independentes a agentes/trabalhadores em branches e worktrees isolados; limitar escrita simultânea no mesmo arquivo.
5. Manter um único responsável por schema, lockfile e arquivos compartilhados; revisar propostas dos demais antes de integrá-las.
6. Receber resultados sem bloquear tarefas independentes, avaliar diffs, conciliar contratos e organizar a ordem dos PRs.
7. Integrar em `develop` somente após os checks e validar novamente o conjunto integrado.
8. Preparar a promoção de `develop` para `master`, incluindo migrations, README e evidências de integração do backend.

O orchestrator aplica o contexto mínimo, a seleção por impacto e os registros de uso definidos em `10-eficiencia-e-documentacao.md`.

Estados: `planejada → em andamento → em revisão → integrada`; bloqueio registra motivo e dependência, sem impedir trabalho independente. Nenhum agente promove seu próprio trabalho para produção sem revisão do orchestrator.

## Caminho de uma tarefa

- Criação: script de tarefa confere árvore limpa, atualiza referências, valida nome, cria branch de `origin/develop` e worktree isolado.
- Desenvolvimento: alteração limitada ao escopo; ajustes de requisito são registrados antes de mudar contratos.
- Validação: `make preMerge TARGET=develop` chama os scripts de fluxo, checks estáticos, segurança e integração. O PR executa novamente os gates no GitHub Actions; validação local não substitui CI.
- Integração: PR para `develop`, revisão, checks obrigatórios de segurança e integração aprovados no commit candidato atual e resolução de conflitos pelo responsável; validar o resultado combinado.
- Produção: PR `develop → master`, checks completos e revisão da compatibilidade de migrations. Merge aprova uma versão candidata; deploy será etapa explícita posterior.

Os scripts não fazem merge, push forçado, reset destrutivo nem deploy automático. A validação da promoção deve comprovar que o commit de `master` é ancestral da versão candidata em `develop`, evitando perda de alterações. Após promoção, reconciliar `develop` com `master` sem reescrever histórico compartilhado.
