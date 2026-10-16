# Arquitetura e dados

## Separação e feature folders

Organização confirmada por funcionalidade. Bootstrap NestJS, validação de configuração, prontidão PostgreSQL, adapter Prisma, autenticação, rotas de pedidos e cache local de listagens estão implementados; cache dedicado em Compose e métricas continuam pendentes. Não criar diretórios globais de controllers, services ou repositories reunindo funcionalidades diferentes. Estrutura:

```text
backend/
  src/main.ts                Bootstrap e composição da aplicação
  src/appModule.ts           Módulo raiz e registro de dependências
  src/features/health/
    healthController.ts
  src/features/orders/         Criação/consulta/paginação/filtros/edição/exclusão lógica implementados
    ordersModule.ts
    ordersController.ts
    ordersUseCases.ts
    ordersRepository.ts
    ordersRepositoryInterface.ts
    orderModel.ts
    ordersTypes.ts
    ordersDto.ts
  src/features/auth/           Login/JWT implementados
  src/shared/cache/            Interface e adapter local em arquivos; métricas pendentes
  src/shared/config/           appConfig.ts implementado
  src/shared/database/         DatabaseModule e PrismaService implementados
  src/shared/http/             filtro de erros sanitizado implementado
  test/integration/            Integração HTTP pendente
database/
  prisma/schema.prisma       Mapeamento Prisma implementado
  prisma/migrations/         Histórico SQL versionado implementado
  seeds/                     Seed fictício de pedido implementado
  compose.yml                PostgreSQL local implementado
scripts/                     Validações de CI implementadas; automação de ambiente futura
docs/                        Documentação existente
```

Scripts, migrations SQL, seed de pedido, Compose do banco e schema Prisma estão implementados. O Prisma 7 gera o client no build e usa adapter PostgreSQL com limite de dez conexões e timeout de conexão de cinco segundos. O executor nativo SQL permanece o único executor de migrations; não gerar nem aplicar migrations pelo Prisma Migrate. Ver [decisão e limites](15-postgresql-operacoes.md).

Nomenclatura confirmada: nome da feature concatenado à responsabilidade em camelCase (primeira palavra minúscula e palavras seguintes com inicial maiúscula), sem ponto, hífen ou underscore entre eles. Apenas a extensão mantém o ponto. Para `auth`: `authController.ts`, `authSevice.ts`, `authUseCases.ts`, `authRepository.ts` e `authModel.ts`. A grafia `sevice` segue literalmente o exemplo solicitado pelo usuário e é o sufixo adotado para services.

A convenção vale em todas as features do backend, inclusive para arquivos auxiliares: `authRepositoryInterface.ts`, `authTypes.ts` e `authDto.ts`. Quando houver mais de um caso de uso no arquivo `authUseCases.ts`, cada operação mantém sua função/classe tipada. Não duplicar uma mesma regra em service e use case.

| Arquivo ilustrativo | Responsabilidade |
| --- | --- |
| `authController.ts` | Adaptar HTTP, validar DTOs e converter resultados/erros em respostas NestJS |
| `authSevice.ts` ou `authUseCases.ts` | Orquestrar a operação com regras de negócio e interfaces; sem dependência de detalhes de infraestrutura |
| `authRepository.ts` | Adaptar Prisma à interface de persistência |
| `authRepositoryInterface.ts` | Contrato de persistência consumido por casos de uso |
| `authModel.ts` | Entidades internas com ID integer, sem tipos Prisma/NestJS |
| `authTypes.ts` e `authDto.ts` | Tipos auxiliares e contratos HTTP, separados dos models internos |

Fluxo: controller → service/use case → interface → adapter repository/cache. A geração do cliente Prisma no build usa o schema único em `database/`.

## Clean Code e Clean Architecture

Dependências apontam para regras e contratos: models e casos de uso não importam NestJS, Prisma nem operações de filesystem. Controllers, DTOs com validação, repositories concretos e adapters ficam na borda. Interfaces de repository, cache, hash e assinatura/verificação de token permitem substituir implementações. Tokens de injeção e módulos fazem a ligação com o NestJS sem acoplar o domínio a decorators do framework.

Manter nomes claros, funções focadas, regras em uma única fonte e mapeamentos explícitos. Não criar camadas vazias ou abstrações sem responsabilidade. Substituir o cache exige implementar o mesmo contrato e trocar o binding de configuração, sem alterar os casos de uso.

## Bootstrap, configuração e main

`backend/src/main.ts` é o ponto de entrada implementado: carregar/validar `API_PORT`, banco e configuração JWT, criar aplicação, excluir prontidão do prefixo `/api/v1`, registrar shutdown hooks e iniciar em `0.0.0.0`. `/health/ready` consulta o primário e responde 503 sem expor detalhes em caso de falha. Pipes globais estritos, envelope HTTP de erro sanitizado e log estruturado sem payloads estão implementados. CORS e logging de requisições ficam para quando houver consumidores definidos.

“Main” aqui identifica o bootstrap da aplicação. O fluxo de branches continua `develop → master`; não renomear a branch de produção sem nova instrução.

Segredos vêm do ambiente do usuário conforme `07-scripts-e-ambiente.md`. Configuração inválida ou obrigatória ausente interrompe o bootstrap com diagnóstico sem valores sensíveis. A aplicação não recebe um objeto irrestrito com todo o ambiente; cada adapter recebe somente sua configuração necessária.

## Tipos, interfaces e compilação

OBRIGATÓRIO: TypeScript com `strict`; tipos/interfaces para models, DTOs, filtros, paginação, erros, casos de uso, repositories e cache. Evitar `any` e coerções que ocultem erros. Fonte única dos contratos públicos na feature da API; não há consumidor frontend ou pacote frontend a gerar nesta etapa.

Tipos distintos para ID integer interno e UUID público, com marcação nominal quando necessário. Tipagem em compilação não substitui validação runtime dos dados HTTP, configuração, banco ou cache.

## Assíncrono e programação defensiva

Usar APIs assíncronas para banco, arquivos, hash de senha e serviços externos. Não usar operações `*Sync`, espera ocupada ou processamento intensivo no event loop das requisições. Preferir `await` para dependências sequenciais e concorrência limitada para operações independentes; não paralelizar passos transacionais dependentes. `async` não torna CPU mais rápida: tarefas pesadas exigem worker quando necessário. Medir antes de prometer ganho de performance.

Validar UUID, payload, paginação, datas e enums na borda; verificar existência, exclusão lógica, transições e unicidade na operação; manter constraints e transações como proteção contra concorrência. Usar timeouts, liberar recursos em `finally`, aguardar promises e não suprimir falhas de escrita. Retentativas somente para operações idempotentes e falhas transitórias conhecidas.

Na camada HTTP, usar `BadRequestException`, `UnauthorizedException`, `ForbiddenException`, `NotFoundException`, `ConflictException` e demais exceções nativas NestJS quando aplicáveis. Não criar classes próprias apenas para repetir status HTTP. Nos casos de uso, erros de domínio próprios são permitidos somente para regras de negócio, como transição proibida; a borda converte-os para exceções nativas. Falhas de infraestrutura inesperadas retornam 500 sanitizado e geram log seguro; falha opcional do cache segue sua política específica. Filtro global, se necessário para o envelope, não é uma nova classe de exceção. [Referência NestJS](https://docs.nestjs.com/exception-filters).

## Cache em arquivos

Contrato assíncrono `CacheInterface`: leitura, escrita com TTL, remoção e invalidação de namespace. Adapter inicial `fileCacheAdapter.ts` usa filesystem, isolado atrás da interface e configurado por injeção. Listagens autenticadas de pedidos usam o adapter com TTL de 60 segundos; Compose ainda não monta volume dedicado em `CACHE_DIRECTORY`. Cache é descartável e a fonte de verdade continua sendo o banco.

Proposta de uso inicial: consultas de pedidos autenticadas, com chave derivada de namespace, versão dos dados, filtros/paginação normalizados e contexto de autorização. Nunca cachear JWT, senha, credenciais ou respostas 401/403. Valores contêm apenas DTOs públicos. Limitar TTL, tamanho por entrada, ocupação total e concorrência; arquivos com permissões restritas, nomes derivados por hash sem entrada de usuário em caminhos, escrita temporária seguida de rename atômico no mesmo volume e limpeza assíncrona limitada. Arquivo expirado/corrompido ou cache indisponível resulta em miss e consulta ao banco; não ocultar erros do banco.

Para consistência entre instâncias, proposta: tabela `cache_versions` no primário, com `namespace` como PK textual e `version` inteira. Escritas de pedidos incrementam a versão na mesma transação; cada leitura consulta a versão atual do primário antes de acessar cache. Em miss, capturar versão e dados no mesmo snapshot consistente do primário; gravar sob essa versão. Assim uma alteração/soft delete torna entradas antigas inalcançáveis em todas as instâncias, mesmo se a gravação de cache falhar. O custo de consultar a versão permanece e deve ser medido. Não usar dados da réplica para preencher cache sem a garantia de visibilidade descrita abaixo.

Volumes de cache locais por instância no perfil escalado, com a mesma política de versionamento; não depender de locks entre hosts ou volume de filesystem compartilhado para consistência. O cache não armazena sessão nem contadores de segurança. Limitação distribuída de login usa adapter próprio, com proposta de contadores atômicos no primário, sem Redis.

## Modelo relacional inicial

| Tabela | Campos principais | Relações e restrições |
| --- | --- | --- |
| `cache_versions` | `namespace`, `version` | Controle técnico de invalidação transacional; sem identidade pública |
| `users` | `id`, `public_id`, `email`, `password_hash`, `created_at`, `updated_at` | E-mail normalizado e único; usuário serve à autenticação |
| `orders` | `id`, `public_id`, `number`, `expected_delivery_date`, `status`, `created_at`, `updated_at`, `deleted_at` | Número único; status validado; identidade pública única |
| `order_customers` | `order_id`, `name`, `document` | PK/FK `order_id`; snapshot de cliente 1:1 |
| `order_addresses` | `order_id`, `street`, `number`, `complement`, `district`, `city`, `state`, `postal_code`, `country` | PK/FK `order_id`; endereço 1:1 |
| `order_items` | `id`, `order_id`, `description`, `price` | N:1 com pedido; preço `numeric(12,2)` e CHECK não negativo |

Normalização proposta até 3FN: itens em linhas próprias, atributos atômicos, sem listas ou JSON para relações, endereço e snapshot de cliente dependem do pedido, sem valores derivados persistidos. O documento do cliente não será chave de uma entidade global: snapshots de pedidos distintos podem repetir o documento legitimamente. Não criar cadastro compartilhado de clientes sem requisito explícito.

Datas de entrega usam `date`; timestamps usam `timestamptz`, serializados em UTC. Valores monetários são decimais no banco e strings decimais na API para evitar perda de precisão. FKs mantêm integridade; a exclusão da aplicação é lógica, sem cascata de remoção física.

Índices propostos: unicidade de `number` e `public_id`, índices de pedidos ativos por previsão e status, e índice em `order_items.order_id`. Avaliar índices compostos com consultas reais antes de adicioná-los.

## Identificadores — decisão confirmada

- `id`: PostgreSQL `integer` gerado pelo banco, PK interna; FKs usam o mesmo tipo. Só é utilizado na persistência e dentro do backend.
- `public_id`: UUID gerado pelo backend, `NOT NULL` e `UNIQUE` em entidades expostas; permanece estável e não pode ser editado pelo cliente.
- API, clientes externos, URLs, contratos externos e claim `sub` do JWT usam exclusivamente UUID. O JSON mantém o nome `id`, com valor UUID; nunca envia `id` inteiro ou FKs internas.
- Repositories resolvem UUID para ID interno; mapeadores explícitos convertem models internos em DTOs públicos. UUID não substitui autenticação nem autorização.
- `users` e `orders` possuem os dois identificadores. Itens e snapshots só precisam de UUID se forem identificados externamente; caso contrário, seus IDs internos são omitidos.

## Escalabilidade da API e replicação

Infraestrutura adicionada: Nginx com HTTPS, réplicas de backend no Docker Swarm e permissões PostgreSQL. Consulte [infraestrutura e acessos](16-infraestrutura-e-acessos.md). O bootstrap, login, rotas de pedidos e cache local de listagens existem; Compose completo, métricas e integração HTTP continuam pendentes.


Objetivo confirmado: suportar mais conexões e requisições concorrentes. Desenho proposto: balanceador → múltiplas instâncias stateless da API → pools de conexões → PostgreSQL primário e réplica de leitura. As instâncias compartilham configuração JWT e banco; sessões não dependem da memória de uma instância específica. Limitação de login deve usar estado compartilhado quando houver múltiplas instâncias.

Replicação física assíncrona por streaming é a proposta para o PostgreSQL. Escritas, transações, autenticação e leituras que exigem consistência imediata usam o primário. Réplicas hot standby atendem somente leituras elegíveis e podem apresentar atraso. [Referência PostgreSQL](https://www.postgresql.org/docs/current/warm-standby.html).

Para preservar o contrato de criação/edição/exclusão, consultas de pedidos usam o primário por padrão. Habilitar leitura na réplica por operação somente quando existir mecanismo que garanta a visibilidade das escritas necessárias (por exemplo, aguardar replay do WAL correspondente, com timeout e fallback). Até existir essa garantia, não direcionar listagem ou detalhe à réplica. Monitorar lag e retirar réplica indisponível/atrasada do roteamento; fallback ao primário deve respeitar seu limite de capacidade.

Pool por processo com limites explícitos e timeouts; considerar pooler compatível com a versão/driver Prisma escolhidos. Dimensionar em cada servidor: soma dos pools das instâncias e jobs, conexões operacionais e reserva não pode exceder sua capacidade. Mais instâncias da API multiplicam os pools; a réplica amplia capacidade de leitura, não capacidade de escrita. [Referência Prisma](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool).

Migrations e seed são executados uma única vez no primário e propagados pelo banco. Configurar usuário de replicação dedicado, redes internas, volumes distintos e monitoramento de conexões, fila, timeouts e lag. Réplica não substitui backup. Não prometer failover automático nesta proposta; promoção e reconexão exigem procedimento operacional e prevenção de dois primários.

Número de instâncias, tamanho de pools, carga esperada, limite de lag, política de failover e RPO/RTO seguem pendentes de dimensionamento. A validação funcional do perfil escalado pertence às suítes existentes de integração do backend, sem nova categoria de testes.

## Ambientes

Bancos separados para desenvolvimento, integração e demonstração. Credenciais e nomes devem impedir que scripts de teste ou seed atinjam produção. Migrations e seed pertencem ao banco; integração com Prisma pertence ao backend. O perfil escalado e os scripts de replicação estão em `07-scripts-e-ambiente.md`.
