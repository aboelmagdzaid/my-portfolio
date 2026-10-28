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

async function sendMessage(chatId, text) {
  return telegram("sendMessage", { chat_id: chatId, text });
}

module.exports = {
  TIME_ZONE,
  addRecurrence,
  cleanTitle,
  formatDue,
  isArabic,
  parseReminder,
  sendMessage,
  supabaseHeaders,
};
