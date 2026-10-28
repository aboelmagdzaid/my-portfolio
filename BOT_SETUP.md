# Telegram personal assistant

The assistant is a separate Vercel serverless feature; it does not change the portfolio pages. It supports English and Arabic text, one-time tasks and appointments, daily/weekly repetition, and the `/today`, `/list`, `/done ID`, and `/delete ID` commands. It parses relative dates, weekdays, numeric dates, and times. If no time is given, it uses 9:00 am in the configured timezone; an ambiguous 12-hour time is assumed to be morning.

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
   - `SUPABASE_DB_URL`: the Supabase Postgres connection string. Use the session pooler or direct connection string from Supabase, with SSL enabled. Add the rotated database password in Vercel only; do not use the password previously shared in chat.
   - `TELEGRAM_BOT_TOKEN`: the token from BotFather.
   - `TELEGRAM_WEBHOOK_SECRET`: a random 1–256 character string using only `A-Z`, `a-z`, `0-9`, `_`, and `-`.
   - `BOT_TIMEZONE`: an IANA timezone, default `Africa/Cairo`.
   - `CRON_SECRET`: a long random secret used to authenticate reminder dispatch.
4. Vercel runs `npm run db:schema:vercel` before each Production deployment. The command applies `supabase/schema.sql` in a transaction and fails the deployment if the database update fails. Preview deployments skip the database update. Add the same required bot and Supabase API variables to Preview only if you also want to test the webhook there; no Preview database URL is needed.
5. Deploy the project. Its webhook URL is `https://YOUR_DOMAIN/api/telegram`.
6. Register the webhook from a trusted PowerShell terminal after setting the token and secret in local environment variables (do not put them in source code or paste the tokenized URL into chat):

   ```powershell
   Invoke-RestMethod -Method Post `
     -Uri "https://api.telegram.org/bot$env:TELEGRAM_BOT_TOKEN/setWebhook" `
     -Body @{ url = "https://YOUR_DOMAIN/api/telegram"; secret_token = $env:TELEGRAM_WEBHOOK_SECRET }
   ```

7. Schedule `GET https://YOUR_DOMAIN/api/reminders` once per minute with a scheduler that supports an `Authorization` header containing the configured cron bearer secret. Vercel's available cron frequency depends on the plan; this project leaves scheduling separate so it can also deploy on plans that do not support minute-level Vercel Cron. You can add a Vercel Cron entry if your plan supports it, or use an external scheduler configured with the same header.
8. Message your bot `/start`.

The webhook rejects requests without Telegram's secret-token header and ignores users other than `TELEGRAM_ALLOWED_USER_ID`. The reminder endpoint requires the cron bearer secret. Supabase's claim function prevents overlapping dispatch runs from claiming the same reminder at once.

## Example messages

- `Remind me to call the dentist tomorrow at 3 pm`
- `Meeting Friday at 10:30`
- `Remind me to take medicine every day at 8 am`
- `ذكرني بالاتصال بالطبيب غدًا الساعة ٣ مساءً`
- `موعد اجتماع يوم الاثنين الساعة ١٠ صباحًا`
- `ذكرني يوميًا بشرب الماء الساعة ٨`

Only daily and weekly recurrence are supported. Monthly recurrence, rescheduling, and interactive follow-up questions are not included yet.
