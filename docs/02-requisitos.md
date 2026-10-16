# Requisitos

## Funcionais

| ID | Origem | Requisito e critério de aceite |
| --- | --- | --- |
| RF-01 | Obrigatório — desafio | Autenticar com JWT; rotas de pedidos exigem `Authorization: Bearer <token>` válido |
| RF-02 | Obrigatório — desafio | Criar pedido com número, previsão de entrega, cliente, endereço e itens; retornar identificador e data de criação |
| RF-03 | Obrigatório — desafio | Listar pedidos ativos; proposta de paginação descrita no contrato |
| RF-04 | Obrigatório — desafio | Filtrar por número, período com data inicial/final e status; permitir combinação dos filtros |
| RF-05 | Obrigatório — desafio | Editar pedido existente e ativo, preservando identidade e data de criação |
| RF-06 | Obrigatório — desafio | Excluir logicamente; pedido excluído deixa de aparecer nas consultas usuais |
| RF-07 | Obrigatório — desafio | Popular o banco por script com pedidos fictícios para demonstração |
| RF-08 | Fora do escopo atual | Frontend adiado por orientação posterior; esta entrega contém somente backend |
| RF-09 | Obrigatório — usuário | Planejar carga inicial fictícia por seed; manter demonstração isolada |
| RF-10 | Proposto | Consultar pedido individual para visualização e edição |
| RF-11 | Proposto | Efetuar login com usuário de demonstração criado de forma controlada pelo seed, sem cadastro público |

## Não funcionais

| ID | Origem | Requisito e validação prevista |
| --- | --- | --- |
| RNF-01 | Obrigatório — desafio | Backend Node.js; preferência atendida com NestJS; justificar no README qualquer substituição |
| RNF-02 | Obrigatório — desafio | Persistência por ORM/ODM; proposta PostgreSQL e Prisma; justificar outra escolha no README |
| RNF-03 | Obrigatório — desafio | Rotas, métodos e respostas REST, conforme contrato documentado |
| RNF-04 | Obrigatório — desafio | README com execução e scripts necessários; somente publicar comandos como operacionais após implementá-los |
| RNF-05 | Obrigatório — usuário | Separar API e banco com responsabilidades explícitas e dados normalizados |
| RNF-06 | Obrigatório — usuário | Ambiente local reproduzível por scripts e Docker Compose, incluindo migrations e seed |
| RNF-07 | Obrigatório — usuário | Testes automatizados apenas de integração no backend; não há frontend nesta entrega |
| RNF-08 | Obrigatório — usuário | Desenvolvimento assíncrono coordenado por orchestrator e integração pelo fluxo de branches documentado |
| RNF-09 | Proposto — segurança | Validar JWT, expiração, emissor e audiência; usar hash de senha, segredos fora do Git, CORS restrito e limitação de tentativas de login |
| RNF-10 | Proposto — privacidade | Não registrar senhas, tokens ou documento completo do cliente; demonstração e testes usam dados fictícios |
| RNF-11 | Proposto — consistência | Gravações de pedido e itens são transacionais; constraints impedem números duplicados e referências órfãs |
| RNF-12 | Proposto — desempenho | Paginação com máximo de 100 registros por página; índices para filtros; meta de latência depende de volume e ambiente ainda não definidos |
| RNF-13 | Proposto — observabilidade | Logs estruturados com identificador de requisição, erros sem stack pública e endpoint de prontidão |
| RNF-14 | Obrigatório — usuário | Feature folders com sufixos por responsabilidade; TypeScript estrito, tipos e interfaces no backend, verificados por typecheck/build |
| RNF-15 | Proposto — recuperação | Cópias identificadas e restauração validada em banco isolado; RPO/RTO a definir se houver operação produtiva |
| RNF-16 | Fora do escopo atual | Requisitos visuais do portal ficam adiados junto ao frontend |
| RNF-17 | Obrigatório — usuário | ID interno integer e UUID externo; contratos e respostas não expõem PKs/FKs internas |
| RNF-18 | Obrigatório — usuário | Planejar replicação do banco e múltiplas instâncias da API para maior concorrência, com pools limitados, roteamento consistente e monitoramento |
| RNF-19 | Obrigatório — usuário | GitHub Actions executa segurança mínima e integração em cada PR para develop; merge bloqueado por gates não aprovados |
| RNF-20 | Obrigatório — usuário | Make delega a scripts reproduzíveis de ambiente, segurança, integração e preparação de merge |
| RNF-21 | Obrigatório — usuário | Cache em arquivos via interface substituível, volume Compose, expiração e invalidação; sem Redis |
| RNF-22 | Obrigatório — usuário | Clean Code/Clean Architecture com domínio e casos de uso independentes de NestJS, Prisma e cache concreto |
| RNF-23 | Obrigatório — usuário | I/O assíncrono com concorrência limitada e timeouts; sem chamadas síncronas bloqueantes no atendimento HTTP |
| RNF-24 | Obrigatório — usuário | Configuração validada no bootstrap main.ts; segredos no ambiente do usuário, passados explicitamente pelo Compose |
| RNF-25 | Obrigatório — usuário | Programação defensiva, exceções nativas NestJS na camada HTTP e exceções próprias somente para regras de negócio |
| RNF-26 | Obrigatório — usuário | Esteira de tarefas/documentação incremental, com contexto mínimo, scripts determinísticos e acompanhamento do consumo de tokens quando disponível |
| RNF-27 | Obrigatório — usuário | Documentar cada rota com latência, status HTTP e bytes enviados/recebidos por execução; separar medição real de dados ainda indisponíveis |

Não há SLA, volume de produção, política de retenção ou metas numéricas de disponibilidade fornecidos. Devem ser definidos antes de assumir compromissos de produção.
