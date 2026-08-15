function emptySnapshot() {
  return {
    schema: 1,
    state: "idle",
    value: 0,
    max: 0,
    queueRemaining: 0,
    promptId: null,
    node: null,
    updatedAt: 0,
    lastEvent: null
  }
}

function asText(value) {
  return value == null ? null : String(value)
}

function asNumber(value, fallback) {
  var n = Number(value)
  return isFinite(n) ? n : fallback
}

function parseStatusFile(raw) {
  try {
    var data = JSON.parse(String(raw || ""))
    if (!data || typeof data !== "object") return emptySnapshot()
    return {
      schema: asNumber(data.schema, 1),
      state: data.state === "running" ? "running" : "idle",
      value: asNumber(data.value, 0),
      max: asNumber(data.max, 0),
      queueRemaining: asNumber(data.queue_remaining, 0),
      promptId: asText(data.prompt_id),
      node: asText(data.node),
      updatedAt: asNumber(data.updated_at, 0),
      lastEvent: data.last_event ? String(data.last_event) : null
    }
  } catch (e) {
    return emptySnapshot()
  }
}

function parsePromptHttp(raw) {
  try {
    var data = JSON.parse(String(raw || ""))
    var queue = data && data.exec_info ? Number(data.exec_info.queue_remaining) : NaN
    if (!isFinite(queue)) return { ok: false, queueRemaining: 0 }
    return { ok: true, queueRemaining: queue }
  } catch (e) {
    return { ok: false, queueRemaining: 0 }
  }
}

// Slow MiniMax-style samplers tick about once per 25s; expire after a few missed steps.
var FILE_MAX_AGE_SEC = 90

function fileIsFresh(file, now, maxAgeSec) {
  var updated = asNumber(file && file.updatedAt, 0)
  if (!(updated > 0)) return false
  var age = asNumber(now, 0) - updated
  var limit = asNumber(maxAgeSec, FILE_MAX_AGE_SEC)
  return isFinite(age) && age >= 0 && age <= limit
}

// httpSeen: first /prompt poll has finished.
// httpOk / queueRemaining: from that poll.
// file: parseStatusFile() result.
// now: unix seconds; file progress older than maxAgeSec is ignored.
function classify(input) {
  var src = input || {}
  if (src.httpSeen && src.httpOk !== true) return "offline"

  var queue = asNumber(src.queueRemaining, 0)
  if (src.httpSeen && queue <= 0) return "idle"

  var file = src.file || emptySnapshot()
  if (!src.httpSeen && file.state !== "running") return "idle"

  var now = asNumber(src.now, 0)
  if (!(now > 0)) now = Date.now() / 1000
  var fresh = fileIsFresh(file, now, src.maxAgeSec)
  if (fresh && file.lastEvent === "progress" && asNumber(file.max, 0) > 0) return "sampling"
  return "working"
}

function sameSampler(prev, tick) {
  if (!prev) return false
  return prev.promptId === tick.promptId
    && prev.node === tick.node
    && prev.max === tick.max
}

// prev / returned state: { rate, value, max, promptId, node, t }
// tick.t is milliseconds (Date.now()).
function nextRate(prev, tick) {
  var value = asNumber(tick && tick.value, 0)
  var max = asNumber(tick && tick.max, 0)
  var t = asNumber(tick && tick.t, 0)
  var next = {
    rate: 0,
    value: value,
    max: max,
    promptId: tick ? asText(tick.promptId) : null,
    node: tick ? asText(tick.node) : null,
    t: t
  }

  if (!sameSampler(prev, next)) return next
  if (!(value > prev.value)) {
    next.rate = asNumber(prev.rate, 0)
    next.t = prev.t
    return next
  }

  var dt = (t - prev.t) / 1000
  if (!(dt > 0)) {
    next.rate = asNumber(prev.rate, 0)
    next.t = prev.t
    return next
  }

  var inst = (value - prev.value) / dt
  var prior = asNumber(prev.rate, 0)
  next.rate = prior > 0 ? (prior * 0.7 + inst * 0.3) : inst
  return next
}

function formatRate(rate) {
  var n = Number(rate)
  if (!isFinite(n) || n <= 0) return ""
  if (n < 1) {
    var sec = 1 / n
    return (sec >= 10 ? sec.toFixed(1) : sec.toFixed(2)) + "s/it"
  }
  return n.toFixed(1) + " it/s"
}

function formatPercent(value, max) {
  var m = Number(max)
  if (!(m > 0)) return ""
  var pct = Math.max(0, Math.min(100, Math.round((Number(value) / m) * 100)))
  return pct + "%"
}

function labelFor(kind, rate, queueRemaining, vertical, value, max) {
  if (kind === "offline") return "Offline"
  if (kind === "idle") return "Idle"
  if (kind === "working") return vertical ? "…" : "Working…"
  var rateText = formatRate(rate)
  if (vertical) return rateText || formatPercent(value, max) || "…"
  return rateText
}

function tooltipFor(kind, file, rate, queueRemaining, host, port) {
  var where = String(host || "127.0.0.1") + ":" + String(port || 8188)
  if (kind === "offline") return "ComfyUI unreachable at " + where
  if (kind === "idle") return "ComfyUI idle · " + where
  var parts = []
  if (kind === "sampling" && file && file.max > 0)
    parts.push(Math.round(file.value) + "/" + Math.round(file.max))
  var rateText = formatRate(rate)
  if (rateText) parts.push(rateText)
  if (queueRemaining > 1) parts.push("queue " + queueRemaining)
  if (kind === "working") parts.push("working")
  parts.push(where)
  return parts.join(" · ")
}

if (typeof module !== "undefined") {
  module.exports = {
    emptySnapshot: emptySnapshot,
    parseStatusFile: parseStatusFile,
    parsePromptHttp: parsePromptHttp,
    fileIsFresh: fileIsFresh,
    FILE_MAX_AGE_SEC: FILE_MAX_AGE_SEC,
    classify: classify,
    nextRate: nextRate,
    formatRate: formatRate,
    formatPercent: formatPercent,
    labelFor: labelFor,
    tooltipFor: tooltipFor
  }
}
