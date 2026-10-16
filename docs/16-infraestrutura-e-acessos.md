# Infraestrutura, escalabilidade e acessos

Implementação: [stack Swarm](../infra/swarm/stack.yml), [Nginx](../infra/nginx/nginx.conf), [exemplo de ambiente](../infra/swarm/.env.example), scripts `scripts/infra/` e `scripts/db/`, além de [imagem real do backend](../backend/Dockerfile). Compose local usa API, banco e cache em arquivos; a suíte de integração HTTP segue pendente. As migrations SQL existentes são preservadas e usadas na validação de permissões. A validação não executa deploy.

## Topologia e segurança

HTTPS → Nginx nos nós de borda → réplicas stateless do backend → PostgreSQL único. O proxy resolve `tasks.backend` pelo DNS do Docker, distribui com `least_conn` e reaproveita conexões. Exige Nginx open source >= 1.27.3 para upstream com `resolve`; imagens Alpine fixadas por digest. [Referência Nginx](https://nginx.org/en/docs/http/ngx_http_upstream_module.html).

Somente a porta 443 é publicada, em modo host, preservando o IP do cliente; um proxy por nó marcado para borda. DNS ou balanceador externo deve apontar para esses nós. A porta 8080 é apenas para o healthcheck interno. Nginx exige TLS 1.2/1.3, remove identificação de versão, adiciona cabeçalhos de segurança, limita payload a 1 MiB e aplica timeouts. Sobrescreve cabeçalhos de origem; caso haja CDN/balanceador externo, configurar explicitamente suas redes confiáveis antes de usar o IP encaminhado. Os logs de acesso omitem URLs, queries, corpos e tokens.

Limites iniciais por IP e por instância Nginx: API 30 requisições/s com burst de 60, login 5/min com burst de 5, 20 conexões simultâneas. Rejeições retornam 429. O login também aplica bloqueio compartilhado de 15 minutos após cinco falhas por email/IP, armazenado no PostgreSQL como HMAC; linhas antigas são removidas em lotes limitados por função com permissão explícita. Esses números são pontos iniciais de configuração, sem garantia de throughput. [Referência de limites](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html).

Nginx e backend executam sem root, sem capabilities e com filesystem somente leitura. Cache em `/tmp/naporta-cache` é privado por tarefa, descartável e limitado pelo tmpfs. A API precisa implementar a invalidação entre instâncias prevista no documento 04. O PostgreSQL conserva o entrypoint oficial para preparar as permissões do volume, que executa o servidor como usuário postgres.

Redes overlay `edge` e `data` usam criptografia; `data` é interna. PostgreSQL não publica portas e aceita somente os três usuários autorizados na sub-rede `10.42.0.0/24`, por SCRAM-SHA-256. Esse transporte interno depende da overlay criptografada; acessos fora dela exigem TLS PostgreSQL e novas regras `hostssl`. Reserve essa sub-rede sem conflito; mudar a rede exige atualizar `pg_hba.conf` e o validador. O proxy não participa da rede de dados. [Redes Swarm](https://docs.docker.com/engine/swarm/networking/).

## Preparação e deploy

Pré-requisitos: Docker Engine em nós Linux, Swarm inicializado em manager pelo operador, registro acessível a todos os nós, certificado válido para o domínio e armazenamento/backup do banco definidos. Libere 2377/TCP entre managers/nós, 7946/TCP+UDP e 4789/UDP somente entre nós confiáveis, além do protocolo IP 50 (ESP) necessário para overlay criptografada. Não exponha essas portas à internet.

No manager, marcar pelo ID dos nós escolhidos:

```sh
docker node update --label-add naporta.edge=true <no-de-borda>
docker node update --label-add naporta.database=true <no-do-banco>
```

Exatamente um nó deve ter o label do banco: o volume é local. Queda desse nó deixa o banco indisponível; não remover o label e recriar o serviço em outro nó com volume vazio. Réplicas da API não são réplicas do PostgreSQL. Streaming e promoção do banco continuam pendentes; as operações de backup/restauração existentes estão descritas no documento 15 e ainda exigem adaptação operacional ao Swarm. Certificados, backups e rotação de credenciais pertencem à operação.

Use o exemplo de ambiente como lista de variáveis; exporte valores no shell. `docker stack` não carrega `.env` automaticamente. `BACKEND_IMAGE` deve ser uma imagem real publicada por digest. O arquivo de exemplo fixa imagens auxiliares baixadas durante a validação; essas imagens ainda precisam passar pelo scanner de vulnerabilidades antes da publicação.

Crie cada secret externamente usando arquivo privado fora do repositório. Exemplo de certificado:

```sh
docker secret create naporta_tls_cert_v1 /caminho/privado/fullchain.pem
docker secret create naporta_tls_key_v1 /caminho/privado/privkey.pem
```

Repita para senha administrativa, senha da aplicação, senha de migration, senha do leitor, URL da aplicação e chave JWT (pelo menos 32 bytes aleatórios), com os nomes exportados no exemplo. As senhas precisam ser distintas. A URL usa a mesma senha de `app_password`, codificada para URL, e o formato `postgresql://naporta_app:<senha>@db:5432/naporta?schema=public`. O adapter PostgreSQL configura explicitamente pool máximo 10 e timeout de conexão de 5 segundos. Não colocar os valores em linha de comando, Git ou logs. Segredos são montados somente nos serviços consumidores. [Docker secrets](https://docs.docker.com/engine/swarm/secrets/).

```sh
make infraValidate
make swarmDeploy
docker stack services naporta
docker stack ps naporta --no-trunc
make scale API_REPLICAS=3
```

`swarmDeploy` verifica manager, imagens imutáveis, secrets e labels. Envia a stack sem prometer convergência. Nomes de configs incluem hash de conteúdo para permitir atualizações; remova versões antigas somente quando não forem usadas, inclusive por rollback. Não usar `docker stack config` com credenciais interpoladas. O manifesto contém somente nomes de secrets. [Deploy de stack](https://docs.docker.com/engine/swarm/stack-deploy/).

Número inicial: duas réplicas; scripts aceitam de uma a quatro. Cada processo tem pool máximo de dez conexões. Com quatro réplicas e uma tarefa adicional de rolling update são até 50 conexões da API, abaixo do limite 60 do role. PostgreSQL tem limite 100, com espaço para migration (5), leitor (10) e operação. Para ampliar, redimensionar memória, CPU e banco, rever todos os pools e medir carga. Não escalar simultaneamente por scripts e por outro controlador; atualizar `API_REPLICAS` no ambiente para que um próximo deploy preserve a escala escolhida.

## Contrato da imagem do backend

A imagem deve conter Node.js com `fetch`, `/bin/sh`, `dist/main.js` relativo ao `WORKDIR`, e permitir execução com UID/GID 1000. Deve escutar em `0.0.0.0:3000`, encerrar graciosamente em SIGTERM e fornecer `/health/ready` (HTTP 200 somente quando a aplicação e o banco estiverem prontos). Esse endpoint não é publicado pelo proxy. Nenhuma migration deve rodar no bootstrap das réplicas.

O wrapper lê os secrets e exporta `DATABASE_URL` e `JWT_SECRET` sem imprimir valores. Valida usuário, host, banco e schema. Prisma 7 usa driver adapter `pg`; a API configura o pool no adapter e usa o schema `public`. Login com Argon2id/JWT, limitação compartilhada, rotas de pedidos e cache local para listagens estão implementados; Compose de desenvolvimento está implementado, mas ainda não foi executado neste branch. Métricas seguem pendentes. Atualização gradual tem uma tarefa por vez, `start-first` e rollback em falha; a prontidão executa uma consulta real ao banco.

## Permissões do PostgreSQL

O bootstrap em volume novo aplica [roles.sql](../database/security/roles.sql) transacionalmente. Não aplica migrations nem seed. Use um cluster dedicado; os scripts não auditam permissões/memberships herdados de roles preexistentes de terceiros. Acesso de superusuário é local por peer, com administração dentro do container como usuário postgres; conexões administrativas remotas são rejeitadas.

| Role | Permissões |
| --- | --- |
| `naporta_migrator` | Dono do schema `public`, cria/altera objetos; sem superuser, criação de bancos/roles, replicação ou bypass de RLS |
| `naporta_app` | Consulta usuários para login; consulta/insere/atualiza tentativas de login, pedidos, itens, snapshots e versões de cache; sem exclusão direta, TRUNCATE, DDL ou acesso à tabela de migrations. Pode executar somente a função limitada de limpeza de tentativas expiradas |
| `naporta_reader` | Consulta somente tabelas de pedidos; sem leitura de hashes de senha e sem escrita |

PUBLIC perde acesso ao banco/schema/objetos. Funções futuras criadas pelo migrator não concedem EXECUTE a PUBLIC. Sem grants genéricos para tabelas futuras: depois de cada migration, [grants.sql](../database/security/grants.sql) reaplica uma lista explícita e falha se faltarem tabelas. Objetos devem ser criados por `naporta_migrator`, pois default privileges são associados ao criador. [Privilégios padrão PostgreSQL](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html).

Executar migrations uma vez, com credencial de migration em job operacional separado, antes de disponibilizar a aplicação. Prisma não recebe permissão de criar shadow database em produção; gerar migrations em ambiente de desenvolvimento isolado. Após migrations, executar no nó do banco:

```sh
make dbAccess DB_CONTAINER=<container-do-banco> DB_ACCESS_ACTION=grants
```

Para reaplicar roles/senhas dos secrets montados em um volume existente:

```sh
make dbAccess DB_CONTAINER=<container-do-banco> DB_ACCESS_ACTION=roles
```

Esse comando altera senhas; coordenar rotação com nova versão do secret de URL e atualização das tarefas. Alterar secrets no Swarm não altera automaticamente a senha armazenada no PostgreSQL. Nunca apagar o volume para aplicar permissões. Não há script de remoção de stack/volume nem restauração automática.

## Validação e limites

Verificação local realizada anteriormente: build da imagem do proxy aprovado e checks de infraestrutura aprovados. O backend agora passa `make check`; a imagem não foi construída nesta tarefa. A verificação de segurança da imagem completa e a integração HTTP seguem pendentes; não há resultado de scan aprovado para a imagem do backend.

`make infraCheck` cria rede e containers temporários, com dados fictícios em tmpfs e certificado autossinado descartável. Valida manifesto, limites de escala, inicialização e reaplicação de roles/grants, operações permitidas/negadas, SCRAM e bloqueio de administração remota; valida Nginx sem root, HTTPS, cabeçalhos, distribuição entre dois upstreams e 429 no login. Remove somente recursos criados pela própria execução. Precisa de Docker, Python 3, OpenSSL, Bash, acesso às imagens e sub-rede livre. Não mede capacidade de produção.

O check executa no job `backend-quality` e no `make ci`. Não substitui integração do backend nem prova Swarm multi-host, recuperação, persistência após queda, execução de migrations no cluster ou segurança da imagem futura. O scan Trivy em `infra/` analisa o Dockerfile do Nginx e exige ao menos um alvo reconhecido; o manifesto Swarm e o nginx.conf não são reconhecidos por esse scanner e são verificados pelos checks executáveis. Scanners e integração completa continuam bloqueando na ausência do backend. Nenhum cluster ou serviço público foi criado por esses checks.

Há também um [Dockerfile opcional do proxy](../infra/nginx/Dockerfile), que inclui a configuração e fixa o usuário sem root. Build a partir da raiz: `docker build -f infra/nginx/Dockerfile -t <registro>/naporta-proxy:<versao> .`. Publicar e substituir `NGINX_IMAGE` pelo digest da imagem construída é uma operação posterior; a stack também monta a configuração versionada via Docker config.
