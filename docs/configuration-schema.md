# Configuration schema reference

This file is generated from `configuration/configuration_schema.json`. It is the mechanical property reference for configuration schema 7. Narrative rules, presence semantics, and the control protocol live in [device-configuration.md](device-configuration.md).

Schema version: 7.

## Limits

| Constant | Value | Meaning |
| --- | --- | --- |
| `kMaximumPayloadSize` | 65536 | Maximum compact JSON payload in bytes, for both the wire and NVS. Sized so a screen filled to every per-type cap still fits with room to spare; the buffers it sizes and the parser's document both live in external memory. |
| `kMaximumScreens` | 4 | Dashboard screens the driver swipes between. Widget storage is a dashboard-wide pool, so a screen costs only its reference table; what bounds the count is how many screens are reachable mid-corner rather than RAM. |
| `kMaximumWidgetsPerScreen` | 94 | Ordered widget references per screen. Exactly the sum of every per-type cap below, so one screen can hold the whole pool; what bounds the widgets across every screen is the pool itself, and what bounds a document is kMaximumPayloadSize. |
| `kMaximumGroups` | 8 | Widget groups per screen. A group is one LVGL container, so it costs its own reference table rather than widget storage. |
| `kMaximumWidgetsPerGroup` | 16 | Ordered widget references inside one group. A group is an area of a screen rather than a screen, so it needs far fewer than a screen does. |
| `kMaximumActions` | 16 | Tap targets for the whole dashboard. An action makes one object clickable and costs one binding; the bound keeps that a decision about memory rather than an open list. |
| `kMaximumSlots` | 4 | Slots for the whole dashboard. A slot is a box whose groups are mutually exclusive; slot numbers run 1..kMaximumSlots and 0 means a group is not in one. |
| `kMaximumTextWidgets` | 32 | Text widget storage for the whole dashboard. A dense dashboard spends most of its widgets here: a tyre quadrant alone is eight readouts. |
| `kMaximumShapeWidgets` | 24 | Shape widget storage for the whole dashboard. Shapes carry a dashboard's layout, so this is the most generous cap. |
| `kMaximumBarWidgets` | 16 | Bar widget storage for the whole dashboard. |
| `kMaximumArcWidgets` | 8 | Arc widget storage for the whole dashboard. |
| `kMaximumIndicatorWidgets` | 4 | Indicator strip storage for the whole dashboard. |
| `kMaximumGraphWidgets` | 2 | Graph storage for the whole dashboard. Each instance owns a sample ring buffer, which is why this cap is the smallest. |
| `kMaximumImageWidgets` | 8 | Image widget storage for the whole dashboard. |
| `kMaximumIndicatorSegments` | 16 | Segments in one indicator strip. |
| `kMaximumGraphPoints` | 128 | Samples one graph retains. The ring buffer is sized by this whatever point_count asks for. |
| `kMaximumTextSources` | 3 | Telemetry sources one text widget composes into a single string. Raising this grows the per-widget document storage, the widget render state, and the binder arrays. |
| `kMaximumValueModifiers` | 4 | Value modifiers per text widget source. |
| `kMaximumColorStops` | 4 | Stops in one widget colour ramp. Four is a normal, caution, warning and limit band, the same bands the conditional rules cover discretely. |
| `kMaximumWidgetConditions` | 4 | Conditional styling rules per widget. Four covers a normal, caution, warning and limit band. |
| `kImageIdCapacity` | 32 | Uploaded image identifier storage including the terminator (31 usable bytes). Must match kImageIdCapacity in the image contract. |
| `kWidgetIdCapacity` | 16 | Widget identifier storage including the terminator (15 usable bytes). |
| `kWidgetTitleCapacity` | 16 | Widget title text storage including the terminator (15 usable bytes). |
| `kUnavailableTextCapacity` | 16 | Placeholder text storage including the terminator (15 usable bytes). |
| `kValidationPathCapacity` | 48 | Storage for the dotted property path reported with a rejection, including the terminator. |
| `kValueBindingCapacity` | 40 | Canonical telemetry field name storage including the terminator (39 usable bytes). Must match CANONICAL_NAME_CAPACITY in tools/generate_telemetry_catalog.py. |
| `kValueAffixCapacity` | 16 | Transform prefix and suffix storage including the terminator (15 usable bytes). |

## Enumerations

| Type | Accepted values | Meaning |
| --- | --- | --- |
| `BoardId` | `t_display_s3`, `guition_esp32_4848s040`, `guition_jc1060p470c` | Immutable hardware identity. Must match the firmware build or the configuration is rejected. |
| `TelemetryTransportId` | `board_default`, `native_usb_cdc`, `uart` | Telemetry transport selection. board_default defers to the immutable board descriptor. |
| `TextAlignment` | `left`, `center`, `right` | Horizontal alignment of a text widget value. |
| `ValueTransformType` | `none`, `time`, `number` | Presentation transform applied after the modifier pipeline. |
| `GradientDirection` | `horizontal`, `vertical` | Axis a linear gradient runs along. Only used when a gradient colour is set. |
| `ColorRampTarget` | `content`, `background`, `border` | Which part of a widget the colour ramp paints. What content means is the widget type's own business: text paints its label, a bar its fill. |
| `ConditionOperator` | `above`, `at_or_above`, `below`, `at_or_below`, `equal`, `not_equal` | Comparison a styling rule applies to the numeric value of its condition source. |
| `WidgetActionType` | `none`, `next_screen`, `previous_screen`, `goto_screen` | What a tap on a widget or a group does. none is the default and leaves the object refusing input, which is what every widget did before actions existed. |
| `ValueModifierType` | `lap_timer` | Stateful value processing implemented by a module behind the pipeline callback. |
| `BarOrientation` | `horizontal`, `vertical` | Axis a bar fills along. A vertical bar grows upwards unless it is inverted. |
| `ShapeKind` | `rectangle`, `ellipse` | Outline a shape widget takes. A line is a thin rectangle, so it needs no kind of its own. |
| `WidgetType` | `text`, `shape`, `bar`, `arc`, `indicator`, `graph`, `image` | Widget kind discriminator. Selects the compile-time widget descriptor used to build the widget. |

## Objects

### BoardConfiguration

| Property | Type | Default |
| --- | --- | --- |
| `board` | `BoardId` | `t_display_s3` |

### UartTelemetryConfiguration

| Property | Type | Default |
| --- | --- | --- |
| `port` | integer | `0` |
| `tx_pin` | integer | `43` |
| `rx_pin` | integer | `44` |
| `baud_rate` | integer, 0 or greater | `921600` |
| `silence_esp_logs` | boolean | `true` |

### TelemetryTransportConfiguration

| Property | Type | Default |
| --- | --- | --- |
| `id` | `TelemetryTransportId` | `board_default` |
| `uart` | [`UartTelemetryConfiguration`](#uarttelemetryconfiguration) | absent |

### WidgetPlacement

Absolute geometry in logical screen pixels.

| Property | Type | Default |
| --- | --- | --- |
| `x` | integer | `0` |
| `y` | integer | `0` |
| `width` | integer | `0` |
| `height` | integer | `0` |

### WidgetInsets

| Property | Type | Default |
| --- | --- | --- |
| `left` | integer, 0..65535 | `0` |
| `top` | integer, 0..65535 | `0` |
| `right` | integer, 0..65535 | `0` |
| `bottom` | integer, 0..65535 | `0` |

### WidgetBorder

| Property | Type | Default |
| --- | --- | --- |
| `color` | string `#RRGGBB` | `#AEAEAE` |
| `width_px` | integer, 0..65535 | `0` |
| `radius_px` | integer, 0..65535 | `0` |

### WidgetTitleStyle

| Property | Type | Default |
| --- | --- | --- |
| `text` | string, max 15 bytes | empty |
| `font` | `FontSpec` | absent |
| `color` | string `#RRGGBB` | `#E8E8E8` |
| `offset_y_px` | integer, -32768..32767 | `0` |

### WidgetValueStyle

| Property | Type | Default |
| --- | --- | --- |
| `font` | `FontSpec` | absent |
| `color` | string `#RRGGBB` | `#E8E8E8` |
| `alignment` | `TextAlignment` | `center` |
| `unavailable_text` | string, max 15 bytes | empty |

### ValueTransform

Stateless presentation transform. Absent means no transform is applied. The prefix and suffix belong to the transform rather than to one type, so they also apply to an untransformed value.

| Property | Type | Default |
| --- | --- | --- |
| `type` | `ValueTransformType` | `none` |
| `format` | see `TimeTransformConfig` | absent |
| `decimals` | see `NumberTransformConfig` | absent |
| `scale` | see `NumberTransformConfig` | absent |
| `offset` | see `NumberTransformConfig` | absent |
| `prefix` | string, max 15 bytes | empty |
| `suffix` | string, max 15 bytes | empty |

### ValueModifier

| Property | Type | Default |
| --- | --- | --- |
| `type` | `ValueModifierType` | `lap_timer` |

### ValueSourceConfiguration

A canonical telemetry binding with its modifier pipeline, consumed as a typed value. Carries no transform: the widgets that read one map it through a range or compare it, rather than presenting it as text.

| Property | Type | Default |
| --- | --- | --- |
| `binding` | string, max 39 bytes | empty |
| `modifiers` | array of [`ValueModifier`](#valuemodifier), max 4 | absent |

### ColorStop

One anchor of a colour ramp.

| Property | Type | Default |
| --- | --- | --- |
| `at` | number | `0` |
| `color` | string `#RRGGBB` | `#E8E8E8` |

### ColorRamp

A colour interpolated from the watched source rather than switched by a threshold. It is the base layer: a matching rule paints over it, and with no stops the authored colour stands.

| Property | Type | Default |
| --- | --- | --- |
| `target` | `ColorRampTarget` | `content` |
| `stops` | array of [`ColorStop`](#colorstop), max 4 | absent |

### WidgetAction

Navigation a tap performs. Carried by a widget and by a group, so a tap target is either a readout that doubles as a button or a rectangle of the screen — including an empty group, which is an invisible touch zone.

| Property | Type | Default |
| --- | --- | --- |
| `type` | `WidgetActionType` | `none` |
| `screen` | string, max 15 bytes | empty |

### WidgetCondition

One styling rule. The first rule whose comparison holds describes the widget; whatever it leaves unset stays as the widget's static style, and a transparent colour means unset rather than see-through.

| Property | Type | Default |
| --- | --- | --- |
| `op` | `ConditionOperator` | `at_or_above` |
| `value` | number | `0` |
| `color` | string `#RRGGBB` | `kTransparentColor` (no background) |
| `background_color` | string `#RRGGBB` | `kTransparentColor` (no background) |
| `border_color` | string `#RRGGBB` | `kTransparentColor` (no background) |
| `hidden` | boolean | `false` |
| `blink_ms` | integer, 0..65535 | `0` |
| `hold_ms` | integer, 0..65535 | `0` |

### TextSourceConfiguration

One canonical telemetry source of a text widget, consumed through a pre-bound typed callback. Its transform affixes are what separate it from the next source, so composing several needs no format string.

| Property | Type | Default |
| --- | --- | --- |
| `binding` | string, max 39 bytes | `vehicle.speed` |
| `modifiers` | array of [`ValueModifier`](#valuemodifier), max 4 | absent |
| `transform` | [`ValueTransform`](#valuetransform) | absent |

### WidgetFrame

What every widget type owns regardless of what it draws: where it sits, how it is boxed, and the rules that restyle it. Flattened into each widget, so these are plain widget properties on the wire.

| Property | Type | Default |
| --- | --- | --- |
| `id` | string, max 15 bytes | empty |
| `placement` | [`WidgetPlacement`](#widgetplacement) | absent |
| `z_index` | integer, -32768..32767 | `0` |
| `padding` | [`WidgetInsets`](#widgetinsets) | absent |
| `border` | [`WidgetBorder`](#widgetborder) | absent |
| `title` | [`WidgetTitleStyle`](#widgettitlestyle) | absent |
| `background_color` | string `#RRGGBB` | `kTransparentColor` (no background) |
| `background_grad_color` | string `#RRGGBB` | `kTransparentColor` (no background) |
| `background_grad_dir` | `GradientDirection` | `vertical` |
| `background_inset_px` | integer, 0..65535 | `0` |
| `action` | [`WidgetAction`](#widgetaction) | absent |
| `condition_source` | [`ValueSourceConfiguration`](#valuesourceconfiguration) | absent |
| `color_ramp` | [`ColorRamp`](#colorramp) | absent |
| `conditions` | array of [`WidgetCondition`](#widgetcondition), max 4 | absent |

### TextWidgetConfiguration

Reusable telemetry text widget. Renders its ordered sources as one string.

Also carries the properties of [`WidgetFrame`](#widgetframe), flattened: they are plain properties of this object in JSON.

| Property | Type | Default |
| --- | --- | --- |
| `type` | `WidgetType`, fixed `text` | required |
| `sources` | array of [`TextSourceConfiguration`](#textsourceconfiguration), max 3 | absent |
| `value` | [`WidgetValueStyle`](#widgetvaluestyle) | absent |

### ValueRange

Input window a widget maps its source through. The fraction is clamped, so a value outside the window reads as full or empty rather than overflowing.

| Property | Type | Default |
| --- | --- | --- |
| `minimum` | number | `0` |
| `maximum` | number | `1` |

### BarWidgetConfiguration

One telemetry source drawn as a filled proportion of the widget. The frame background is the track the fill runs over, so a bar needs no track colour of its own.

Also carries the properties of [`WidgetFrame`](#widgetframe) and [`ValueRange`](#valuerange), flattened: they are plain properties of this object in JSON.

| Property | Type | Default |
| --- | --- | --- |
| `type` | `WidgetType`, fixed `bar` | required |
| `source` | [`ValueSourceConfiguration`](#valuesourceconfiguration) | absent |
| `origin` | number | `0` |
| `orientation` | `BarOrientation` | `horizontal` |
| `inverted` | boolean | `false` |
| `fill_color` | string `#RRGGBB` | `#38BDF8` |
| `fill_grad_color` | string `#RRGGBB` | `kTransparentColor` (no background) |

### ArcWidgetConfiguration

One telemetry source swept around an arc. The track is the arc's own background, so a gauge needs no shape behind it.

Also carries the properties of [`WidgetFrame`](#widgetframe) and [`ValueRange`](#valuerange), flattened: they are plain properties of this object in JSON.

| Property | Type | Default |
| --- | --- | --- |
| `type` | `WidgetType`, fixed `arc` | required |
| `source` | [`ValueSourceConfiguration`](#valuesourceconfiguration) | absent |
| `start_angle_deg` | integer, 0..65535 | `135` |
| `sweep_deg` | integer, 0..65535 | `270` |
| `thickness_px` | integer, 0..65535 | `8` |
| `track_color` | string `#RRGGBB` | `kTransparentColor` (no background) |
| `fill_color` | string `#RRGGBB` | `#38BDF8` |
| `inverted` | boolean | `false` |

### IndicatorSegment

One lamp in an indicator strip.

| Property | Type | Default |
| --- | --- | --- |
| `threshold` | number | `0` |
| `color` | string `#RRGGBB` | `#00C853` |

### IndicatorWidgetConfiguration

A row of lamps that light as one telemetry source climbs its range: shift lights, a rev strip, a stint marker.

Also carries the properties of [`WidgetFrame`](#widgetframe) and [`ValueRange`](#valuerange), flattened: they are plain properties of this object in JSON.

| Property | Type | Default |
| --- | --- | --- |
| `type` | `WidgetType`, fixed `indicator` | required |
| `source` | [`ValueSourceConfiguration`](#valuesourceconfiguration) | absent |
| `orientation` | `BarOrientation` | `horizontal` |
| `segment_gap_px` | integer, 0..65535 | `4` |
| `segment_radius_px` | integer, 0..65535 | `0` |
| `off_color` | string `#RRGGBB` | `kTransparentColor` (no background) |
| `blink_threshold` | number | `2` |
| `blink_ms` | integer, 0..65535 | `0` |
| `segments` | array of [`IndicatorSegment`](#indicatorsegment), max 16 | absent |

### GraphWidgetConfiguration

A rolling trace of one telemetry source. The history is presentation state the widget samples for itself; it is not a telemetry value and nothing else can read it.

Also carries the properties of [`WidgetFrame`](#widgetframe) and [`ValueRange`](#valuerange), flattened: they are plain properties of this object in JSON.

| Property | Type | Default |
| --- | --- | --- |
| `type` | `WidgetType`, fixed `graph` | required |
| `source` | [`ValueSourceConfiguration`](#valuesourceconfiguration) | absent |
| `point_count` | integer, 0..65535 | `64` |
| `sample_interval_ms` | integer, 0..65535 | `100` |
| `line_color` | string `#RRGGBB` | `#38BDF8` |
| `line_width_px` | integer, 0..65535 | `2` |

### ImageWidgetConfiguration

An uploaded image drawn inside the frame. It binds no telemetry of its own, but its styling rules can hide it, flash it or recolour it. Neither scaled nor rotated: the configurator converts each image to the size it is drawn at, which also keeps the accelerated draw path on the ESP32-P4.

Also carries the properties of [`WidgetFrame`](#widgetframe), flattened: they are plain properties of this object in JSON.

| Property | Type | Default |
| --- | --- | --- |
| `type` | `WidgetType`, fixed `image` | required |
| `image` | string, max 31 bytes | empty |
| `recolor` | string `#RRGGBB` | `kTransparentColor` (no background) |
| `recolor_opa` | integer, 0..255 | `255` |

### ShapeWidgetConfiguration

Panels, dividers and backing plates: the frame is the whole widget. It binds no telemetry of its own, but its styling rules can still hide it or flash it. A line is a thin rectangle.

Also carries the properties of [`WidgetFrame`](#widgetframe), flattened: they are plain properties of this object in JSON.

| Property | Type | Default |
| --- | --- | --- |
| `type` | `WidgetType`, fixed `shape` | required |
| `kind` | `ShapeKind` | `rectangle` |

### GroupCondition

One activation rule for a group in a slot. The first rule whose comparison holds shows its group, and the hold keeps it up for that long after the match ends so a momentary event stays readable.

| Property | Type | Default |
| --- | --- | --- |
| `op` | `ConditionOperator` | `at_or_above` |
| `value` | number | `0` |
| `hold_ms` | integer, 0..65535 | `0` |

### GroupConfiguration

A rectangle of a screen with widgets authored inside it. A widget in a group is placed relative to this box and clipped to it; the group performs no layout of its own. Groups sharing a slot occupy the same box with one of them visible at a time.

| Property | Type | Default |
| --- | --- | --- |
| `id` | string, max 15 bytes | empty |
| `placement` | [`WidgetPlacement`](#widgetplacement) | absent |
| `z_index` | integer, -32768..32767 | `0` |
| `slot` | integer, 0..255 | `0` |
| `slot_default` | boolean | `false` |
| `action` | [`WidgetAction`](#widgetaction) | absent |
| `condition_source` | [`ValueSourceConfiguration`](#valuesourceconfiguration) | absent |
| `conditions` | array of [`GroupCondition`](#groupcondition), max 4 | absent |
| `widgets` | array of [`TextWidgetConfiguration`](#textwidgetconfiguration), [`ShapeWidgetConfiguration`](#shapewidgetconfiguration), [`BarWidgetConfiguration`](#barwidgetconfiguration), [`ArcWidgetConfiguration`](#arcwidgetconfiguration), [`IndicatorWidgetConfiguration`](#indicatorwidgetconfiguration), [`GraphWidgetConfiguration`](#graphwidgetconfiguration), [`ImageWidgetConfiguration`](#imagewidgetconfiguration), max 16, discriminated by `type` | absent |

### ScreenConfiguration

One dashboard screen: the coordinate space its widgets are placed in, and the order they stack in. The widgets themselves live in the dashboard's pool; a screen names them by reference. Widgets authored directly on the screen appear in its own reference table, and widgets authored inside a group appear in that group's.

| Property | Type | Default |
| --- | --- | --- |
| `id` | string, max 15 bytes | empty |
| `background_color` | string `#RRGGBB` | `#000000` |
| `groups` | array of [`GroupConfiguration`](#groupconfiguration), max 8 | absent |
| `widgets` | array of [`TextWidgetConfiguration`](#textwidgetconfiguration), [`ShapeWidgetConfiguration`](#shapewidgetconfiguration), [`BarWidgetConfiguration`](#barwidgetconfiguration), [`ArcWidgetConfiguration`](#arcwidgetconfiguration), [`IndicatorWidgetConfiguration`](#indicatorwidgetconfiguration), [`GraphWidgetConfiguration`](#graphwidgetconfiguration), [`ImageWidgetConfiguration`](#imagewidgetconfiguration), max 94, discriminated by `type` | absent |

### DashboardConfiguration

Owns the typed widget storage as one pool shared by every screen; a screen holds only an ordered list of references into it. A screen therefore costs its reference table rather than a full set of widget arrays.

| Property | Type | Default |
| --- | --- | --- |
| `screens` | array of [`ScreenConfiguration`](#screenconfiguration), max 4 | absent |

### ApplicationConfiguration

Also carries the properties of [`BoardConfiguration`](#boardconfiguration), flattened: they are plain properties of this object in JSON.

| Property | Type | Default |
| --- | --- | --- |
| `hardware` | [`HardwareConfiguration`](#hardwareconfiguration) | absent |
| `telemetry_transport` | [`TelemetryTransportConfiguration`](#telemetrytransportconfiguration) | absent |
| `dashboard` | [`DashboardConfiguration`](#dashboardconfiguration) | absent |

## Validation errors

| Token | Meaning |
| --- | --- |
| `none` | No error. |
| `malformed` | Not parseable JSON, oversized payload, or trailing content. |
| `unsupported_schema` | Stored record uses a schema version this firmware does not accept. |
| `invalid_board` | Missing or unknown board identifier. |
| `board_mismatch` | Board identifier does not match the firmware build. |
| `invalid_hardware` | Hardware list is not an empty array. |
| `invalid_transport` | Unknown transport or one the board does not support. |
| `invalid_uart` | UART pins do not match the board or baud rate is out of range. |
| `invalid_module` | Module section value out of range. |
| `invalid_screen` | Screen section is malformed or the screen count is out of range. |
| `invalid_group` | Group is malformed, outside its screen, or breaks a slot rule: groups sharing a slot must share a box and exactly one of them must be the slot default. |
| `invalid_dashboard` | Dashboard section is malformed or references an absent module. |
| `invalid_widget` | Widget property is malformed, out of range, or outside the screen bounds. |
| `unknown_property` | Property name is not part of this schema version. |
| `duplicate_property` | Property appears more than once in the same object. |
