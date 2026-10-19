# Validação e aceite

## Política de testes automatizados

Somente testes de integração no backend nesta entrega. Não há frontend e não haverá suíte E2E de navegador agora. Se o frontend voltar ao escopo, seus testes deverão ser E2E com API real, mediante atualização deste plano. Não criar testes unitários, snapshots ou suítes isoladas de componentes, contrato, carga ou banco.

Ferramentas implementadas: Node.js/fetch para HTTP e Python para operações PostgreSQL, replicação, seed e ciclo Compose. Integração sobe NestJS, PostgreSQL, migrations e adapter de cache em arquivos reais e isolados, sem mock de ORM/banco. Perfil de replicação usa standby real. Linter, typecheck, build e scanners de segurança são checks, não novas categorias de testes funcionais. As operações PostgreSQL têm integração real em `backend/test/integration/databaseOperations.py`, executada por `make dbIntegration` e pelo wrapper `make integration`. A suíte HTTP usa Node.js/fetch contra NestJS real; o perfil PostgreSQL streaming tem integração real própria no backend, compondo `make integration`. Jest/Supertest não são dependências do backend.

## Integração obrigatória antes de merge

| Cenário | Evidência |
| --- | --- |
| JWT e login | Login válido; 401 para credenciais/token ausente, inválido ou expirado; claims e assinatura verificados |
| CRUD e soft delete | Criar, listar, detalhar, editar e excluir; linhas preservadas e consultas não retornam excluídos |
| Filtros e paginação | Número, status, datas inclusive limites e combinações; datas invertidas rejeitadas |
| Transações/constraints | Número duplicado retorna conflito; falha nos itens não deixa gravação parcial |
| IDs | PK/FK integer internas; UUID em rotas, respostas e JWT; inteiro rejeitado como identidade pública |
| Exceções e defesa | Entrada inválida retorna 400; inexistente 404; regra de negócio 409; erro inesperado 500 sem stack/segredos |
| Cache real | Hit/miss, TTL, arquivo corrompido, indisponibilidade, escrita atômica e limites; falha opcional consulta o banco |
| Invalidação entre instâncias | Alterar/excluir em uma instância torna entrada antiga inacessível em outra; cache não retorna pedido excluído |
| Adapter desacoplado | Integração com binding de cache desligado preserva resultados e regras, sem alterar casos de uso |
| Migrations/seed | Banco limpo sobe corretamente; seed repetido não duplica nem modifica dados externos ao conjunto |
| Réplica/pools | Propagação e lag no perfil isolado; HTTP permanece no primário; pool configurado, sem medição de ocupação ou failover automático |
| Métricas HTTP | Todas as rotas/cenários exigidos produzem latência, status e bytes válidos; guard/erro/204/aborto tratados sem payloads sensíveis |
| Configuração/async | Configuração obrigatória ausente impede bootstrap; falhas assíncronas são tratadas sem sucesso falso |

O conjunto mais relevante de JWT, CRUD, filtros, transações, IDs, exceções e cache roda integralmente em cada PR para develop. O wrapper atual executa sempre o conjunto completo, incluindo replicação e Compose, tanto em PRs para develop quanto na promoção para master. Seleção deve ser conservadora: se houver dúvida de impacto, executar tudo. Nenhum caso obrigatório pode ser desabilitado para permitir merge.

Coletar métricas durante a mesma integração, conforme `11-performance-das-rotas.md`, sem suíte adicional de carga. Validar schema, cobertura de rotas e documentação com scripts; as amostras reais são geradas por execução e não são versionadas.

Cada execução usa banco/cache próprios e dados fictícios determinísticos; paralelismo isola recursos por worker. Limpeza limitada à execução, inclusive em falha. Evidências não contêm senhas/tokens/documentos reais.

## Gates e evidências

GitHub Actions chama os mesmos Make/scripts locais, conforme `09-ci-e-seguranca.md`. PR para develop exige check estático, segurança e integração relevantes aprovados no commit candidato atualizado. Após merge, repetir validação do conjunto. Promoção develop → master exige conjunto completo, incluindo perfil escalado. Orchestrator registra commit, comandos, resultados e limitações.

## Base documental e operacional atual

- Requisitos, regras e contratos organizados com backend e banco como componentes ativos.
- Exatamente três AGENTS.md complementares: raiz, backend e database.
- IDs integer/UUID, camelCase, feature folders, JWT, Clean Architecture, async, cache em arquivos, configuração privada e exceções definidos.
- Fluxo de branches, Make/scripts, Compose, replicação e gates GitHub Actions descritos.
- Aplicação e perfil de replicação isolado estão implementados; evidências atuais e limitações constam no documento 13. Compose PostgreSQL, migration SQL inicial e scripts operacionais existem; testes reais em [operações PostgreSQL](15-postgresql-operacoes.md). Makefile, workflow e scripts de CI foram implementados após autorização do usuário; evidências em [13 — Esteiras executáveis](13-esteiras-executaveis.md).

## Aceite futuro

Comprovar requisitos obrigatórios com integração e checks de segurança; atualizar README com comandos executados; manter proteção real de branches e revisar dados/segredos antes de cada publicação. O repositório público e o ruleset já existem; evidências no [documento 14](14-publicacao-e-protecao.md). Frontend não é critério de entrega atual. Bônus não adotados devem ser identificados sem se tornarem exigências originais do e-mail.
