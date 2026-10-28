const {
  cleanTitle,
  formatDue,
  isArabic,
  parseReminder,
  sendMessage,
  supabaseHeaders,
} = require("../lib/assistant");

const EN_HELP = [
  "Hi! I can manage your personal reminders.",
  "",
  "Examples:",
  "• Remind me to call Sam tomorrow at 3 pm",
  "• Dentist appointment Friday at 10:30",
  "• Pay rent every month on the 1st (monthly recurrence is not supported yet)",
  "",
  "Commands: /today, /list, /done ID, /delete ID, /help",
  "Times use the timezone configured for this bot.",
].join("\n");
const AR_HELP = [
  "مرحبًا! أساعدك في تنظيم مهامك ومواعيدك.",
  "",
  "أمثلة:",
  "• ذكرني بالاتصال بسامي غدًا الساعة ٣ مساءً",
  "• موعد طبيب الأسنان الجمعة الساعة ١٠:٣٠",
  "• ذكرني يوميًا بشرب الماء",
  "",
  "الأوامر: /today، /list، /done رقم، /delete رقم، /help",
  "تُفسر الأوقات حسب المنطقة الزمنية المضبوطة للبوت.",
].join("\n");

function replyText(arabic, english, arabicText, englishText) {
  return arabic ? arabicText : englishText;
}

async function request(path, options = {}) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...supabaseHeaders(), Prefer: "return=representation", ...options.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Supabase request failed (${response.status}): ${JSON.stringify(body)}`);
  return body;
}

async function handleCommand(message, command, argument, arabic) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  if (command === "/start" || command === "/help") {
    await sendMessage(chatId, arabic ? AR_HELP : EN_HELP);
    return;
  }
  if (command === "/today" || command === "/list") {
    const rows = await request(
      `reminders?user_id=eq.${userId}&completed=eq.false&order=due_at.asc&limit=${command === "/today" ? 50 : 20}`,
    );
    const upcoming = command === "/today"
      ? rows.filter((row) => new Date(row.due_at).toLocaleDateString("en-CA", { timeZone: process.env.BOT_TIMEZONE || "Africa/Cairo" }) === new Date().toLocaleDateString("en-CA", { timeZone: process.env.BOT_TIMEZONE || "Africa/Cairo" }))
      : rows;
    if (!upcoming.length) {
      await sendMessage(chatId, replyText(arabic, false, "لا توجد تذكيرات قادمة.", "You have no upcoming reminders."));
      return;
    }
    const lines = upcoming.map((row) => {
      const repeat = row.recurrence ? ` · ${row.recurrence}` : "";
      return `#${row.id} · ${formatDue(row.due_at, arabic)}${repeat}\n${row.title}`;
    });
    await sendMessage(chatId, lines.join("\n\n"));
    return;
  }
  if (command === "/done" || command === "/delete") {
    const id = Number(argument);
    if (!Number.isSafeInteger(id) || id < 1) {
      await sendMessage(chatId, replyText(arabic, false, "استخدم الأمر هكذا: /done 12", "Use the command like this: /done 12"));
      return;
    }
    const rows = await request(
      `reminders?id=eq.${id}&user_id=eq.${userId}&completed=eq.false`,
      {
        method: command === "/done" ? "PATCH" : "DELETE",
        body: command === "/done" ? JSON.stringify({ completed: true }) : undefined,
      },
    );
    await sendMessage(chatId, rows.length
      ? replyText(arabic, false, command === "/done" ? "تم إنجاز التذكير." : "تم حذف التذكير.", command === "/done" ? "Reminder marked done." : "Reminder deleted.")
      : replyText(arabic, false, "لم أجد تذكيرًا بهذا الرقم.", "I couldn't find an active reminder with that ID."));
    return;
  }
  await sendMessage(chatId, arabic ? AR_HELP : EN_HELP);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers["x-telegram-bot-api-secret-token"] !== secret) {
    return res.status(401).send("Unauthorized");
  }
  try {
    const update = req.body;
    const message = update && (update.message || update.edited_message);
    if (!message || !message.chat || !message.from || typeof message.text !== "string") {
      return res.status(200).json({ ok: true });
    }
    if (String(message.from.id) !== process.env.TELEGRAM_ALLOWED_USER_ID) {
      return res.status(200).json({ ok: true });
    }
    const text = message.text.trim();
    const arabic = isArabic(text);
    const commandMatch = /^\/([a-z]+)(?:@\w+)?(?:\s+(.+))?$/i.exec(text);
    if (commandMatch) {
      await handleCommand(message, `/${commandMatch[1].toLowerCase()}`, commandMatch[2] || "", arabic);
      return res.status(200).json({ ok: true });
    }

    const parsed = parseReminder(text);
    if (parsed.error) {
      const help = arabic ? AR_HELP : EN_HELP;
      const error = parsed.error === "past"
        ? (arabic ? "هذا الوقت قد مضى. أرسل تاريخًا ووقتًا في المستقبل." : "That time has already passed. Please give a future date and time.")
        : (arabic ? "لم أفهم الموعد. أرسل التاريخ أو اليوم والوقت، مثل: غدًا الساعة ٣ مساءً." : "I couldn't find the date and time. Try: tomorrow at 3 pm.");
      await sendMessage(message.chat.id, `${error}\n\n${help}`);
      return res.status(200).json({ ok: true });
    }
    const title = cleanTitle(text, parsed);
    if (!title) {
      await sendMessage(
        message.chat.id,
        arabic ? "ما المهمة أو الموعد الذي تريد تذكّره؟ أرسل الاسم مع التاريخ والوقت." : "What should I remind you about? Include a task or appointment name with the date and time.",
      );
      return res.status(200).json({ ok: true });
    }
    const kind = /appointment|event|meeting|موعد|اجتماع|مقابلة/i.test(text) ? "appointment" : "task";
    const rows = await request("reminders", {
      method: "POST",
      body: JSON.stringify({
        user_id: message.from.id,
        chat_id: message.chat.id,
        title,
        kind,
        due_at: parsed.dueAt,
        recurrence: parsed.recurrence,
        language: arabic ? "ar" : "en",
        telegram_update_id: update.update_id,
      }),
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    });
    const row = rows[0];
    if (!row) {
      return res.status(200).json({ ok: true });
    }
    const repeatText = parsed.recurrence
      ? (arabic ? ` · يتكرر ${parsed.recurrence === "daily" ? "يوميًا" : "أسبوعيًا"}` : ` · repeats ${parsed.recurrence}`)
      : "";
    const defaultText = parsed.defaultTime
      ? (arabic ? " (الساعة ٩ صباحًا افتراضيًا)" : " (defaulted to 9:00 am)")
      : "";
    const ambiguousText = parsed.ambiguousTime
      ? (arabic ? " (اعتبرت الوقت صباحًا؛ أرسل «مساءً» لتغييره)" : " (assumed morning; add “pm” if you meant afternoon)")
      : "";
    const responseText = arabic
      ? `تم حفظ ${kind === "appointment" ? "الموعد" : "المهمة"} #${row.id}: ${title}\n${formatDue(row.due_at, true)}${repeatText}${defaultText}${ambiguousText}`
      : `Saved ${kind}: ${title}\n${formatDue(row.due_at, false)}${repeatText}${defaultText}${ambiguousText}`;
    await sendMessage(message.chat.id, responseText);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook failed:", error);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
};
