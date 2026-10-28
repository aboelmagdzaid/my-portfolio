const { formatDue, localParts, monthRange, sendMessage, supabaseHeaders } = require("../lib/assistant");

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...supabaseHeaders(), ...options.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Supabase request failed (${response.status}): ${JSON.stringify(body)}`);
  return body;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value || 0));
}

async function sendMonthlyReport(now) {
  const current = localParts(now);
  if (current.day !== 1) return false;

  const range = monthRange(-1, now);
  const claimed = await supabaseRequest("rpc/claim_monthly_report", {
    method: "POST",
    body: JSON.stringify({ p_report_month: range.month }),
  });
  if (!claimed) return false;

  const userId = process.env.TELEGRAM_ALLOWED_USER_ID;
  if (!userId) throw new Error("Missing TELEGRAM_ALLOWED_USER_ID for monthly report delivery");
  const totals = await supabaseRequest("rpc/money_flow_totals", {
    method: "POST",
    body: JSON.stringify({
      p_user_id: userId,
      p_start_at: range.start.toISOString(),
      p_end_at: range.end.toISOString(),
    }),
  });
  const recentTransactions = await supabaseRequest(
    `money_transactions?user_id=eq.${userId}&select=language&order=created_at.desc&limit=1`,
  );
  const arabic = (recentTransactions[0] && recentTransactions[0].language === "ar")
    || (!recentTransactions.length && process.env.BOT_LANGUAGE === "ar");
  const currencies = totals.length ? totals : [{ currency: "EGP", expenses: 0, earnings: 0 }];
  const locale = arabic ? "ar-EG" : "en";
  const monthLabel = new Intl.DateTimeFormat(locale, {
    timeZone: process.env.BOT_TIMEZONE || "Africa/Cairo",
    month: "long",
    year: "numeric",
  }).format(range.start);
  const lines = currencies.map((row) => {
    const expenses = Number(row.expenses || 0);
    const earnings = Number(row.earnings || 0);
    return arabic
      ? `${row.currency} — المصروفات ${formatMoney(expenses)}، الإيرادات ${formatMoney(earnings)}، صافي الربح ${formatMoney(earnings - expenses)}`
      : `${row.currency} — expenses ${formatMoney(expenses)}, earned ${formatMoney(earnings)}, profit ${formatMoney(earnings - expenses)}`;
  });
  const heading = arabic ? `التقرير المالي لشهر ${monthLabel}:` : `Monthly money report for ${monthLabel}:`;
  await sendMessage(userId, `${heading}\n${lines.join("\n")}`);
  await supabaseRequest(`monthly_report_deliveries?report_month=eq.${range.month}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ sent_at: new Date().toISOString() }),
  });
  return true;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).send("Unauthorized");
  }
  try {
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/claim_due_reminders`, {
      method: "POST",
      headers: supabaseHeaders(),
    });
    if (!response.ok) throw new Error(`Supabase claim failed (${response.status}): ${await response.text()}`);
    const reminders = await response.json();
    const results = await Promise.allSettled(reminders.map(async (reminder) => {
      const arabic = reminder.language === "ar";
      const message = arabic
        ? `⏰ تذكير${reminder.kind === "appointment" ? " بموعد" : ""}: ${reminder.title}\n${formatDue(reminder.notified_at || reminder.due_at, true)}`
        : `⏰ Reminder${reminder.kind === "appointment" ? " (appointment)" : ""}: ${reminder.title}\n${formatDue(reminder.notified_at || reminder.due_at, false)}`;
      const replyMarkup = {
        inline_keyboard: [[
          { text: arabic ? "تم ✅" : "Done ✅", callback_data: `reminder:done:${reminder.id}` },
          { text: arabic ? "لاحقًا ⏰" : "Later (1 hour) ⏰", callback_data: `reminder:later:${reminder.id}` },
        ]],
      };
      await sendMessage(reminder.chat_id, message, { reply_markup: replyMarkup });
      const update = {
        due_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        notified_at: reminder.notified_at || reminder.due_at,
        claimed_at: null,
      };
      const updated = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/reminders?id=eq.${reminder.id}&claimed_at=not.is.null`,
        { method: "PATCH", headers: { ...supabaseHeaders(), Prefer: "return=minimal" }, body: JSON.stringify(update) },
      );
      if (!updated.ok) throw new Error(`Could not finalize reminder ${reminder.id}: ${await updated.text()}`);
    }));
    const reminderFailures = results.filter((result) => result.status === "rejected");
    const failures = [...reminderFailures];
    let monthlyReportSent = false;
    try {
      monthlyReportSent = await sendMonthlyReport(new Date());
    } catch (error) {
      failures.push({ status: "rejected", reason: error });
    }
    if (failures.length) {
      failures.forEach((result) => console.error("Reminder delivery failed:", result.reason));
      return res.status(500).json({ delivered: reminders.length - reminderFailures.length, failed: failures.length });
    }
    return res.status(200).json({ delivered: reminders.length, monthlyReportSent });
  } catch (error) {
    console.error("Reminder dispatch failed:", error);
    return res.status(500).json({ error: "Reminder dispatch failed" });
  }
};
