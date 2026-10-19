-- Cenários fictícios opcionais. Somente pedidos novos recebem seus snapshots/itens.
-- Registros existentes, inclusive pedidos de demonstração editados, permanecem intactos.
DO $seed_scenarios$
DECLARE
  scenario record;
  inserted_id integer;
BEGIN
  FOR scenario IN
    SELECT * FROM (VALUES
      ('00000000-0000-4000-8000-000000000010'::uuid, '000042', DATE '2026-11-01', 'PENDING'::public.order_status, false),
      ('00000000-0000-4000-8000-000000000011'::uuid, 'DEMO-TRANSIT-001', DATE '2026-11-10', 'IN_TRANSIT'::public.order_status, false),
      ('00000000-0000-4000-8000-000000000012'::uuid, 'DEMO-DELIVERED-001', DATE '2026-10-15', 'DELIVERED'::public.order_status, false),
      ('00000000-0000-4000-8000-000000000013'::uuid, 'DEMO-CANCELED-001', DATE '2026-11-20', 'CANCELED'::public.order_status, false),
      ('00000000-0000-4000-8000-000000000014'::uuid, 'DEMO-DELETED-001', DATE '2026-12-01', 'PENDING'::public.order_status, true)
    ) AS scenarios(public_id, number, delivery_date, status, is_deleted)
  LOOP
    inserted_id := NULL;
    INSERT INTO public.orders(public_id, number, expected_delivery_date, status, deleted_at)
    VALUES (scenario.public_id, scenario.number, scenario.delivery_date, scenario.status,
            CASE WHEN scenario.is_deleted THEN TIMESTAMPTZ '2026-10-16 12:00:00+00' ELSE NULL END)
    ON CONFLICT (public_id) DO NOTHING
    RETURNING id INTO inserted_id;
    IF inserted_id IS NOT NULL THEN
      INSERT INTO public.order_customers(order_id, name, document)
      VALUES (inserted_id, 'Cliente fictício ' || scenario.number, 'DEMO-FICTICIO-' || scenario.number);
      INSERT INTO public.order_addresses(order_id, street, number, complement, district, city, state, postal_code, country)
      VALUES (inserted_id, 'Rua Demonstração', '42', 'Endereço fictício', 'Centro', 'São Paulo', 'SP', '00000000', 'BR');
      INSERT INTO public.order_items(order_id, description, price)
      VALUES (inserted_id, 'Produto fictício principal', 123.45),
             (inserted_id, 'Produto fictício adicional', 0.00);
    END IF;
  END LOOP;
END
$seed_scenarios$;
