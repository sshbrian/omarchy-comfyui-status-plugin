function emptyFacts() {
  return {
    checkpoint: null,
    width: null,
    height: null,
    seed: null,
    steps: null,
    sampler: null,
    cfg: null,
    batch: null
  }
}

function emptyVram() {
  return { name: null, used: 0, total: 0 }
}

function emptySession() {
  return { day: null, gens: 0, failures: 0, interrupts: 0, gpuSec: 0 }
}

function emptyLastJob() {
  return null
}

function emptySnapshot() {
  return {
    schema: 2,
    state: "idle",
    phase: "idle",
    value: 0,
    max: 0,
    queueRemaining: 0,
    queueRunning: 0,
    queuePending: 0,
    promptId: null,
    node: null,
    nodeType: null,
    nodeTitle: null,
    updatedAt: 0,
    lastEvent: null,
    stepTimes: [],
    facts: emptyFacts(),
    lastJob: emptyLastJob(),
    vram: emptyVram(),
    session: emptySession()
  }
}

function asText(value) {
  return value == null || value === "" ? null : String(value)
}

function asNumber(value, fallback) {
  var n = Number(value)
  return isFinite(n) ? n : fallback
}

function asInt(value, fallback) {
  var n = asNumber(value, NaN)
  if (!isFinite(n)) return fallback
  return Math.round(n)
}

function parseFacts(raw) {
  var src = raw && typeof raw === "object" ? raw : {}
  return {
    checkpoint: asText(src.checkpoint),
    width: src.width == null ? null : asInt(src.width, null),
    height: src.height == null ? null : asInt(src.height, null),
    seed: src.seed == null || src.seed === "" ? null : asInt(src.seed, asText(src.seed)),
    steps: src.steps == null ? null : asInt(src.steps, null),
    sampler: asText(src.sampler),
    cfg: src.cfg == null ? null : asNumber(src.cfg, null),
    batch: src.batch == null ? null : asInt(src.batch, null)
  }
}

function parseVram(raw) {
  var src = raw && typeof raw === "object" ? raw : {}
  return {
    name: asText(src.name),
    used: Math.max(0, asNumber(src.used, 0)),
    total: Math.max(0, asNumber(src.total, 0))
  }
}

function pad2(n) {
  return n < 10 ? "0" + n : String(n)
}

function todayStr(now) {
  var d
  if (now == null || now === undefined || now === "") d = new Date()
  else {
    var sec = asNumber(now, NaN)
    d = isFinite(sec) && sec > 1e11 ? new Date(sec) : new Date(sec * 1000)
    if (isNaN(d.getTime())) d = new Date()
  }
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate())
}

function parseSession(raw, now) {
  var src = raw && typeof raw === "object" ? raw : {}
  var today = todayStr(now)
  if (asText(src.day) !== today) {
    return { day: today, gens: 0, failures: 0, interrupts: 0, gpuSec: 0 }
  }
  return {
    day: today,
    gens: Math.max(0, asInt(src.gens, 0)),
    failures: Math.max(0, asInt(src.failures, 0)),
    interrupts: Math.max(0, asInt(src.interrupts, 0)),
    gpuSec: Math.max(0, asNumber(src.gpu_sec != null ? src.gpu_sec : src.gpuSec, 0))
  }
}

function parseLastJob(raw) {
  if (!raw || typeof raw !== "object") return null
  return {
    promptId: asText(raw.prompt_id != null ? raw.prompt_id : raw.promptId),
    status: asText(raw.status) || "ok",
    durationSec: Math.max(0, asNumber(raw.duration_sec != null ? raw.duration_sec : raw.durationSec, 0)),
    endedAt: asNumber(raw.ended_at != null ? raw.ended_at : raw.endedAt, 0),
    node: asText(raw.node),
    nodeType: asText(raw.node_type != null ? raw.node_type : raw.nodeType),
    error: asText(raw.error),
    facts: parseFacts(raw.facts)
  }
}

function parseStepTimes(raw) {
  if (!raw || !raw.length) return []
  var out = []
  for (var i = 0; i < raw.length; i++) {
    var n = asNumber(raw[i], NaN)
    if (n > 0) out.push(n)
  }
  return out
}

function parseStatusFile(raw, now) {
  try {
    var data = JSON.parse(String(raw || ""))
    if (!data || typeof data !== "object") return emptySnapshot()
    return {
      schema: asNumber(data.schema, 1),
      state: data.state === "running" ? "running" : "idle",
      phase: asText(data.phase) || "idle",
      value: asNumber(data.value, 0),
      max: asNumber(data.max, 0),
      queueRemaining: asNumber(data.queue_remaining, 0),
      queueRunning: asNumber(data.queue_running, 0),
      queuePending: asNumber(data.queue_pending, 0),
      promptId: asText(data.prompt_id),
      node: asText(data.node),
      nodeType: asText(data.node_type),
      nodeTitle: asText(data.node_title),
      updatedAt: asNumber(data.updated_at, 0),
      lastEvent: data.last_event ? String(data.last_event) : null,
      stepTimes: parseStepTimes(data.step_times),
      facts: parseFacts(data.facts),
      lastJob: parseLastJob(data.last_job),
      vram: parseVram(data.vram),
      session: parseSession(data.session, now)
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

function parseQueueHttp(raw) {
  try {
    var data = JSON.parse(String(raw || ""))
    var running = data && data.queue_running && data.queue_running.length ? data.queue_running.length : 0
    var pending = data && data.queue_pending && data.queue_pending.length ? data.queue_pending.length : 0
    return { ok: true, running: running, pending: pending }
  } catch (e) {
    return { ok: false, running: 0, pending: 0 }
  }
}

function parseSystemStats(raw) {
  try {
    var data = JSON.parse(String(raw || ""))
    var dev = data && data.devices && data.devices[0]
    if (!dev) return { ok: false, vram: emptyVram() }
    var total = asNumber(dev.vram_total, 0)
    var free = asNumber(dev.vram_free, 0)
    return {
      ok: true,
      vram: {
        name: asText(dev.name),
        used: Math.max(0, total - free),
        total: Math.max(0, total)
      }
    }
  } catch (e) {
    return { ok: false, vram: emptyVram() }
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

function medianOf(values) {
  if (!values || !values.length) return 0
  var copy = []
  for (var i = 0; i < values.length; i++) {
    var n = Number(values[i])
    if (isFinite(n) && n > 0) copy.push(n)
  }
  if (!copy.length) return 0
  copy.sort(function(a, b) { return a - b })
  var mid = Math.floor(copy.length / 2)
  if (copy.length % 2) return copy[mid]
  return (copy[mid - 1] + copy[mid]) / 2
}

function etaSeconds(file, rate) {
  var remain = asNumber(file && file.max, 0) - asNumber(file && file.value, 0)
  if (!(remain > 0)) return 0
  var median = medianOf(file && file.stepTimes)
  if (median > 0) return remain * median
  var n = Number(rate)
  if (isFinite(n) && n > 0) return remain / n
  return 0
}

function formatDuration(seconds) {
  var n = Number(seconds)
  if (!isFinite(n) || n < 0) return ""
  n = Math.round(n)
  if (n < 60) return n + "s"
  var mins = Math.floor(n / 60)
  var sec = n % 60
  if (mins < 60) return sec > 0 ? (mins + "m " + sec + "s") : (mins + "m")
  var hours = Math.floor(mins / 60)
  var remMin = mins % 60
  return remMin > 0 ? (hours + "h " + remMin + "m") : (hours + "h")
}

function formatEta(seconds) {
  var n = Number(seconds)
  if (!isFinite(n) || n <= 0) return ""
  return formatDuration(n) + " left"
}

function formatBytes(bytes) {
  var n = Number(bytes)
  if (!isFinite(n) || n < 0) return ""
  var gb = n / (1024 * 1024 * 1024)
  if (gb >= 10) return gb.toFixed(1) + " GB"
  if (gb >= 1) return gb.toFixed(2) + " GB"
  var mb = n / (1024 * 1024)
  if (mb >= 1) return Math.round(mb) + " MB"
  return Math.round(n / 1024) + " KB"
}

function formatVram(vram) {
  if (!vram || !(asNumber(vram.total, 0) > 0)) return "—"
  var used = formatBytes(vram.used)
  var total = formatBytes(vram.total)
  if (!used || !total) return "—"
  return used + " / " + total
}

function formatAgo(endedAt, now) {
  var end = asNumber(endedAt, 0)
  var t = asNumber(now, 0)
  if (!(end > 0) || !(t > 0)) return ""
  var dt = t - end
  if (dt < 10) return "just now"
  if (dt < 60) return Math.round(dt) + "s ago"
  if (dt < 3600) return Math.round(dt / 60) + "m ago"
  if (dt < 86400) return Math.round(dt / 3600) + "h ago"
  return "earlier"
}

function formatLastJob(job, now) {
  if (!job) return "—"
  var parts = []
  var dur = formatDuration(job.durationSec)
  if (dur) parts.push(dur)
  if (job.status === "error") parts.push("failed")
  else if (job.status === "interrupted") parts.push("stopped")
  else parts.push("ok")
  var ago = formatAgo(job.endedAt, now)
  if (ago) parts.push(ago)
  return parts.join(" · ")
}

function formatQueue(running, pending, remaining) {
  var rem = asNumber(remaining, 0)
  var run = asNumber(running, 0)
  var wait = asNumber(pending, 0)
  if (run <= 0 && wait <= 0) {
    if (rem <= 0) return "Empty"
    return rem === 1 ? "1 running" : rem + " running"
  }
  if (wait > 0) return run + " running · " + wait + " waiting"
  return run === 1 ? "1 running" : run + " running"
}

function phaseLabel(phase, kind) {
  if (kind === "offline") return "Offline"
  var key = String(phase || "")
  if (key === "queued") return "Queued"
  if (key === "loading") return "Loading"
  if (key === "sampling") return "Sampling"
  if (key === "decoding") return "Decoding"
  if (key === "saving") return "Saving"
  if (key === "error") return "Failed"
  if (key === "interrupted") return "Stopped"
  if (kind === "working") return "Working"
  if (kind === "idle" || key === "idle") return "Idle"
  return "Working"
}

function nodeLabel(file) {
  if (!file) return ""
  if (file.nodeTitle) return file.nodeTitle
  if (file.nodeType) return file.nodeType
  if (file.node) return "node " + file.node
  return ""
}

function stepLabel(file) {
  if (!file || !(asNumber(file.max, 0) > 0)) return ""
  return Math.round(asNumber(file.value, 0)) + "/" + Math.round(asNumber(file.max, 0))
}

function resolvedPhase(kind, file) {
  if (kind === "offline") return "offline"
  if (kind === "idle") return "idle"
  if (kind === "sampling") return "sampling"
  var phase = file && file.phase ? String(file.phase) : ""
  if (phase && phase !== "idle") return phase
  return kind === "working" ? "working" : "idle"
}

function heroTitle(kind, file, rate) {
  if (kind === "offline") return "Offline"
  if (kind === "idle") return "Idle"
  if (kind === "sampling") {
    var eta = formatEta(etaSeconds(file, rate))
    if (eta) return eta
    var rateText = formatRate(rate)
    if (rateText) return rateText
    return "Sampling"
  }
  return phaseLabel(resolvedPhase(kind, file), kind)
}

function heroMeta(kind, file, session) {
  if (kind === "offline") return ""
  if (kind === "idle") {
    var gens = session && session.gens ? session.gens : (file && file.session ? file.session.gens : 0)
    if (gens > 0) return gens === 1 ? "1 gen today" : gens + " gens today"
    return "Queue empty"
  }
  var parts = []
  var node = nodeLabel(file)
  if (node) parts.push(node)
  var steps = stepLabel(file)
  if (steps) parts.push(steps)
  return parts.join(" · ")
}

function heroDetail(kind, rate, queueRemaining) {
  if (kind === "sampling") return formatRate(rate)
  if (asNumber(queueRemaining, 0) > 1) return "Q:" + Math.round(queueRemaining)
  return ""
}

function factPills(facts) {
  var f = facts || {}
  var pills = []
  if (f.checkpoint) pills.push(String(f.checkpoint))
  if (f.width && f.height) pills.push(Math.round(f.width) + "×" + Math.round(f.height))
  if (f.seed != null && f.seed !== "") pills.push("seed " + f.seed)
  if (f.steps) pills.push(f.steps + " steps")
  if (f.sampler) pills.push(String(f.sampler))
  return pills
}

function pickVram(file, httpVram, now) {
  if (file && fileIsFresh(file, now) && file.vram && asNumber(file.vram.total, 0) > 0) return file.vram
  if (httpVram && asNumber(httpVram.total, 0) > 0) return httpVram
  return emptyVram()
}

function pickQueue(file, httpRunning, httpPending, now) {
  var freshV2 = file && asNumber(file.schema, 0) >= 2 && fileIsFresh(file, now)
  if (freshV2 && (file.state === "idle" || asNumber(file.queueRemaining, 0) <= 0)) {
    return { running: 0, pending: 0 }
  }
  if (freshV2) {
    return {
      running: asNumber(file.queueRunning, 0),
      pending: asNumber(file.queuePending, 0)
    }
  }
  return {
    running: asNumber(httpRunning, 0),
    pending: asNumber(httpPending, 0)
  }
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
  var eta = kind === "sampling" ? formatEta(etaSeconds(file, rate)) : ""
  if (eta) parts.push(eta)
  if (queueRemaining > 1) parts.push("queue " + queueRemaining)
  if (kind === "working") parts.push(phaseLabel(resolvedPhase(kind, file), kind).toLowerCase())
  parts.push(where)
  return parts.join(" · ")
}

if (typeof module !== "undefined") {
  module.exports = {
    emptySnapshot: emptySnapshot,
    emptyFacts: emptyFacts,
    emptyVram: emptyVram,
    emptySession: emptySession,
    todayStr: todayStr,
    parseSession: parseSession,
    parseStatusFile: parseStatusFile,
    parsePromptHttp: parsePromptHttp,
    parseQueueHttp: parseQueueHttp,
    parseSystemStats: parseSystemStats,
    fileIsFresh: fileIsFresh,
    FILE_MAX_AGE_SEC: FILE_MAX_AGE_SEC,
    classify: classify,
    nextRate: nextRate,
    formatRate: formatRate,
    formatPercent: formatPercent,
    formatDuration: formatDuration,
    formatEta: formatEta,
    formatBytes: formatBytes,
    formatVram: formatVram,
    formatAgo: formatAgo,
    formatLastJob: formatLastJob,
    formatQueue: formatQueue,
    phaseLabel: phaseLabel,
    nodeLabel: nodeLabel,
    stepLabel: stepLabel,
    heroTitle: heroTitle,
    heroMeta: heroMeta,
    heroDetail: heroDetail,
    factPills: factPills,
    pickVram: pickVram,
    pickQueue: pickQueue,
    resolvedPhase: resolvedPhase,
    etaSeconds: etaSeconds,
    medianOf: medianOf,
    labelFor: labelFor,
    tooltipFor: tooltipFor
  }
}
