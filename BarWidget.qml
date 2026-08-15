import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

BarWidget {
  id: root
  moduleName: "comfyui.status"

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
  readonly property string promptUrl: "http://" + host + ":" + port + "/prompt"
  readonly property string uiUrl: "http://" + host + ":" + port + "/"
  readonly property string stateHome: Quickshell.env("XDG_STATE_HOME") || (Quickshell.env("HOME") + "/.local/state")
  readonly property string statusPath: stateHome + "/omarchy/comfyui-status.json"

  property var fileSnap: Model.emptySnapshot()
  property bool httpSeen: false
  property bool httpOk: false
  property int queueRemaining: 0
  property var rateState: ({})

  readonly property string kind: Model.classify({
    httpSeen: httpSeen,
    httpOk: httpOk,
    queueRemaining: queueRemaining,
    file: fileSnap
  })
  readonly property real progress: fileSnap && fileSnap.max > 0 ? Math.max(0, Math.min(1, fileSnap.value / fileSnap.max)) : 0
  readonly property real rate: rateState && isFinite(Number(rateState.rate)) ? Number(rateState.rate) : 0
  readonly property string rateText: Model.formatRate(rate)
  readonly property string queueText: queueRemaining > 1 ? "Q:" + queueRemaining : ""
  readonly property color fg: bar ? bar.barForeground : Color.foreground
  readonly property color dim: Qt.darker(fg, 1.55)
  readonly property color trackColor: Style.selectedFillFor(fg, Color.accent)
  readonly property color fillColor: Color.accent
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family

  implicitWidth: visible ? row.implicitWidth + Style.space(14) : 0
  implicitHeight: barSize

  Behavior on implicitWidth {
    NumberAnimation { duration: 180; easing.type: Easing.OutCubic }
  }

  onFileSnapChanged: root.noteProgress(fileSnap)

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

  function openUi() {
    Qt.openUrlExternally(root.uiUrl)
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
    onTriggered: root.ping()
  }

  property string _pingOutput: ""

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

  Row {
    id: row
    anchors.centerIn: parent
    spacing: Style.space(6)

    Text {
      visible: root.kind !== "sampling" || root.vertical
      anchors.verticalCenter: parent.verticalCenter
      text: {
        if (root.kind === "sampling" && root.vertical)
          return root.rateText || Model.formatPercent(root.fileSnap.value, root.fileSnap.max) || "…"
        return Model.labelFor(root.kind, root.rate, root.queueRemaining, root.vertical)
      }
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

  MouseArea {
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onClicked: root.openUi()
    onEntered: if (root.bar) root.bar.showTooltip(root, Model.tooltipFor(root.kind, root.fileSnap, root.rate, root.queueRemaining, root.host, root.port))
    onExited: if (root.bar) root.bar.hideTooltip(root)
  }
}
