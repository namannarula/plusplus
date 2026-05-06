# plusplus

A Slack bot for teams that'd rather `++` than say thanks.

Give someone a `++` when they help you out. The bot keeps score and there's a leaderboard.

I spent two years at FamPay. We had this thing — "don't say thanks, give ++".

That's it. Someone helps you out, you give them a `++`. It just became how we said thanks. After a while you stop thinking about it, your hands just type `++` before your brain can write "thank you".

I left, but that never left me. So I rebuilt the bot for my own team.

---

## What it does

- **`@user++`** / **`@user--`** — give or take karma
- **`@bot leaderboard`** — top 10
- **`@bot score @user`** — check someone's score
- **`@bot toss`** — coin flip
- **`@bot roll 3 dices`** — roll dice
- Gets snarky when you say "thanks" without giving `++`
- Says bye when you say bye
- Ignores DMs

## Setup

1. Create a Slack app at https://api.slack.com/apps with Socket Mode enabled
2. Bot token scopes: `chat:write`, `channels:read`, `groups:read`, `im:read`, `users:read`
3. Subscribe to bot events: `message.channels`, `message.groups`, `message.im`
4. Generate an app-level token with `connections:write`
5. Create a Supabase project and run:
   ```sql
   create table karma (
     user_id text primary key,
     score integer default 0
   );
   ```

```
cp .env.example .env
# Fill in your tokens
docker compose up --build -d
```

## Stack

- Node 22, @slack/bolt, Supabase, Docker
