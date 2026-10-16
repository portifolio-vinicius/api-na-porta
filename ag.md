# Instruções gerais

Leia este arquivo, `docs/README.md` e o `ag.md` do componente antes de trabalhar. O nome adotado é `ag.md`; não crie cópias em `agente.md` ou `AGENTS.md`.

- A implementação das esteiras foi autorizada pelo usuário. Mantenha a aplicação e as funcionalidades ainda não implementadas explicitamente identificadas; não aprove gates por ausência de código ou testes.
- Use `docs/` como fonte dos requisitos e decisões. Aqui ficam apenas instruções de trabalho.
- Respeite os limites de `backend/` e `database/`; consulte suas instruções específicas.
- Use um orchestrator para dividir e acompanhar funcionalidades assíncronas, com responsáveis e arquivos definidos. O protocolo está em `docs/06-fluxo-de-desenvolvimento.md`.
- Trabalhe a partir de `develop` em `feature/<ticket>-<descricao>` ou `fix/<ticket>-<descricao>`; filtros usam `feature/<ticket>-filtros-pedidos`.
- Abra PR da branch de trabalho para `develop`; promova `develop` para `master` por PR após validação. `master` representa o código aprovado para produção.
- Respeite os gates de GitHub Actions e comandos Make definidos em `docs/09-ci-e-seguranca.md`; não integre com falhas.
- Use os scripts planejados para branches, validação e ambiente assim que forem implementados. Até lá, registre a ausência; não alegue execução.
- Use o fluxo de contexto mínimo e atualização incremental de `docs/10-eficiencia-e-documentacao.md`; registre métricas reais conforme `docs/11-performance-das-rotas.md`.
- Mantenha contratos entre componentes consistentes. Atualize a documentação afetada sem copiar requisitos entre arquivos.
- Não envie segredos, tokens ou dados pessoais ao Git. Informe mudanças, validações realizadas e pendências com precisão.
