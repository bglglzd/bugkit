// Actual recipe functions, loopback HTTP and explicitly fake SDK/store boundaries.
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {timingSafeEqual} from 'node:crypto'
import test from 'node:test'
import {snippet, load, report} from './helpers.mjs'

async function contextBuilder() {
  return load(await snippet('recipes/web-app-full.md', '## The "Copy Context for AI" function'), ['buildAIContext']).buildAIContext
}
const localCloseHint = 'node scripts/bugkit.js close synthetic-report "<note>"'
async function localService(run) {
  const requests = [], mode = {httpError: false, telegramError: false, slackError: false}
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk
    requests.push({path: req.url, headers: req.headers, raw})
    if (mode.httpError) { res.writeHead(503); res.end('synthetic rejection'); return }
    if (req.url.startsWith('/slack')) { res.end(mode.slackError ? 'invalid_payload' : 'ok'); return }
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(req.url.startsWith('/telegram')
      ? {ok: !mode.telegramError, result: {message_id: 501}}
      : {id: 'synthetic-message'}))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const guardedFetch = (url, init) => {
    const address = String(url)
    if (address.startsWith(origin + '/')) return fetch(address, init)
    const telegram = 'https://api.telegram.org/botsynthetic-token/'
    if (address.startsWith(telegram)) return fetch(origin + '/telegram/' + address.slice(telegram.length), init)
    throw Error('External provider request blocked by synthetic test')
  }
  try { await run({origin, guardedFetch, requests, mode}) }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
}
const syntheticSecret = 'synthetic_webhook_secret_for_tests_only_1234'
const telegramEnv = {
  TELEGRAM_BOT_TOKEN: 'synthetic-token', TELEGRAM_ADMIN_CHAT_ID: '-10042',
  TELEGRAM_ADMIN_USER_IDS: '7,8', TELEGRAM_WEBHOOK_SECRET: syntheticSecret,
  BUGKIT_TELEGRAM_TRACKING: 'true',
}

for (const [file, heading] of [
  ['recipes/web-app-full.md', '### Local Whisper upgrade (optional)'],
  ['skills/adding-voice/SKILL.md', '### Mode 2: Local Whisper (opt-in upgrade)'],
]) {
  test(`${file}: Whisper proxy rejects missing audio and preserves browser bytes through loopback HTTP`, async () => {
    await localService(async ({origin, guardedFetch, requests, mode}) => {
      const {POST} = load(await snippet(file, heading), ['POST'], {
        process: {env: {BUGKIT_TRANSCRIBE_URL: origin + '/synthetic-inference'}}, fetch: guardedFetch,
      })
      const request = value => {
        const form = new FormData()
        if (value !== undefined) form.append('file', value)
        return new Request(origin + '/proxy', {method: 'POST', body: form})
      }
      for (const value of [undefined, 'not a file', new Blob([])]) {
        assert.equal((await POST(request(value))).status, 400)
      }
      assert.equal(requests.length, 0)
      const audio = new Blob(['synthetic browser audio bytes'], {type: 'audio/webm'})
      const response = await POST(request(audio))
      assert.equal(response.status, 200)
      assert.ok(requests[0].raw.includes('synthetic browser audio bytes'))
      assert.ok(requests[0].raw.includes('response_format'))
      mode.httpError = true
      assert.equal((await POST(request(audio))).status, 502)
    })
  })
}
const callback = (data, chat = -10042, user = 7) => ({callback_query: {id: 'synthetic-callback', data, from: {id: user}, message: {chat: {id: chat}, message_id: 10}}})
const webhookRequest = (body, secret = syntheticSecret) => new Request('http://127.0.0.1/synthetic-webhook', {
  method: 'POST', headers: {'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret}, body: JSON.stringify(body),
})
async function telegram(globals) {
  const code = await snippet('recipes/telegram-bot.md', '## Implementation sketch (Node)') + '\n' + await snippet('recipes/telegram-bot.md', '## Webhook (for callback buttons)')
  return load(code, ['handler', 'sendBugToTelegram'], {process: {env: telegramEnv}, timingSafeEqual, buildAIContext: await contextBuilder(), ...globals})
}

test('Telegram preserves full UUIDs and sends the complete long canonical context as a file', async () => {
  await localService(async ({guardedFetch, requests}) => {
    const id = '6588a8c7-9437-47cf-a30c-6dbe49797f08'
    const input = {...report, id, description: 'Synthetic long description. '.repeat(220)}
    let selected
    const {handler, sendBugToTelegram} = await telegram({fetch: guardedFetch, getReport: async value => { selected = value; return input }, updateStatus: async () => { throw Error('Unexpected mutation') }})
    assert.equal((await handler(webhookRequest(callback(`ctx:${id}`)))).status, 200)
    assert.equal(selected, id)
    assert.ok(requests.some(request => request.path === '/telegram/sendDocument' && request.raw.includes(input.description)))
    assert.ok(requests.some(request => request.raw.includes('## Environment') && request.raw.includes('## Attachments')))
    await sendBugToTelegram(input)
    const notice = requests.filter(request => request.path === '/telegram/sendMessage').at(-1)
    const message = JSON.parse(notice.raw)
    assert.ok(message.text.length < 4096)
    assert.equal(message.reply_markup.inline_keyboard[0][0].callback_data, `ctx:${id}`)
  })
})

test('Telegram webhook authorization denies disclosure/mutation before storage or delivery', async () => {
  await localService(async ({guardedFetch, requests}) => {
    let reads = 0, mutations = 0
    const {handler} = await telegram({fetch: guardedFetch, getReport: async () => { reads++; return report }, updateStatus: async () => { mutations++ }})
    for (const request of [
      webhookRequest(callback('ctx:synthetic'), ''),
      webhookRequest(callback('res:synthetic'), 'synthetic_wrong_secret_123456789012345'),
      webhookRequest(callback('ctx:synthetic', -99)),
      webhookRequest(callback('res:synthetic', -10042, 999)),
    ]) assert.equal((await handler(request)).status, 403)
    const missing = await telegram({process: {env: {...telegramEnv, TELEGRAM_WEBHOOK_SECRET: ''}}, fetch: guardedFetch, getReport: async () => { reads++; return report }, updateStatus: async () => { mutations++ }})
    assert.equal((await missing.handler(webhookRequest(callback('ctx:synthetic')))).status, 503)
    const disabled = await telegram({process: {env: {...telegramEnv, BUGKIT_TELEGRAM_TRACKING: 'false'}}, fetch: guardedFetch})
    assert.equal((await disabled.handler(webhookRequest(callback('ctx:synthetic')))).status, 404)
    assert.equal(reads, 0); assert.equal(mutations, 0); assert.equal(requests.length, 0)
  })
})

test('Telegram authorized resolution and reason replies target the same complete ID', async () => {
  await localService(async ({guardedFetch}) => {
    const mutations = []
    const {handler} = await telegram({fetch: guardedFetch, getReport: async () => report, updateStatus: async (...args) => mutations.push(args)})
    const id = '6588a8c7-9437-47cf-a30c-6dbe49797f08'
    assert.equal((await handler(webhookRequest(callback(`res:${id}`)))).status, 200)
    assert.equal(mutations[0][0], id)
    assert.equal((await handler(webhookRequest(callback(`wfx:${id}`)))).status, 200)
    const reply = {message: {chat: {id: -10042}, from: {id: 7}, reply_to_message: {message_id: 501}, text: 'Synthetic explicit reason'}}
    assert.equal((await handler(webhookRequest({...reply, message: {...reply.message, from: {id: 8}}}))).status, 200)
    assert.equal(mutations.length, 1)
    assert.equal((await handler(webhookRequest(reply))).status, 200)
    assert.deepEqual(mutations[1], [id, 'wontfix', 'Synthetic explicit reason'])
  })
})

test('Telegram HTTP and application-level rejections reject instead of reporting success', async () => {
  await localService(async ({guardedFetch, mode}) => {
    const {sendBugToTelegram} = await telegram({fetch: guardedFetch})
    mode.httpError = true
    await assert.rejects(sendBugToTelegram(report), /Telegram delivery failed/)
    mode.httpError = false; mode.telegramError = true
    await assert.rejects(sendBugToTelegram(report), /Telegram delivery failed/)
  })
})

test('Slack and Discord preserve large context within transport limits and suppress mentions', async () => {
  await localService(async ({origin, guardedFetch, requests}) => {
    const context = 'Synthetic <@everyone> ``` context 😀\n'.repeat(400)
    const {postToChat} = load(await snippet('recipes/slack-discord.md', '## Implementation (minimal)'), ['postToChat'], {
      process: {env: {BUGKIT_SLACK_WEBHOOK: origin + '/slack', BUGKIT_DISCORD_WEBHOOK: origin + '/discord'}},
      fetch: guardedFetch, buildAIContext: () => context,
    })
    await postToChat(report, localCloseHint)
    const slack = requests.filter(request => request.path === '/slack').map(request => JSON.parse(request.raw))
    assert.ok(slack.length > 1)
    assert.ok(slack.every(message => message.blocks[0].text.type === 'plain_text' && message.blocks[0].text.text.length <= 3000))
    assert.equal(slack.map(message => message.blocks[0].text.text).join(''), context)
    const discord = requests.find(request => request.path === '/discord?wait=true')
    assert.ok(discord.raw.includes(context))
    assert.ok(discord.raw.includes('"allowed_mentions":{"parse":[]}'))
    assert.ok(discord.headers['content-type'].startsWith('multipart/form-data;'))
  })
})

for (const provider of ['Slack', 'Discord']) {
  test(`${provider} delivery errors reject`, async () => {
    await localService(async ({origin, guardedFetch, mode}) => {
      const {postToChat} = load(await snippet('recipes/slack-discord.md', '## Implementation (minimal)'), ['postToChat'], {
        process: {env: {[`BUGKIT_${provider.toUpperCase()}_WEBHOOK`]: origin + '/' + provider.toLowerCase()}},
        fetch: guardedFetch, buildAIContext: () => 'Synthetic context',
      })
      mode.httpError = true
      await assert.rejects(postToChat(report, localCloseHint), /delivery failed/)
      if (provider === 'Slack') {
        mode.httpError = false; mode.slackError = true
        await assert.rejects(postToChat(report, localCloseHint), /delivery failed/)
      }
    })
  })
}

test('Resend SDK rejection is surfaced even when its promise resolves', async () => {
  let rejected = true
  class Resend { constructor() { this.emails = {send: async () => rejected ? {data: null, error: {message: 'synthetic error'}} : {data: {id: 'synthetic-mail'}, error: null}} } }
  const {sendBugByEmail} = load(await snippet('recipes/email.md', '## Implementation sketch (Resend)'), ['sendBugByEmail'], {
    Resend, buildAIContext: await contextBuilder(), renderHtml: () => '<p>Synthetic</p>', renderPlainText: () => 'Synthetic',
  })
  await assert.rejects(sendBugByEmail(report, localCloseHint), /Email provider rejected/)
  rejected = false; assert.equal((await sendBugByEmail(report, localCloseHint)).id, 'synthetic-mail')
})

test('email and chat payloads propagate the actual JSONL close command and reject an omitted hint', async () => {
  const buildAIContext = await contextBuilder()
  const expected = buildAIContext(report, localCloseHint)
  let payload, sends = 0
  class Resend { constructor() { this.emails = {send: async input => { payload = input; sends++; return {data: {id: 'synthetic-mail'}, error: null} }} } }
  const {sendBugByEmail} = load(await snippet('recipes/email.md', '## Implementation sketch (Resend)'), ['sendBugByEmail'], {
    Resend, buildAIContext, renderHtml: (_report, context) => context, renderPlainText: (_report, context) => context,
  })
  await assert.rejects(sendBugByEmail(report), /update hint is required/)
  assert.equal(sends, 0)
  await sendBugByEmail(report, localCloseHint)
  assert.equal(payload.text, expected); assert.equal(payload.html, expected)
  assert.ok(!payload.text.includes('PATCH /api/bug-reports/'))
  await localService(async ({origin, guardedFetch, requests}) => {
    const {postToChat} = load(await snippet('recipes/slack-discord.md', '## Implementation (minimal)'), ['postToChat'], {
      process: {env: {BUGKIT_SLACK_WEBHOOK: origin + '/slack', BUGKIT_DISCORD_WEBHOOK: origin + '/discord'}},
      fetch: guardedFetch, buildAIContext,
    })
    await assert.rejects(postToChat(report), /update hint is required/)
    assert.equal(requests.length, 0)
    await postToChat(report, localCloseHint)
    const slack = requests.filter(request => request.path === '/slack').map(request => JSON.parse(request.raw).blocks[0].text.text).join('')
    assert.equal(slack, expected)
    assert.ok(requests.find(request => request.path.startsWith('/discord')).raw.includes(expected))
    assert.ok(!slack.includes('PATCH /api/bug-reports/'))
  })
})

test('reporter email notification skips absent addresses and propagates SDK rejection', async () => {
  let rejected = true, calls = 0, payload
  const resend = {emails: {send: async input => {
    calls++; payload = input
    return rejected ? {data: null, error: {message: 'synthetic failure'}} : {data: {id: 'synthetic-reporter-mail'}, error: null}
  }}}
  const {notifyReporter} = load(await snippet('recipes/email.md', '## Notify reporter on status change'), ['notifyReporter'], {resend})
  await notifyReporter(report); assert.equal(calls, 0)
  const input = {...report, reporter: {...report.reporter, email: 'fixture@example.invalid'}, resolution: '<b>Synthetic literal note</b>'}
  await assert.rejects(notifyReporter(input), /Reporter email delivery rejected/)
  rejected = false
  assert.equal((await notifyReporter(input)).id, 'synthetic-reporter-mail')
  assert.ok(payload.html.includes('&lt;b&gt;Synthetic literal note&lt;/b&gt;'))
})

test('GitHub issue rendering retains canonical context and assigns server IDs without rewriting user text', async () => {
  const requests = []
  let rejectUpdate = false
  class Octokit { constructor() { this.issues = {
    create: async input => { requests.push(input); return {data: {number: 42, html_url: 'https://example.invalid/issues/42', body: input.body}} },
    update: async input => { if (rejectUpdate) throw Error('synthetic update rejection'); requests.push(input) },
  } } }
  const {createBugReport} = load(await snippet('recipes/github-issues.md', '## Implementation sketch (Node)'), ['createBugReport'], {
    Octokit, buildAIContext: await contextBuilder(), extractTitle: text => text.split('\n')[0].slice(0, 200),
  })
  const input = {...report, description: 'Synthetic literal #PENDING ```\n</details>\nSecond line'}
  assert.equal((await createBugReport(input)).id, 42)
  const body = requests.at(-1).body
  assert.ok(body.includes('=== BUG REPORT #42 ===') && body.includes(input.description))
  assert.ok(body.includes('gh issue close 42 --comment'))
  assert.ok(body.includes('````text'))
  for (const section of ['Environment', 'Selected Element', 'Error', 'Recent Console', 'Attachments']) assert.ok(body.includes('## ' + section))
  rejectUpdate = true; await assert.rejects(createBugReport(input), /synthetic update rejection/)
})
