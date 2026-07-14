const { App } = require('@slack/bolt');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const cron = require('node-cron');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const nvidiaClient = new OpenAI({
  baseURL: process.env.NVIDIA_BASE_URL,
  apiKey: process.env.NVIDIA_API_KEY,
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

let botUserId = null;

// --- Helpers ---

function stripBotPrefix(text) {
  if (!text) return null;
  const mentionPattern = new RegExp(`^<@${botUserId}>\\s*`, 'i');
  const namePattern = /^vibecoder\s*/i;
  if (mentionPattern.test(text)) return text.replace(mentionPattern, '');
  if (namePattern.test(text)) return text.replace(namePattern, '');
  return null;
}

let userCache = null;
let userCacheTime = 0;

async function findUser(client, identifier) {
  const mentionMatch = identifier.match(/^<@(\w+)>$/);
  if (mentionMatch) {
    return { id: mentionMatch[1] };
  }

  if (!userCache || Date.now() - userCacheTime > 5 * 60 * 1000) {
    const result = await client.users.list();
    userCache = result.members.filter(m => !m.deleted && !m.is_bot);
    userCacheTime = Date.now();
  }

  const lower = identifier.toLowerCase();
  return userCache.find(
    u =>
      u.name?.toLowerCase() === lower ||
      u.profile?.display_name?.toLowerCase() === lower ||
      u.real_name?.toLowerCase() === lower
  );
}

async function getScore(userId) {
  const { data } = await supabase
    .from('karma')
    .select('score')
    .eq('user_id', userId)
    .single();
  return data?.score || 0;
}

async function changeScore(userId, delta) {
  const current = await getScore(userId);
  const newScore = current + delta;
  await supabase
    .from('karma')
    .upsert({ user_id: userId, score: newScore });
  return newScore;
}

// --- Karma (++/--) ---

const karmaPattern = /(<@\w+>|[\w.\-]+)\s*(\+\+|--)/g;

const karmaResponses = [
  'flamboyant!',
  'baroque!',
  'impressive!',
  'lustrous!',
  'splashy!',
  'superb!',
  'splendid!',
];

app.message(karmaPattern, async ({ message, say, client }) => {
  if (message.channel_type === 'im') return;

  const matches = [...message.text.matchAll(karmaPattern)];
  if (!matches.length) return;

  const lines = [];
  for (const match of matches) {
    const identifier = match[1];
    const op = match[2];

    const userInfo = await findUser(client, identifier);
    if (!userInfo) continue;

    if (userInfo.id === message.user) {
      lines.push(`<@${userInfo.id}> Sorry, you can't give ${op} to yourself`);
      continue;
    }

    const delta = op === '++' ? 1 : -1;
    const newScore = await changeScore(userInfo.id, delta);

    if (op === '++') {
      const response = karmaResponses[Math.floor(Math.random() * karmaResponses.length)];
      lines.push(`${response} (<@${userInfo.id}> now at ${newScore})`);

      const permalink = await client.chat.getPermalink({ channel: message.channel, message_ts: message.ts });
      await client.chat.postMessage({
        channel: '#plusplus',
        text: `<@${userInfo.id}> got a <${permalink.permalink}|++> from <@${message.user}>!`,
      });
    } else {
      lines.push(`ouch! (<@${userInfo.id}> now at ${newScore})`);
    }
  }

  if (lines.length) {
    await say({ text: lines.join('\n'), thread_ts: message.thread_ts || message.ts });
  }
});

// Leaderboard
app.message(/leaderboard/i, async ({ message, say }) => {
  const cmd = stripBotPrefix(message.text);
  if (cmd === null || !/^leaderboard$/i.test(cmd.trim())) return;

  const { data } = await supabase
    .from('karma')
    .select('*')
    .order('score', { ascending: false })
    .limit(10);

  if (!data || !data.length) {
    await say('No karma yet.');
    return;
  }

  const lines = data.map((s, i) => `${i + 1}. <@${s.user_id}> — ${s.score}`);
  await say(`*Leaderboard*\n${lines.join('\n')}`);
});

// Score check
app.message(/score/i, async ({ message, say, client }) => {
  const cmd = stripBotPrefix(message.text);
  if (cmd === null) return;
  const scoreMatch = cmd.trim().match(/^score\s+(<@\w+>|[\w.\-]+)$/i);
  if (!scoreMatch) return;

  const userInfo = await findUser(client, scoreMatch[1]);
  if (!userInfo) {
    await say(`Couldn't find user "${scoreMatch[1]}"`);
    return;
  }
  const score = await getScore(userInfo.id);
  await say(`<@${userInfo.id}> is at ${score}`);
});

// --- Thanks ---

const thanksPattern = /\b(thanks|thank you|thanx|thnks|thankyou)\b/i;
const thanksReplies = [
  "Don't say that. Give ++",
  "You are not welcome until you give ++",
  "The pleasure is all mine :smiling_imp:",
  "The pleasure is only yours :blush:",
  "Dost ko thanks bolte ho :expressionless:",
  "You are most welcome :slightly_smiling_face:",
];

app.message(thanksPattern, async ({ message, say }) => {
  if (message.channel_type === 'im') return;
  const reply = thanksReplies[Math.floor(Math.random() * thanksReplies.length)];
  await say({ text: reply, thread_ts: message.thread_ts || message.ts });
});

// --- Bye ---

const byePattern = /\b(good night|goodnight|cya|bye|nighty night)\b/i;
const byeReplies = [
  "Good night.",
  "Sleep tight, don't let the bed bugs bite",
  "So long, and thanks for all the fish.",
  "Finally",
  "TTYL",
  "Fine, then go!",
  "Cheers",
  "SHOO! SHOO!",
  "Avada Kedavra",
  "Ok. Tata. Byebye",
  "Connection: close",
  "Farewell! God knows when we shall meet again.",
  "Don't leave me here!",
  "If you say so.",
  "Connection closed by remote host",
];

app.message(byePattern, async ({ message, say }) => {
  if (message.channel_type === 'im') return;
  const reply = byeReplies[Math.floor(Math.random() * byeReplies.length)];
  await say({ text: reply, thread_ts: message.thread_ts || message.ts });
});

// --- Toss & Dice ---

app.message(/toss/i, async ({ message, say }) => {
  const cmd = stripBotPrefix(message.text);
  if (cmd === null || !/^toss$/i.test(cmd.trim())) return;
  const result = Math.random() < 0.5 ? ':head:\nHeads' : ':tail:\nTails';
  await say({ text: result, thread_ts: message.thread_ts || message.ts });
});

app.message(/roll/i, async ({ message, say }) => {
  const cmd = stripBotPrefix(message.text);
  if (cmd === null) return;
  const diceMatch = cmd.trim().match(/^roll ?(\d+)? ?a? dices?$/i);
  if (!diceMatch) return;
  const count = diceMatch[1] ? parseInt(diceMatch[1]) : 1;
  const faces = [':one:', ':two:', ':three:', ':four:', ':five:', ':six:'];
  const rolls = Array.from({ length: count }, () => faces[Math.floor(Math.random() * 6)]);
  await say({ text: rolls.join(' '), thread_ts: message.thread_ts || message.ts });
});

// --- Ping ---

app.message(/ping/i, async ({ message, say }) => {
  const cmd = stripBotPrefix(message.text);
  if (cmd === null || !/^ping$/i.test(cmd.trim())) return;
  await say({ text: 'PONG', thread_ts: message.thread_ts || message.ts });
});

// --- DM blocking ---

app.event('message', async ({ event, client }) => {
  if (event.channel_type === 'im' && !event.bot_id) {
    await client.chat.postMessage({
      channel: event.channel,
      text: "I don't do DMs. Talk to me in a channel!",
    });
  }
});

// --- Haiku generation ---

async function generateHaiku() {
  const stream = await nvidiaClient.chat.completions.create({
    model: 'z-ai/glm4.7',
    messages: [
      {
        role: 'user',
        content:
          'Write a haiku about vibe coding. Output only the three lines of the haiku, nothing else — no title, no explanation, no punctuation beyond the haiku itself.',
      },
    ],
    temperature: 1,
    top_p: 1,
    max_tokens: 16384,
    extra_body: { chat_template_kwargs: { enable_thinking: false, clear_thinking: false } },
    stream: true,
  });

  let haiku = '';
  for await (const chunk of stream) {
    haiku += chunk.choices[0]?.delta?.content || '';
  }
  return haiku.trim();
}

// --- /vibe-haiku slash command ---

app.command('/vibe-haiku', async ({ ack, respond }) => {
  await ack();
  try {
    const haiku = await generateHaiku();
    if (!haiku) {
      await respond({ text: 'Sorry, could not generate a haiku right now.', response_type: 'in_channel' });
      return;
    }
    await respond({ text: haiku, response_type: 'in_channel' });
  } catch (err) {
    console.error('/vibe-haiku: failed to generate haiku:', err);
    await respond({ text: 'Sorry, something went wrong generating the haiku.', response_type: 'in_channel' });
  }
});

// --- Haiku cron (9 AM IST = 03:30 UTC) ---

// Runs daily at 9:00 AM IST (UTC+5:30 = 03:30 UTC)
cron.schedule('30 3 * * *', async () => {
  try {
    const haiku = await generateHaiku();
    if (!haiku) {
      console.warn('Haiku cron: no content received from NVIDIA API');
      return;
    }
    await app.client.chat.postMessage({
      channel: '#social',
      text: haiku,
    });
  } catch (err) {
    console.error('Haiku cron: failed to generate or post haiku to #social:', err);
  }
});

// --- Start ---

(async () => {
  const auth = await app.client.auth.test();
  botUserId = auth.user_id;
  await app.start();
  console.log('vibecoder is running');
})();
