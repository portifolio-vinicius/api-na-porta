# Instruções do backend

A leitura começa em [../ag.md](../ag.md). Este componente mantém API, autenticação, pedidos e adaptadores de persistência.

- A implementação segue os [contratos HTTP](../docs/05-api.md), as [regras de negócio](../docs/03-regras-de-negocio.md) e a [arquitetura](../docs/04-arquitetura-e-dados.md).
- Features agrupam seus arquivos. Tipos explícitos, camelCase e TypeScript estrito orientam o código.
- Casos de uso dependem de interfaces. NestJS, Prisma e cache pertencem aos adaptadores.
- IDs integer ficam na persistência. UUIDs identificam recursos públicos. DTOs definem os campos serializados.
- Validação, JWT Bearer e soft delete preservam os contratos das rotas de pedidos.
- Bootstrap e composição ficam em `main.ts` e módulos. Configuração validada recebe segredos do ambiente privado.
- I/O assíncrono, cache por interface e acesso primário/réplica seguem a arquitetura.
- Exceções HTTP usam NestJS. Exceções de domínio representam regras de negócio. Respostas de erro expõem informações sanitizadas.
- Mudanças de contrato ou schema são coordenadas com o responsável pelo banco.
- `make check` executa lint, typecheck e build. `make security` executa os scanners compartilhados.
- A validação funcional usa `make integration` com API, banco e cache reais isolados, conforme [o plano de integração](../docs/08-validacao.md).
- A integração coleta métricas reais. `make routeReport` agrega os artefatos conforme [o contrato de métricas](../docs/13-esteiras-executaveis.md).
- Alterações de rotas atualizam contrato e inventário. `make docsCheck` confere os links e a correspondência das rotas.
