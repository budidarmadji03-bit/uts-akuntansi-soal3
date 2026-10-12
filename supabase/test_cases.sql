-- Manual smoke-test guide. Do not run on production data.
-- Requires a Supabase project with 3.2_audit_trail.sql and seed_chart_of_accounts.sql applied,
-- plus an existing authenticated user. Replace the UUID below with that user's auth.users.id.
-- The transaction is rolled back at the end; review any returned values before rollback.

begin;
select set_config('request.jwt.claim.sub', '<AUTH_USER_UUID>', true);

-- T01: valid balanced voucher; expected: POSTED JSON with created_by and SHA-256 hash.
select public.rpc_create_cash_voucher(
  current_date,
  'TEST-KK-VALID-001',
  'Pembayaran utilitas (uji)',
  'OPERASI',
  '[
    {"account_code":"5001","debit":"125000.00","credit":"0.00"},
    {"account_code":"1001","debit":"0.00","credit":"125000.00"}
  ]'::jsonb
);

-- Inspect the returned journal_id while the transaction is open, then test:
-- T02: duplicate voucher number; expected unique_violation (SQLSTATE 23505).
-- T03: unbalanced values; expected business validation error.
-- T04: negative amount, 3 decimal places, both sides positive, or zero row; expected rejection.
-- T05: unknown/inactive account; expected rejection.
-- T06: missing cash credit or debit to a cash account; expected rejection.
-- T07: future transaction date; expected rejection using Asia/Jakarta.
-- T08: verify posted checksum; expected valid=true.
-- T09: attempt UPDATE/DELETE header and INSERT/UPDATE/DELETE line for the posted journal;
--      expected trigger rejection (SQLSTATE 55000).
-- T10: call rpc_reverse_journal with a reason; expected POSTED reversal with sides swapped.
-- T11: reverse the same source again; expected rejection and no duplicate reversal.
-- T12: inspect audit_log; expected header and line insert/post records with actor and server time.
-- T13: in an isolated disposable project only, alter a test row as database owner and call
--      rpc_verify_journal_hash; expected content_hash_valid=false. Roll back the alteration.
-- T14: run two concurrent postings/reversal requests in separate authenticated sessions;
--      expected unique sequential hash_sequence values and one reversal maximum.
-- T15: unauthenticated RPC, direct anon DML, and authenticated DML/TRUNCATE; expected denied.
-- T16: confirm a user cannot access private.hash_chain_state or mutate audit_log.

rollback;
