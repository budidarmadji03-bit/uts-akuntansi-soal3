-- Optional example chart of accounts for a fresh project. No journal transactions are seeded.
insert into public.chart_of_accounts (account_code, account_name, account_type, is_cash)
values
  ('1001', 'Kas Kecil', 'ASSET', true),
  ('1002', 'Bank', 'ASSET', true),
  ('1101', 'Piutang Usaha', 'ASSET', false),
  ('1201', 'Perlengkapan', 'ASSET', false),
  ('1501', 'Peralatan', 'ASSET', false),
  ('2001', 'Utang Usaha', 'LIABILITY', false),
  ('3001', 'Modal Pemilik', 'EQUITY', false),
  ('4001', 'Pendapatan Jasa', 'REVENUE', false),
  ('5001', 'Beban Utilitas', 'EXPENSE', false),
  ('5002', 'Beban Sewa', 'EXPENSE', false),
  ('5003', 'Beban Gaji', 'EXPENSE', false),
  ('5099', 'Beban Lain-lain', 'EXPENSE', false)
on conflict (account_code) do update
set account_name = excluded.account_name,
    account_type = excluded.account_type,
    is_cash = excluded.is_cash,
    is_active = true;
