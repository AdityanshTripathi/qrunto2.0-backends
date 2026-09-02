-- The API uses custom server-side auth, not Supabase Auth. Direct Data API
-- access to order data is therefore closed for browser roles.
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.transactions enable row level security;
alter table public.invoices enable row level security;
alter table public.order_status_history enable row level security;

revoke all privileges on table public.orders from anon, authenticated;
revoke all privileges on table public.order_items from anon, authenticated;
revoke all privileges on table public.payments from anon, authenticated;
revoke all privileges on table public.transactions from anon, authenticated;
revoke all privileges on table public.invoices from anon, authenticated;
revoke all privileges on table public.order_status_history from anon, authenticated;

-- Composite keys let Postgres enforce that related records belong to the
-- same restaurant, even if application validation is accidentally bypassed.
alter table public.restaurant_tables
  add constraint restaurant_tables_id_restaurant_id_key unique (id, restaurant_id);
alter table public.waiters
  add constraint waiters_id_restaurant_id_key unique (id, restaurant_id);
alter table public.orders
  add constraint orders_id_restaurant_id_key unique (id, restaurant_id);
alter table public.payments
  add constraint payments_id_restaurant_id_key unique (id, restaurant_id);

alter table public.orders
  add constraint orders_table_tenant_fk
  foreign key (table_id, restaurant_id)
  references public.restaurant_tables (id, restaurant_id);
alter table public.orders
  add constraint orders_waiter_tenant_fk
  foreign key (assigned_waiter_id, restaurant_id)
  references public.waiters (id, restaurant_id);
alter table public.payments
  add constraint payments_order_tenant_fk
  foreign key (order_id, restaurant_id)
  references public.orders (id, restaurant_id)
  on delete cascade;
alter table public.invoices
  add constraint invoices_order_tenant_fk
  foreign key (order_id, restaurant_id)
  references public.orders (id, restaurant_id)
  on delete cascade;
alter table public.transactions
  add constraint transactions_payment_tenant_fk
  foreign key (payment_id, restaurant_id)
  references public.payments (id, restaurant_id);
