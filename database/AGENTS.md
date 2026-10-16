# Instruções do banco

A leitura começa em [../AGENTS.md](../AGENTS.md). Este componente mantém modelagem, migrations, seed, backup e replicação.

- A modelagem segue a [arquitetura e os contratos de dados](../docs/04-arquitetura-e-dados.md).
- `database/prisma/migrations/` concentra o histórico SQL executável. O executor nativo é único. A futura integração Prisma parte desse schema existente.
- Migrations aplicadas permanecem imutáveis. Correções usam novas migrations versionadas.
- PKs e FKs integer preservam relações internas. UUIDs identificam entidades públicas. Valores monetários preservam precisão decimal.
- Mudanças de schema são coordenadas com o responsável pelo backend antes da integração.
- Migrations e seed executam no primário. Replicação segue a ordem definida no [catálogo de ambiente](../docs/07-scripts-e-ambiente.md).
- Seed usa dados fictícios e chaves estáveis. Repetições preservam dados externos ao conjunto.
- Operações exigem destino explícito e ambiente autorizado. Rotinas de desenvolvimento ficam restritas a desenvolvimento, teste e demonstração.
- Reversão de estrutura depende de plano compatível com a migration. Recuperação de dados depende de backup e restauração validados.
- Make executa migrations, seed, rollback, backup e restauração. Configuração e limites seguem [as operações PostgreSQL](../docs/15-postgresql-operacoes.md).
- `make dbIntegration` valida operações PostgreSQL reais e integra `make integration` do backend. Replicação permanece planejada, conforme [o plano de testes](../docs/08-validacao.md).
- Evidências informam comandos, destino técnico sanitizado, resultados e limitações reais.
