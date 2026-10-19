# Alto volume da API

Perfil opcional autorizado pelo usuário em 2026-10-18. Usa a imagem real do backend e PostgreSQL 18 fixado no projeto. A API acessa o banco como naporta_app com grants reais; migrations continuam pelo executor versionado. Nenhuma URL externa é aceita. Não participa automaticamente da CI de integração funcional.

```sh
make apiVolume
make apiVolume LOAD_ORDERS=100000 LOAD_STAGES=1,10,25,50,100 LOAD_SECONDS=15 LOAD_INSTANCES=2
make apiVolume LOAD_ORDERS=1000 LOAD_STAGES=1,5 LOAD_SECONDS=2 LOAD_WARMUP_SECONDS=1
```

Requer Docker ativo, Node.js 24 e npm. Instala dependências pelo lockfile; cria imagem, rede, volume PostgreSQL e containers exclusivos. APIs usam uma CPU/512 MiB por instância; banco usa duas CPUs/1 GiB. O armazenamento do banco é volume Docker; cache é tmpfs privado por API. Imagens e todos os recursos próprios são removidos após a execução, inclusive quando há falha. SIGINT/SIGTERM interrompem novas operações e iniciam limpeza após operações em andamento; falhas da limpeza são registradas. Não usar kill -9 se precisar dessa limpeza automática.

## Dados e identidades

Padrão: 100 mil pedidos sintéticos, UUID v4 aleatório, PK/FK integer, snapshots e itens relacionais reais. O SQL parametrizado varia itens, preços exatos em centavos, status, cidades/UF, datas e exclusão lógica. Clientes e documentos são explicitamente fictícios e repetidos entre snapshots para representar clientes com vários pedidos. Nenhum CPF/CNPJ, endereço pessoal ou cadastro real é importado. UUIDs não são sequências artificiais do seed de demonstração. Validação SQL verifica cardinalidade, unicidade, versão dos UUIDs, tipo interno e relações; HTTP verifica formato público e ausência de IDs internos em itens. JWT é obtido por login real.

O SQL usa gen_random_uuid(), gerador v4 do [PostgreSQL](https://www.postgresql.org/docs/18/functions-uuid.html). Cada execução começa em banco novo; o seed de volume não é um comando para popular bancos existentes.

## Método

Padrão: duas APIs, etapas de 1/10/25/50/100 clientes, três segundos de aquecimento e quinze segundos medidos por etapa. Cada cliente executa sequencialmente uma mistura aproximada de 70% consultas (detalhe, número, listagem e status) e 30% criação/edição/exclusão lógica. O início de etapas e limites de tempo pode alterar a proporção; contagens reais por cenário constam no JSON. Cada cliente altera somente pedidos criados por ele. Operações sobre pedidos de outros clientes nunca são fabricadas como sucesso.

Modelo fechado, com concorrência constante e conexões keep-alive limitadas: novas requisições dependem das anteriores. Req/s são a taxa efetivamente concluída, incluindo a drenagem das requisições iniciadas. Não representa taxa fixa de chegada nem garante resistência a rajadas. Timeouts de quinze segundos contam como erros e permanecem nos resultados. Aquecimento fica separado dos resultados medidos. Percentis nearest-rank, sem médias de percentis.

Topologia: cliente local distribuindo requisições entre APIs Docker, com PostgreSQL primário único. Não inclui Nginx, HTTPS, standby nem failover. Código e schema de produção são usados; infraestrutura não equivale a produção. Logs de requisição reais permanecem habilitados e são correlacionados em memória para medir duração do servidor. CPU/memória/I/O dos containers são amostrados a cada cinco segundos; CPU/event loop do gerador sinalizam quando ele pode limitar os resultados. Cliente, banco e APIs compartilham a máquina.

## Opções e relatórios

LOAD_ORDERS: 100..1000000; LOAD_STAGES: até dez valores entre 1..200; LOAD_SECONDS: 1..120; LOAD_WARMUP_SECONDS: 0..30; LOAD_INSTANCES: 1..4. LOAD_CACHE=file|disabled permite comparação em execuções separadas; versões de cache continuam compartilhadas pelo primário. LOAD_MAX_REQUESTS limita o total (padrão 250000); atingir esse limite torna o teste incompleto, sem extrapolar números. LOAD_OUTPUT escolhe um diretório novo dentro de artifacts/volume.

Artefatos: report.json com ambiente/configuração/auditorias/recursos e métricas por cenário; report.md com tabela resumida; samples.jsonl com latência cliente/servidor, status e bytes de corpo, sem corpos, tokens, IDs de pedidos ou dados de clientes. Falhas preservam relatório incompleto. Campos indisponíveis usam null. Código de saída não zero para erro de preparação, limite atingido, resposta inesperada, timeout, coleta incompleta ou falha de limpeza.

Não há SLA aprovado; o relatório não transforma uma execução local em garantia produtiva. Comparações exigem o mesmo ambiente, dados, mistura e configuração. Resultados reais ficam registrados na [tarefa 014](tasks/014.md) e na [baseline descritiva](performance/volume-014.md). Réplicas e recuperação continuam no documento 17.

## Compatibilidade e regressões

O runner valida envelopes `Messages` (code/message/data/requestId e correlação no cabeçalho) antes de verificar login e pedidos. Os bytes medidos incluem o envelope completo; 204 permanece vazio. A integração funcional cobre erro concorrente de listagem no banco real e recuperação sem encerrar o processo. Auditoria dos worktrees, ciclos TDD e repetição de 100 mil pedidos na base atual estão na [tarefa 021](tasks/021.md).
