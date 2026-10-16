INSERT INTO public.orders(public_id, number, expected_delivery_date)
VALUES ('00000000-0000-4000-8000-000000000001', 'DEMO-0001', DATE '2026-11-05')
ON CONFLICT (public_id) DO NOTHING;
INSERT INTO public.order_customers(order_id, name, document)
SELECT id, 'Cliente Demonstração', 'DEMO-0001' FROM public.orders
WHERE public_id = '00000000-0000-4000-8000-000000000001'
ON CONFLICT (order_id) DO NOTHING;
INSERT INTO public.order_addresses(order_id, street, number, district, city, state, postal_code, country)
SELECT id, 'Rua Exemplo', '123', 'Centro', 'São Paulo', 'SP', '01001000', 'BR' FROM public.orders
WHERE public_id = '00000000-0000-4000-8000-000000000001'
ON CONFLICT (order_id) DO NOTHING;
INSERT INTO public.order_items(order_id, description, price)
SELECT id, 'Item fictício', 49.90 FROM public.orders
WHERE public_id = '00000000-0000-4000-8000-000000000001'
AND NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = orders.id);
