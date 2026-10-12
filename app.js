const form = document.getElementById("journal-form");
const linesBody = document.getElementById("journal-lines");
const addLineButton = document.getElementById("add-line");
const submitButton = document.getElementById("submit-button");
const submitLabel = document.getElementById("submit-label");
const submitSpinner = document.getElementById("submit-spinner");
const totalDebitEl = document.getElementById("total-debit");
const totalCreditEl = document.getElementById("total-credit");
const balanceCard = document.getElementById("balance-card");
const balanceStatus = document.getElementById("balance-status");
const differenceEl = document.getElementById("difference");
const reasonList = document.getElementById("reason-list");
const submitReasons = document.getElementById("submit-reasons");
const checklist = document.getElementById("business-checklist");
const message = document.getElementById("message");
const dateInput = document.getElementById("date");
const voucherInput = document.getElementById("voucher");
const activityInput = document.getElementById("cash-flow-activity");
const authForm = document.getElementById("auth-form");
const authStatus = document.getElementById("connection-status");
const signOutButton = document.getElementById("sign-out");
const historyRows = document.getElementById("history-rows");
const historyEmpty = document.getElementById("history-empty");
const detailPanel = document.getElementById("journal-detail");
const detailTitle = document.getElementById("detail-title");
const detailLines = document.getElementById("detail-lines");
const auditEvents = document.getElementById("audit-events");
const hashResult = document.getElementById("hash-result");
const reverseForm = document.getElementById("reverse-form");

const ruleNames = [
  "Tanggal dan nomor voucher wajib diisi.",
  "Tanggal transaksi tidak boleh berada di masa depan menurut waktu Asia/Jakarta.",
  "Jurnal mempunyai minimal dua baris valid.",
  "Setiap baris yang digunakan mempunyai akun aktif yang valid.",
  "Nominal debit dan kredit tidak boleh negatif dan harus memakai maksimal dua angka desimal.",
  "Satu baris tidak boleh memiliki debit dan kredit positif sekaligus.",
  "Setiap baris yang digunakan harus mempunyai nominal positif pada salah satu sisi.",
  "Total debit harus sama dengan kredit dan lebih besar dari nol.",
  "Voucher kas keluar mempunyai setidaknya satu baris yang mengkredit akun Kas.",
  "Akun Kas tidak didebit dalam voucher kas keluar.",
  "Klasifikasi aktivitas arus kas sudah dipilih.",
  "Saya sudah memeriksa entri jurnal dan memastikan sesuai dengan bukti pengeluaran."
];
const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
let supabaseClient = null;
let currentUser = null;
let accounts = [];
let activeJournalId = null;
let isSubmitting = false;
let historyLoading = false;

function jakartaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function toCents(input) {
  if (input.value === "") return { cents: 0, valid: true, safe: true };
  const amount = input.valueAsNumber;
  if (!Number.isFinite(amount)) return { cents: 0, valid: false, safe: false };
  const cents = Math.round(amount * 100);
  const safe = Number.isSafeInteger(cents);
  return {
    cents: safe ? cents : 0,
    valid: input.validity.valid && amount >= 0 && safe,
    safe
  };
}

function moneyFromCents(cents) {
  return rupiah.format(cents / 100);
}

function setConnectionStatus(text, kind = "warning") {
  authStatus.textContent = text;
  authStatus.className = kind === "success"
    ? "mt-1 text-sm text-emerald-800"
    : kind === "error"
      ? "mt-1 text-sm text-rose-800"
      : "mt-1 text-sm text-amber-800";
}

function updateAccountOptions(select, selected = select.value) {
  select.replaceChildren(new Option(accounts.length ? "Pilih akun" : "Belum ada akun aktif", ""));
  for (const account of accounts) {
    select.add(new Option(`${account.account_code} · ${account.account_name}`, account.account_code));
  }
  if (accounts.some(account => account.account_code === selected)) select.value = selected;
}

function addLine() {
  const row = document.createElement("tr");
  row.className = "align-top";
  row.innerHTML = `
    <td class="px-3 py-3 sm:px-4"><select aria-label="Akun jurnal" class="account w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"></select></td>
    <td class="px-3 py-3 sm:px-4"><input aria-label="Debit dalam rupiah" class="debit w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm tabular-nums outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0,00"></td>
    <td class="px-3 py-3 sm:px-4"><input aria-label="Kredit dalam rupiah" class="credit w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm tabular-nums outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0,00"></td>
    <td class="px-3 py-3 text-center"><button type="button" class="remove-line rounded-lg px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 focus:outline-none focus:ring-4 focus:ring-rose-100" aria-label="Hapus baris jurnal">Hapus</button></td>`;
  updateAccountOptions(row.querySelector(".account"));
  row.addEventListener("input", refresh);
  row.addEventListener("change", refresh);
  row.querySelector(".remove-line").addEventListener("click", () => {
    row.remove();
    refresh();
  });
  linesBody.appendChild(row);
  refresh();
}

function readRows() {
  let debitCents = 0;
  let creditCents = 0;
  let totalsSafe = true;
  let validRowCount = 0;
  let everyUsedAccountValid = true;
  let everyAmountValid = true;
  let noDualSidedRows = true;
  let everyUsedRowHasOnePositiveSide = true;
  let cashCreditExists = false;
  let cashDebitExists = false;

  for (const row of linesBody.querySelectorAll("tr")) {
    const accountCode = row.querySelector(".account").value;
    const account = accounts.find(item => item.account_code === accountCode);
    const debitInput = row.querySelector(".debit");
    const creditInput = row.querySelector(".credit");
    const debit = toCents(debitInput);
    const credit = toCents(creditInput);
    const used = accountCode !== "" || debitInput.value !== "" || creditInput.value !== "";
    const debitPositive = debit.valid && debit.cents > 0;
    const creditPositive = credit.valid && credit.cents > 0;
    const hasBothPositive = debitPositive && creditPositive;
    const hasOnePositiveSide = debitPositive !== creditPositive;
    const accountValid = Boolean(account?.is_active);
    const amountsValid = debit.valid && credit.valid;

    if (debit.safe && Number.isSafeInteger(debitCents + debit.cents)) debitCents += debit.cents;
    else totalsSafe = false;
    if (credit.safe && Number.isSafeInteger(creditCents + credit.cents)) creditCents += credit.cents;
    else totalsSafe = false;
    if (!amountsValid) everyAmountValid = false;
    if (hasBothPositive) noDualSidedRows = false;
    if (account?.is_cash && creditPositive) cashCreditExists = true;
    if (account?.is_cash && debitPositive) cashDebitExists = true;
    if (!used) continue;
    if (!accountValid) everyUsedAccountValid = false;
    if (!hasOnePositiveSide) everyUsedRowHasOnePositiveSide = false;
    if (accountValid && amountsValid && !hasBothPositive && hasOnePositiveSide) validRowCount += 1;
  }
  return {
    debitCents, creditCents, totalsSafe, validRowCount, everyUsedAccountValid,
    everyAmountValid, noDualSidedRows, everyUsedRowHasOnePositiveSide,
    cashCreditExists, cashDebitExists
  };
}

function setChecklistItem(index, passed, manuallyChecked = false) {
  const item = document.createElement("li");
  item.className = "flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.disabled = index !== 11 || isSubmitting;
  checkbox.checked = index === 11 ? manuallyChecked : passed;
  checkbox.className = "mt-0.5 h-4 w-4 shrink-0 accent-blue-700";
  if (index === 11) {
    checkbox.id = "review-confirmation";
    checkbox.addEventListener("change", refresh);
  } else {
    checkbox.setAttribute("aria-label", passed ? "Aturan terpenuhi" : "Aturan belum terpenuhi");
  }
  const text = document.createElement("span");
  text.className = passed ? "text-slate-700" : "text-slate-500";
  text.textContent = ruleNames[index];
  item.append(checkbox, text);
  checklist.appendChild(item);
}

function refresh() {
  const manuallyChecked = Boolean(document.getElementById("review-confirmation")?.checked);
  const rows = readRows();
  const today = jakartaDate();
  dateInput.max = today;
  const datePresent = dateInput.value !== "";
  const dateNotFuture = datePresent && dateInput.value <= today && dateInput.validity.valid;
  const metadataPresent = datePresent && voucherInput.value.trim() !== "";
  const balanced = rows.totalsSafe && rows.debitCents === rows.creditCents && rows.debitCents > 0;
  const rules = [
    metadataPresent,
    dateNotFuture,
    rows.validRowCount >= 2,
    rows.everyUsedAccountValid,
    rows.everyAmountValid,
    rows.noDualSidedRows,
    rows.everyUsedRowHasOnePositiveSide,
    balanced,
    rows.cashCreditExists,
    !rows.cashDebitExists,
    activityInput.value !== "",
    manuallyChecked
  ];
  const allPassed = rules.every(Boolean);

  totalDebitEl.textContent = rows.totalsSafe ? moneyFromCents(rows.debitCents) : "Nominal terlalu besar";
  totalCreditEl.textContent = rows.totalsSafe ? moneyFromCents(rows.creditCents) : "Nominal terlalu besar";
  balanceCard.className = balanced
    ? "rounded-xl border border-emerald-200 bg-emerald-50 p-4"
    : "rounded-xl border border-rose-200 bg-rose-50 p-4";
  balanceStatus.className = balanced ? "mt-1 text-sm font-bold text-emerald-800" : "mt-1 text-sm font-bold text-rose-800";
  differenceEl.className = balanced ? "mt-0.5 text-sm tabular-nums text-emerald-700" : "mt-0.5 text-sm tabular-nums text-rose-700";
  balanceStatus.textContent = balanced ? "SEIMBANG" : "TIDAK SEIMBANG";
  differenceEl.textContent = rows.totalsSafe
    ? `Selisih: ${moneyFromCents(Math.abs(rows.debitCents - rows.creditCents))}`
    : "Selisih tidak dapat dihitung";

  checklist.replaceChildren();
  rules.forEach((passed, index) => setChecklistItem(index, passed, manuallyChecked));
  reasonList.replaceChildren();
  const reasons = [];
  if (!metadataPresent) reasons.push("Isi tanggal transaksi dan nomor voucher.");
  if (!dateNotFuture) reasons.push(datePresent ? "Pilih tanggal valid yang tidak melewati hari ini (Asia/Jakarta)." : "Pilih tanggal transaksi.");
  if (rows.validRowCount < 2) reasons.push(`Lengkapi minimal dua baris jurnal valid (saat ini ${rows.validRowCount}).`);
  if (!rows.everyUsedAccountValid) reasons.push("Pilih akun aktif yang valid pada setiap baris yang digunakan.");
  if (!rows.everyAmountValid) reasons.push("Periksa nominal: gunakan angka tidak negatif, maksimal dua desimal, dan nilai yang dapat dihitung.");
  if (!rows.noDualSidedRows) reasons.push("Satu baris tidak boleh memiliki debit dan kredit positif sekaligus.");
  if (!rows.everyUsedRowHasOnePositiveSide) reasons.push("Setiap baris yang digunakan harus memiliki tepat satu nominal positif.");
  if (!balanced) reasons.push("Samakan total debit dan kredit serta pastikan jumlahnya lebih besar dari nol.");
  if (!rows.cashCreditExists) reasons.push("Tambahkan baris kredit untuk akun kas.");
  if (rows.cashDebitExists) reasons.push("Akun kas tidak boleh didebit pada voucher kas keluar.");
  if (!activityInput.value) reasons.push("Pilih klasifikasi aktivitas arus kas.");
  if (!manuallyChecked) reasons.push("Centang konfirmasi pemeriksaan jurnal dan bukti pengeluaran.");
  if (!supabaseClient) reasons.push("Isi konfigurasi Supabase sebelum mengirim transaksi.");
  else if (!currentUser) reasons.push("Masuk ke Supabase untuk memuat akun, menyimpan, dan mem-posting jurnal.");

  if (reasons.length === 0) {
    submitReasons.className = "mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4";
    const heading = document.createElement("p");
    heading.className = "text-sm font-semibold text-emerald-900";
    heading.textContent = "Validasi lokal terpenuhi dan sesi Supabase aktif. Posting akan divalidasi kembali di database.";
    reasonList.appendChild(heading);
  } else {
    submitReasons.className = "mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4";
    reasons.forEach(reason => {
      const item = document.createElement("li");
      item.textContent = reason;
      reasonList.appendChild(item);
    });
  }
  submitButton.disabled = !allPassed || !currentUser || !supabaseClient || isSubmitting;
  addLineButton.disabled = isSubmitting;
  addLineButton.classList.toggle("opacity-50", isSubmitting);
}

function showMessage(text, kind) {
  message.textContent = text;
  message.className = kind === "success"
    ? "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
    : "rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900";
}

async function loadAccounts() {
  const { data, error } = await supabaseClient
    .from("chart_of_accounts")
    .select("account_code,account_name,is_cash,is_active")
    .eq("is_active", true)
    .order("account_code");
  if (error) throw error;
  accounts = data ?? [];
  for (const select of linesBody.querySelectorAll(".account")) updateAccountOptions(select);
  refresh();
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

async function loadHistory() {
  if (!currentUser || !supabaseClient || historyLoading) return;
  historyLoading = true;
  historyEmpty.textContent = "Memuat riwayat...";
  try {
    const { data, error } = await supabaseClient
      .from("journal_headers")
      .select("journal_id,voucher_no,transaction_date,status,journal_type,hash_checksum,reversal_of")
      .order("posted_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    historyRows.replaceChildren();
    historyEmpty.textContent = data.length ? "" : "Belum ada jurnal yang diposting.";
    for (const journal of data) {
      const row = document.createElement("tr");
      row.append(
        element("td", "px-4 py-3 tabular-nums", journal.transaction_date),
        element("td", "px-4 py-3 font-medium text-slate-800", journal.voucher_no),
        element("td", "px-4 py-3", `${journal.status}${journal.journal_type === "REVERSAL" ? " · Pembalik" : ""}`),
        element("td", "px-4 py-3 font-mono text-xs", journal.hash_checksum?.slice(0, 16) ?? "-")
      );
      const actionCell = document.createElement("td");
      actionCell.className = "px-4 py-3";
      const detailButton = element("button", "font-semibold text-blue-700 hover:underline", "Detail");
      detailButton.type = "button";
      detailButton.addEventListener("click", () => openJournalDetail(journal));
      actionCell.appendChild(detailButton);
      row.appendChild(actionCell);
      historyRows.appendChild(row);
    }
  } catch (error) {
    historyEmpty.textContent = `Gagal memuat riwayat: ${error.message}`;
  } finally {
    historyLoading = false;
  }
}

async function openJournalDetail(journal) {
  activeJournalId = journal.journal_id;
  detailPanel.classList.remove("hidden");
  detailTitle.textContent = `Voucher ${journal.voucher_no}`;
  detailLines.textContent = "Memuat detail jurnal...";
  auditEvents.replaceChildren();
  hashResult.textContent = "";
  reverseForm.classList.toggle("hidden", journal.journal_type === "REVERSAL");
  document.getElementById("reversal-date").max = jakartaDate();
  document.getElementById("reversal-date").value = jakartaDate();

  try {
    const [{ data: header, error: headerError }, { data: lines, error: linesError }, { data: events, error: auditError }] = await Promise.all([
      supabaseClient.from("journal_headers").select("*").eq("journal_id", journal.journal_id).single(),
      supabaseClient.from("journal_lines").select("line_no,account_code,debit,credit").eq("journal_id", journal.journal_id).order("line_no"),
      supabaseClient.from("audit_log").select("occurred_at,actor_id,action,object_type,object_id,old_data,new_data").eq("journal_id", journal.journal_id).order("occurred_at", { ascending: true })
    ]);
    if (headerError) throw headerError;
    if (linesError) throw linesError;
    if (auditError) throw auditError;
    detailLines.textContent = [
      `Tanggal: ${header.transaction_date}`,
      `Status: ${header.status} · ${header.journal_type}`,
      `Klasifikasi: ${header.cash_flow_activity}`,
      `Dibuat oleh: ${header.created_by}`,
      `Dibuat pada: ${header.created_at}`,
      `Diposting pada: ${header.posted_at}`,
      `Hash urutan: ${header.hash_sequence}`,
      `Hash sebelumnya: ${header.prev_hash ?? "(awal rantai)"}`,
      `SHA-256: ${header.hash_checksum}`,
      "",
      ...lines.map(line => `${line.line_no}. ${line.account_code} | Debit ${moneyFromCents(Math.round(Number(line.debit) * 100))} | Kredit ${moneyFromCents(Math.round(Number(line.credit) * 100))}`)
    ].join("\n");
    for (const event of events) {
      const item = document.createElement("li");
      item.className = "rounded border border-slate-200 bg-white p-2";
      item.textContent = `${event.occurred_at} · ${event.action} ${event.object_type} ${event.object_id} · aktor ${event.actor_id ?? "system"} · data baru ${JSON.stringify(event.new_data)}`;
      auditEvents.appendChild(item);
    }
    detailPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    detailLines.textContent = `Gagal memuat detail/audit trail: ${error.message}`;
  }
}

async function updateSession(session) {
  currentUser = session?.user ?? null;
  signOutButton.classList.toggle("hidden", !currentUser);
  for (const control of authForm.querySelectorAll("input,button")) control.disabled = Boolean(currentUser) || !supabaseClient;
  if (!supabaseClient) {
    setConnectionStatus("Supabase belum dikonfigurasi; transaksi tidak dapat dikirim atau disimpan.", "warning");
    accounts = [];
  } else if (!currentUser) {
    setConnectionStatus("Supabase siap. Masuk dengan akun terautentikasi untuk menggunakan aplikasi.", "warning");
    accounts = [];
    historyRows.replaceChildren();
    historyEmpty.textContent = "Masuk untuk memuat riwayat jurnal.";
  } else {
    setConnectionStatus(`Terautentikasi sebagai ${currentUser.email}.`, "success");
    try {
      await loadAccounts();
      await loadHistory();
    } catch (error) {
      setConnectionStatus(`Gagal memuat data Supabase: ${error.message}`, "error");
    }
  }
  for (const select of linesBody.querySelectorAll(".account")) updateAccountOptions(select);
  refresh();
}

addLineButton.addEventListener("click", addLine);
form.addEventListener("input", () => {
  message.classList.add("hidden");
  refresh();
});
form.addEventListener("change", () => {
  message.classList.add("hidden");
  refresh();
});
form.addEventListener("submit", async event => {
  event.preventDefault();
  refresh();
  if (submitButton.disabled) {
    showMessage("Posting belum dapat dilakukan. Periksa alasan yang ditampilkan di atas.", "error");
    return;
  }
  isSubmitting = true;
  submitButton.disabled = true;
  submitSpinner.classList.remove("hidden");
  submitLabel.textContent = "Memvalidasi dan mem-posting...";
  for (const control of form.querySelectorAll("input,select,textarea,button")) control.disabled = true;
  try {
    const p_lines = [...linesBody.querySelectorAll("tr")].filter(row =>
      row.querySelector(".account").value ||
      row.querySelector(".debit").value ||
      row.querySelector(".credit").value
    ).map(row => ({
      account_code: row.querySelector(".account").value,
      debit: (Math.round(Number(row.querySelector(".debit").value || 0) * 100) / 100).toFixed(2),
      credit: (Math.round(Number(row.querySelector(".credit").value || 0) * 100) / 100).toFixed(2)
    }));
    const { data, error } = await supabaseClient.rpc("rpc_create_cash_voucher", {
      p_transaction_date: dateInput.value,
      p_voucher_no: voucherInput.value.trim(),
      p_description: document.getElementById("description").value.trim(),
      p_cash_flow_activity: activityInput.value,
      p_lines
    });
    if (error) throw error;
    showMessage(`Jurnal ${data.voucher_no} berhasil diposting ke Supabase. ID ${data.journal_id}; hash ${data.hash_checksum}.`, "success");
    form.reset();
    linesBody.replaceChildren();
    addLine();
    addLine();
    await loadHistory();
  } catch (error) {
    showMessage(`Posting gagal: ${error.message}`, "error");
  } finally {
    isSubmitting = false;
    for (const control of form.querySelectorAll("input,select,textarea,button")) control.disabled = false;
    submitSpinner.classList.add("hidden");
    submitLabel.textContent = "Submit & Posting Jurnal";
    refresh();
  }
});

authForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!supabaseClient) return;
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  const action = event.submitter?.dataset.authAction;
  try {
    const result = action === "sign-up"
      ? await supabaseClient.auth.signUp({ email, password })
      : await supabaseClient.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    if (action === "sign-up" && !result.data.session) {
      setConnectionStatus("Pendaftaran diterima. Periksa email untuk konfirmasi, lalu masuk.", "success");
    } else {
      await updateSession(result.data.session);
    }
  } catch (error) {
    setConnectionStatus(`Autentikasi gagal: ${error.message}`, "error");
  }
});

signOutButton.addEventListener("click", async () => {
  const { error } = await supabaseClient.auth.signOut();
  if (error) setConnectionStatus(`Gagal keluar: ${error.message}`, "error");
});
document.getElementById("refresh-history").addEventListener("click", loadHistory);
document.getElementById("verify-hash").addEventListener("click", async () => {
  if (!activeJournalId) return;
  hashResult.textContent = "Memverifikasi...";
  try {
    const { data, error } = await supabaseClient.rpc("rpc_verify_journal_hash", { p_journal_id: activeJournalId });
    if (error) throw error;
    hashResult.textContent = data.valid
      ? `VALID — checksum dan tautan sebelumnya cocok (${data.computed_hash}).`
      : `TIDAK VALID — checksum: ${data.content_hash_valid ? "cocok" : "berbeda"}; tautan sebelumnya: ${data.previous_link_valid ? "cocok" : "berbeda"}.`;
    hashResult.className = data.valid ? "mt-2 text-sm font-semibold text-emerald-800" : "mt-2 text-sm font-semibold text-rose-800";
  } catch (error) {
    hashResult.textContent = `Verifikasi gagal: ${error.message}`;
    hashResult.className = "mt-2 text-sm font-semibold text-rose-800";
  }
});

reverseForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!activeJournalId || !currentUser) return;
  const button = document.getElementById("reverse-submit");
  button.disabled = true;
  button.textContent = "Memproses pembalikan...";
  try {
    const { data, error } = await supabaseClient.rpc("rpc_reverse_journal", {
      p_journal_id: activeJournalId,
      p_reversal_voucher_no: document.getElementById("reversal-voucher").value.trim(),
      p_reversal_date: document.getElementById("reversal-date").value,
      p_reason: document.getElementById("reversal-reason").value.trim()
    });
    if (error) throw error;
    hashResult.textContent = `Jurnal pembalik ${data.voucher_no} berhasil diposting. Hash ${data.hash_checksum}.`;
    hashResult.className = "mt-2 text-sm font-semibold text-emerald-800";
    await loadHistory();
  } catch (error) {
    hashResult.textContent = `Pembalikan gagal: ${error.message}`;
    hashResult.className = "mt-2 text-sm font-semibold text-rose-800";
  } finally {
    button.disabled = false;
    button.textContent = "Posting jurnal pembalik";
  }
});

document.getElementById("reversal-date").max = jakartaDate();
addLine();
addLine();
const config = window.APP_CONFIG;
if (window.supabase?.createClient && config?.supabaseUrl && config?.supabaseAnonKey) {
  supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => updateSession(session), 0);
  });
  supabaseClient.auth.getSession()
    .then(({ data, error }) => {
      if (error) throw error;
      return updateSession(data.session);
    })
    .catch(error => setConnectionStatus(`Gagal memeriksa sesi Supabase: ${error.message}`, "error"));
} else {
  setConnectionStatus("Konfigurasi Supabase belum tersedia; transaksi tidak akan disimpan. Isi supabase-config.js untuk mengaktifkan backend.", "warning");
  for (const control of authForm.querySelectorAll("input,button")) control.disabled = true;
  for (const select of linesBody.querySelectorAll(".account")) updateAccountOptions(select);
  refresh();
}
