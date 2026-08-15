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
  const sampling = {
    state: "running",
    lastEvent: "progress",
    max: 20,
    value: 4
  }
  assert.equal(Model.classify({ httpSeen: true, httpOk: false, queueRemaining: 1, file: sampling }), "offline")
  assert.equal(Model.classify({ httpSeen: true, httpOk: true, queueRemaining: 0, file: sampling }), "idle")
  assert.equal(Model.classify({ httpSeen: true, httpOk: true, queueRemaining: 1, file: sampling }), "sampling")
  assert.equal(Model.classify({ httpSeen: true, httpOk: true, queueRemaining: 1, file: { lastEvent: "executing", max: 0 } }), "working")
  assert.equal(Model.classify({ httpSeen: false, httpOk: false, queueRemaining: 0, file: Model.emptySnapshot() }), "idle")
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
