# Contratos da API

Prefixo `/api/v1`; JSON em UTF-8. Login e prontidão estão implementados. Rotas de pedidos permanecem propostas e exigirão JWT Bearer.

## Rotas

| Método e rota | Entrada | Sucesso |
| --- | --- | --- |
| `POST /auth/login` | `email`, `password` | 200: `accessToken`, `tokenType: Bearer`, `expiresIn` |
| `GET /health/ready` | Sem dados | 200 pronto; 503 indisponível; sem detalhes de credenciais |
| `POST /orders` | Corpo de criação abaixo | 201, pedido criado e `Location` para o recurso |
| `GET /orders` | `number`, `startDate`, `endDate`, `status`, `page`, `pageSize` opcionais | 200, lista paginada |
| `GET /orders/:id` | UUID público | 200, pedido ativo |
| `PATCH /orders/:id` | Campos editáveis enviados parcialmente, inclusive `status` | 200, pedido atualizado |
| `DELETE /orders/:id` | UUID público | 204, sem corpo |

As rotas da tabela são relativas ao prefixo. Todas constam no [inventário de performance](performance/rotas.md), ainda sem medições. O método de coleta e os campos estão em [performance das rotas](11-performance-das-rotas.md). Criação não aceita status arbitrário; o estado inicial vem de RN-07. Em PATCH, `customer`, `deliveryAddress` ou `items`, quando enviados, substituem integralmente o respectivo bloco; campos omitidos são preservados. `items: []`, campos desconhecidos e valores nulos em campos obrigatórios são inválidos. Operação de substituição é transacional.

`POST /api/v1/auth/login` e `GET /health/ready` são as únicas rotas implementadas até aqui. Login usa Argon2id, claim `sub` com UUID público e JWT assinado que valida emissor, audiência e expiração. O contrato de CRUD de pedidos não está implementado.

## Corpo de criação ilustrativo

```json
{
  "number": "PED-0001",
  "expectedDeliveryDate": "2026-11-05",
  "customer": { "name": "Cliente Demonstração", "document": "DEMO-0001" },
  "deliveryAddress": {
    "street": "Rua Exemplo", "number": "123", "complement": null,
    "district": "Centro", "city": "São Paulo", "state": "SP",
    "postalCode": "01001000", "country": "BR"
  },
  "items": [{ "description": "Item fictício", "price": "49.90" }]
}
```

A resposta acrescenta `id` como UUID público, `status`, `createdAt` e `updatedAt`. Não retorna ID interno, hash de senha nem `deletedAt`. O exemplo é fictício; não define validação de CPF/CNPJ.

## Listagem, erros e autenticação

- Paginação proposta: `page=1`, `pageSize=20`, máximo de 100; inteiros positivos. Ordenação fixa por `createdAt DESC` e ID como desempate.
- Envelope: `{ "data": [], "meta": { "page": 1, "pageSize": 20, "total": 0, "totalPages": 0 } }`.
- Filtros seguem RN-09/RN-10; datas inválidas, enum desconhecido e paginação fora do limite retornam 400.
- 401 para credenciais ou token ausente, inválido ou expirado; 403 para falta de autorização se esse controle for definido; 404 para recurso inexistente/excluído; 409 para número duplicado ou transição de status proibida; 429 para limite de tentativas; 500 sem detalhes internos. O login já bloqueia por 15 minutos o par email/IP após cinco credenciais inválidas, com contadores compartilhados no PostgreSQL.
- Erro uniforme: `{ "error": { "code": "VALIDATION_ERROR", "message": "Dados inválidos", "details": [], "requestId": "..." } }`. Detalhes só contêm erros seguros de campo.
- Token com expiração padrão de 15 minutos, configurável de 1 a 60 minutos; sem refresh token no escopo inicial. Logout no consumidor descarta o token, sem promessa de revogação imediata no servidor.
- Consumidores não devem colocar tokens em URLs ou logs. Não há frontend implementado ou planejado nesta entrega.

Os DTOs de login já têm validação estrita e rejeitam campos desconhecidos. O filtro HTTP implementa o envelope uniforme e sanitiza erros 5xx; o mapeamento nunca expõe o ID integer interno. A arquitetura, o cache e a política de exceções estão em `04-arquitetura-e-dados.md`. Login usa `Cache-Control: no-store`; o cache interno em arquivos ainda não foi implementado.
