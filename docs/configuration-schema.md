# Configuration schema reference

This file is generated from `configuration/configuration_schema.json`. It is the mechanical property reference for configuration schema 4. Narrative rules, presence semantics, and the control protocol live in [device-configuration.md](device-configuration.md).

Schema version: 4.

## Limits

| Constant | Value | Meaning |
| --- | --- | --- |
| `kMaximumPayloadSize` | 16384 | Maximum compact JSON payload in bytes, for both the wire and NVS. |
| `kMaximumScreens` | 1 | Dashboard screens. Raising this multiplies per-screen widget storage and requires an explicit RAM-budget review. |
| `kMaximumWidgetsPerScreen` | 17 | Ordered widget references per screen. Bounds the sum of every widget variant on one screen. |
| `kMaximumTextWidgets` | 16 | Text widget storage per screen. |
| `kMaximumDeltaTimeWidgets` | 1 | Delta Time widget storage per screen. |
| `kMaximumTextSources` | 3 | Telemetry sources one text widget composes into a single string. Raising this grows the per-widget document storage, the widget render state, and the binder arrays. |
| `kMaximumValueModifiers` | 4 | Value modifiers per text widget source. |
| `kMaximumWidgetConditions` | 4 | Conditional styling rules per widget. Four covers a normal, caution, warning and limit band. |
| `kWidgetIdCapacity` | 16 | Widget identifier storage including the terminator (15 usable bytes). |
| `kWidgetTitleCapacity` | 16 | Widget title text storage including the terminator (15 usable bytes). |
| `kUnavailableTextCapacity` | 16 | Placeholder text storage including the terminator (15 usable bytes). |
| `kDeltaTimeTextCapacity` | 16 | Delta Time placeholder storage including the terminator (15 usable bytes). |
| `kValidationPathCapacity` | 48 | Storage for the dotted property path reported with a rejection, including the terminator. |
| `kValueBindingCapacity` | 40 | Canonical telemetry field name storage including the terminator (39 usable bytes). Must match CANONICAL_NAME_CAPACITY in tools/generate_telemetry_catalog.py. |
| `kValueAffixCapacity` | 16 | Transform prefix and suffix storage including the terminator (15 usable bytes). |

## Enumerations

| Type | Accepted values | Meaning |
| --- | --- | --- |
| `BoardId` | `t_display_s3`, `guition_esp32_4848s040`, `guition_jc1060p470c` | Immutable hardware identity. Must match the firmware build or the configuration is rejected. |
| `TelemetryTransportId` | `board_default`, `native_usb_cdc`, `uart` | Telemetry transport selection. board_default defers to the immutable board descriptor. |
| `DeltaTimeUnavailableBehavior` | `hide`, `placeholder`, `zero` | What the Delta Time widget shows while its telemetry is unavailable. |
| `TextAlignment` | `left`, `center`, `right` | Horizontal alignment of a text widget value. |
| `ValueTransformType` | `none`, `time`, `number` | Presentation transform applied after the modifier pipeline. |
| `ConditionOperator` | `above`, `at_or_above`, `below`, `at_or_below`, `equal`, `not_equal` | Comparison a styling rule applies to the numeric value of its condition source. |
| `ValueModifierType` | `lap_timer` | Stateful value processing implemented by a module behind the pipeline callback. |
| `WidgetType` | `text`, `delta_time` | Widget kind discriminator. Selects the compile-time widget descriptor used to build the widget. |

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

### DeltaTimeScaleConfiguration

| Property | Type | Default |
| --- | --- | --- |
| `enabled` | boolean | `false` |
| `show_sign` | boolean | `false` |
| `range_ms` | integer | `2000` |

### DeltaTimeConfiguration

Delta Time module configuration. Distinct from the Delta Time widget, which owns presentation only.

| Property | Type | Default |
| --- | --- | --- |
| `unavailable_behavior` | `DeltaTimeUnavailableBehavior` | `zero` |
| `placeholder` | string, max 15 bytes | `---` |
| `scale` | [`DeltaTimeScaleConfiguration`](#deltatimescaleconfiguration) | absent |

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

### DeltaTimeScaleStyle

| Property | Type | Default |
| --- | --- | --- |
| `vertical_padding_px` | integer, 0..65535 | `2` |
| `border_width_px` | integer, 0..65535 | `2` |
| `border_radius_px` | integer, 0..65535 | `8` |

### DeltaTimeWidgetConfiguration

Renders Delta Time module state. Requires the delta_time module section to be present.

| Property | Type | Default |
| --- | --- | --- |
| `type` | `WidgetType`, fixed `delta_time` | required |
| `id` | string, max 15 bytes | empty |
| `font` | `FontSpec` | absent |
| `placement` | [`WidgetPlacement`](#widgetplacement) | absent |
| `z_index` | integer, -32768..32767 | `0` |
| `faster_color` | string `#RRGGBB` | `#00C853` |
| `slower_color` | string `#RRGGBB` | `#D50000` |
| `neutral_color` | string `#RRGGBB` | `#E8E8E8` |
| `scale` | [`DeltaTimeScaleStyle`](#deltatimescalestyle) | absent |

### ConditionSourceConfiguration

Telemetry a widget watches to style itself, independent of what it displays: a gear readout can turn red on engine speed. It carries no transform because a condition consumes the typed value rather than its presentation.

| Property | Type | Default |
| --- | --- | --- |
| `binding` | string, max 39 bytes | empty |
| `modifiers` | array of [`ValueModifier`](#valuemodifier), max 4 | absent |

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

### TextWidgetConfiguration

Reusable telemetry text widget. Renders its ordered sources as one string.

| Property | Type | Default |
| --- | --- | --- |
| `type` | `WidgetType`, fixed `text` | required |
| `id` | string, max 15 bytes | empty |
| `sources` | array of [`TextSourceConfiguration`](#textsourceconfiguration), max 3 | absent |
| `condition_source` | [`ConditionSourceConfiguration`](#conditionsourceconfiguration) | absent |
| `conditions` | array of [`WidgetCondition`](#widgetcondition), max 4 | absent |
| `placement` | [`WidgetPlacement`](#widgetplacement) | absent |
| `z_index` | integer, -32768..32767 | `0` |
| `padding` | [`WidgetInsets`](#widgetinsets) | absent |
| `border` | [`WidgetBorder`](#widgetborder) | absent |
| `title` | [`WidgetTitleStyle`](#widgettitlestyle) | absent |
| `value` | [`WidgetValueStyle`](#widgetvaluestyle) | absent |
| `background_color` | string `#RRGGBB` | `kTransparentColor` (no background) |
| `background_inset_px` | integer, 0..65535 | `0` |

### ScreenConfiguration

One dashboard screen. A screen is the coordinate space for the widgets it owns.

| Property | Type | Default |
| --- | --- | --- |
| `id` | string, max 15 bytes | empty |
| `background_color` | string `#RRGGBB` | `#000000` |
| `widgets` | array of [`TextWidgetConfiguration`](#textwidgetconfiguration), [`DeltaTimeWidgetConfiguration`](#deltatimewidgetconfiguration), max 17, discriminated by `type` | absent |

### DashboardConfiguration

| Property | Type | Default |
| --- | --- | --- |
| `screens` | array of [`ScreenConfiguration`](#screenconfiguration), max 1 | absent |

### ApplicationConfiguration

| Property | Type | Default |
| --- | --- | --- |
| `hardware` | [`HardwareConfiguration`](#hardwareconfiguration) | absent |
| `telemetry_transport` | [`TelemetryTransportConfiguration`](#telemetrytransportconfiguration) | absent |
| `delta_time` | [`DeltaTimeConfiguration`](#deltatimeconfiguration) | absent |
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
| `invalid_dashboard` | Dashboard section is malformed or references an absent module. |
| `invalid_widget` | Widget property is malformed, out of range, or outside the screen bounds. |
| `unknown_property` | Property name is not part of this schema version. |
| `duplicate_property` | Property appears more than once in the same object. |
