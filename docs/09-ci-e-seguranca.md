# CI/CD, segurança e merge

O workflow `.github/workflows/backend-ci.yml` e os scripts de validação estão implementados, conforme [13 — Esteiras executáveis](13-esteiras-executaveis.md). Não há execução remota nem proteção de branches verificada; o repositório local não tem remoto configurado. CI valida e produz artefatos; publicação/deploy fica para etapa explícita, sem destino produtivo presumido.

## Eventos e bloqueio

Workflow `.github/workflows/backend-ci.yml`: `pull_request` para develop e master em abertura, atualização e reabertura; `push` para develop/master para validar resultado integrado; execução manual para diagnóstico. Todo novo commit invalida a aprovação dos checks anteriores. Se merge queue for adotada, incluir `merge_group` e validar o candidato gerado.

Ruleset/proteção em develop/master: exigir PR, revisão, branch atualizada ou merge queue, checks obrigatórios e impedir push direto/force push/bypass. Workflow não substitui proteção de branch. Checks devem corresponder à versão candidata atual, incluindo mudanças da base. [Referência GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).

Job obrigatório `backend-merge-gate` agrega resultados de jobs com nomes únicos: `backend-quality`, `backend-security`, `backend-integration` e `backend-docs`. O gate roda mesmo com falha anterior e só retorna sucesso se todos os checks exigidos tiverem sucesso efetivo; não aceitar cancelamento, falha, ausência ou skip indevido. Não usar `continue-on-error` nos gates. Evitar filtros por caminho que deixem segurança ou o gate sem executar; PR documental também executa a segurança mínima. Se o perfil escalado for exigido pelo escopo, sua falha bloqueia o gate.

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

Integração coleta métricas de rota na própria execução. Job `backend-docs` agrega artefatos e valida contrato/inventário conforme documento 11; depende dos dados da integração, sem disparar testes novamente. Em falha, publicar diagnóstico incompleto e manter gate reprovado. Job Summary apresenta síntese; detalhes ficam em artefatos sanitizados. Não fazer commit/push automático da documentação a cada run.

## Scripts mínimos de segurança

`make security` delega a `scripts/security/check.sh`, que coordena:

| Script futuro | Verificação proposta | Bloqueio |
| --- | --- | --- |
| `scripts/security/dependencies.sh` | Auditoria de dependências pelo lockfile, inclusive desenvolvimento; proposta npm audit | Vulnerabilidades high/critical; demais são relatadas para triagem |
| `scripts/security/secrets.sh` | Detecção de segredos no conteúdo e commits do PR; proposta Gitleaks | Qualquer segredo confirmado; falso positivo somente com justificativa específica revisada |
| `scripts/security/source.sh` | SAST TypeScript com regras de segurança versionadas; proposta Semgrep | Achados de severidade alta/crítica segundo política mapeada da ferramenta |
| `scripts/security/container.sh` | Scan do Dockerfile e da imagem construída; proposta Trivy | Vulnerabilidades high/critical e configurações inseguras bloqueadoras |

Scanners estão fixados por versão e digest nos scripts, regras SAST estão versionadas e actions usam SHA. Scanner indisponível, relatório ausente, erro de execução ou download não vira sucesso. Não aplicar correções automáticas irrestritas nem ignorar arquivos/dependências inteiras para passar. Exceção de risco somente se explícita, revisada, com responsável, motivo e expiração; nenhuma exceção é presumida por este plano.

Scanners estáticos/de dependências não são suítes de testes funcionais adicionais. Testes de autenticação, validação, erros sanitizados e cache continuam na integração do backend.

## Segurança da própria esteira

Permissões mínimas, padrão `contents: read`; actions fixadas por SHA de commit revisado. PR externo roda sem segredos reais. Não executar código do PR com permissões privilegiadas via `pull_request_target`; não interpolar título/branch/corpo de PR diretamente em shell. Usar argumentos/variáveis tratados e runners efêmeros. Relatórios sanitizados e retenção limitada; não publicar `.env`, diretórios do cache da aplicação, dumps ou JWT. Cache de dependências usa lockfile/escopo e não compartilha segredos. [Referência GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use).

## Make e entrega

Fluxo local futuro: `make preMerge TARGET=develop` → push da branch → PR → GitHub Actions → revisão → merge autorizado. Make prepara e valida; não substitui aprovação remota nem realiza merge automaticamente. Nesta entrega só há backend; não há job de frontend vazio ou aprovado artificialmente.

Para master, o mesmo fluxo executa integração completa e constrói imagem identificada pelo commit, sem embutir segredos. Publicação de imagem, ambiente de homologação e deploy exigem destino e política definidos na fase de implementação/entrega. Não considerar merge como deploy executado.
