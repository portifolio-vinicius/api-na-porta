# CI/CD, segurança e merge

O workflow `.github/workflows/backend-ci.yml` e os scripts de validação estão implementados, conforme [13 — Esteiras executáveis](13-esteiras-executaveis.md). O repositório está publicado e as execuções remotas e proteções de master/develop foram verificadas em 2026-10-16; evidências no [documento 14](14-publicacao-e-protecao.md). CI valida e produz artefatos; publicação/deploy fica para etapa explícita, sem destino produtivo presumido.

## Eventos e bloqueio

Workflow `.github/workflows/backend-ci.yml`: `pull_request` para develop e master em abertura, atualização e reabertura; `push` para develop/master para validar resultado integrado; execução manual para diagnóstico. O evento `ready_for_review` também executa o workflow. Todo novo commit exige checks do candidato atual. O evento `merge_group` já está declarado; merge queue não está ativada no ruleset.

Ruleset ativo [master-develop-apenas-pull-requests](https://github.com/portifolio-vinicius/api-na-porta/rules/25253537), ID `25253537`, aplicado exatamente a `refs/heads/master` e `refs/heads/develop`:

| Configuração efetiva | Valor |
| --- | --- |
| Enforcement | `active` |
| Alterações | Somente por Pull Request |
| Método de merge permitido | `merge`; squash e rebase não permitidos nessas branches |
| Check obrigatório | `backend-merge-gate`, emitido pelo GitHub Actions (App ID `15368`) |
| Base atualizada | Obrigatória antes do merge |
| Force push e exclusão | Bloqueados |
| Bypass | Lista vazia; administradores também estão sujeitos às regras |
| Aprovações obrigatórias | `0`; revisão humana continua prevista no processo, sem exigência automática de aprovação |
| CODEOWNERS e resolução de conversas | Não exigidos pelo ruleset atual |

As regras permitem trabalhar e commitar em features/fixes, mas impedem enviar esses commits diretamente às branches protegidas. Alterações devem entrar pelo merge do PR com o gate aprovado. Workflow não substitui proteção de branch. A configuração remota deve ser consultada novamente após qualquer alteração administrativa. Checks devem corresponder à versão candidata atual, incluindo mudanças da base. [Referência GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

Job obrigatório `backend-merge-gate` agrega resultados de jobs com nomes únicos: `backend-quality`, `backend-security`, `backend-integration` e `backend-docs`. O gate roda mesmo com falha anterior e só retorna sucesso se todos os checks exigidos tiverem sucesso efetivo; não aceitar cancelamento, falha, ausência ou skip indevido. Não usar `continue-on-error` nos gates. Evitar filtros por caminho que deixem segurança ou o gate sem executar; PR documental também executa a segurança mínima. Se o perfil escalado for exigido pelo escopo, sua falha bloqueia o gate.

O ruleset atual não restringe a branch de origem do PR. `feature/fix → develop → master` é o fluxo do projeto, parcialmente conferido por `validateFlow` local; o workflow atual não chama esse validador para impor origem/nomenclatura remotamente. Essa limitação não permite push direto, mas significa que origem incorreta não é rejeitada por uma regra específica no GitHub.

## Etapas mínimas

| Job | Make/script compartilhado | Critério |
| --- | --- | --- |
| Qualidade | `make check` | Instalação por lockfile, linter, TypeScript strict, build e contratos aprovados |
| Segurança | `make security` | Todos os scanners mínimos executados e sem achados bloqueadores |
| Integração | `make integration` | JWT, pedidos, banco real, cache real e casos relevantes do documento 08 aprovados |
| Documentação | `make routeReport` e `make docsCheck` | Relatório válido, inventário atualizado e documentação consistente |
| Gate | Agregar resultados | Todos os jobs exigidos aprovados no candidato atual |

Jobs independentes podem executar em paralelo com ambientes isolados; o gate depende de todos. Timeout e cancelamento de execução antiga por PR limitam custo, mas execução cancelada não aprova merge. Runner efêmero não recebe segredos produtivos.

## Eficiência e atualização documental

Aplicar o documento 10 para contexto mínimo, plano de impacto e geração determinística. Mínimos obrigatórios continuam executados; não reduzir segurança para economizar tokens ou tempo. Não há chamada de LLM no caminho normal da CI.

`make integration` primeiro valida as operações PostgreSQL reais e publica um resultado técnico sanitizado. Quando a suíte HTTP do backend existir, deverá coletar métricas de rota na própria execução; essa coleta ainda não está implementada. Job `backend-docs` agrega artefatos e valida contrato/inventário conforme documento 11; depende dos dados da integração, sem disparar testes novamente. Em falha, manter gate reprovado. O agregador escreve diagnóstico incompleto quando o diretório de métricas existe; se o diretório também estiver ausente, pode não haver artefato de diagnóstico para publicar. Job Summary apresenta síntese; detalhes ficam em artefatos sanitizados. Não fazer commit/push automático da documentação a cada run.

## Scripts mínimos de segurança

`make security` delega a `scripts/security/check.sh`, que coordena:

| Script implementado | Verificação | Bloqueio |
| --- | --- | --- |
| `scripts/security/dependencies.sh` | Auditoria de dependências pelo lockfile, inclusive desenvolvimento; npm audit | Vulnerabilidades high/critical; demais são relatadas para triagem |
| `scripts/security/secrets.sh` | Detecção de segredos no conteúdo e commits do PR; Gitleaks | Qualquer segredo confirmado; falso positivo somente com justificativa específica revisada |
| `scripts/security/source.sh` | SAST TypeScript com regras de segurança versionadas; Semgrep com regras iniciais locais | Achados de severidade alta/crítica segundo política mapeada da ferramenta |
| `scripts/security/container.sh` | Scan do Dockerfile e da imagem construída; Trivy | Vulnerabilidades high/critical e configurações inseguras bloqueadoras |

O scanner de segredos monta também o diretório Git comum em leitura para consultar o histórico de linked worktrees. Scanners estão fixados por versão e digest nos scripts, regras SAST estão versionadas e actions usam SHA. Scanner indisponível, relatório ausente, erro de execução ou download não vira sucesso. Não aplicar correções automáticas irrestritas nem ignorar arquivos/dependências inteiras para passar. Exceção de risco somente se explícita, revisada, com responsável, motivo e expiração; nenhuma exceção é presumida por este plano.

Scanners estáticos/de dependências não são suítes de testes funcionais adicionais. Testes de autenticação, validação, erros sanitizados e cache continuam na integração do backend.

## Segurança da própria esteira

Permissões mínimas, padrão `contents: read`; actions fixadas por SHA de commit revisado. PR externo roda sem segredos reais. Não executar código do PR com permissões privilegiadas via `pull_request_target`; não interpolar título/branch/corpo de PR diretamente em shell. Usar argumentos/variáveis tratados e runners efêmeros. Relatórios sanitizados e retenção limitada; não publicar `.env`, diretórios do cache da aplicação, dumps ou JWT. Cache de dependências usa lockfile/escopo e não compartilha segredos. [Referência GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use).

## Make e entrega

Fluxo implementado, condicionado aos pré-requisitos do backend: `make preMerge TARGET=develop` → push da branch → PR → GitHub Actions → revisão → merge autorizado. Make prepara e valida; não substitui aprovação remota nem realiza merge automaticamente. Nesta entrega só há backend; não há job de frontend vazio ou aprovado artificialmente.

Para master, o mesmo fluxo executa integração completa e constrói imagem identificada pelo commit, sem embutir segredos. Publicação de imagem, ambiente de homologação e deploy exigem destino e política definidos na fase de implementação/entrega. Não considerar merge como deploy executado.
