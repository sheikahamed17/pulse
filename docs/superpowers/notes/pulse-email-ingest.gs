/**
 * Pulse — email transaction auto-ingest.
 * Setup: Project Settings → Script properties → add ENDPOINT and TOKEN.
 * Create a Gmail label "Pulse" + a filter that applies it to your bank alerts.
 * Add a time-driven trigger on ingestPulseEmails() (every 10 minutes).
 */
const PULSE_LABEL = 'Pulse'            // your Gmail filter applies this to bank alerts
const PULSE_DONE_LABEL = 'Pulse/Done'  // applied after a successful POST
const MAX_THREADS = 20                 // per run — stays under Apps Script quotas
const MAX_BODY_CHARS = 4000            // clip long emails before sending

function ingestPulseEmails() {
  const props = PropertiesService.getScriptProperties()
  const endpoint = props.getProperty('ENDPOINT')
  const token = props.getProperty('TOKEN')
  if (!endpoint || !token) throw new Error('Set ENDPOINT and TOKEN in Script properties.')

  const label = GmailApp.getUserLabelByName(PULSE_LABEL)
  if (!label) throw new Error('Create a Gmail label "' + PULSE_LABEL + '" and a filter that applies it to bank emails.')
  const done = GmailApp.getUserLabelByName(PULSE_DONE_LABEL) || GmailApp.createLabel(PULSE_DONE_LABEL)

  const threads = label.getThreads(0, MAX_THREADS)
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
    if (ok) { thread.addLabel(done); thread.removeLabel(label) }
  }
}
