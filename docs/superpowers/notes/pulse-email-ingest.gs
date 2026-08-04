/**
 * Pulse — email transaction auto-ingest.
 * Setup: Project Settings > Script properties > add ENDPOINT, TOKEN and SENDER.
 *   ENDPOINT = the endpoint shown in Pulse Settings (…/api/ingest/sms)
 *   TOKEN    = the token generated in Pulse Settings (shown once)
 *   SENDER   = your bank's alert address(es), comma-separated
 *              (e.g. alerts@hdfcbank.bank.in)
 * Then Triggers > add a time-driven trigger on ingestPulseEmails() every 10 minutes.
 *
 * No Gmail label or filter to create: the script finds emails by sender itself and
 * marks each done with an auto-created "PulseDone" label so none is sent twice.
 */
const DONE_LABEL = 'PulseDone'
const LOOKBACK = 'newer_than:2d'   // only scan recent mail (belt with server dedup)
const MAX_THREADS = 25             // per run — stays under Apps Script quotas
const MAX_BODY_CHARS = 4000        // clip long emails before sending

function ingestPulseEmails() {
  const props = PropertiesService.getScriptProperties()
  const endpoint = props.getProperty('ENDPOINT')
  const token = props.getProperty('TOKEN')
  const sender = props.getProperty('SENDER')
  if (!endpoint || !token) throw new Error('Set ENDPOINT and TOKEN in Project Settings > Script properties.')
  if (!sender) throw new Error('Set SENDER in Script properties (your bank alert address, e.g. alerts@hdfcbank.bank.in; comma-separate multiple).')

  const done = GmailApp.getUserLabelByName(DONE_LABEL) || GmailApp.createLabel(DONE_LABEL)
  const fromQuery = sender.split(',').map(function (s) { return 'from:' + s.trim() }).join(' OR ')
  const threads = GmailApp.search('(' + fromQuery + ') ' + LOOKBACK + ' -label:' + DONE_LABEL, 0, MAX_THREADS)
  for (const thread of threads) {
    let ok = true
    for (const msg of thread.getMessages()) {
      const text = (msg.getPlainBody() || '').slice(0, MAX_BODY_CHARS)
      if (!text) continue
      try {
        const res = UrlFetchApp.fetch(endpoint, {
          method: 'post',
          contentType: 'application/json',
          headers: { Authorization: 'Bearer ' + token },
          payload: JSON.stringify({ text: text, source: 'email' }),
          muteHttpExceptions: true,
        })
        const code = res.getResponseCode()
        if (code < 200 || code >= 300) { ok = false; console.error('POST failed', code, res.getContentText()) }
      } catch (e) { ok = false; console.error('POST error', e) }
    }
    if (ok) thread.addLabel(done)
  }
}
