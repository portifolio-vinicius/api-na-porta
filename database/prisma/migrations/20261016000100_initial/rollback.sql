DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM public.orders) OR EXISTS (SELECT 1 FROM public.users) THEN
        RAISE EXCEPTION 'Initial schema contains application data';
    END IF;
END $$;
DROP TABLE public.order_items;
DROP TABLE public.order_addresses;
DROP TABLE public.order_customers;
DROP TABLE public.orders;
DROP TABLE public.users;
DROP TABLE public.cache_versions;
DROP TYPE public.order_status;
