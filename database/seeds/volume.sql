-- SYNTHETIC ONLY: invoke with node-postgres query(sql, [orderCount]) on an
-- explicitly authorized, migrated, ephemeral test database. Caller owns BEGIN /
-- COMMIT and cleanup. This is one parameterized statement; never interpolate $1.
-- Up to 1,000,000 synthetic orders; duplicate invocation fails atomically on number.
WITH
parameters AS (
    SELECT CASE WHEN $1::integer BETWEEN 1 AND 1000000 THEN $1::integer
                ELSE 1 / COALESCE($1::integer - $1::integer, 0) END AS order_count
),
source AS MATERIALIZED (
    SELECT n AS sequence_number,
           ((n - 1) % 10000) + 1 AS customer_number,
           1 + ((n * 19) % 5) AS city_number,
           (n * 41) % 100 AS item_bucket,
           now() - ((n * 73) % 365) * interval '1 day'
                 - ((n::bigint * 7919) % 86400) * interval '1 second' AS created_at
    FROM parameters CROSS JOIN LATERAL generate_series(1, order_count) AS generated(n)
),
inserted_orders AS (
    INSERT INTO public.orders
        (public_id, number, expected_delivery_date, status, created_at, updated_at, deleted_at)
    SELECT gen_random_uuid(),
           'SYN-VOLUME-' || lpad(sequence_number::text, 9, '0'),
           current_date + ((sequence_number * 17) % 365) - 180,
           (CASE WHEN sequence_number % 100 < 60 THEN 'PENDING'
                 WHEN sequence_number % 100 < 85 THEN 'IN_TRANSIT'
                 WHEN sequence_number % 100 < 95 THEN 'DELIVERED'
                 ELSE 'CANCELED' END)::public.order_status,
           created_at,
           created_at + (now() - created_at) * 0.8,
           CASE WHEN (sequence_number * 37) % 100 < 5
                THEN created_at + (now() - created_at) * 0.9 ELSE NULL END
    FROM source
    RETURNING id, number
),
order_mapping AS MATERIALIZED (
    SELECT inserted_orders.id, source.*
    FROM inserted_orders
    JOIN source ON source.sequence_number = right(inserted_orders.number, 9)::integer
),
inserted_customers AS (
    INSERT INTO public.order_customers (order_id, name, document)
    SELECT id,
           'SYN Cliente Fictício ' ||
               (ARRAY['Aurora', 'Brisa', 'Cedro', 'Duna', 'Estrela', 'Farol'])[((customer_number - 1) % 6) + 1]
               || ' ' || lpad(customer_number::text, 5, '0'),
           'SYN-CUSTOMER-' || lpad(customer_number::text, 5, '0')
    FROM order_mapping
    RETURNING order_id
),
inserted_addresses AS (
    INSERT INTO public.order_addresses
        (order_id, street, number, complement, district, city, state, postal_code, country)
    SELECT id,
           'Rua SYN Fictícia ' || lpad((sequence_number % 500)::text, 3, '0'),
           lpad((1 + sequence_number % 9999)::text, 5, '0'),
           CASE WHEN sequence_number % 3 = 0 THEN 'SYN Apartamento ' || (1 + sequence_number % 200)::text ELSE NULL END,
           'Bairro SYN Fictício ' || (1 + sequence_number % 20)::text,
           (ARRAY['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Curitiba', 'Recife'])[city_number],
           (ARRAY['SP', 'RJ', 'MG', 'PR', 'PE'])[city_number],
           '00000000',
           'BR'
    FROM order_mapping
    RETURNING order_id
),
inserted_items AS (
    INSERT INTO public.order_items (order_id, description, price)
    SELECT id,
           'SYN Item Fictício ' ||
               (ARRAY['Caixa', 'Envelope', 'Pacote', 'Livro', 'Amostra'])[((sequence_number + item_number) % 5) + 1]
               || ' ' || lpad(item_number::text, 2, '0'),
           ((sequence_number::bigint * 157 + item_number * 97) % 250000 + 1)::numeric / 100
    FROM order_mapping
    CROSS JOIN LATERAL generate_series(1,
        CASE WHEN item_bucket < 40 THEN 1 WHEN item_bucket < 65 THEN 2
             WHEN item_bucket < 80 THEN 3 WHEN item_bucket < 88 THEN 4
             WHEN item_bucket < 93 THEN 5 WHEN item_bucket < 96 THEN 6
             WHEN item_bucket < 98 THEN 7 ELSE 8 END) AS items(item_number)
    RETURNING order_id
),
bumped_cache AS (
    UPDATE public.cache_versions SET version = version + 1 WHERE namespace = 'orders'
    RETURNING version
)
SELECT 'synthetic' AS dataset,
       (SELECT count(*) FROM inserted_orders) AS orders,
       (SELECT count(*) FROM inserted_customers) AS customers,
       (SELECT count(*) FROM inserted_addresses) AS addresses,
       (SELECT count(*) FROM inserted_items) AS items,
       (SELECT version FROM bumped_cache) AS cache_version;
