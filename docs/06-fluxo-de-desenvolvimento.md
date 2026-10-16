# Fluxo de desenvolvimento e orchestrator

O repositório está publicado com `master` como branch padrão e `develop` como base de trabalho. Ambas têm proteção ativa no GitHub, descrita no [documento 09](09-ci-e-seguranca.md). Worktrees e validação do fluxo foram testados; a criação automática via `startTask` permanece pendente. Evidências em [14 — Publicação e proteção](14-publicacao-e-protecao.md).

## Branches

```text
master                         Destino das versões aprovadas; base inicial ainda sem API
  └── develop                  Integração contínua das funcionalidades
        ├── feature/123-criar-pedido
        ├── feature/124-filtros-pedidos
        ├── feature/125-cache-arquivos
        └── fix/126-periodo-invertido

feature/* ou fix/* → PR para develop → PR de develop para master
```

Feature folders definem a organização de código dentro de cada componente, conforme `04-arquitetura-e-dados.md`. São independentes das branches `feature/*`. A branch `feature/124-filtros-pedidos` é apenas um exemplo de funcionalidade de filtros.

A publicação inicial criou `master` e `develop` no commit `763efbd`. Essa base contém documentação e esteiras, sem aplicação ou release produtiva aprovada. Cada nova tarefa parte de `origin/develop` atualizado e usa ticket e descrição curtos; não recriar as branches protegidas.

Sem commits ou push diretos em `master` ou `develop`. O ruleset ativo exige PR, merge commit, branch atualizada e gate aprovado; bloqueia force push e exclusão, sem bypass. Revisão humana faz parte do processo, mas o GitHub está configurado com zero aprovações obrigatórias; detalhes no [documento 09](09-ci-e-seguranca.md). A publicação inicial antecedeu a ativação das regras; as alterações seguintes devem passar por PR. Correções urgentes também partem de `develop`; não há fluxo paralelo de hotfix previsto.

## Criar tarefa com worktree

Na raiz, com nome de tarefa e diretório ainda não utilizados:

```sh
git status --short
git fetch origin
git worktree add -b fix/002-documentar-protecoes ../naporta-fix-002 origin/develop
cd ../naporta-fix-002
make validateFlow TARGET=develop
```

O número e a descrição são exemplos; usar um ticket novo para outra tarefa. Se `git status --short` mostrar mudanças antes da criação, resolver essas mudanças primeiro. Desenvolver e commitar somente na branch da tarefa. Depois de `make preMerge TARGET=develop` aprovado, publicar a branch e abrir PR para develop. Enquanto o backend não existir, o pré-merge reprova; um PR em rascunho pode registrar trabalho e diagnóstico, sem autorizar integração.

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

- Criação atual: conferir árvore limpa, executar `git fetch origin` e criar branch/worktree de `origin/develop` pelos comandos abaixo. O script `startTask` ainda não existe.
- Desenvolvimento: alteração limitada ao escopo; ajustes de requisito são registrados antes de mudar contratos.
- Validação: `make preMerge TARGET=develop` chama os scripts de fluxo, checks estáticos, segurança e integração. O PR executa novamente os gates no GitHub Actions; validação local não substitui CI.
- Integração: PR para `develop`, revisão, checks obrigatórios de segurança e integração aprovados no commit candidato atual e resolução de conflitos pelo responsável; validar o resultado combinado.
- Produção: PR `develop → master`, checks completos e revisão da compatibilidade de migrations. Merge aprova uma versão candidata; deploy será etapa explícita posterior.

Os scripts não fazem merge, push forçado, reset destrutivo nem deploy automático. A validação da promoção deve comprovar que o commit de `master` é ancestral da versão candidata em `develop`, evitando perda de alterações. Após promoção, reconciliar `develop` com `master` sem reescrever histórico compartilhado.
