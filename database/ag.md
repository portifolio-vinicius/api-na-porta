# Instruções do banco

Leia primeiro `../ag.md`. Escopo: modelo relacional, migrations, seed, backup e replicação.

- Siga `../docs/04-arquitetura-e-dados.md`; preserve normalização, integridade referencial e precisão monetária.
- Mantenha o schema Prisma e migrations em `database/prisma/` quando forem implementados; o backend consome essa única fonte.
- Versione migrations; não altere migrations já aplicadas em ambientes compartilhados.
- Use dados fictícios e seed idempotente somente em ambientes autorizados de desenvolvimento, teste e demonstração.
- Nunca restaure, limpe ou sobrescreva produção com scripts de desenvolvimento.
- Use PK/FK integer e UUID único nas entidades expostas, conforme a arquitetura.
- Aplique migrations/seed apenas no primário; siga os contratos de inicialização e monitoramento de réplica.
- Valide migrations, seed e replicação por integração; não crie outra suíte de testes automatizados.
- Coordene mudanças de schema com backend e orchestrator antes de integrar.
