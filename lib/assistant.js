const TIME_ZONE = process.env.BOT_TIMEZONE || "Africa/Cairo";

function arabicDigits(value) {
  return value.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

function localParts(date, timeZone = TIME_ZONE) {
  const values = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const parts = Object.fromEntries(values.map(({ type, value }) => [type, Number(value)]));
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute };
}

function localDateToUtc(parts, timeZone = TIME_ZONE) {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  let guess = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = localParts(new Date(guess), timeZone);
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    const correction = target - represented;
    guess += correction;
    if (correction === 0) break;
  }
  return new Date(guess);
}

function monthRange(offset = 0, now = new Date()) {
  const current = localParts(now);
  const monthDate = new Date(Date.UTC(current.year, current.month - 1 + offset, 1));
  const nextMonth = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 1));
  const start = localDateToUtc({
    year: monthDate.getUTCFullYear(),
    month: monthDate.getUTCMonth() + 1,
    day: 1,
    hour: 0,
    minute: 0,
  });
  const nextStart = localDateToUtc({
    year: nextMonth.getUTCFullYear(),
    month: nextMonth.getUTCMonth() + 1,
    day: 1,
    hour: 0,
    minute: 0,
  });
  return {
    start,
    end: new Date(nextStart.getTime() - 1),
    month: `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, "0")}-01`,
  };
}

function weekdayIndex(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function parseReminder(input, now = new Date()) {
  const normalized = arabicDigits(input).toLowerCase().replace(/[\u0617-\u061a\u064b-\u0652]/g, "");
  const arabic = /[\u0600-\u06ff]/.test(input);
  const result = { arabic, recurrence: null };
  const localNow = localParts(now);
  let date = { year: localNow.year, month: localNow.month, day: localNow.day };
  let hasDate = false;
  let hasTime = false;

  const recurrencePatterns = [
    { pattern: /\bevery\s+(?:sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)\b|كل\s*يوم\s*(?:الأحد|الاحد|الاثنين|الإثنين|الثلاثاء|الأربعاء|الاربعاء|الخميس|الجمعة|السبت)/i, value: "weekly" },
    { pattern: /\b(?:every day|daily)\b|كل\s*يوم|يومي(?:ا|اً)?/i, value: "daily" },
    { pattern: /\b(?:every week|weekly)\b|كل\s*أسبوع|أسبوعي(?:ا|اً)?/i, value: "weekly" },
  ];
  for (const item of recurrencePatterns) {
    if (item.pattern.test(normalized)) {
      result.recurrence = item.value;
      break;
    }
  }

  const relativeDay = /\b(today|tonight)\b|اليوم|الليلة/.exec(normalized);
  const tomorrow = /\b(?:tomorrow|tmr)\b|غدا|غداً|بكرة|بكره/.exec(normalized);
  const dayAfter = /\bday after tomorrow\b|بعد\s*بكرة|بعد\s*غد/.exec(normalized);
  if (dayAfter) {
    date.day += 2;
    hasDate = true;
  } else if (tomorrow) {
    date.day += 1;
    hasDate = true;
  } else if (relativeDay) {
    hasDate = true;
  }

  const weekdays = [
    [/\b(?:sunday|sun)\b|الأحد|الاحد/, 0],
    [/\b(?:monday|mon)\b|الاثنين|الإثنين/, 1],
    [/\b(?:tuesday|tue|tues)\b|الثلاثاء/, 2],
    [/\b(?:wednesday|wed)\b|الأربعاء|الاربعاء/, 3],
    [/\b(?:thursday|thu|thur|thurs)\b|الخميس/, 4],
    [/\b(?:friday|fri)\b|الجمعة/, 5],
    [/\b(?:saturday|sat)\b|السبت/, 6],
  ];
  for (const [pattern, targetDay] of weekdays) {
    if (pattern.test(normalized)) {
      const offset = (targetDay - weekdayIndex(date.year, date.month, date.day) + 7) % 7 || 7;
      date.day += offset;
      hasDate = true;
      break;
    }
  }

  const absoluteDate = /(?:\b(?:on|for|بتاريخ)\s*)?(\d{4})-(\d{1,2})-(\d{1,2})|(?:\b(?:on|for|بتاريخ)\s*)?(\d{1,2})[/. -](\d{1,2})(?:[/. -](\d{2,4}))?/.exec(normalized);
  if (absoluteDate) {
    if (absoluteDate[1]) {
      date = { year: Number(absoluteDate[1]), month: Number(absoluteDate[2]), day: Number(absoluteDate[3]) };
    } else {
      const year = absoluteDate[6] ? Number(absoluteDate[6]) : localNow.year;
      date = {
        year: year < 100 ? 2000 + year : year,
        month: Number(absoluteDate[5]),
        day: Number(absoluteDate[4]),
      };
    }
    hasDate = true;
    const calendarDate = new Date(Date.UTC(date.year, date.month - 1, date.day));
    if (calendarDate.getUTCFullYear() !== date.year || calendarDate.getUTCMonth() + 1 !== date.month || calendarDate.getUTCDate() !== date.day) {
      return { error: "date" };
    }
  }

  const timePattern = /(?:\b(?:at|around)\s*|الساعة\s*|(?=\d{1,2}:\d{2}\b)|(?=\d{1,2}\s*(?:a\.?m\.?|p\.?m\.?|صباحا|صباحًا|مساء|مساءً)))(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|صباحا|صباحًا|مساء|مساءً)?/i;
  const time = timePattern.exec(normalized);
  if (time) {
    let hour = Number(time[1] || time[4]);
    const minute = Number(time[2] || 0);
    const meridiem = (time[3] || "").replace(/[.]/g, "");
    if (minute > 59 || hour > 23 || hour < 0) return { error: "time" };
    if (/^(p|pm|مساء)/.test(meridiem) && hour < 12) hour += 12;
    if (/^(a|am|صباح)/.test(meridiem) && hour === 12) hour = 0;
    if (!meridiem && hour <= 12 && hour !== 0) {
      result.ambiguousTime = true;
    }
    date.hour = hour;
    date.minute = minute;
    hasTime = true;
  }

  if (!hasDate && !hasTime) return { error: "date" };
  const normalizedDate = new Date(Date.UTC(date.year, date.month - 1, date.day));
  date.year = normalizedDate.getUTCFullYear();
  date.month = normalizedDate.getUTCMonth() + 1;
  date.day = normalizedDate.getUTCDate();
  if (!hasTime) {
    date.hour = 9;
    date.minute = 0;
    result.defaultTime = true;
  }
  if (!date.hour && date.hour !== 0) date.hour = 9;
  if (!date.minute && date.minute !== 0) date.minute = 0;

  const dueAt = localDateToUtc(date);
  if (!Number.isFinite(dueAt.getTime())) return { error: "date" };
  const checkedDate = localParts(dueAt);
  if (checkedDate.year !== date.year || checkedDate.month !== date.month || checkedDate.day !== date.day) {
    return { error: "date" };
  }
  if (dueAt <= now) {
    if (hasDate && !hasTime && date.day === localNow.day) return { error: "past" };
    if (!hasDate && hasTime) {
      const next = { ...localNow, hour: date.hour, minute: date.minute };
      next.day += 1;
      result.dueAt = localDateToUtc(next).toISOString();
    } else {
      return { error: "past" };
    }
  } else {
    result.dueAt = dueAt.toISOString();
  }
  return result;
}

function cleanTitle(input, parsed) {
  let title = arabicDigits(input)
    .replace(/[\u0617-\u061a\u064b-\u0652]/g, "")
    .replace(/^(?:please\s+)?(?:remind me(?: to)?|reminder(?: me)?(?: to)?|remember to|schedule|add (?:a )?(?:task|appointment|event)(?: to)?)\s*/i, "")
    .replace(/^(?:ذكرني|فكرني|تذكرني|سجل|أضف|اضف)(?:\s+أن|ان|\s+بأن)?\s*/i, "")
    .replace(/^موعد\s*/i, "")
    .replace(/\b(?:at|around)\s*(?=\d{1,2}(?::\d{2})?\b)/gi, " ")
    .replace(/\b(?:on|for)\s+(?=(?:today|tonight|tomorrow|tmr|day after tomorrow|sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat|\d))/gi, " ")
    .replace(/\b(?:today|tonight|tomorrow|tmr|day after tomorrow|every day|every|daily|every week|weekly)\b/gi, " ")
    .replace(/\b(?:sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)\b/gi, " ")
    .replace(/(?:اليوم|الليلة|غدا|غداً|بكرة|بكره|بعد\s*بكرة|بعد\s*غد|كل\s*يوم|يومي(?:ا|اً)?|كل\s*أسبوع|أسبوعي(?:ا|اً)?|الأحد|الاحد|الاثنين|الإثنين|الثلاثاء|الأربعاء|الاربعاء|الخميس|الجمعة|السبت|يوم|الساعة|صباحا|صباحًا|مساء|مساءً|بتاريخ)/gi, " ")
    .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}[/. -]\d{1,2}(?:[/. -]\d{2,4})?\b/g, " ")
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,،:؛-]+|[\s,،:؛-]+$/g, "")
    .trim();
  return title.slice(0, 250);
}

function addRecurrence(dueAt, recurrence) {
  const parts = localParts(new Date(dueAt));
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + (recurrence === "weekly" ? 7 : 1)));
  parts.year = date.getUTCFullYear();
  parts.month = date.getUTCMonth() + 1;
  parts.day = date.getUTCDate();
  return localDateToUtc(parts).toISOString();
}

function isArabic(value) {
  return /[\u0600-\u06ff]/.test(value);
}

function formatDue(value, arabic) {
  return new Intl.DateTimeFormat(arabic ? "ar-EG" : "en-GB", {
    timeZone: TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function normalizeMoneyText(value) {
  return arabicDigits(String(value || ""))
    .toLowerCase()
    .replace(/[،،]/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMoneyAmount(value) {
  const normalized = normalizeMoneyText(value)
    .replace(/(?:egp|egyptian|\ble\b|جنيه|جنيها?|ج.م|ج م|pound|pounds|£)/gi, "")
    .replace(/(?:usd|dollar|dollars|\$)/gi, "")
    .replace(/\b(?:k|thousand)\b|alf|آلاف/gi, "k")
    .replace(/\b(?:m|million)\b|مليون/gi, "m");

  const match = normalized.match(/(\d+(?:[.,]\d+)?(?:\s*\d{3})*(?:\s*(?:k|m))?)/i);
  if (!match) return null;

  let token = match[1].replace(/\s+/g, "");
  const suffix = token.slice(-1).toLowerCase();
  if (suffix === "k" || suffix === "m") token = token.slice(0, -1);
  const hasComma = token.includes(",");
  const hasPeriod = token.includes(".");
  let numeric = token;
  if (hasComma && hasPeriod) {
    numeric = token.replace(/,/g, "");
  } else if (hasComma) {
    numeric = /^\d{1,3}(?:,\d{3})+$/.test(token) ? token.replace(/,/g, "") : token.replace(",", ".");
  }
  const amount = Number(numeric) * (suffix === "k" ? 1000 : suffix === "m" ? 1000000 : 1);
  return Number.isFinite(amount) ? amount : null;
}

function parseMoneyTransaction(input, now = new Date()) {
  const text = normalizeMoneyText(input);
  if (!text) return null;

  const expensePatterns = [
    /(?:i\s+)?(?:spent|paid|buy|bought|lost|gave|cash|expense|outflow|صرفت|أنفقت|دفعت|دفع|اشتريت|شريت|صرف)/i,
    /(?:أنا|انا)\s*(?:صرفت|أنفقت|دفعت|دفع|اشتريت|شريت|صرف)/i,
    /(?:i\s+)?(?:spend|pay|purchase|buy|cost|مصاريف|مصروف)/i,
  ];
  const incomePatterns = [
    /(?:i\s+)?(?:earned|received|got|income|salary|cashed|collected|received|paid me|قبضت|قبظت|استلمت|حصلت|كسبت|دخل|دخلت|رزق)/i,
    /(?:أنا|انا)\s*(?:قبضت|قبظت|استلمت|حصلت|كسبت|دخلت|رزق|ربحت)/i,
  ];

  let type = null;
  let matchedPattern = null;
  if (expensePatterns.some((pattern) => pattern.test(text))) {
    type = "expense";
    matchedPattern = expensePatterns.find((pattern) => pattern.test(text));
  } else if (incomePatterns.some((pattern) => pattern.test(text))) {
    type = "income";
    matchedPattern = incomePatterns.find((pattern) => pattern.test(text));
  }

  if (!type) return null;

  const amount = parseMoneyAmount(text);
  if (amount === null || amount <= 0) return { error: "amount", type };

  let withoutAmount = text.replace(matchedPattern, "");
  withoutAmount = withoutAmount
    .replace(/\d[\d.,]*(?:\s*(?:k|m|thousand|million|ألف|آلاف|مليون))?/i, "")
    .replace(/(^|\s)(?:أنا|انا|i)\s*/gi, "$1")
    .replace(/(?:spent|paid|earned|received|got|salary|income|purchase|buy|buying|cost|صرفت|أنفقت|دفعت|قبضت|قبظت|استلمت|حصلت|كسبت|ربحت|دفع|يوم|جنيه|جنيها?|egp|usd|dollar|دولار|ج\.م|ج م|مصروف|مصاريف)/gi, "")
    .replace(/\b(?:for|from|on|في|من|عن|لـ|ل)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,؛:.-]+|[\s,؛:.-]+$/g, "")
    .trim();

  const currencyMatch = text.match(/(?:egp|egyptian|جنيه|جنيها?|ج.م|ج م|pound|pounds|£|usd|dollar|dollars|\$)/i);
  const currency = currencyMatch ? (/[\$]|usd|dollar|dollars/.test(currencyMatch[0]) ? "USD" : "EGP") : "EGP";

  return {
    type,
    amount: Number(amount.toFixed(2)),
    currency,
    note: withoutAmount || (type === "expense" ? "expense" : "income"),
    created_at: new Date(now).toISOString(),
  };
}

function parseMoneyFlowQuery(input, now = new Date()) {
  const text = normalizeMoneyText(input);
  if (!text) return null;
  const isReport = /\b(?:report|summary)\b|(?:تقرير|ملخص)/i.test(text);
  const isFlow = isReport || /\b(?:money flow|total money flow|cash flow|flow|total(?:\s+money)?|calculate(?:\s+my)?(?:\s+total)?|tell me my(?:\s+total)?(?:\s+money)?(?:\s+flow)?)\b|(?:مجموع|إجمالي|اجمالي|تدفق|التدفق|حساب|عدد|مالي|المصروفات|مصروفاتي|الإنفاق|الدخل)/i.test(text);
  if (!isFlow) return null;

  const lastMonth = /(?:last|previous|past)\s+month|الشهر\s*(?:الماضي|الفائت|اللي\s*فات)/i.test(text);
  const startsThisMonth = /(?:from\s+)?(?:(?:the\s+)?start of (?:this\s+|the\s+)?month|beginning of (?:this\s+|the\s+)?month|month start|first day of (?:this\s+|the\s+)?month|first of (?:this\s+|the\s+)?month|من\s*بداية\s*الشهر|بداية\s*الشهر|من\s*أول\s*الشهر|من\s*اول\s*الشهر)/i.test(text);
  if (!lastMonth && !startsThisMonth && !isReport) return { error: "period" };

  const range = monthRange(lastMonth ? -1 : 0, now);

  return {
    type: "flow",
    start: range.start.toISOString(),
    end: (lastMonth ? range.end : new Date(now)).toISOString(),
    month: range.month,
    period: lastMonth ? "last_month" : "this_month",
    detailed: /\b(?:detailed|detail|full|itemized)\b|(?:تفصيلي|مفصل|بالتفصيل)/i.test(text),
  };
}

function supabaseHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.SUPABASE_URL || !key) throw new Error("Missing Supabase environment variables");
  return {
    apikey: key,
        Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function telegram(method, body) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(`Telegram API ${method} failed: ${data.description || response.status}`);
  return data.result;
}

async function sendMessage(chatId, text, options = {}) {
  return telegram("sendMessage", { chat_id: chatId, text, ...options });
}

async function answerCallbackQuery(callbackQueryId, text) {
  return telegram("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

async function editMessageReplyMarkup(chatId, messageId) {
  return telegram("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });
}

module.exports = {
  TIME_ZONE,
  addRecurrence,
  answerCallbackQuery,
  cleanTitle,
  editMessageReplyMarkup,
  formatDue,
  isArabic,
  localDateToUtc,
  localParts,
  monthRange,
  parseMoneyFlowQuery,
  parseMoneyTransaction,
  parseReminder,
  sendMessage,
  supabaseHeaders,
};
