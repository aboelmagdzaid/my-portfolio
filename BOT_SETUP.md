# Telegram personal assistant

The assistant is a separate Vercel serverless feature; it does not change the portfolio pages. It supports English and Arabic reminders, one-time tasks and appointments, daily/weekly repetition, expense and income logging, and current-month money-flow summaries. Reminder commands include `/today`, `/list`, `/done ID`, and `/delete ID`. It parses relative dates, weekdays, numeric dates, and times. If no time is given, it uses 9:00 am in the configured timezone; an ambiguous 12-hour time is assumed to be morning.

## Set up storage

1. Create a Supabase project and run [`supabase/schema.sql`](./supabase/schema.sql) in its SQL editor.
2. Create the Telegram bot with `@BotFather`, start a chat with it, then retrieve your Telegram user ID before enabling the webhook. In PowerShell, set your bot token locally and run:

   ```powershell
   $updates = Invoke-RestMethod -Uri "https://api.telegram.org/bot$env:TELEGRAM_BOT_TOKEN/getUpdates"
   $updates.result | ForEach-Object { $_.message.from.id }
   ```

   Add your numeric ID to Vercel as `TELEGRAM_ALLOWED_USER_ID`.
3. In Vercel project settings, add these environment variables for Production:
   - `SUPABASE_URL`: the project URL.
   - `SUPABASE_SERVICE_ROLE_KEY`: the service-role key. Keep it private; never add it to browser code or commit it.
   - Database connection: either `SUPABASE_DB_URL` or Vercel's existing `POSTGRES_URL_NON_POOLING`. The migration prefers `SUPABASE_DB_URL` when both are set. Use a valid Supabase Postgres connection string with SSL enabled. Rotate the database password previously shared in chat before using it.
   - `SUPABASE_DB_CA_CERT`: only if the Production build reports a Postgres TLS certificate-chain error. Download the CA certificate for the project from Supabase Dashboard → Project Settings → Database → SSL Configuration, then save its full PEM contents as this Vercel Production environment variable. The migration removes SSL query parameters from the database URL and uses this certificate with hostname verification enabled. Do not use `NODE_TLS_REJECT_UNAUTHORIZED=0` or a no-verify connection mode.
   - `TELEGRAM_BOT_TOKEN`: the token from BotFather.
   - `TELEGRAM_WEBHOOK_SECRET`: a random 1–256 character string using only `A-Z`, `a-z`, `0-9`, `_`, and `-`.
   - `BOT_TIMEZONE`: an IANA timezone, default `Africa/Cairo`.
   - Optional `BOT_LANGUAGE`: set to `ar` to make the automatic monthly report Arabic when no money entries have been recorded yet. Otherwise the report follows the language of the most recently saved transaction.
   - `CRON_SECRET`: a long random secret used to authenticate reminder dispatch.
4. Vercel runs `npm run db:schema:vercel` before each Production deployment. The command uses `SUPABASE_DB_URL` or the already-configured `POSTGRES_URL_NON_POOLING`, verifies the database TLS certificate (using `SUPABASE_DB_CA_CERT` if configured), applies `supabase/schema.sql` in a transaction, and fails the deployment if the database update fails. Preview deployments skip the database update. Add the same required bot and Supabase API variables to Preview only if you also want to test the webhook there; no Preview database URL is needed.
5. Deploy the project. Its webhook URL is `https://YOUR_DOMAIN/api/telegram`.
6. Register the webhook from a trusted PowerShell terminal after setting the token and secret in local environment variables (do not put them in source code or paste the tokenized URL into chat):

   ```powershell
   Invoke-RestMethod -Method Post `
     -Uri "https://api.telegram.org/bot$env:TELEGRAM_BOT_TOKEN/setWebhook" `
     -Body @{ url = "https://YOUR_DOMAIN/api/telegram"; secret_token = $env:TELEGRAM_WEBHOOK_SECRET }
   ```

7. Schedule `GET https://YOUR_DOMAIN/api/reminders` once per minute with a scheduler that supports an `Authorization` header containing the configured cron bearer secret. This sends due reminders, resends unanswered reminders every two hours, and sends the previous month's short money report on the first day of each month. Vercel's available cron frequency depends on the plan; this project leaves scheduling separate so it can also deploy on plans that do not support minute-level Vercel Cron. You can add a Vercel Cron entry if your plan supports it, or use an external scheduler configured with the same header.
8. Message your bot `/start`.

The webhook rejects requests without Telegram's secret-token header and ignores users other than `TELEGRAM_ALLOWED_USER_ID`. At reminder time, choose **Done** to finish it or **Later** to snooze it for one hour. If it is left unanswered, it repeats every two hours. Recurring reminders continue at their next scheduled occurrence when marked done. You may also reply `done` or `later` (or `تم` / `لاحقًا`) to act on your most recently notified reminder. The reminder endpoint requires the cron bearer secret. Supabase claim functions prevent overlapping dispatch runs and duplicate monthly reports.

## Example messages

- `Remind me to call the dentist tomorrow at 3 pm`
- `Meeting Friday at 10:30`
- `Remind me to take medicine every day at 8 am`
- `I spent 50 EGP on food`
- `أنا صرفت 50 جنيه اكل`
- `I earned 10000 EGP from salary`
- `أخبرني بإجمالي التدفق المالي منذ بداية الشهر`
- `Detailed money report for last month`
- `تقرير تفصيلي عن الشهر الماضي`
- `Short money report`
- `ذكرني بالاتصال بالطبيب غدًا الساعة ٣ مساءً`
- `موعد اجتماع يوم الاثنين الساعة ١٠ صباحًا`
- `ذكرني يوميًا بشرب الماء الساعة ٨`

Only daily and weekly recurrence are supported. Monthly recurrence, rescheduling, and interactive follow-up questions are not included yet. The money tracker saves each Telegram transaction update once, and reports expenses, income, and net profit from the start of the current month. Totals are grouped by currency so different currencies are never added together.
