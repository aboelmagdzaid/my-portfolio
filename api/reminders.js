const { addRecurrence, formatDue, sendMessage, supabaseHeaders } = require("../lib/assistant");

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
        ? `⏰ تذكير${reminder.kind === "appointment" ? " بموعد" : ""}: ${reminder.title}\n${formatDue(reminder.due_at, true)}`
        : `⏰ Reminder${reminder.kind === "appointment" ? " (appointment)" : ""}: ${reminder.title}\n${formatDue(reminder.due_at, false)}`;
      await sendMessage(reminder.chat_id, message);
      const update = reminder.recurrence
        ? { due_at: addRecurrence(reminder.due_at, reminder.recurrence), claimed_at: null }
        : { completed: true, claimed_at: null };
      const updated = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/reminders?id=eq.${reminder.id}&claimed_at=not.is.null`,
        { method: "PATCH", headers: { ...supabaseHeaders(), Prefer: "return=minimal" }, body: JSON.stringify(update) },
      );
      if (!updated.ok) throw new Error(`Could not finalize reminder ${reminder.id}: ${await updated.text()}`);
    }));
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length) {
      failures.forEach((result) => console.error("Reminder delivery failed:", result.reason));
      return res.status(500).json({ delivered: reminders.length - failures.length, failed: failures.length });
    }
    return res.status(200).json({ delivered: reminders.length });
  } catch (error) {
    console.error("Reminder dispatch failed:", error);
    return res.status(500).json({ error: "Reminder dispatch failed" });
  }
};
