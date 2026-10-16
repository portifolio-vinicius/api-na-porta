# Regras de negócio

As decisões de domínio abaixo são propostas, exceto a estrutura do pedido e a exclusão lógica exigidas pelo desafio. Precisam ser validadas antes de implementar.

| ID | Regra |
| --- | --- |
| RN-01 | Todo pedido possui identificador, número, previsão de entrega, cliente com nome e documento, endereço, ao menos um item e data de criação |
| RN-02 | O número é texto, preserva zeros iniciais, tem espaços externos removidos e é único, inclusive entre pedidos excluídos |
| RN-03 | Cada item contém descrição e preço unitário não negativo, com até duas casas decimais; moeda proposta BRL. Quantidade, desconto e frete não foram solicitados |
| RN-04 | A previsão de entrega é data válida no formato `YYYY-MM-DD`; inicialmente não se impede data passada para permitir edição histórica |
| RN-05 | O servidor define identificadores, `createdAt`, `updatedAt` e `deletedAt`; o cliente não pode atribuí-los |
| RN-06 | Soft delete define `deletedAt`, mantém relacionamentos e impede leitura ou edição pelas rotas usuais; não haverá restauração pela API inicial |
| RN-07 | Novo pedido inicia `PENDING`. Transições propostas: `PENDING → IN_TRANSIT` ou `CANCELED`; `IN_TRANSIT → DELIVERED` ou `CANCELED`. Repetir o estado atual é permitido; estados finais não avançam |
| RN-08 | Edição de número, cliente, endereço, previsão e itens é permitida em `PENDING`; em `IN_TRANSIT` somente previsão e status; pedidos finais não permitem edição. Exclusão lógica pode ocorrer em qualquer status |
| RN-09 | O filtro por número é exato, após remoção de espaços externos; período é inclusivo e proposto sobre previsão de entrega; status é um valor do enum |
| RN-10 | Filtros combinados usam AND. Aceita-se apenas limite inicial ou final; quando ambos existem, início não pode exceder fim |
| RN-11 | Criação e edição de pedido, endereço e itens são atômicas: falha em qualquer parte desfaz a operação inteira |
| RN-12 | Nome, documento e endereço do cliente são snapshots do pedido; editar um pedido não modifica outro pedido do mesmo cliente |
| RN-13 | Documento é texto obrigatório com espaços externos removidos. Não há regra de exclusividade nem de CPF/CNPJ sem confirmação |
| RN-14 | Endereço exige logradouro, número ou indicação “sem número”, bairro, cidade, UF, CEP e país; complemento é opcional. Regras de formato por país dependem do escopo confirmado |
| RN-15 | Todos os usuários autenticados autorizados compartilham o conjunto de pedidos. Se houver isolamento por cliente, ele deverá ser especificado antes de liberar acesso externo |

Pedidos excluídos devem responder como inexistentes nas rotas de consulta, edição e exclusão repetida. Histórico de transições e controle de edição concorrente são evoluções futuras; a proposta inicial adota última gravação válida, sem prometer auditoria completa.
