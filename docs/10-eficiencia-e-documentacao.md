# Esteira de tarefas eficiente e documentação incremental

Implementação parcial: plano conservador, checks documentais e agregação de relatórios estão disponíveis; [estado executável](13-esteiras-executaveis.md). Seleção incremental avançada permanece futura. O objetivo é reduzir retrabalho, contexto enviado ao modelo, duração da CI e custo por tarefa aceita, preservando segurança e qualidade. Não há promessa de economia numérica sem medição. A CI normal não depende de LLM nem de chave de provedor.

## Fluxo coordenado

```text
Solicitação → orchestrator → análise do diff e dependências
  → tarefa pequena com aceite e contexto mínimo
  → execução em branch/worktree isolado
  → scripts de qualidade, segurança e integração
  → métricas das rotas coletadas na mesma integração
  → geração determinística dos relatórios e validação documental
  → revisão do diff pelo orchestrator → PR → gates → develop
```

O protocolo de branches permanece no documento 06 e os gates no 09. Este documento adiciona a seleção de trabalho e a atualização documental; não cria um segundo fluxo de merge.

## Seleção por impacto

O script implementado `scripts/tasks/plan.sh` calcula arquivos alterados contra o merge-base da branch alvo e produz plano estruturado. Usa `--no-renames`, representando renomeação como remoção e inclusão. Sempre seleciona o conjunto completo; classificação por feature e seleção incremental da tabela abaixo são evoluções planejadas. Base indisponível ou impacto desconhecido exige análise completa, nunca plano vazio aprovado.

| Mudança | Trabalho adicional ao mínimo obrigatório |
| --- | --- |
| Documentação | Validar links, referências, requisitos e nomenclatura; não reescrever documentos não afetados |
| Feature de pedidos | Atualizar contrato/regras afetados e relatório das operações alteradas |
| Auth, validação ou contrato público | Verificar consumidores e todos os cenários HTTP impactados |
| Schema, cache, pools ou infraestrutura | Integração escalada/replicação e revisão de configuração/operação |
| CI, scripts ou mapa de impacto | Validar o próprio plano e executar conjunto completo |

Segurança mínima, qualidade e integração mínima do documento 08 continuam obrigatórias em todo PR para develop, inclusive documental. A seleção por impacto reduz leitura pelo agente e trabalho suplementar; não omite gates nem troca resultado atual por resultado de outro commit. Reutilizar downloads/builds somente com chave compatível; auditorias de segurança rodam novamente, pois bases de vulnerabilidades mudam.

## Orchestrator e consumo de tokens

- Uma tarefa possui objetivo, critério de aceite, responsável, arquivos autorizados, dependências e comando de validação. Evitar delegar novamente uma investigação já concluída.
- Ler primeiro índice, instruções aplicáveis, diff e trechos relevantes via busca; ampliar contexto somente quando uma dependência exigir. Não enviar o repositório ou histórico completo por padrão.
- Separar tarefas independentes apenas quando houver benefício; cada agente recebe um resumo específico. Trabalho paralelo tem custo agregado e não garante economia de tokens.
- Reutilizar resultados com referência ao commit, arquivos e hash de entrada. Invalidar resumo/decisão se sua fonte mudou; não reutilizar resultado desatualizado para aprovar código.
- Scripts fazem inventário, validação, cálculos, tabelas e geração de relatórios. Modelo atua em ambiguidade, decisões, implementação e revisão semântica, somente no escopo autorizado.
- Saídas para o agente são curtas: arquivos afetados, resultado, erros e caminho do relatório. Logs completos ficam em artefatos; em falha, ler trecho causal antes de ampliar. Não truncar informação necessária para corrigir a falha.
- Encerrar a tarefa quando o aceite estiver comprovado. Não repetir checks aprovados sem novo diff, falha ou dúvida; a CI remota continua validando seu próprio candidato.

Registro futuro por tarefa: commit/base, duração, chamadas, agentes, tentativas, reaberturas e tokens de entrada/saída/cache quando a plataforma os fornecer. Ausência de contagem aparece como `indisponível`, nunca zero. Custo monetário só com uso e preços efetivamente conhecidos. Medir tokens por tarefa aceita e retrabalho; menor uso com tarefa incompleta não é ganho de eficiência. Limites de contexto e chamadas são configuráveis por tarefa, com replanejamento se o orçamento for insuficiente.

## Atualização da documentação

Fontes únicas: contrato HTTP na feature da API, requisitos/regras nos documentos 02/03, decisões de arquitetura no 04 e amostras de integração nos artefatos de execução. Documentação conceitual é editada pelo responsável; conteúdo calculado é gerado por scripts, sem LLM.

Estado atual: `scripts/docs/update.sh` gera relatório de execução e chama o check; `scripts/docs/check.sh` verifica existência dos destinos de links locais e correspondência contrato/inventário. Não verifica conteúdo remoto, âncoras, todas as regras semânticas ou camelCase, nem reescreve texto manual. O plano de impacto não é consumido pelo atualizador. Requisitos adicionais para evolução desses scripts:

1. Receber plano de impacto, commit e relatórios estruturados; validar schema, origem e integridade.
2. Atualizar somente seções/tabelas afetadas; preservar texto manual e evitar alterações de formatação em arquivos não relacionados.
3. Ordenar resultados por método, template de rota, cenário e status; usar gerador/versionamento fixos e não regravar conteúdo idêntico. Data de execução e run ID pertencem ao relatório de execução, não a arquivos estáticos sem mudança.
4. Validar links, referências, camelCase, consistência dos contratos e cobertura de todas as rotas. Alteração semântica exige nota do responsável; scanner de diff não comprova sozinho qualidade do texto.
5. Emitir resumo e patch revisável. Conteúdo divergente falha o check quando deveria estar versionado; dados de performance aparecem em artefato/Job Summary para evitar commits a cada variação de latência.

PR que cria/remove/altera rota atualiza o inventário e seu contrato. Não gerar métricas ausentes nem reutilizar baseline como medição atual. Em PRs externos, produzir artefato/patch sem token de escrita. Não fazer commit, push ou abrir PR automaticamente; o responsável aplica e revisa a atualização na branch da tarefa.

## Make implementado

| Alvo | Responsabilidade |
| --- | --- |
| `make taskPlan TARGET=develop` | Gerar diff e plano conservador completo com scripts determinísticos |
| `make docsUpdate` | Gerar relatório de execução e validar documentação manual |
| `make docsCheck` | Conferir consistência documental sem modificar arquivos |
| `make routeReport` | Agregar amostras já coletadas na integração; não disparar suíte de carga |

`make ci` e `make preMerge` incorporam plano, checks existentes, integração instrumentada, relatório e docsCheck. `docsUpdate` é ação local explícita. Na CI, geração ocorre em diretório temporário e a comparação não modifica a branch.
