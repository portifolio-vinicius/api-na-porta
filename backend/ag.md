# Instruções do backend

Leia primeiro `../ag.md`. Escopo: API, autenticação, autorização, domínio de pedidos e integração com o ORM.

- Siga os contratos de `../docs/05-api.md` e as regras de `../docs/03-regras-de-negocio.md`.
- Use Node.js, NestJS e Prisma conforme a arquitetura proposta; mantenha acesso ao banco neste componente.
- Organize por feature folders e nomes em camelCase definidos em `../docs/04-arquitetura-e-dados.md`; use tipos/interfaces e TypeScript estrito.
- Use ID integer apenas internamente e UUID nos contratos externos; mapeie DTOs explicitamente.
- Respeite roteamento primário/réplica e limites de pool definidos na arquitetura.
- Valide entradas, proteja as rotas de pedidos com JWT Bearer e serialize apenas campos públicos.
- Aplique soft delete em consultas e alterações; nunca exponha credenciais ou detalhes internos de erros.
- Implemente somente testes automatizados de integração no backend, conforme `../docs/08-validacao.md`.
- Siga Clean Architecture: casos de uso dependem de interfaces; Prisma, cache e NestJS ficam nos adaptadores.
- Use I/O assíncrono, cache em arquivos via interface e exceções nativas do NestJS na borda HTTP; customizadas somente para regras de negócio.
- Centralize bootstrap/composição em `main.ts` e módulos; segredos vêm do ambiente do usuário.
- Atualize inventário/contratos das rotas e registre latência, status e bytes pela integração conforme `../docs/11-performance-das-rotas.md`; não invente medições.
- Coordene mudanças de contrato e schema com o orchestrator antes de integrar.
