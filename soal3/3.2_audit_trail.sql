-- Canonical Soal 3.2 migration for Supabase/PostgreSQL.
-- Run once in the Supabase SQL Editor. This migration does not seed journal transactions.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_extension as e
    join pg_catalog.pg_namespace as n on n.oid = e.extnamespace
    where e.extname = 'pgcrypto' and n.nspname <> 'extensions'
  ) then
    execute 'alter extension pgcrypto set schema extensions';
  end if;
end;
$$;

create table if not exists public.chart_of_accounts (
  account_code text primary key,
  account_name text not null,
  account_type text not null check (account_type in ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
  is_cash boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default transaction_timestamp()
);

create table if not exists public.journal_headers (
  journal_id uuid primary key default pg_catalog.gen_random_uuid(),
  voucher_no text not null unique,
  transaction_date date not null,
  description text not null default '',
  cash_flow_activity text not null check (cash_flow_activity in ('OPERASI', 'INVESTASI', 'PENDANAAN')),
  journal_type text not null check (journal_type in ('CASH_OUT', 'REVERSAL')),
  status text not null check (status in ('DRAFT', 'POSTED')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null,
  posted_at timestamptz,
  reversal_of uuid unique references public.journal_headers(journal_id) on delete restrict,
  reversal_reason text,
  hash_sequence bigint unique,
  prev_hash text references public.journal_headers(hash_checksum) on delete restrict,
  hash_checksum text unique,
  constraint journal_reversal_metadata_ck check (
    (journal_type = 'CASH_OUT' and reversal_of is null and reversal_reason is null)
    or
    (journal_type = 'REVERSAL' and reversal_of is not null and nullif(btrim(reversal_reason), '') is not null)
  ),
  constraint journal_posting_metadata_ck check (
    (status = 'DRAFT' and posted_at is null and hash_sequence is null and hash_checksum is null)
    or
    (status = 'POSTED' and posted_at is not null and hash_sequence is not null and hash_checksum is not null)
  )
);

create table if not exists public.journal_lines (
  journal_line_id uuid primary key default pg_catalog.gen_random_uuid(),
  journal_id uuid not null references public.journal_headers(journal_id) on delete restrict,
  line_no integer not null check (line_no > 0),
  account_code text not null references public.chart_of_accounts(account_code) on delete restrict,
  debit numeric(18, 2) not null default 0 check (debit >= 0),
  credit numeric(18, 2) not null default 0 check (credit >= 0),
  constraint journal_line_one_side_ck check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0)),
  constraint journal_line_no_uq unique (journal_id, line_no)
);

create table if not exists public.audit_log (
  audit_id bigint generated always as identity primary key,
  journal_id uuid,
  actor_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default clock_timestamp(),
  action text not null,
  object_type text not null,
  object_id text not null,
  old_data jsonb,
  new_data jsonb
);

create table if not exists private.hash_chain_state (
  singleton boolean primary key default true check (singleton),
  last_sequence bigint not null default 0 check (last_sequence >= 0),
  last_hash text references public.journal_headers(hash_checksum) on delete restrict
);

insert into private.hash_chain_state (singleton, last_sequence, last_hash)
values (true, 0, null)
on conflict (singleton) do nothing;

create index if not exists journal_headers_date_idx on public.journal_headers (transaction_date desc, created_at desc);
create index if not exists journal_headers_created_by_idx on public.journal_headers (created_by, created_at desc);
create index if not exists journal_lines_account_idx on public.journal_lines (account_code, journal_id);
create index if not exists audit_log_journal_idx on public.audit_log (journal_id, occurred_at desc);

create or replace function private.guard_journal_header()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'POSTED' then
      raise exception using errcode = '55000', message = 'Jurnal POSTED tidak dapat dihapus; gunakan jurnal pembalik.';
    end if;
    return old;
  end if;

  if old.status = 'POSTED' then
    raise exception using errcode = '55000', message = 'Jurnal POSTED bersifat immutable; gunakan jurnal pembalik.';
  end if;
  if old.status <> 'DRAFT' or new.status <> 'POSTED' then
    raise exception using errcode = '55000', message = 'Perubahan header hanya diizinkan saat transisi DRAFT ke POSTED.';
  end if;
  return new;
end;
$$;

create or replace function private.guard_journal_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_journal_id uuid;
  v_status text;
begin
  if tg_op = 'DELETE' then
    v_journal_id := old.journal_id;
  else
    v_journal_id := new.journal_id;
  end if;
  select h.status into v_status
  from public.journal_headers as h
  where h.journal_id = v_journal_id
  for key share;
  if v_status is distinct from 'DRAFT' then
    raise exception using errcode = '55000', message = 'Baris hanya dapat diubah saat jurnal DRAFT.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function private.write_journal_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_object_id text;
  v_journal_id uuid;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  v_object_id := coalesce(
    v_new ->> 'account_code', v_old ->> 'account_code',
    v_new ->> 'journal_line_id', v_old ->> 'journal_line_id',
    v_new ->> 'journal_id', v_old ->> 'journal_id'
  );
  v_journal_id := coalesce((v_new ->> 'journal_id')::uuid, (v_old ->> 'journal_id')::uuid);

  insert into public.audit_log (journal_id, actor_id, action, object_type, object_id, old_data, new_data)
  values (
    v_journal_id,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    v_object_id,
    v_old,
    v_new
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists chart_of_accounts_audit on public.chart_of_accounts;
create trigger chart_of_accounts_audit after insert or update or delete on public.chart_of_accounts
for each row execute function private.write_journal_audit();

drop trigger if exists journal_headers_guard on public.journal_headers;
create trigger journal_headers_guard before update or delete on public.journal_headers
for each row execute function private.guard_journal_header();
drop trigger if exists journal_lines_guard on public.journal_lines;
create trigger journal_lines_guard before insert or update or delete on public.journal_lines
for each row execute function private.guard_journal_line();
drop trigger if exists journal_headers_audit on public.journal_headers;
create trigger journal_headers_audit after insert or update or delete on public.journal_headers
for each row execute function private.write_journal_audit();
drop trigger if exists journal_lines_audit on public.journal_lines;
create trigger journal_lines_audit after insert or update or delete on public.journal_lines
for each row execute function private.write_journal_audit();

create or replace function private.compute_journal_hash(
  p_journal_id uuid,
  p_posted_at timestamptz,
  p_hash_sequence bigint,
  p_prev_hash text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'journal_id', h.journal_id::text,
          'voucher_no', h.voucher_no,
          'transaction_date', to_char(h.transaction_date, 'YYYY-MM-DD'),
          'description', h.description,
          'cash_flow_activity', h.cash_flow_activity,
          'journal_type', h.journal_type,
          'status', 'POSTED',
          'created_by', h.created_by::text,
          'created_at', to_char(h.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
          'posted_at', to_char(p_posted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
          'reversal_of', h.reversal_of::text,
          'reversal_reason', h.reversal_reason,
          'hash_sequence', p_hash_sequence,
          'prev_hash', p_prev_hash,
          'lines', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'line_no', l.line_no,
                'account_code', l.account_code,
                'debit', to_char(l.debit, 'FM999999999999999990.00'),
                'credit', to_char(l.credit, 'FM999999999999999990.00')
              ) order by l.line_no
            )
            from public.journal_lines as l
            where l.journal_id = h.journal_id
          ), '[]'::jsonb)
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  from public.journal_headers as h
  where h.journal_id = p_journal_id;
$$;

create or replace function public.rpc_create_cash_voucher(
  p_transaction_date date,
  p_voucher_no text,
  p_description text,
  p_cash_flow_activity text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_posted_at timestamptz;
  v_journal_id uuid := pg_catalog.gen_random_uuid();
  v_prev_hash text;
  v_sequence bigint;
  v_hash text;
  v_debit numeric(18, 2);
  v_credit numeric(18, 2);
  v_count integer;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Autentikasi diperlukan.'; end if;
  if p_transaction_date is null or p_transaction_date > (v_now at time zone 'Asia/Jakarta')::date then
    raise exception using errcode = '22007', message = 'Tanggal transaksi wajib valid dan tidak boleh di masa depan (Asia/Jakarta).';
  end if;
  if nullif(btrim(p_voucher_no), '') is null then raise exception using errcode = '22023', message = 'Nomor voucher wajib diisi.'; end if;
  if p_cash_flow_activity is null or p_cash_flow_activity not in ('OPERASI', 'INVESTASI', 'PENDANAAN') then
    raise exception using errcode = '22023', message = 'Klasifikasi arus kas tidak valid.';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' then raise exception using errcode = '22023', message = 'Baris jurnal harus berupa array JSON.'; end if;
  select count(*) into v_count from jsonb_array_elements(p_lines);
  if v_count < 2 then raise exception using errcode = '22023', message = 'Jurnal harus memiliki minimal dua baris.'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_lines) as x(account_code text, debit numeric, credit numeric)
    left join public.chart_of_accounts as a on a.account_code = x.account_code and a.is_active
    where a.account_code is null
       or x.debit is null or x.credit is null
       or x.debit < 0 or x.credit < 0
       or x.debit <> round(x.debit, 2) or x.credit <> round(x.credit, 2)
       or not ((x.debit > 0 and x.credit = 0) or (x.credit > 0 and x.debit = 0))
  ) then
    raise exception using errcode = '22023', message = 'Baris tidak valid: akun harus aktif dan tepat satu nominal harus positif.';
  end if;
  select coalesce(sum(x.debit), 0), coalesce(sum(x.credit), 0)
  into v_debit, v_credit
  from jsonb_to_recordset(p_lines) as x(account_code text, debit numeric, credit numeric);
  if v_debit <= 0 or v_debit <> v_credit then
    raise exception using errcode = '22023', message = 'Jurnal harus seimbang dan total lebih besar dari nol.';
  end if;
  if not exists (
    select 1 from jsonb_to_recordset(p_lines) as x(account_code text, debit numeric, credit numeric)
    join public.chart_of_accounts as a on a.account_code = x.account_code
    where a.is_cash and x.credit > 0
  ) then raise exception using errcode = '22023', message = 'Voucher kas keluar harus mengkredit akun kas.'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lines) as x(account_code text, debit numeric, credit numeric)
    join public.chart_of_accounts as a on a.account_code = x.account_code
    where a.is_cash and x.debit > 0
  ) then raise exception using errcode = '22023', message = 'Akun kas tidak boleh didebit pada voucher kas keluar.'; end if;

  perform 1 from private.hash_chain_state where singleton for update;
  select last_hash, last_sequence + 1 into v_prev_hash, v_sequence
  from private.hash_chain_state where singleton;

  insert into public.journal_headers (
    journal_id, voucher_no, transaction_date, description, cash_flow_activity,
    journal_type, status, created_by, created_at, prev_hash
  ) values (
    v_journal_id, btrim(p_voucher_no), p_transaction_date, coalesce(p_description, ''),
    p_cash_flow_activity, 'CASH_OUT', 'DRAFT', v_actor, v_now, v_prev_hash
  );
  insert into public.journal_lines (journal_id, line_no, account_code, debit, credit)
  select v_journal_id, x.ordinality::integer, x.account_code, x.debit, x.credit
  from jsonb_array_elements(p_lines) with ordinality as e(value, ordinality)
  cross join lateral jsonb_to_record(e.value) as x(account_code text, debit numeric, credit numeric)
  order by e.ordinality;

  v_posted_at := clock_timestamp();
  v_hash := private.compute_journal_hash(v_journal_id, v_posted_at, v_sequence, v_prev_hash);
  update public.journal_headers
  set status = 'POSTED', posted_at = v_posted_at, hash_sequence = v_sequence, hash_checksum = v_hash
  where journal_id = v_journal_id;
  update private.hash_chain_state set last_sequence = v_sequence, last_hash = v_hash where singleton;

  return jsonb_build_object(
    'journal_id', v_journal_id,
    'voucher_no', btrim(p_voucher_no),
    'status', 'POSTED',
    'created_by', v_actor,
    'created_at', v_now,
    'posted_at', v_posted_at,
    'hash_sequence', v_sequence,
    'prev_hash', v_prev_hash,
    'hash_checksum', v_hash
  );
end;
$$;

create or replace function public.rpc_reverse_journal(
  p_journal_id uuid,
  p_reversal_voucher_no text,
  p_reversal_date date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_original public.journal_headers%rowtype;
  v_now timestamptz := clock_timestamp();
  v_posted_at timestamptz;
  v_new_id uuid := pg_catalog.gen_random_uuid();
  v_prev_hash text;
  v_sequence bigint;
  v_hash text;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'Autentikasi diperlukan.'; end if;
  if nullif(btrim(p_reversal_voucher_no), '') is null or nullif(btrim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'Nomor voucher pembalik dan alasan wajib diisi.';
  end if;
  if p_reversal_date is null or p_reversal_date > (v_now at time zone 'Asia/Jakarta')::date then
    raise exception using errcode = '22007', message = 'Tanggal pembalikan wajib valid dan tidak boleh di masa depan.';
  end if;
  select * into v_original from public.journal_headers where journal_id = p_journal_id for update;
  if not found or v_original.status <> 'POSTED' then
    raise exception using errcode = '22023', message = 'Hanya jurnal POSTED yang dapat dibalik.';
  end if;
  if exists (select 1 from public.journal_headers where reversal_of = p_journal_id) then
    raise exception using errcode = '23505', message = 'Jurnal ini sudah pernah dibalik.';
  end if;

  perform 1 from private.hash_chain_state where singleton for update;
  select last_hash, last_sequence + 1 into v_prev_hash, v_sequence
  from private.hash_chain_state where singleton;
  insert into public.journal_headers (
    journal_id, voucher_no, transaction_date, description, cash_flow_activity,
    journal_type, status, created_by, created_at, reversal_of, reversal_reason,
    prev_hash
  ) values (
    v_new_id, btrim(p_reversal_voucher_no), p_reversal_date,
    'Pembalikan voucher ' || v_original.voucher_no || ': ' || btrim(p_reason),
    v_original.cash_flow_activity, 'REVERSAL', 'DRAFT', v_actor, v_now,
    p_journal_id, btrim(p_reason), v_prev_hash
  );
  insert into public.journal_lines (journal_id, line_no, account_code, debit, credit)
  select v_new_id, l.line_no, l.account_code, l.credit, l.debit
  from public.journal_lines as l
  where l.journal_id = p_journal_id
  order by l.line_no;

  v_posted_at := clock_timestamp();
  v_hash := private.compute_journal_hash(v_new_id, v_posted_at, v_sequence, v_prev_hash);
  update public.journal_headers
  set status = 'POSTED', posted_at = v_posted_at, hash_sequence = v_sequence, hash_checksum = v_hash
  where journal_id = v_new_id;
  update private.hash_chain_state set last_sequence = v_sequence, last_hash = v_hash where singleton;

  return jsonb_build_object(
    'journal_id', v_new_id,
    'reversal_of', p_journal_id,
    'voucher_no', btrim(p_reversal_voucher_no),
    'status', 'POSTED',
    'created_by', v_actor,
    'created_at', v_now,
    'posted_at', v_posted_at,
    'hash_sequence', v_sequence,
    'prev_hash', v_prev_hash,
    'hash_checksum', v_hash
  );
end;
$$;

create or replace function public.rpc_verify_journal_hash(p_journal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_header public.journal_headers%rowtype;
  v_computed text;
  v_link_valid boolean;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Autentikasi diperlukan.'; end if;
  select * into v_header from public.journal_headers where journal_id = p_journal_id;
  if not found or v_header.status <> 'POSTED' then
    raise exception using errcode = '22023', message = 'Jurnal POSTED tidak ditemukan.';
  end if;
  v_computed := private.compute_journal_hash(
    v_header.journal_id, v_header.posted_at, v_header.hash_sequence, v_header.prev_hash
  );
  v_link_valid := (v_header.hash_sequence = 1 and v_header.prev_hash is null)
    or exists (
      select 1 from public.journal_headers as previous
      where previous.hash_checksum = v_header.prev_hash
        and previous.hash_sequence = v_header.hash_sequence - 1
        and previous.status = 'POSTED'
    );
  return jsonb_build_object(
    'journal_id', p_journal_id,
    'valid', v_computed = v_header.hash_checksum and v_link_valid,
    'content_hash_valid', v_computed = v_header.hash_checksum,
    'previous_link_valid', v_link_valid,
    'stored_hash', v_header.hash_checksum,
    'computed_hash', v_computed,
    'hash_sequence', v_header.hash_sequence
  );
end;
$$;

alter table public.chart_of_accounts enable row level security;
alter table public.journal_headers enable row level security;
alter table public.journal_lines enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists coa_read_authenticated on public.chart_of_accounts;
create policy coa_read_authenticated on public.chart_of_accounts for select to authenticated using (true);
drop policy if exists headers_read_authenticated on public.journal_headers;
create policy headers_read_authenticated on public.journal_headers for select to authenticated using (true);
drop policy if exists lines_read_authenticated on public.journal_lines;
create policy lines_read_authenticated on public.journal_lines for select to authenticated using (true);
drop policy if exists audit_read_authenticated on public.audit_log;
create policy audit_read_authenticated on public.audit_log for select to authenticated using (true);

revoke all on public.chart_of_accounts, public.journal_headers, public.journal_lines, public.audit_log from anon, authenticated;
revoke all on private.hash_chain_state from public, anon, authenticated;
revoke all on function public.rpc_create_cash_voucher(date, text, text, text, jsonb) from public, anon;
revoke all on function public.rpc_reverse_journal(uuid, text, date, text) from public, anon;
revoke all on function public.rpc_verify_journal_hash(uuid) from public, anon;
revoke all on function private.compute_journal_hash(uuid, timestamptz, bigint, text) from public, anon, authenticated;
revoke all on function private.guard_journal_header() from public, anon, authenticated;
revoke all on function private.guard_journal_line() from public, anon, authenticated;
revoke all on function private.write_journal_audit() from public, anon, authenticated;

grant usage on schema public to authenticated;
grant select on public.chart_of_accounts, public.journal_headers, public.journal_lines, public.audit_log to authenticated;
grant execute on function public.rpc_create_cash_voucher(date, text, text, text, jsonb) to authenticated;
grant execute on function public.rpc_reverse_journal(uuid, text, date, text) to authenticated;
grant execute on function public.rpc_verify_journal_hash(uuid) to authenticated;
