# Verificação das esteiras

Registro histórico anterior à implementação. O estado posterior e novas evidências estão em [13 — Esteiras executáveis](13-esteiras-executaveis.md).

Verificação local realizada em 2026-10-16. Os comandos abaixo foram executados sequencialmente, um por vez, na raiz do projeto.

## Resultados observados

| Ordem | Comando executado | Código de saída | Resultado |
| --- | --- | --- | --- |
| 1 | `make check` | 2 | Alvo `check` inexistente |
| 2 | `make security` | 2 | Alvo `security` inexistente |
| 3 | `make integration` | 2 | Alvo `integration` inexistente |
| 4 | `make routeReport` | 2 | Alvo `routeReport` inexistente |
| 5 | `make docsCheck` | 2 | Alvo `docsCheck` inexistente |
| 6 | `make ci` | 2 | Alvo `ci` inexistente |
| 7 | `make preMerge TARGET=develop` | 2 | Alvo `preMerge` inexistente |

Todos retornaram `make: *** No rule to make target '<alvo>'. Stop.` Não há Makefile, diretório `scripts/`, `.github/` ou `package.json` na raiz. Os componentes backend e database contêm apenas suas instruções `ag.md`. `git remote -v` não retornou remotos configurados; a branch local indicada foi `main`.

**Conclusão:** nenhuma esteira está operacional neste checkout. A execução foi interrompida antes de qualquer linter, scanner, integração ou agregação de resultados. O código não zero observado é falha de preparação do projeto; não comprova que os gates previstos propagam falhas corretamente. Não houve execução remota de GitHub Actions nem verificação de proteção de branches.

## Cenários pendentes de execução

Depois da implementação, executar cada esteira isoladamente em ambiente descartável, primeiro com entrada válida e depois com falha controlada. Restaurar a condição válida antes de passar à próxima.

| Esteira | Funcionamento esperado | Falha a provocar e verificar |
| --- | --- | --- |
| Qualidade | Linter, TypeScript e build aprovados | Erro de lint, tipo ou build faz o alvo falhar |
| Segurança | Todos os scanners executam e geram relatórios válidos | Achado bloqueador, scanner indisponível ou relatório ausente faz o alvo falhar; usar fixtures sintéticas, sem segredos reais |
| Integração | Casos obrigatórios passam com banco e cache reais isolados | Asserção obrigatória reprovada ou banco indisponível faz o alvo falhar; falha opcional do cache mantém consulta ao banco conforme contrato |
| Métricas | Agrega os dados da integração sem repetir testes | Artefato ausente, inválido ou cobertura incompleta impede aprovação |
| Documentação | Links, contratos e inventário consistentes | Link quebrado ou divergência obrigatória faz o alvo falhar |
| CI local | Todas as etapas exigidas aprovadas | Falha em qualquer etapa chega ao código de saída do coordenador |
| Pré-merge | Fluxo Git válido e CI aprovada | Origem/destino inválidos ou CI reprovada impedem aprovação |
| Gate remoto | Todos os jobs exigidos aprovados no candidato atual | Falha, cancelamento, ausência ou skip indevido impedem aprovação do gate e merge pela proteção configurada |

Esses cenários estão **não executados**. Os contratos aplicáveis permanecem nos documentos [07](07-scripts-e-ambiente.md), [08](08-validacao.md), [09](09-ci-e-seguranca.md) e [11](11-performance-das-rotas.md).
