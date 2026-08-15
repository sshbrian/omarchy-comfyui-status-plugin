import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

Panel {
  id: root
  moduleName: "io.github.sshbrian.comfyui-status"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root
  readonly property var host: hostWidget

  readonly property color foreground: host && host.fg ? host.fg : (bar ? bar.barForeground : Color.foreground)
  readonly property color dim: host && host.dim ? host.dim : Qt.darker(foreground, 1.55)
  readonly property color trackColor: host && host.trackColor ? host.trackColor : Style.selectedFillFor(foreground, Color.accent)
  readonly property color fillColor: host && host.fillColor ? host.fillColor : Color.accent
  readonly property color urgent: bar ? bar.urgent : Color.urgent
  readonly property string fontFamily: host && host.fontFamily ? host.fontFamily : (bar ? bar.fontFamily : Style.font.family)

  readonly property string kind: host ? String(host.kind || "idle") : "idle"
  readonly property real progress: host ? Number(host.progress || 0) : 0
  readonly property var stepTimes: host && host.stepTimes ? host.stepTimes : []
  readonly property var pills: host && host.pills ? host.pills : []
  readonly property string heroTitle: host ? String(host.heroTitle || "") : ""
  readonly property string heroMeta: host ? String(host.heroMeta || "") : ""
  readonly property string heroDetail: host ? String(host.heroDetail || "") : ""
  readonly property string queueDetail: host ? String(host.queueDetail || "") : ""
  readonly property string lastJobText: host ? String(host.lastJobText || "—") : "—"
  readonly property string vramText: host ? String(host.vramText || "—") : "—"
  readonly property string sessionGens: host ? String(host.sessionGensText || "0") : "0"
  readonly property string sessionFail: host ? String(host.sessionFailText || "0") : "0"
  readonly property string sessionGpu: host ? String(host.sessionGpuText || "—") : "—"
  readonly property bool canInterrupt: host ? host.canInterrupt === true : false
  readonly property string rateText: host ? String(host.rateText || "") : ""

  function open() {
    root.controller.show()
    if (host && host.pingExtras) host.pingExtras()
    Qt.callLater(function() {
      if (root.opened) setCenterHoverRevealSuppressed(true)
    })
  }

  function close() {
    setCenterHoverRevealSuppressed(false)
    root.controller.hide()
  }

  function toggle() {
    if (root.opened) root.close()
    else root.open()
  }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  function setCenterHoverRevealSuppressed(value) {
    if (root.bar && "centerHoverRevealSuppressed" in root.bar)
      root.bar.centerHoverRevealSuppressed = value
  }

  function activate() {
    if (root.canInterrupt && host && host.interrupt) host.interrupt()
    else if (host && host.openUi) host.openUi()
  }

  onOpenedChanged: if (opened && host && host.pingExtras) host.pingExtras()

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(400))
    contentHeight: panel.fittedContentHeight(column.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onActivateRequested: root.activate()
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onTextKey: function(t) {
        if (t === "x" || t === "X" || t === "i" || t === "I") {
          if (root.canInterrupt && root.host && root.host.interrupt) root.host.interrupt()
        } else if (t === "o" || t === "O") {
          if (root.host && root.host.openUi) root.host.openUi()
        }
      }

      Flickable {
        id: panelFlick
        anchors.fill: parent
        contentWidth: width
        contentHeight: column.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        flickableDirection: Flickable.VerticalFlick
        interactive: contentHeight > height

        Column {
          id: column
          width: panelFlick.width
          spacing: Style.space(14)

          Item {
            width: parent.width
            implicitHeight: heroColumn.implicitHeight

            Column {
              id: heroColumn
              width: parent.width - (stopBtn.visible ? stopBtn.width + Style.space(10) : 0)
              spacing: Style.space(4)

              Row {
                width: parent.width
                spacing: Style.space(8)

                Text {
                  width: Math.min(implicitWidth, parent.width - (detailPill.visible ? detailPill.implicitWidth + Style.space(8) : 0))
                  text: root.heroTitle || "—"
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.display + Style.space(6)
                  font.bold: true
                  elide: Text.ElideRight
                }

                Item {
                  width: Math.max(0, parent.width - parent.children[0].width - (detailPill.visible ? detailPill.implicitWidth : 0))
                  height: 1
                }

                BorderSurface {
                  id: detailPill
                  visible: root.heroDetail !== ""
                  implicitWidth: detailText.implicitWidth + Style.space(10)
                  implicitHeight: detailText.implicitHeight + Style.space(4)
                  anchors.verticalCenter: parent.verticalCenter
                  color: "transparent"
                  borderSpec: Border.controlSpec("normal", root.foreground, Color.accent)
                  radius: Style.cornerRadius

                  Text {
                    id: detailText
                    anchors.centerIn: parent
                    text: root.heroDetail
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.body
                    font.bold: true
                  }
                }
              }

              Text {
                width: parent.width
                text: root.heroMeta.toUpperCase()
                visible: root.heroMeta !== ""
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1.2
                elide: Text.ElideRight
              }
            }

            PanelActionButton {
              id: stopBtn
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              visible: root.canInterrupt
              iconText: ""
              tooltipText: "Interrupt"
              foreground: root.foreground
              hoverColor: root.urgent
              fontFamily: root.fontFamily
              onClicked: if (root.host && root.host.interrupt) root.host.interrupt()
            }
          }

          Item {
            width: parent.width
            height: Math.max(Style.space(6), Math.round(Style.spacing.controlHeight * 0.22))

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
              width: parent.width * Math.max(0, Math.min(1, root.progress))
              color: root.fillColor

              Behavior on width {
                NumberAnimation { duration: 160; easing.type: Easing.OutCubic }
              }
            }
          }

          Column {
            visible: root.stepTimes.length >= 2
            width: parent.width
            spacing: Style.space(6)

            Canvas {
              id: spark
              width: parent.width
              height: Style.space(72)
              property var values: root.stepTimes
              property color lineColor: root.fillColor
              onValuesChanged: requestPaint()
              onLineColorChanged: requestPaint()
              onWidthChanged: requestPaint()
              onHeightChanged: requestPaint()

              onPaint: {
                var ctx = getContext("2d")
                ctx.reset()
                var vals = spark.values
                if (!vals || vals.length < 2 || spark.width < 2 || spark.height < 2) return
                var w = spark.width
                var h = spark.height
                var min = Number.POSITIVE_INFINITY
                var max = Number.NEGATIVE_INFINITY
                for (var i = 0; i < vals.length; i++) {
                  var n = Number(vals[i])
                  if (!isFinite(n)) continue
                  if (n < min) min = n
                  if (n > max) max = n
                }
                if (!(max > min)) {
                  min = 0
                  if (!(max > 0)) max = 1
                }
                var pad = 3
                var c = spark.lineColor
                var r = Math.round(c.r * 255)
                var g = Math.round(c.g * 255)
                var b = Math.round(c.b * 255)
                ctx.beginPath()
                var lastX = 0
                var lastY = h
                for (var i = 0; i < vals.length; i++) {
                  var x = (i / (vals.length - 1)) * w
                  var t = (Number(vals[i]) - min) / (max - min)
                  if (!isFinite(t)) t = 0
                  var y = h - pad - t * (h - pad * 2)
                  if (i === 0) ctx.moveTo(x, y)
                  else ctx.lineTo(x, y)
                  lastX = x
                  lastY = y
                }
                ctx.strokeStyle = "rgba(" + r + "," + g + "," + b + ",1)"
                ctx.lineWidth = 2
                ctx.lineJoin = "round"
                ctx.lineCap = "round"
                ctx.stroke()
                ctx.lineTo(lastX, h)
                ctx.lineTo(0, h)
                ctx.closePath()
                ctx.fillStyle = "rgba(" + r + "," + g + "," + b + ",0.18)"
                ctx.fill()
              }
            }

            Item {
              width: parent.width
              implicitHeight: sparkCaption.implicitHeight

              Text {
                id: sparkCaption
                text: "THIS SAMPLER"
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1.2
              }

              Text {
                anchors.right: parent.right
                text: root.rateText !== "" ? root.rateText : (root.stepTimes.length + " steps")
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
              }
            }
          }

          Flow {
            id: factRow
            visible: root.pills.length > 0
            width: parent.width
            spacing: Style.space(6)

            Repeater {
              model: root.pills

              BorderSurface {
                id: pill
                required property var modelData
                implicitWidth: pillText.implicitWidth + Style.space(10)
                implicitHeight: pillText.implicitHeight + Style.space(4)
                color: "transparent"
                borderSpec: Border.controlSpec("normal", root.foreground, Color.accent)
                radius: Style.cornerRadius

                Text {
                  id: pillText
                  anchors.centerIn: parent
                  text: String(pill.modelData)
                  color: root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  font.bold: true
                }
              }
            }
          }

          PanelSeparator { foreground: root.foreground }

          Column {
            width: parent.width
            spacing: Style.space(8)

            InfoPair { label: "Queue"; value: root.queueDetail }
            InfoPair { label: "Last"; value: root.lastJobText }
            InfoPair { label: "VRAM"; value: root.vramText }
          }

          PanelSeparator { foreground: root.foreground }

          Column {
            width: parent.width
            spacing: Style.space(8)

            Item {
              width: parent.width
              implicitHeight: Math.max(todayLabel.implicitHeight, colHeaders.implicitHeight)

              Text {
                id: todayLabel
                text: "TODAY"
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                font.letterSpacing: 1.2
              }

              Row {
                id: colHeaders
                anchors.right: parent.right
                spacing: Style.space(16)

                HeaderCell { text: "gens"; cellWidth: Style.space(36) }
                HeaderCell { text: "fail"; cellWidth: Style.space(36) }
                HeaderCell { text: "gpu"; cellWidth: Style.space(56) }
              }
            }

            Item {
              width: parent.width
              implicitHeight: Math.max(todayWord.implicitHeight, colValues.implicitHeight)

              Text {
                id: todayWord
                text: "today"
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
              }

              Row {
                id: colValues
                anchors.right: parent.right
                spacing: Style.space(16)

                ValueCell { text: root.sessionGens; cellWidth: Style.space(36) }
                ValueCell { text: root.sessionFail; cellWidth: Style.space(36) }
                ValueCell { text: root.sessionGpu; cellWidth: Style.space(56) }
              }
            }
          }

          Text {
            text: "Open ComfyUI"
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            font.bold: true
            font.letterSpacing: 1.2

            MouseArea {
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: if (root.host && root.host.openUi) root.host.openUi()
            }
          }
        }
      }
    }
  }

  component InfoPair: Row {
    property string label: ""
    property string value: ""

    width: parent.width
    spacing: Style.space(8)

    Text {
      text: label
      color: root.foreground
      opacity: 0.6
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
    }

    Item {
      width: Math.max(0, parent.width - parent.children[0].implicitWidth - parent.children[2].implicitWidth - parent.spacing * 2)
      height: 1
    }

    Text {
      text: value
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      elide: Text.ElideRight
    }
  }

  component HeaderCell: Text {
    property real cellWidth: Style.space(36)
    width: cellWidth
    horizontalAlignment: Text.AlignRight
    color: root.dim
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    font.bold: true
  }

  component ValueCell: Text {
    property real cellWidth: Style.space(36)
    width: cellWidth
    horizontalAlignment: Text.AlignRight
    color: root.foreground
    font.family: root.fontFamily
    font.pixelSize: Style.font.bodySmall
  }
}
