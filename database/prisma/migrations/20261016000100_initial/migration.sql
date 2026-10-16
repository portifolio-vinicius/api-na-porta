CREATE TYPE public.order_status AS ENUM ('PENDING', 'IN_TRANSIT', 'DELIVERED', 'CANCELED');
CREATE TABLE public.users (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id uuid NOT NULL UNIQUE,
    email text NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND email <> ''),
    password_hash text NOT NULL CHECK (btrim(password_hash) <> ''),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.orders (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id uuid NOT NULL UNIQUE,
    number text NOT NULL UNIQUE CHECK (number = btrim(number) AND number <> ''),
    expected_delivery_date date NOT NULL,
    status public.order_status NOT NULL DEFAULT 'PENDING',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);
CREATE TABLE public.order_customers (
    order_id integer PRIMARY KEY REFERENCES public.orders(id),
    name text NOT NULL CHECK (btrim(name) <> ''),
    document text NOT NULL CHECK (document = btrim(document) AND document <> '')
);
CREATE TABLE public.order_addresses (
    order_id integer PRIMARY KEY REFERENCES public.orders(id),
    street text NOT NULL CHECK (btrim(street) <> ''),
    number text NOT NULL CHECK (btrim(number) <> ''),
    complement text,
    district text NOT NULL CHECK (btrim(district) <> ''),
    city text NOT NULL CHECK (btrim(city) <> ''),
    state text NOT NULL CHECK (btrim(state) <> ''),
    postal_code text NOT NULL CHECK (btrim(postal_code) <> ''),
    country text NOT NULL CHECK (btrim(country) <> '')
);
CREATE TABLE public.order_items (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id integer NOT NULL REFERENCES public.orders(id),
    description text NOT NULL CHECK (btrim(description) <> ''),
    price numeric(12,2) NOT NULL CHECK (price >= 0)
);
CREATE TABLE public.cache_versions (
    namespace text PRIMARY KEY,
    version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
INSERT INTO public.cache_versions(namespace) VALUES ('orders');
CREATE INDEX orders_active_delivery_date_idx ON public.orders(expected_delivery_date) WHERE deleted_at IS NULL;
CREATE INDEX orders_active_status_idx ON public.orders(status) WHERE deleted_at IS NULL;
CREATE INDEX order_items_order_id_idx ON public.order_items(order_id);
