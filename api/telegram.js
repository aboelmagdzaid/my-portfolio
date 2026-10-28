const {
  addRecurrence,
  answerCallbackQuery,
  cleanTitle,
  editMessageReplyMarkup,
  formatDue,
  isArabic,
  parseMoneyFlowQuery,
  parseMoneyTransaction,
  parseReminder,
  sendMessage,
  supabaseHeaders,
} = require("../lib/assistant");

const EN_HELP = [
  "Hi! I can manage your personal reminders and money tracking.",
  "",
  "Examples:",
  "• Remind me to call Sam tomorrow at 3 pm",
  "• Dentist appointment Friday at 10:30",
  "• I spent 50 EGP on food",
  "• I earned 10000 EGP from salary",
  "• Tell me my total money flow from start of month",
  "• Detailed money report for last month",
  "",
  "Commands: /today, /list, /done ID, /delete ID, /help",
  "At reminder time choose Done or Later (1 hour); unanswered reminders repeat every 2 hours.",
  "Times use the timezone configured for this bot.",
].join("\n");
const AR_HELP = [
  "مرحبًا! أساعدك في تنظيم مهامك ومواعيدك ومتابعة الأموال.",
  "",
  "أمثلة:",
  "• ذكرني بالاتصال بسامي غدًا الساعة ٣ مساءً",
  "• موعد طبيب الأسنان الجمعة الساعة ١٠:٣٠",
  "• أنا صرفت 50 جنيه اكل",
  "• أنا قبضت 10000 جنيه راتب",
  "• أخبرني بإجمالي التدفق المالي منذ بداية الشهر",
  "• تقرير تفصيلي عن الشهر الماضي",
  "",
  "الأوامر: /today، /list، /done رقم، /delete رقم، /help",
  "عند التذكير اختر «تم» أو «لاحقًا» بعد ساعة؛ ويتكرر التذكير كل ساعتين دون رد.",
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

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function recurrenceAfter(notifiedAt, recurrence, now = new Date()) {
  let next = new Date(addRecurrence(notifiedAt, recurrence));
  while (next <= now) next = new Date(addRecurrence(next, recurrence));
  return next.toISOString();
}

async function handleReminderCallback(callback) {
  const actionMatch = /^reminder:(done|later):(\d+)$/.exec(callback.data || "");
  if (!actionMatch || !callback.message) {
    await answerCallbackQuery(callback.id, "Unknown reminder action.");
    return;
  }

  const [, action, rawId] = actionMatch;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) {
    await answerCallbackQuery(callback.id, "Invalid reminder.");
    return;
  }

  const userId = callback.from.id;
  const reminders = await request(
    `reminders?id=eq.${id}&user_id=eq.${userId}&completed=eq.false&notified_at=not.is.null&select=id,recurrence,notified_at,language`,
  );
  const reminder = reminders[0];
  if (!reminder) {
    await answerCallbackQuery(
      callback.id,
      isArabic(callback.message.text || "") ? "تم التعامل مع هذا التذكير بالفعل." : "This reminder was already handled.",
    );
    await editMessageReplyMarkup(callback.message.chat.id, callback.message.message_id);
    return;
  }

  const nextDueAt = action === "done" && reminder.recurrence
    ? recurrenceAfter(reminder.notified_at, reminder.recurrence)
    : null;
  const updated = await applyReminderAction(reminder, userId, action, callback.id, nextDueAt);
  const row = updated[0];
  const arabic = reminder.language === "ar";
  const responseText = row
    ? (action === "done"
      ? (arabic ? "تم إنجاز التذكير ✅" : "Reminder marked done ✅")
      : (arabic ? "حسنًا، سأذكّرك بعد ساعة ⏰" : "Okay, I’ll remind you in one hour ⏰"))
    : (arabic ? "تم التعامل مع هذا التذكير بالفعل." : "This reminder was already handled.");
  await answerCallbackQuery(callback.id, responseText);
  await editMessageReplyMarkup(callback.message.chat.id, callback.message.message_id);
}

async function applyReminderAction(reminder, userId, action, callbackId, nextDueAt) {
  return request("rpc/respond_to_reminder", {
    method: "POST",
    body: JSON.stringify({
      p_reminder_id: reminder.id,
      p_user_id: userId,
      p_action: action,
      p_callback_id: callbackId,
      p_next_due_at: nextDueAt,
    }),
  });
}

async function handleReminderTextAction(message, action, updateId, arabic) {
  const rows = await request(
    `reminders?user_id=eq.${message.from.id}&completed=eq.false&notified_at=not.is.null&order=last_notified_at.desc&limit=1&select=id,recurrence,notified_at,language`,
  );
  const reminder = rows[0];
  if (!reminder) {
    await sendMessage(
      message.chat.id,
      arabic ? "لا يوجد تذكير نشط للتعامل معه." : "There is no active reminder to update.",
    );
    return;
  }
  const nextDueAt = action === "done" && reminder.recurrence
    ? recurrenceAfter(reminder.notified_at, reminder.recurrence)
    : null;
  const updated = await applyReminderAction(reminder, message.from.id, action, `message:${updateId}`, nextDueAt);
  const responseText = action === "done"
    ? (arabic ? "تم إنجاز التذكير ✅" : "Reminder marked done ✅")
    : (arabic ? "حسنًا، سأذكّرك بعد ساعة ⏰" : "Okay, I’ll remind you in one hour ⏰");
  await sendMessage(message.chat.id, updated.length ? responseText : (arabic ? "تم التعامل مع هذا التذكير بالفعل." : "This reminder was already handled."));
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
    if (command === "/done") {
      const reminders = await request(
        `reminders?id=eq.${id}&user_id=eq.${userId}&completed=eq.false&select=id,recurrence,notified_at`,
      );
      const reminder = reminders[0];
      if (!reminder) {
        await sendMessage(chatId, replyText(arabic, false, "لم أجد تذكيرًا بهذا الرقم.", "I couldn't find an active reminder with that ID."));
        return;
      }
      if (reminder.notified_at && reminder.recurrence) {
        const updated = await applyReminderAction(
          reminder,
          userId,
          "done",
          `command:${message.message_id}`,
          recurrenceAfter(reminder.notified_at, reminder.recurrence),
        );
        if (!updated.length) {
          await sendMessage(chatId, replyText(arabic, false, "لم أجد تذكيرًا نشطًا بهذا الرقم.", "I couldn't find an active reminder with that ID."));
          return;
        }
      } else {
        await request(`reminders?id=eq.${id}&user_id=eq.${userId}&completed=eq.false`, {
          method: "PATCH",
          body: JSON.stringify({ completed: true, claimed_at: null, notified_at: null, last_notified_at: null }),
        });
      }
      await sendMessage(chatId, replyText(arabic, false, "تم إنجاز التذكير.", "Reminder marked done."));
      return;
    }
    const rows = await request(
      `reminders?id=eq.${id}&user_id=eq.${userId}&completed=eq.false`,
      {
        method: "DELETE",
      },
    );
    await sendMessage(chatId, rows.length
      ? replyText(arabic, false, "تم حذف التذكير.", "Reminder deleted.")
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
    const callback = update && update.callback_query;
    if (callback) {
      if (!callback.from || String(callback.from.id) !== process.env.TELEGRAM_ALLOWED_USER_ID) {
        return res.status(200).json({ ok: true });
      }
      await handleReminderCallback(callback);
      return res.status(200).json({ ok: true });
    }

    const message = update && (update.message || update.edited_message);
    if (!message || !message.chat || !message.from || typeof message.text !== "string") {
      return res.status(200).json({ ok: true });
    }
    if (String(message.from.id) !== process.env.TELEGRAM_ALLOWED_USER_ID) {
      return res.status(200).json({ ok: true });
    }
    const text = message.text.trim();
    const arabic = isArabic(text);
    if (/^(?:done|complete|completed|تم|خلصت|أنجزت|انجزت)$/i.test(text)) {
      await handleReminderTextAction(message, "done", update.update_id, arabic);
      return res.status(200).json({ ok: true });
    }
    if (/^(?:later|snooze|remind me later|لاحقا|لاحقًا|بعد ساعة|فكرني بعد ساعة|ذكرني بعد ساعة)$/i.test(text)) {
      await handleReminderTextAction(message, "later", update.update_id, arabic);
      return res.status(200).json({ ok: true });
    }
    const commandMatch = /^\/([a-z]+)(?:@\w+)?(?:\s+(.+))?$/i.exec(text);
    if (commandMatch) {
      await handleCommand(message, `/${commandMatch[1].toLowerCase()}`, commandMatch[2] || "", arabic);
      return res.status(200).json({ ok: true });
    }

    const moneyTransaction = parseMoneyTransaction(text);
    if (moneyTransaction) {
      if (moneyTransaction.error === "amount") {
        await sendMessage(
          message.chat.id,
          arabic ? "لم أتعرف على المبلغ. أرسل المصروف أو الدخل مع المبلغ، مثل: صرفت 50 جنيه طعام." : "I couldn't find the amount. Include it in your message, for example: I spent 50 EGP on food.",
        );
        return res.status(200).json({ ok: true });
      }
      const rows = await request("money_transactions", {
        method: "POST",
        body: JSON.stringify({
          user_id: message.from.id,
          chat_id: message.chat.id,
          transaction_type: moneyTransaction.type,
          amount: moneyTransaction.amount,
          currency: moneyTransaction.currency,
          note: moneyTransaction.note,
          language: arabic ? "ar" : "en",
          telegram_update_id: update.update_id,
        }),
        headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      });
      const row = rows[0];
      if (!row) {
        return res.status(200).json({ ok: true });
      }
      const responseText = arabic
        ? `تم حفظ ${moneyTransaction.type === "expense" ? "المصروف" : "الدخل"} #${row.id}: ${formatMoney(row.amount)} ${row.currency} ${row.note ? `· ${row.note}` : ""}`.trim()
        : `Saved ${moneyTransaction.type}: ${formatMoney(row.amount)} ${row.currency}${row.note ? ` · ${row.note}` : ""}`;
      await sendMessage(message.chat.id, responseText);
      return res.status(200).json({ ok: true });
    }

    const moneyFlow = parseMoneyFlowQuery(text);
    if (moneyFlow) {
      if (moneyFlow.error === "period") {
        await sendMessage(
          message.chat.id,
          arabic ? "أستطيع حاليًا حساب التدفق المالي منذ بداية الشهر. جرّب: إجمالي التدفق المالي من بداية الشهر." : "I can currently calculate money flow from the start of this month. Try: total money flow from start of month.",
        );
        return res.status(200).json({ ok: true });
      }
      const rows = await request("rpc/money_flow_totals", {
        method: "POST",
        body: JSON.stringify({
          p_user_id: message.from.id,
          p_start_at: moneyFlow.start,
          p_end_at: moneyFlow.end,
        }),
      });
      const totals = Object.fromEntries(rows.map((row) => [
        row.currency || "EGP",
        { expenses: Number(row.expenses || 0), earnings: Number(row.earnings || 0) },
      ]));
      const currencies = Object.keys(totals).length ? Object.keys(totals).sort() : ["EGP"];
      const monthLabel = new Intl.DateTimeFormat(arabic ? "ar-EG" : "en", {
        timeZone: process.env.BOT_TIMEZONE || "Africa/Cairo",
        month: "long",
        year: "numeric",
      }).format(new Date(moneyFlow.start));
      const lines = currencies.map((currency) => {
        const total = totals[currency] || { expenses: 0, earnings: 0 };
        const profit = total.earnings - total.expenses;
        return arabic
          ? `${currency}:\nالمصروفات: ${formatMoney(total.expenses)}\nالإيرادات: ${formatMoney(total.earnings)}\nصافي الربح: ${formatMoney(profit)}`
          : `${currency}:\nExpenses: ${formatMoney(total.expenses)}\nEarned: ${formatMoney(total.earnings)}\nProfit: ${formatMoney(profit)}`;
      });
      const heading = moneyFlow.period === "last_month"
        ? (arabic ? `تقرير الشهر الماضي (${monthLabel})` : `Money report for last month (${monthLabel})`)
        : (arabic ? `تقرير هذا الشهر (${monthLabel})` : `Money report for this month (${monthLabel})`);
      let responseText = `${heading}:\n\n${lines.join("\n\n")}`;
      if (moneyFlow.detailed) {
        const detailRows = await request(
          `money_transactions?user_id=eq.${message.from.id}&created_at=gte.${encodeURIComponent(moneyFlow.start)}&created_at=lte.${encodeURIComponent(moneyFlow.end)}&select=transaction_type,amount,currency,note,created_at&order=created_at.asc&limit=500`,
        );
        const detailHeading = arabic ? "\n\nالتفاصيل:" : "\n\nTransactions:";
        const detailLines = detailRows.map((row) => {
          const label = row.transaction_type === "expense"
            ? (arabic ? "مصروف" : "Expense")
            : (arabic ? "دخل" : "Income");
          const date = formatDue(row.created_at, arabic);
          return `${date} · ${label}: ${formatMoney(row.amount)} ${row.currency}${row.note ? ` · ${row.note}` : ""}`;
        });
        responseText += detailHeading;
        if (!detailLines.length) {
          responseText += `\n${arabic ? "لا توجد معاملات في هذه الفترة." : "No transactions in this period."}`;
        } else {
          let omitted = detailRows.length === 500;
          for (const [index, line] of detailLines.entries()) {
            if (responseText.length + line.length + 1 > 3600) {
              omitted = true;
              break;
            }
            responseText += `\n${line}`;
            if (index === detailLines.length - 1) omitted = detailRows.length === 500;
          }
          if (omitted) {
            responseText += arabic ? "\n\nتم اختصار التفاصيل لتناسب رسالة تيليجرام." : "\n\nDetails were shortened to fit a Telegram message.";
          }
        }
      }
      await sendMessage(message.chat.id, responseText);
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
