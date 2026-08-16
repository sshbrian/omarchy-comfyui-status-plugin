const test = require("node:test")
const assert = require("node:assert/strict")
const Model = require("../Model.js")

test("parseStatusFile maps snake_case and ignores junk", () => {
  const snap = Model.parseStatusFile(JSON.stringify({
    schema: 1,
    state: "running",
    value: 3,
    max: 20,
    queue_remaining: 2,
    prompt_id: "abc",
    node: "9",
    updated_at: 12.5,
    last_event: "progress"
  }))
  assert.equal(snap.state, "running")
  assert.equal(snap.queueRemaining, 2)
  assert.equal(snap.promptId, "abc")
  assert.equal(snap.lastEvent, "progress")
  assert.deepEqual(Model.parseStatusFile("not-json").state, "idle")
})

test("classify prefers HTTP idle and offline", () => {
  const now = 1000
  const sampling = {
    state: "running",
    lastEvent: "progress",
    max: 20,
    value: 4,
    updatedAt: now
  }
  assert.equal(Model.classify({ httpSeen: true, httpOk: false, queueRemaining: 1, file: sampling, now: now }), "offline")
  // Fresh companion snapshot beats a stale /prompt poll (queue still 0).
  assert.equal(Model.classify({ httpSeen: true, httpOk: true, queueRemaining: 0, file: sampling, now: now }), "sampling")
  assert.equal(Model.classify({ httpSeen: true, httpOk: true, queueRemaining: 1, file: sampling, now: now }), "sampling")
  assert.equal(Model.classify({ httpSeen: true, httpOk: true, queueRemaining: 1, file: { state: "running", lastEvent: "executing", max: 0, updatedAt: now }, now: now }), "working")
  assert.equal(Model.classify({ httpSeen: false, httpOk: false, queueRemaining: 0, file: Model.emptySnapshot() }), "idle")
})

test("classify ignores a stale leftover status file", () => {
  const now = 1000
  const leftover = {
    state: "running",
    lastEvent: "progress",
    max: 20,
    value: 8,
    updatedAt: now
  }
  assert.equal(Model.classify({ httpSeen: true, httpOk: true, queueRemaining: 1, file: leftover, now: now }), "sampling")
  assert.equal(Model.classify({
    httpSeen: true, httpOk: true, queueRemaining: 1, file: leftover,
    now: now + Model.HTTP_BUSY_PROGRESS_AGE_SEC + 1
  }), "working")
  assert.equal(Model.classify({
    httpSeen: true, httpOk: true, queueRemaining: 1,
    file: { lastEvent: "progress", max: 20, value: 8, updatedAt: 0 }, now: now
  }), "working")
  // Companion already wrote idle; don't flash Working from a stale queue=1 poll.
  assert.equal(Model.classify({
    httpSeen: true, httpOk: true, queueRemaining: 2,
    file: { state: "idle", lastEvent: "status", max: 0, updatedAt: now }, now: now
  }), "idle")
})

test("classify keeps sampling across a slow MiniMax step", () => {
  const now = 1000
  const slow = {
    state: "running",
    lastEvent: "progress",
    phase: "sampling",
    max: 20,
    value: 6,
    stepTimes: [38, 40, 37],
    updatedAt: now
  }
  assert.equal(Model.classify({
    httpSeen: true, httpOk: true, queueRemaining: 1, file: slow, now: now + 100
  }), "sampling")
  assert.equal(Model.classify({
    httpSeen: true, httpOk: true, queueRemaining: 1,
    file: { state: "running", lastEvent: "executing", phase: "sampling", max: 20, value: 6, updatedAt: now },
    now: now
  }), "sampling")
})

test("fast-gen classify+hold does not flicker working/sampling", () => {
  const last = { at: 0 }
  const kinds = []
  function tick(t, file, queue) {
    const raw = Model.classify({
      httpSeen: true, httpOk: true, queueRemaining: queue, file, now: t
    })
    if (raw === "sampling") last.at = t
    kinds.push(Model.holdKind(raw, last.at, t))
  }
  tick(0.00, { state: "running", lastEvent: "executing", max: 0, updatedAt: 0.00 }, 1)
  tick(0.10, { state: "running", lastEvent: "progress", max: 4, value: 1, updatedAt: 0.10 }, 1)
  tick(0.18, { state: "running", lastEvent: "progress", max: 4, value: 2, updatedAt: 0.18 }, 1)
  tick(0.26, { state: "running", lastEvent: "progress", max: 4, value: 4, updatedAt: 0.26 }, 1)
  tick(0.28, { state: "running", lastEvent: "executing", phase: "decoding", max: 4, value: 4, updatedAt: 0.28 }, 1)
  tick(0.50, { state: "running", lastEvent: "execution_success", max: 0, updatedAt: 0.50 }, 1)
  tick(0.52, { state: "idle", lastEvent: "status", max: 0, updatedAt: 0.52 }, 1)
  tick(1.00, { state: "running", lastEvent: "progress", max: 4, value: 1, updatedAt: 1.00 }, 0)
  const live = kinds.filter((k) => k === "sampling" || k === "working")
  let flips = 0
  for (let i = 1; i < live.length; i++) if (live[i] !== live[i - 1]) flips++
  assert.deepEqual(kinds.slice(0, 6), ["working", "sampling", "sampling", "sampling", "sampling", "sampling"])
  assert.equal(kinds[6], "idle")
  assert.equal(kinds[7], "sampling")
  assert.ok(flips <= 1)
})

test("holdKind glues brief working gaps after sampling", () => {
  assert.equal(Model.holdKind("idle", 10, 10.2), "idle")
  assert.equal(Model.holdKind("offline", 10, 10.2), "offline")
  assert.equal(Model.holdKind("sampling", 10, 10.2), "sampling")
  assert.equal(Model.holdKind("working", 10, 10.2), "sampling")
  assert.equal(Model.holdKind("working", 10, 10 + Model.SAMPLE_HOLD_SEC + 0.05), "working")
})

test("labelFor vertical sampling uses real percent", () => {
  assert.equal(Model.labelFor("sampling", 0, 1, true, 5, 20), "25%")
  assert.equal(Model.labelFor("sampling", 8.3, 1, true, 5, 20), "8.3 it/s")
})

test("formatRate matches Comfy it/s vs s/it", () => {
  assert.equal(Model.formatRate(0), "")
  assert.equal(Model.formatRate(8.27), "8.3 it/s")
  assert.equal(Model.formatRate(15.4), "15.4 it/s")
  assert.equal(Model.formatRate(0.04), "25.0s/it")
  assert.equal(Model.formatRate(0.4), "2.50s/it")
})

test("nextRate EMA and reset on new sampler", () => {
  const a = Model.nextRate(null, { value: 1, max: 20, promptId: "p", node: "3", t: 1000 })
  assert.equal(a.rate, 0)
  const b = Model.nextRate(a, { value: 3, max: 20, promptId: "p", node: "3", t: 2000 })
  assert.equal(b.rate, 2)
  const same = Model.nextRate(b, { value: 3, max: 20, promptId: "p", node: "3", t: 3000 })
  assert.equal(same.rate, 2)
  const reset = Model.nextRate(b, { value: 1, max: 30, promptId: "p", node: "3", t: 4000 })
  assert.equal(reset.rate, 0)
})

test("parseStatusFile maps schema 2 fields and stays compatible with schema 1", () => {
  const v2 = Model.parseStatusFile(JSON.stringify({
    schema: 2,
    state: "running",
    phase: "sampling",
    value: 4,
    max: 20,
    queue_remaining: 2,
    queue_running: 1,
    queue_pending: 1,
    prompt_id: "abc",
    node: "9",
    node_type: "KSampler",
    node_title: "Base sampler",
    updated_at: 12.5,
    last_event: "progress",
    step_times: [3.0, 2.5, 0],
    facts: { checkpoint: "flux1-dev.safetensors", width: 1024, height: 1024, seed: 7, steps: 20, sampler: "euler" },
    last_job: { prompt_id: "prev", status: "ok", duration_sec: 48, ended_at: 10 },
    vram: { name: "cuda", used: 18e9, total: 24e9 },
    session: { day: Model.todayStr(), gens: 3, failures: 1, interrupts: 0, gpu_sec: 120 }
  }))
  assert.equal(v2.phase, "sampling")
  assert.equal(v2.nodeType, "KSampler")
  assert.equal(v2.nodeTitle, "Base sampler")
  assert.deepEqual(v2.stepTimes, [3, 2.5])
  assert.equal(v2.facts.checkpoint, "flux1-dev.safetensors")
  assert.equal(v2.facts.seed, 7)
  assert.equal(v2.lastJob.status, "ok")
  assert.equal(v2.lastJob.durationSec, 48)
  assert.equal(v2.session.gens, 3)
  assert.equal(v2.session.gpuSec, 120)
  assert.equal(v2.vram.total, 24e9)
  assert.equal(v2.queuePending, 1)

  const v1 = Model.parseStatusFile(JSON.stringify({
    schema: 1,
    state: "running",
    value: 3,
    max: 20,
    queue_remaining: 2,
    prompt_id: "abc",
    node: "9",
    updated_at: 12.5,
    last_event: "progress"
  }))
  assert.equal(v1.state, "running")
  assert.equal(v1.queueRemaining, 2)
  assert.deepEqual(v1.stepTimes, [])
  assert.equal(v1.facts.checkpoint, null)
  assert.equal(v1.lastJob, null)
})

test("eta prefers median step time over rate", () => {
  const file = { value: 5, max: 20, stepTimes: [2, 4, 3] }
  assert.equal(Model.medianOf(file.stepTimes), 3)
  assert.equal(Model.etaSeconds(file, 10), 45)
  assert.equal(Model.etaSeconds({ value: 5, max: 20, stepTimes: [] }, 5), 3)
  assert.equal(Model.formatEta(45), "45s left")
  assert.equal(Model.formatEta(75), "1m 15s left")
  assert.equal(Model.formatEta(0), "")
})

test("hero and fact helpers", () => {
  const file = {
    phase: "sampling",
    value: 4,
    max: 20,
    stepTimes: [3, 3],
    nodeTitle: "Base sampler",
    facts: { checkpoint: "flux1-dev.safetensors", width: 1024, height: 1024, seed: 7, steps: 20, sampler: "euler" },
    session: { gens: 12 }
  }
  assert.equal(Model.heroTitle("sampling", file, 0), "48s left")
  assert.equal(Model.heroTitle("idle", file, 0), "Idle")
  assert.equal(Model.heroTitle("offline", file, 0), "Offline")
  assert.equal(Model.heroTitle("working", { phase: "idle" }, 0), "Working")
  assert.equal(Model.heroTitle("working", { phase: "decoding" }, 0), "Decoding")
  assert.equal(Model.resolvedPhase("working", { phase: "idle" }), "working")
  assert.match(Model.tooltipFor("working", { phase: "idle" }, 0, 1, "127.0.0.1", 8188), /working/)
  assert.equal(Model.heroMeta("sampling", file, null), "Base sampler · 4/20")
  assert.equal(Model.heroMeta("idle", file, file.session), "12 gens today")
  assert.equal(Model.heroDetail("sampling", 0.333, 1), "3.00s/it")
  assert.equal(Model.heroDetail("offline", 0, 2), "")
  assert.equal(Model.heroDetail("idle", 0, 2), "")
  assert.deepEqual(Model.factPills(file.facts), [
    "flux1-dev.safetensors",
    "1024×1024",
    "seed 7",
    "20 steps",
    "euler"
  ])
  assert.equal(Model.formatQueue(1, 2, 3), "1 running · 2 waiting")
  assert.equal(Model.formatQueue(0, 0, 0), "Empty")
  assert.equal(Model.formatLastJob({ status: "ok", durationSec: 48, endedAt: 100 }, 160), "48s · ok · 1m ago")
  assert.equal(Model.formatVram({ used: 18 * 1024 ** 3, total: 24 * 1024 ** 3 }), "18.0 GB / 24.0 GB")
  assert.equal(Model.phaseLabel("decoding", "working"), "Decoding")
})

test("parse extra HTTP payloads", () => {
  const queue = Model.parseQueueHttp(JSON.stringify({
    queue_running: [[0, "a"]],
    queue_pending: [[1, "b"], [2, "c"]]
  }))
  assert.equal(queue.ok, true)
  assert.equal(queue.running, 1)
  assert.equal(queue.pending, 2)

  const stats = Model.parseSystemStats(JSON.stringify({
    devices: [{ name: "cuda:0", vram_total: 24000, vram_free: 6000 }]
  }))
  assert.equal(stats.ok, true)
  assert.equal(stats.vram.used, 18000)
  assert.equal(stats.vram.total, 24000)
})

test("parseSession zeros leftover totals from another day", () => {
  const now = 1_700_000_000
  const today = Model.todayStr(now)
  const stale = Model.parseSession({
    day: "1999-01-01",
    gens: 9,
    failures: 1,
    interrupts: 2,
    gpu_sec: 12
  }, now)
  assert.equal(stale.gens, 0)
  assert.equal(stale.failures, 0)
  assert.equal(stale.interrupts, 0)
  assert.equal(stale.gpuSec, 0)
  assert.equal(stale.day, today)

  const fresh = Model.parseStatusFile(JSON.stringify({
    schema: 2,
    session: { day: today, gens: 4, failures: 0, interrupts: 0, gpu_sec: 30 }
  }), now)
  assert.equal(fresh.session.gens, 4)
  assert.equal(fresh.session.gpuSec, 30)
})

test("pickQueue prefers fresh schema 2 zeros over stale HTTP", () => {
  const now = 1000
  const fresh = { schema: 2, updatedAt: now, queueRunning: 0, queuePending: 0 }
  assert.deepEqual(Model.pickQueue(fresh, 1, 2, now), { running: 0, pending: 0 })
  const stale = { schema: 2, updatedAt: now - Model.FILE_MAX_AGE_SEC - 1, queueRunning: 0, queuePending: 0 }
  assert.deepEqual(Model.pickQueue(stale, 1, 2, now), { running: 1, pending: 2 })
  const v1 = { schema: 1, updatedAt: now, queueRunning: 0, queuePending: 0 }
  assert.deepEqual(Model.pickQueue(v1, 1, 2, now), { running: 1, pending: 2 })
  const leftover = {
    schema: 2, updatedAt: now, state: "idle",
    queueRemaining: 0, queueRunning: 1, queuePending: 2
  }
  assert.deepEqual(Model.pickQueue(leftover, 1, 2, now), { running: 0, pending: 0 })
  const busy = {
    schema: 2, updatedAt: now, state: "running",
    queueRemaining: 1, queueRunning: 1, queuePending: 0
  }
  assert.deepEqual(Model.pickQueue(busy, 0, 0, now), { running: 1, pending: 0 })
  assert.deepEqual(Model.pickQueue(busy, 1, 2, now, "offline"), { running: 0, pending: 0 })
  assert.deepEqual(Model.pickQueue(busy, 0, 0, now, "idle"), { running: 0, pending: 0 })
})

test("pickVram ignores a stale snapshot", () => {
  const now = 1000
  const http = { name: "cuda", used: 9, total: 10 }
  const stale = { updatedAt: now - Model.FILE_MAX_AGE_SEC - 1, vram: { name: "old", used: 1, total: 24 } }
  assert.deepEqual(Model.pickVram(stale, http, now), http)
  const fresh = { updatedAt: now, vram: { name: "old", used: 1, total: 24 } }
  assert.deepEqual(Model.pickVram(fresh, http, now), fresh.vram)
  assert.deepEqual(Model.pickVram(fresh, http, now, "offline"), http)
  assert.deepEqual(Model.pickVram(fresh, Model.emptyVram(), now, "offline"), Model.emptyVram())
})
