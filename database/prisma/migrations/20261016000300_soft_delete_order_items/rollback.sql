DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.order_items WHERE deleted_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Reversão recusada: itens antigos estão marcados como excluídos';
    END IF;
END;
$$;
DROP INDEX public.order_items_active_order_idx;
ALTER TABLE public.order_items DROP COLUMN deleted_at;
