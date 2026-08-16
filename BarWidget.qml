import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

BarWidget {
  id: root
  moduleName: "io.github.sshbrian.comfyui-status"

  readonly property string host: {
    var value = String(setting("host", "127.0.0.1")).replace(/^\s+|\s+$/g, "")
    return value.length > 0 ? value : "127.0.0.1"
  }
  readonly property int port: {
    var n = parseInt(String(setting("port", 8188)), 10)
    if (!isFinite(n)) n = 8188
    if (n < 1) n = 1
    if (n > 65535) n = 65535
    return n
  }
  readonly property string origin: "http://" + host + ":" + port
  readonly property string promptUrl: origin + "/prompt"
  readonly property string queueUrl: origin + "/queue"
  readonly property string statsUrl: origin + "/system_stats"
  readonly property string interruptUrl: origin + "/interrupt"
  readonly property string uiUrl: origin + "/"
  readonly property string stateHome: Quickshell.env("XDG_STATE_HOME") || (Quickshell.env("HOME") + "/.local/state")
  readonly property string statusPath: stateHome + "/omarchy/comfyui-status.json"

  property var fileSnap: Model.emptySnapshot()
  property bool httpSeen: false
  property bool httpOk: false
  property int queueRemaining: 0
  property var rateState: ({})
  property double nowMs: Date.now()
  property var httpVram: Model.emptyVram()
  property int httpRunning: 0
  property int httpPending: 0
  property string _pingOutput: ""
  property string _queueOutput: ""
  property string _statsOutput: ""

  readonly property string kind: Model.classify({
    httpSeen: httpSeen,
    httpOk: httpOk,
    queueRemaining: queueRemaining,
    file: fileSnap,
    now: nowMs / 1000
  })
  readonly property real progress: liveJob && fileSnap && fileSnap.max > 0 ? Math.max(0, Math.min(1, fileSnap.value / fileSnap.max)) : 0
  readonly property real rate: rateState && isFinite(Number(rateState.rate)) ? Number(rateState.rate) : 0
  readonly property string rateText: Model.formatRate(rate)
  readonly property string queueText: queueRemaining > 1 ? "Q:" + queueRemaining : ""
  readonly property color fg: bar ? bar.barForeground : Color.foreground
  readonly property color dim: Qt.darker(fg, 1.55)
  readonly property color trackColor: Style.selectedFillFor(fg, Color.accent)
  readonly property color fillColor: Color.accent
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property bool liveJob: kind === "sampling" || kind === "working"
  readonly property bool canInterrupt: liveJob
  readonly property var stepTimes: liveJob && fileSnap && fileSnap.stepTimes ? fileSnap.stepTimes : []
  readonly property var pills: liveJob ? Model.factPills(fileSnap && fileSnap.facts) : []
  readonly property string heroTitle: Model.heroTitle(kind, fileSnap, rate)
  readonly property string heroMeta: Model.heroMeta(kind, fileSnap, fileSnap ? fileSnap.session : null)
  readonly property string heroDetail: Model.heroDetail(kind, rate, queueRemaining)
  readonly property var displayQueue: Model.pickQueue(fileSnap, httpRunning, httpPending, nowMs / 1000, kind)
  readonly property int displayRunning: displayQueue.running
  readonly property int displayPending: displayQueue.pending
  readonly property string queueDetail: Model.formatQueue(displayRunning, displayPending, kind === "offline" ? 0 : queueRemaining)
  readonly property string lastJobText: Model.formatLastJob(fileSnap ? fileSnap.lastJob : null, nowMs / 1000)
  readonly property string vramText: Model.formatVram(Model.pickVram(fileSnap, httpVram, nowMs / 1000, kind))
  readonly property string sessionGensText: fileSnap && fileSnap.session ? String(fileSnap.session.gens) : "0"
  readonly property string sessionFailText: fileSnap && fileSnap.session ? String(fileSnap.session.failures) : "0"
  readonly property string sessionGpuText: {
    var sec = fileSnap && fileSnap.session ? fileSnap.session.gpuSec : 0
    return Model.formatDuration(sec) || "0s"
  }

  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false
  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false
  readonly property real openPanelIndicatorWidth: row.implicitWidth

  implicitWidth: visible ? button.implicitWidth : 0
  implicitHeight: button.implicitHeight

  Behavior on implicitWidth {
    NumberAnimation { duration: 180; easing.type: Easing.OutCubic }
  }

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()
  onFileSnapChanged: root.noteProgress(fileSnap)
  onKindChanged: {
    if (root.kind !== "idle" && root.kind !== "offline") return
    root.httpRunning = 0
    root.httpPending = 0
    if (root.kind === "offline") root.httpVram = Model.emptyVram()
  }

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
  }

  function open() {
    if (panelLoader.item && panelLoader.item.open) panelLoader.item.open()
  }

  function close() {
    if (panelLoader.item && panelLoader.item.close) panelLoader.item.close()
  }

  function togglePanel() {
    if (panelLoader.item && panelLoader.item.toggle) panelLoader.item.toggle()
  }

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  function noteProgress(snap) {
    if (!snap || snap.lastEvent !== "progress") return
    rateState = Model.nextRate(rateState, {
      value: snap.value,
      max: snap.max,
      promptId: snap.promptId,
      node: snap.node,
      t: Date.now()
    })
  }

  function applyFile(raw) {
    fileSnap = Model.parseStatusFile(raw)
  }

  function applyHttp(raw, ok) {
    httpSeen = true
    if (!ok) {
      httpOk = false
      queueRemaining = 0
      return
    }
    var parsed = Model.parsePromptHttp(raw)
    httpOk = parsed.ok === true
    if (parsed.ok) queueRemaining = parsed.queueRemaining
  }

  function ping() {
    if (pingProc.running) return
    pingProc.command = ["curl", "-fsS", "--max-time", "1", root.promptUrl]
    pingProc.running = true
  }

  function pingExtras() {
    if (queueProc.running === false) {
      queueProc.command = ["curl", "-fsS", "--max-time", "1", root.queueUrl]
      queueProc.running = true
    }
    if (statsProc.running === false) {
      statsProc.command = ["curl", "-fsS", "--max-time", "1", root.statsUrl]
      statsProc.running = true
    }
  }

  function openUi() {
    Qt.openUrlExternally(root.uiUrl)
  }

  function interrupt() {
    if (!root.canInterrupt || interruptProc.running) return
    interruptProc.command = [
      "curl", "-fsS", "-X", "POST", "--max-time", "2",
      "-H", "Content-Type: application/json",
      "-d", "{}",
      root.interruptUrl
    ]
    interruptProc.running = true
  }

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  FileView {
    id: statusFile
    path: root.statusPath
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: root.applyFile(text())
    onLoadFailed: root.applyFile("")
  }

  Timer {
    interval: 500
    running: true
    repeat: true
    onTriggered: statusFile.reload()
  }

  Timer {
    interval: 2000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: {
      root.nowMs = Date.now()
      root.ping()
      if (root.opened) root.pingExtras()
    }
  }

  Process {
    id: pingProc
    running: false
    command: ["curl", "-fsS", "--max-time", "1", root.promptUrl]
    stdout: StdioCollector {
      id: pingStdout
      waitForEnd: true
      onStreamFinished: root._pingOutput = text
    }
    onExited: function(exitCode) {
      root.applyHttp(pingStdout.text || root._pingOutput, exitCode === 0)
    }
  }

  Process {
    id: queueProc
    running: false
    stdout: StdioCollector {
      id: queueStdout
      waitForEnd: true
      onStreamFinished: root._queueOutput = text
    }
    onExited: function(exitCode) {
      if (exitCode !== 0) {
        root.httpRunning = 0
        root.httpPending = 0
        return
      }
      var parsed = Model.parseQueueHttp(queueStdout.text || root._queueOutput)
      if (!parsed.ok) {
        root.httpRunning = 0
        root.httpPending = 0
        return
      }
      root.httpRunning = parsed.running
      root.httpPending = parsed.pending
    }
  }

  Process {
    id: statsProc
    running: false
    stdout: StdioCollector {
      id: statsStdout
      waitForEnd: true
      onStreamFinished: root._statsOutput = text
    }
    onExited: function(exitCode) {
      if (exitCode !== 0) {
        root.httpVram = Model.emptyVram()
        return
      }
      var parsed = Model.parseSystemStats(statsStdout.text || root._statsOutput)
      if (parsed.ok) root.httpVram = parsed.vram
      else root.httpVram = Model.emptyVram()
    }
  }

  Process {
    id: interruptProc
    running: false
  }

  IpcHandler {
    target: root.moduleName

    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.togglePanel() }
    function interrupt(): void { root.interrupt() }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: ""
    labelVisible: false
    hasVisualContent: true
    tooltipText: root.opened ? "" : Model.tooltipFor(root.kind, root.fileSnap, root.rate, root.queueRemaining, root.host, root.port)
    fixedWidth: root.vertical ? -1 : Math.max(Style.space(48), row.implicitWidth + Style.space(14))
    fixedHeight: root.vertical ? Math.max(root.barSize, row.implicitHeight + Style.space(8)) : -1

    onPressed: function(b) {
      if (b === Qt.RightButton) root.openUi()
      else if (b === Qt.MiddleButton) root.interrupt()
      else root.togglePanel()
    }

    Row {
      id: row
      anchors.centerIn: parent
      spacing: Style.space(6)

      Text {
        visible: root.kind !== "sampling" || root.vertical
        anchors.verticalCenter: parent.verticalCenter
        text: Model.labelFor(root.kind, root.rate, root.queueRemaining, root.vertical, root.fileSnap.value, root.fileSnap.max)
        color: root.kind === "offline" ? root.dim : root.fg
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
      }

      Item {
        id: track
        visible: root.kind === "sampling" && !root.vertical
        width: Style.space(72)
        height: Math.max(Style.space(4), Math.round(Style.spacing.controlHeight * 0.14))
        anchors.verticalCenter: parent.verticalCenter

        Rectangle {
          anchors.fill: parent
          radius: height / 2
          color: root.trackColor
        }

        Rectangle {
          anchors.left: parent.left
          anchors.verticalCenter: parent.verticalCenter
          height: parent.height
          radius: parent.height / 2
          width: parent.width * root.progress
          color: root.fillColor

          Behavior on width {
            NumberAnimation { duration: 160; easing.type: Easing.OutCubic }
          }
        }
      }

      Text {
        visible: root.kind === "sampling" && !root.vertical && root.rateText !== ""
        anchors.verticalCenter: parent.verticalCenter
        text: root.rateText
        color: root.fg
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
      }

      Text {
        visible: root.queueText !== "" && root.kind !== "idle" && root.kind !== "offline"
        anchors.verticalCenter: parent.verticalCenter
        text: root.queueText
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
      }
    }
  }
}
