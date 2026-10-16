# Escopo e premissas

## Origem e objetivo

OBRIGATÓRIO: criar uma Web API para a naPorta, consumida pelo portal web, e entregar o código em repositório público no GitHub. O desafio avalia backend, lógica, organização, boas práticas e segurança. O e-mail menciona conhecimento em Node.js e Go, mas exige implementar a API em Node.js; Go não integra o escopo obrigatório.

OBRIGATÓRIO nesta etapa: documentar antes de implementar, separar backend e banco, registrar requisitos e regras de negócio, planejar scripts e Docker Compose, definir branches e coordenação assíncrona. O escopo atual é somente backend, sem frontend. Testes automatizados serão exclusivamente de integração no backend. E2E de frontend fica reservado para uma futura ampliação explícita de escopo.

## Prioridades futuras

1. Backend obrigatório: JWT, pedidos, filtros, ORM, soft delete, README e seed.
2. Entrega solicitada pelo usuário: scripts/Make, Compose, cache em arquivos, CI de segurança, modelo normalizado e fluxo coordenado.
3. Qualidade: testes nos tipos autorizados, linter, segurança e clareza do código.
4. Bônus opcional do desafio: Serverless, somente após nova decisão de escopo.

Clean Code, testes automatizados, Docker e linter são diferenciais no e-mail. Testes nos tipos especificados e o planejamento de Docker/scripts passam a fazer parte deste projeto pela instrução adicional do usuário.

## Decisões propostas

- NestJS sobre Node.js; PostgreSQL com Prisma. Seguem as preferências do desafio e atendem ao domínio relacional.
- Um repositório, componentes separados e uma única fonte para schema e migrations.
- Status `PENDING`, `IN_TRANSIT`, `DELIVERED` e `CANCELED`; o desafio exige filtro por status, mas não define valores.
- Filtro de período sobre a previsão de entrega, usando datas sem horário. Esse campo deve ser confirmado antes de implementar o filtro.
- Um conjunto compartilhado de pedidos para usuários autorizados. Não há multitenancy, cadastro público ou papéis administrativos previstos.

## Decisões confirmadas pelo usuário

- ID interno `integer` na persistência e no backend; UUID público em toda comunicação externa ao backend.
- Réplicas do banco e instâncias do servidor de aplicação para suportar maior concorrência na API; detalhes de capacidade serão definidos posteriormente.
- Organização por feature folders, com nomes em camelCase conforme os exemplos `authController`, `authSevice`, `authUseCases` e `authRepository`; convenção completa em `04-arquitetura-e-dados.md`.
- Somente backend nesta entrega; não há aplicação frontend nem sua suíte E2E.
- TypeScript estrito com tipos e interfaces no backend para verificação em tempo de compilação.
- GitHub Actions com gates mínimos de segurança e integração obrigatórios em todo PR para `develop`.
- Make como entrada de automação local/CI; scripts são a fonte executável compartilhada.
- Cache em arquivos provisionado por volume no Docker Compose; Redis não é dependência do projeto.
- Clean Code, Clean Architecture, I/O assíncrono, programação defensiva e exceções nativas NestJS; exceções próprias somente quando representarem regras de negócio.
- Bootstrap e composição organizados em `backend/src/main.ts` e módulos; segredos fornecidos pelo ambiente do usuário e repassados explicitamente pelo Compose.

- Esteira eficiente com consumo mínimo de tokens, atualização documental incremental e documentação de latência, status e bytes por rota; somente planejamento nesta etapa.

## Pontos a confirmar antes da implementação correspondente

| Ponto | Registro provisório | Efeito |
| --- | --- | --- |
| “CID do banco” | Interpretar como seed/carga inicial, sem pressupor um serviço chamado CID | Confirmar finalidade dos scripts de dados |
| Período de filtragem | Previsão de entrega | Confirmar se deveria ser data de criação |
| Status e transições | Vocabulário e transições do documento 03 | Validar com o responsável pelo domínio |
| Documento do cliente | Identificador textual, sem impor CPF/CNPJ ainda | Confirmar tipos aceitos e validação específica |
| Capacidade e operação | Número de instâncias, conexões, lag máximo e estratégia de failover a dimensionar | Validar antes de operação produtiva |
| Acesso à demonstração | Ambiente isolado com dados fictícios | Confirmar hospedagem, acesso e frequência de atualização |

Essas hipóteses servem apenas para documentação. Não implementar decisões dependentes de confirmação como se fossem exigências originais.

## Limites

Sem frontend nesta entrega. Sem pagamentos, estoque, rastreamento geográfico, notificações, múltiplas empresas, cadastro público ou deploy Serverless no escopo inicial. A publicação do repositório e qualquer ambiente público ficam para a fase de entrega; não são executadas nesta etapa.
