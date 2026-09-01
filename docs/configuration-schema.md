# Configuration schema reference

This file is generated from `configuration/configuration_schema.json`. It is the mechanical property reference for configuration schema 23. Narrative rules, presence semantics, and the control protocol live in [device-configuration.md](device-configuration.md).

Schema version: 23.

## Documents

The configuration is transferred and stored as three independent documents. Each carries the `board` identifier — so each is validated against the board it arrives at — plus the root sections listed here, and is rejected if it carries any other. `@SC:GET`, `@SC:SET`, `@SC:VALIDATE` and `@SC:APPLY` name one of them.

| Document | Carries | Maximum payload | Restart to take effect | Purpose |
| --- | --- | --- | --- | --- |
| `dashboard` | `board`, `dashboard` | 131072 bytes | no | The screens and every widget on them. The one document large enough to need the full payload bound, and the only one a live apply rebuilds in place. |
| `modules` | `board`, `hardware` | 32768 bytes | no | Peripherals beyond the display: the addressable LED outputs, and the buttons and encoders that will join them. Separate from the dashboard so that adding one costs neither its bytes nor its restarts, and sized to carry a matrix's artwork inline rather than as an uploaded asset. |
| `protocol` | `board`, `telemetry_transport` | 1024 bytes | yes | Which link carries telemetry and how it is configured. The transport is bound once at startup, so writing this document stores a setting that is not yet in force — which is why it is the one document whose save asks for a restart. |

## Limits

| Constant | Value | Meaning |
| --- | --- | --- |
| `kMaximumPayloadSize` | 131072 | Largest compact JSON payload in bytes any one document may carry, for both the wire and NVS. It is the dashboard's bound — the widest of the three — so it is what sizes the shared line, record and reply buffers; each document is held to its own `max_payload` below. At the ~350 bytes of compact JSON a widget measures it carries around 370 widgets, which is what a document can actually instantiate — fewer than the per-type pools below add up to, and already past what one screen can address. Two of these also have to fit in the 512 KB configuration partition while a record is being replaced, which is why it stops here rather than growing again. The buffers it sizes and the parser's document both live in external memory. |
| `kMaximumScreens` | 4 | Dashboard screens the driver swipes between. Widget storage is a dashboard-wide pool, so a screen costs only its reference table; what bounds the count is how many screens are reachable mid-corner rather than RAM. |
| `kMaximumWidgetsPerScreen` | 255 | Ordered widget references per screen, and the largest a uint8 count can address — which is what sets it. It is no longer the sum of the per-type caps below: the pool is dashboard-wide and deliberately larger than one screen, so four screens share it instead of each being able to hold all of it. What bounds the widgets across every screen is the pool itself, and what bounds a document is kMaximumPayloadSize, which at the ~350 bytes of compact JSON a widget measures carries fewer widgets than the pools could hold. |
| `kMaximumWidgetsPerContainer` | 32 | Ordered widget references inside one container: a shape, or one page of a slot. A container is an area of a screen rather than a screen, so it needs far fewer than a screen does. |
| `kMaximumNestingDepth` | 4 | How deeply containers may nest, counting a widget on a screen as depth 0. The parser recurses once per level, so this is what bounds the configuration task's stack rather than an authoring preference — and why a slot page costs nothing here: it is walked without a recursion of its own, so a slot spends exactly what a container shape spends. |
| `kMaximumActions` | 32 | Tap targets for the whole dashboard. An action makes one object clickable and costs one binding; the bound keeps that a decision about memory rather than an open list. |
| `kMaximumSlotPages` | 8 | Pages one slot switches between. A page costs one bare LVGL object and one row in the slot controller, so this bounds both; the flat page table the parser addresses is kMaximumSlotWidgets * kMaximumSlotPages entries. |
| `kMaximumTextWidgets` | 160 | Text widget storage for the whole dashboard, and the largest pool because a dense dashboard spends most of its widgets here: a tyre quadrant alone is eight readouts. Widget storage costs external RAM only, so what bounds this is the frame rather than memory - see ADR 0026. |
| `kMaximumShapeWidgets` | 96 | Shape widget storage for the whole dashboard. Shapes carry a dashboard's layout and hold other widgets, so this is the most generous cap after text: every container spends one, and a dense screen spends them faster than it spends any gauge. |
| `kMaximumSlotWidgets` | 12 | Slot widget storage for the whole dashboard. A slot is an area that switches what it shows, and every page it holds is a live object built at composition, so it is capped far below the shape pool. |
| `kMaximumBarWidgets` | 48 | Bar widget storage for the whole dashboard. |
| `kMaximumArcWidgets` | 24 | Arc widget storage for the whole dashboard. |
| `kMaximumIndicatorWidgets` | 12 | Indicator strip storage for the whole dashboard. |
| `kMaximumGraphWidgets` | 6 | Graph storage for the whole dashboard. Each instance owns a sample ring buffer, which is why this cap is the smallest. |
| `kMaximumImageWidgets` | 64 | Image widget storage for the whole dashboard. Generous because an image that never changes is among the cheapest widgets to draw, and a dashboard that leans on artwork rather than on shapes spends its budget here instead. |
| `kMaximumIndicatorSegments` | 16 | Segments in one indicator strip. |
| `kMinimumBlinkMs` | 100 | Fastest blink period any rule may ask for. Below this a widget reads as a strobe rather than an indicator, and the eye stops resolving the state it is meant to signal. |
| `kMaximumBlinkMs` | 5000 | Slowest blink period any rule may ask for. Past this the widget spends so long in one phase that it reads as one that failed to update. |
| `kMaximumHoldMs` | 10000 | Longest a styling rule, or a slot page raised by an event, may outlive the match that raised it. Past this it stops reading as a reaction to the car and starts reading as a stuck dashboard. |
| `kMaximumGraphPoints` | 128 | Samples one graph retains. The ring buffer is sized by this whatever point_count asks for. |
| `kMaximumGraphSources` | 3 | Telemetry sources one graph draws on a single plot, counting the widget's own. Each one costs a point array and an LVGL line of its own, which is why this is the smallest of the multi-source caps. |
| `kMaximumGraphTraces` | 2 | Entries in a graph's traces array: kMaximumGraphSources less the one the widget's own source already is. An array capacity has to name a limit of its own, which is why the total is stated separately. |
| `kMaximumTextSources` | 3 | Telemetry sources one text widget composes into a single string. Raising this grows the per-widget document storage, the widget render state, and the binder arrays. |
| `kMaximumValueModifiers` | 4 | Value modifiers per text widget source. |
| `kMaximumColorStops` | 4 | Stops in one widget colour ramp. Four is a normal, caution, warning and limit band, the same bands the conditional rules cover discretely. |
| `kMaximumWidgetConditions` | 4 | Conditional styling rules per widget. Four covers a normal, caution, warning and limit band. |
| `kMaximumSpriteFrames` | 64 | Frames one uploaded image may hold as a sprite sheet. A frame costs only its own pixels — every frame of a sheet is an offset into the one buffer the image was already loaded into — so this bounds what an author can address rather than what the device spends. Must match kMaximumSpriteFrames in the image contract. |
| `kImageIdCapacity` | 32 | Uploaded image identifier storage including the terminator (31 usable bytes). Must match kImageIdCapacity in the image contract. |
| `kWidgetIdCapacity` | 16 | Widget identifier storage including the terminator (15 usable bytes). |
| `kWidgetTitleCapacity` | 16 | Widget title text storage including the terminator (15 usable bytes). |
| `kUnavailableTextCapacity` | 16 | Placeholder text storage including the terminator (15 usable bytes). |
| `kValidationPathCapacity` | 48 | Storage for the dotted property path reported with a rejection, including the terminator. |
| `kValueBindingCapacity` | 40 | Canonical telemetry field name storage including the terminator (39 usable bytes). Must match CANONICAL_NAME_CAPACITY in tools/codegen/telemetry_catalog. |
| `kValueAffixCapacity` | 16 | Transform prefix and suffix storage including the terminator (15 usable bytes). |
| `kMaximumHardwareDevices` | 4 | Peripherals one board may declare. It is the number of LED outputs a board can drive: each one owns an RMT transmit channel, and four is what both the ESP32-S3 and the ESP32-P4 have. |
| `kMaximumLedEffects` | 32 | Layers one output composes its picture from. Effects overwrite rather than resolve, so the count is how many things may be true at once about one chain, not how many rules describe one lamp. |
| `kMaximumLedsPerOutput` | 512 | Lamps on one data line. What sets it is time rather than memory: 512 lamps take 12 ms to clock out at 800 kHz, which is already most of a frame at 60 Hz, and an RGBW chain takes a third longer again. |
| `kMaximumLedsTotal` | 1024 | Lamps across every output. Outputs transmit on their own channels at the same time, so what this bounds is the frame buffer and the current the board can plausibly be asked to switch, not the frame time. |
| `kMaximumLedSegments` | 8 | Straight runs one strip's physical arrangement may describe. A wheel rim is three runs and a halo around a screen is four, so eight covers every mounting anyone has asked for while keeping the description readable. |
| `kMaximumMatrixSide` | 16 | Columns or rows one matrix panel may have, and the same ceiling on a sprite's own geometry. Sixteen is where the panels stop rather than where the lamp budget does - a square panel at this bound is 256 lamps, half of what one output may drive - and eight by eight, the default above, is what nearly everyone mounts. It is also what keeps a layer's panel mask to sixty-four digits. |
| `kMaximumLedSprites` | 8 | Pictures one output may carry. They travel inside the document, so this and the pixel capacity below are what keep a matrix's artwork inside the payload bound. |
| `kMaximumLedSpriteFrames` | 16 | Frames one sprite may hold. Frames share a geometry and a palette and are stored back to back, so a frame is an offset rather than an entry. |
| `kLedPaletteSize` | 16 | Colours one sprite names. Sixteen is what one hexadecimal digit addresses, which is why a pixel costs half a byte. |
| `kLedSpritePixelCapacity` | 1025 | Pixel digit storage for one sprite including the terminator (1024 usable). Sixteen frames of eight by eight, or four of sixteen by sixteen, and the same budget however it is spent. |
| `kLedPanelMaskCapacity` | 65 | Panel mask storage including the terminator (64 usable digits). Four pixels to a digit covers the whole 16 by 16 panel a matrix may have, and an eight by eight one spends sixteen characters on saying where a layer shows. |
| `kLedTextCapacity` | 32 | Static text a text effect may carry including the terminator (31 usable bytes). |
| `kLedTelemetryIdleMs` | 2000 | Silence after which the telemetry_idle gate starts holding. Long enough that a pause between lines is not an outage, short enough that a closed game is noticed before the lamps look stuck. |

## Enumerations

| Type | Accepted values | Meaning |
| --- | --- | --- |
| `HardwareDeviceType` | `rgb_strip`, `rgb_matrix` | Peripheral kind discriminator for an entry of the hardware list. A strip and a matrix are separate devices on separate pins rather than segments of one chain: each owns its data line and, on the wire, its own transmit channel. Buttons and encoders become further values of this rather than further sections. |
| `LedChip` | `ws2812b`, `sk6812_rgbw` | Addressable LED family on an output. ws2812b also covers WS2812, WS2813 and WS2815, which differ in supply and redundancy rather than in the three bytes they read. sk6812_rgbw adds a fourth white byte, so the same chain costs a third more time on the wire. |
| `MatrixOrder` | `progressive`, `serpentine` | How a matrix panel's rows are wired. progressive starts every row at the same side; serpentine reverses alternate rows, which is what most ready-made panels do. Ignored by a strip. |
| `MatrixOrigin` | `top_left`, `top_right`, `bottom_left`, `bottom_right` | Corner the first lamp of a matrix sits in. Ignored by a strip. |
| `LedSegmentDirection` | `right`, `left`, `up`, `down` | Way a run of a strip's arrangement extends across the mounting, read while drawing the strip rather than while driving it. Each run starts one step from where the previous one ended, in its own direction, which is how a chain bends around a corner. |
| `LedEffectType` | `solid`, `gradient`, `steps`, `gauge`, `animation`, `sprite`, `text` | What an effect paints over the lamps it covers. The order of these values indexes the generated painter table, so a new kind is appended rather than inserted. |
| `LedAnimationKind` | `rainbow`, `scan`, `pulse`, `wipe`, `chase` | Motion an animation effect draws. Read only by that kind. |
| `LedGate` | `always`, `conditions`, `telemetry_idle` | When an effect paints at all. always paints on every frame; conditions paints while a rule over condition_source holds; telemetry_idle paints only after kLedTelemetryIdleMs of silence, which is what an idle animation and a lost-link warning both want. |
| `LedFont` | `regular_4x6`, `bold_4x6`, `regular_5x8`, `bold_5x8` | Built-in bitmap face a text effect draws with, named by the pixels one glyph occupies and its weight. Compiled into the firmware, so text on a matrix needs no uploaded font and works on a board with no display to install a font package for. Each face carries only the digits, N and R, which is what a gear readout spells and all a panel this small can spell legibly. |
| `BoardId` | `t_display_s3`, `guition_esp32_4848s040`, `guition_jc1060p470c`, `esp32s3_devkit` | Immutable hardware identity. Must match the firmware build or the configuration is rejected. A board that declares no display carries no dashboard either: a dashboard section on one is rejected rather than quietly ignored, because an author who wrote it meant it to be drawn somewhere. |
| `TelemetryTransportId` | `board_default`, `native_usb_cdc`, `uart` | Telemetry transport selection. board_default defers to the immutable board descriptor. |
| `TextAlignment` | `top_left`, `top_center`, `top_right`, `left`, `center`, `right`, `bottom_left`, `bottom_center`, `bottom_right` | Which point of a box the text is anchored to, on both axes. The unprefixed names are the middle row, so left, center and right sit vertically centred. Used for a text widget's value inside its content area and for a frame caption on its outer box. |
| `ValueTransformType` | `none`, `time`, `number` | Presentation transform applied after the modifier pipeline. |
| `GradientDirection` | `horizontal`, `vertical` | Axis a linear gradient runs along. Only used when a gradient colour is set. |
| `ColorRampTarget` | `content`, `background`, `border` | Which part of a widget the colour ramp paints. What content means is the widget type's own business: text paints its label, a bar its fill. |
| `ConditionOperator` | `above`, `at_or_above`, `below`, `at_or_below`, `equal`, `not_equal` | Comparison a styling rule applies to the numeric value of its condition source. |
| `WidgetActionType` | `none`, `next_screen`, `previous_screen`, `goto_screen` | What a tap on a widget does. none is the default and leaves the object refusing input, which is what every widget did before actions existed. |
| `ScreenTransition` | `slide`, `none` | How the dashboard swaps one screen for another. slide is LVGL's animated screen load, the horizontal move a swipe reads as. none replaces the screen in a single frame: the animation composites both screens for its whole duration, which on a screen filled with widgets costs more per frame than either screen alone, so a dashboard that cannot afford it says so here rather than living with the drop. |
| `ValueModifierType` | `lap_timer` | Stateful value processing implemented by a module behind the pipeline callback. |
| `BarOrientation` | `horizontal`, `vertical` | Axis a bar fills along. A vertical bar grows upwards unless it is inverted. |
| `ShapeKind` | `rectangle`, `ellipse` | Outline a shape widget takes. A line is a thin rectangle, so it needs no kind of its own. |
| `FillCorners` | `rounded`, `square` | How what the box paints inside itself meets a rounded corner. rounded gives the background and a value fill the box radius less whatever they are inset by, which is what a filled widget has always drawn. square leaves them with square corners and clips the box to its own outline instead, so a bar keeps a straight leading edge while its ends still follow the rounding. Nothing to decide while the radius is zero. |
| `ArcMark` | `ring`, `needle` | What an arc draws at the angle its value maps to. ring fills the sweep up to it; needle points a line from the centre at it, over the same track. The mark changes, the mapping does not, so a needle needs no geometry of its own: it spans the radius the ring would occupy and takes its width from thickness_px. |
| `IndicatorShape` | `strip`, `arc` | How the lamps are laid out. strip runs them along the widget's orientation; arc spaces them around a sweep, which is the rev ring a round dashboard is built on. A strip reads orientation, an arc reads the three angle properties, and each ignores the other's. |
| `SlotTrigger` | `none`, `value_changed`, `conditions` | How telemetry raises a slot page over the ones the tap cycles. none is a plain page reached only by tapping. value_changed raises it whenever the watched value differs from the last one seen, which is what makes a momentary aid such as ABS visible without naming a threshold. conditions raises it while one of its comparisons holds. |
| `WidgetParentKind` | `screen`, `shape`, `slot_page` | Which table parent_index addresses. Written by the parser, never authored: a widget names its parent by the index of the object that owns its coordinate space, and that object is a screen, a container shape, or one page of a slot. |
| `WidgetType` | `text`, `shape`, `bar`, `arc`, `indicator`, `graph`, `image`, `slot` | Widget kind discriminator. Selects the compile-time widget descriptor used to build the widget. The order of these values indexes the generated traits table and the parser table, so a new type is appended rather than inserted. |

## Objects

### BoardConfiguration

| Property | Type | Default |
| --- | --- | --- |
| `board` | `BoardId` | `t_display_s3` |

### LedPaletteEntry

One colour a sprite's pixel digits name.

| Property | Type | Default |
| --- | --- | --- |
| `color` | string `#RRGGBB` | `#000000` |

### LedSpriteConfiguration

A picture, or several frames of one, drawn on a matrix. Stored palette-indexed at four bits a pixel and carried inside this document rather than uploaded, because a whole icon set is a few kilobytes: nothing to install, nothing to claim the serial link while it installs, no partition to add, and a template carries its artwork with it.

| Property | Type | Default |
| --- | --- | --- |
| `id` | string, max 31 bytes | empty |
| `width` | integer, 1..16 | `8` |
| `height` | integer, 1..16 | `8` |
| `frame_count` | integer, 1..16 | `1` |
| `palette` | array of [`LedPaletteEntry`](#ledpaletteentry), max 16 | absent |
| `pixels` | string, max 1024 bytes | empty |

### LedEffect

One layer of an output's picture. Effects are painted in the order they are authored and a later one overwrites the lamps it covers, so a flag laid over shift lights is simply written after them. This is deliberately the opposite of a widget's styling rules, where the first match wins and the rest are skipped: a widget resolves one appearance for one object, while an output composes a picture out of many independent things being true at once.

Also carries the properties of [`ValueRange`](#valuerange), flattened: they are plain properties of this object in JSON.

| Property | Type | Default |
| --- | --- | --- |
| `type` | `LedEffectType` | `solid` |
| `id` | string, max 15 bytes | empty |
| `from` | integer, 0..512 | `0` |
| `count` | integer, 0 or 1..512 | `0` |
| `panel_mask` | string, max 64 bytes | empty |
| `source` | [`ValueSourceConfiguration`](#valuesourceconfiguration) | absent |
| `gate` | `LedGate` | `always` |
| `condition_source` | [`ValueSourceConfiguration`](#valuesourceconfiguration) | absent |
| `conditions` | array of [`ValueCondition`](#valuecondition), max 4 | absent |
| `hold_ms` | integer, 0..10000 | `0` |
| `blink_ms` | integer, 0 or 100..5000 | `0` |
| `mirrored` | boolean | `false` |
| `inverted` | boolean | `false` |
| `color` | string `#RRGGBB` | `#FFFFFF` |
| `stops` | array of [`ColorStop`](#colorstop), max 4 | absent |
| `steps` | array of [`IndicatorSegment`](#indicatorsegment), max 16 | absent |
| `animation` | `LedAnimationKind` | `rainbow` |
| `speed_ms` | integer, 50..60000 | `1000` |
| `sprite` | string, max 31 bytes | empty |
| `sprite_frame` | integer, 0..16 | `0` |
| `sprite_loop` | boolean | `false` |
| `text` | string, max 31 bytes | empty |
| `font` | `LedFont` | `regular_4x6` |

### LedSegmentConfiguration

One straight run of a strip's physical arrangement: how many lamps continue in which direction across the mounting. The runs together must account for every lamp the strip drives, so the description and the wire can never disagree about how many lamps there are. Nothing on the device reads them - the strip is clocked out in wire order whatever shape it is bent into - but they travel in the document so a configuration carries its own picture of where each lamp sits.

| Property | Type | Default |
| --- | --- | --- |
| `count` | integer, 1..512 | `1` |
| `direction` | `LedSegmentDirection` | `right` |

### HardwareDeviceConfiguration

One peripheral beyond the display, on its own data pin. A strip is a line of lamps and needs only a count; a matrix is a grid whose wiring has to be described before a picture lands the right way up. They are separate devices rather than segments of a shared chain, so each spends a pin and a transmit channel of its own, and neither can disturb the other's lamp numbering.

| Property | Type | Default |
| --- | --- | --- |
| `type` | `HardwareDeviceType` | `rgb_strip` |
| `id` | string, max 15 bytes | empty |
| `pin` | integer | `-1` |
| `chip` | `LedChip` | `ws2812b` |
| `brightness` | integer, 0..255 | `128` |
| `gamma` | boolean | `true` |
| `current_limit_ma` | integer, 0 or 100..20000 | `0` |
| `count` | integer, 1..512 | `1` |
| `segments` | array of [`LedSegmentConfiguration`](#ledsegmentconfiguration), max 8 | absent |
| `width` | integer, 1..16 | `8` |
| `height` | integer, 1..16 | `8` |
| `order` | `MatrixOrder` | `serpentine` |
| `origin` | `MatrixOrigin` | `top_left` |
| `rotation_deg` | integer, 0..270 | `0` |
| `effects` | array of [`LedEffect`](#ledeffect), max 32 | absent |
| `sprites` | array of [`LedSpriteConfiguration`](#ledspriteconfiguration), max 8 | absent |

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
| `width_px` | integer, 0..240 | `0` |
| `radius_px` | integer, 0..480 | `0` |

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

### WidgetTitleStyle

The caption on a widget's frame. It is anchored to a point on the widget's outer box, moved from there by the offsets, and it cuts the frame line on whichever border it ends up crossing.

| Property | Type | Default |
| --- | --- | --- |
| `text` | string, max 15 bytes | empty |
| `source` | [`ValueSourceConfiguration`](#valuesourceconfiguration) | absent |
| `font` | `FontSpec` | absent |
| `color` | string `#RRGGBB` | `#E8E8E8` |
| `alignment` | `TextAlignment` | `top_center` |
| `offset_x_px` | integer, -32768..32767 | `0` |
| `offset_y_px` | integer, -32768..32767 | `0` |
| `border_gap` | boolean | `true` |
| `gap_padding_px` | integer, 0..240 | `4` |

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

Navigation a tap performs. Carried by every widget, so a tap target is either a readout that doubles as a button or a rectangle of the screen — including an empty transparent shape, which is an invisible touch zone.

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
| `blink_ms` | integer, 0 or 100..5000 | `0` |
| `hold_ms` | integer, 0..10000 | `0` |

### ValueCondition

One selection rule: a comparison over a watched value, and nothing else. Kept apart from a widget's styling rules because selecting and describing are different questions — a slot page is raised by one of these, and an LED effect is gated by one, while how long either then lasts belongs to the thing selected rather than to the rule that selected it.

| Property | Type | Default |
| --- | --- | --- |
| `op` | `ConditionOperator` | `at_or_above` |
| `value` | number | `0` |

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
| `fill_corners` | `FillCorners` | `rounded` |
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
| `start_angle_deg` | integer, 0..359 | `135` |
| `sweep_deg` | integer, 1..360 | `270` |
| `thickness_px` | integer, 1..65535 | `8` |
| `radius_px` | integer, 0 or 1..2048 | `0` |
| `center_x_px` | integer, -2048..2048 | `0` |
| `center_y_px` | integer, -2048..2048 | `0` |
| `track_color` | string `#RRGGBB` | `kTransparentColor` (no background) |
| `fill_color` | string `#RRGGBB` | `#38BDF8` |
| `mark` | `ArcMark` | `ring` |
| `inverted` | boolean | `false` |

### IndicatorSegment

One lamp in an indicator strip.

| Property | Type | Default |
| --- | --- | --- |
| `threshold` | number | `0` |
| `color` | string `#RRGGBB` | `#00C853` |

### IndicatorWidgetConfiguration

A row or ring of lamps that light as one telemetry source climbs its range: shift lights, a rev strip, the rev ring around a dial.

Also carries the properties of [`WidgetFrame`](#widgetframe) and [`ValueRange`](#valuerange), flattened: they are plain properties of this object in JSON.

| Property | Type | Default |
| --- | --- | --- |
| `type` | `WidgetType`, fixed `indicator` | required |
| `source` | [`ValueSourceConfiguration`](#valuesourceconfiguration) | absent |
| `shape` | `IndicatorShape` | `strip` |
| `orientation` | `BarOrientation` | `horizontal` |
| `start_angle_deg` | integer, 0..359 | `135` |
| `sweep_deg` | integer, 1..360 | `270` |
| `thickness_px` | integer, 1..65535 | `8` |
| `radius_px` | integer, 0 or 1..2048 | `0` |
| `center_x_px` | integer, -2048..2048 | `0` |
| `center_y_px` | integer, -2048..2048 | `0` |
| `segment_gap_px` | integer, 0..65535 | `4` |
| `segment_radius_px` | integer, 0..65535 | `0` |
| `inverted` | boolean | `false` |
| `off_color` | string `#RRGGBB` | `kTransparentColor` (no background) |
| `blink_threshold` | number | `2` |
| `blink_ms` | integer, 0 or 100..5000 | `0` |
| `segments` | array of [`IndicatorSegment`](#indicatorsegment), max 16 | absent |

### GraphTraceConfiguration

A second or third source drawn on the same plot as the graph's own. It carries a window of its own, because a trace of speed beside one of throttle would otherwise flatten against an edge, and a colour of its own, because that is what tells the two apart.

Also carries the properties of [`ValueRange`](#valuerange), flattened: they are plain properties of this object in JSON.

| Property | Type | Default |
| --- | --- | --- |
| `source` | [`ValueSourceConfiguration`](#valuesourceconfiguration) | absent |
| `line_color` | string `#RRGGBB` | `#38BDF8` |

### GraphWidgetConfiguration

A rolling trace of one telemetry source, plus up to two more drawn over the same plot. The history is presentation state the widget samples for itself; it is not a telemetry value and nothing else can read it.

Also carries the properties of [`WidgetFrame`](#widgetframe) and [`ValueRange`](#valuerange), flattened: they are plain properties of this object in JSON.

| Property | Type | Default |
| --- | --- | --- |
| `type` | `WidgetType`, fixed `graph` | required |
| `source` | [`ValueSourceConfiguration`](#valuesourceconfiguration) | absent |
| `point_count` | integer, 2..128 | `64` |
| `sample_interval_ms` | integer, 1..65535 | `100` |
| `line_color` | string `#RRGGBB` | `#38BDF8` |
| `line_width_px` | integer, 1..65535 | `2` |
| `traces` | array of [`GraphTraceConfiguration`](#graphtraceconfiguration), max 2 | absent |

### ImageWidgetConfiguration

An uploaded image drawn inside the frame. Neither scaled nor rotated: the configurator converts each image to the size it is drawn at, which also keeps the accelerated draw path on the ESP32-P4. It binds telemetry only to choose between the frames of a sprite sheet; its styling rules can still hide it, flash it or recolour it.

Also carries the properties of [`WidgetFrame`](#widgetframe), flattened: they are plain properties of this object in JSON.

| Property | Type | Default |
| --- | --- | --- |
| `type` | `WidgetType`, fixed `image` | required |
| `image` | string, max 31 bytes | empty |
| `sprite_frame` | integer, 0..64 | `0` |
| `sprite_frame_source` | [`ValueSourceConfiguration`](#valuesourceconfiguration) | absent |
| `recolor` | string `#RRGGBB` | `kTransparentColor` (no background) |
| `recolor_opa` | integer, 0..255 | `255` |

### ShapeWidgetConfiguration

Panels, dividers and backing plates, and the widget that draws while holding other widgets. The frame is the whole widget: it binds no telemetry of its own, but its styling rules can still hide it or flash it, and a line is a thin rectangle. A shape with widgets is a container — its children are placed relative to its box and cut off at it, unless clip_children says otherwise.

Also carries the properties of [`WidgetFrame`](#widgetframe), flattened: they are plain properties of this object in JSON.

| Property | Type | Default |
| --- | --- | --- |
| `type` | `WidgetType`, fixed `shape` | required |
| `kind` | `ShapeKind` | `rectangle` |
| `clip_children` | boolean | `true` |
| `widgets` | array of [`TextWidgetConfiguration`](#textwidgetconfiguration), [`ShapeWidgetConfiguration`](#shapewidgetconfiguration), [`BarWidgetConfiguration`](#barwidgetconfiguration), [`ArcWidgetConfiguration`](#arcwidgetconfiguration), [`IndicatorWidgetConfiguration`](#indicatorwidgetconfiguration), [`GraphWidgetConfiguration`](#graphwidgetconfiguration), [`ImageWidgetConfiguration`](#imagewidgetconfiguration), max 32, discriminated by `type` | absent |

### SlotPageConfiguration

One page of a slot: a set of widgets that share the slot's box and are shown or hidden together. A page has no geometry, no frame and no styling of its own — it is the slot's box, and its widgets are placed relative to it. Pages the tap cycles are the loop; a page with a trigger is raised over the loop while its event lasts, and the first such page in this array wins when several fire at once.

| Property | Type | Default |
| --- | --- | --- |
| `in_loop` | boolean | `true` |
| `trigger` | `SlotTrigger` | `none` |
| `source` | [`ValueSourceConfiguration`](#valuesourceconfiguration) | absent |
| `duration_ms` | integer, 0..10000 | `0` |
| `conditions` | array of [`ValueCondition`](#valuecondition), max 4 | absent |
| `widgets` | array of [`TextWidgetConfiguration`](#textwidgetconfiguration), [`ShapeWidgetConfiguration`](#shapewidgetconfiguration), [`BarWidgetConfiguration`](#barwidgetconfiguration), [`ArcWidgetConfiguration`](#arcwidgetconfiguration), [`IndicatorWidgetConfiguration`](#indicatorwidgetconfiguration), [`GraphWidgetConfiguration`](#graphwidgetconfiguration), [`ImageWidgetConfiguration`](#imagewidgetconfiguration), max 32, discriminated by `type` | absent |

### SlotWidgetConfiguration

An area of a screen that switches what it shows. It draws nothing of its own — no background, border, caption or styling rules, all of which are rejected rather than ignored — and exists only to hold pages. A tap cycles the pages in the loop; a page whose trigger fires is raised over them for its duration and then hands the slot back to the loop page that was showing. A slot is authored directly on a screen: it holds containers rather than living inside one.

Also carries the properties of [`WidgetFrame`](#widgetframe), flattened: they are plain properties of this object in JSON.

| Property | Type | Default |
| --- | --- | --- |
| `type` | `WidgetType`, fixed `slot` | required |
| `clip_children` | boolean | `true` |
| `pages` | array of [`SlotPageConfiguration`](#slotpageconfiguration), max 8 | absent |

### ScreenConfiguration

One dashboard screen: the coordinate space its widgets are placed in, and the order they stack in. The widgets themselves live in the dashboard's pool; a screen names them by reference. Widgets authored directly on the screen appear in its own reference table, and widgets authored inside a container shape appear in that shape's.

| Property | Type | Default |
| --- | --- | --- |
| `id` | string, max 15 bytes | empty |
| `background_color` | string `#RRGGBB` | `#000000` |
| `widgets` | array of [`TextWidgetConfiguration`](#textwidgetconfiguration), [`ShapeWidgetConfiguration`](#shapewidgetconfiguration), [`BarWidgetConfiguration`](#barwidgetconfiguration), [`ArcWidgetConfiguration`](#arcwidgetconfiguration), [`IndicatorWidgetConfiguration`](#indicatorwidgetconfiguration), [`GraphWidgetConfiguration`](#graphwidgetconfiguration), [`ImageWidgetConfiguration`](#imagewidgetconfiguration), [`SlotWidgetConfiguration`](#slotwidgetconfiguration), max 255, discriminated by `type` | absent |

### DashboardConfiguration

Owns the typed widget storage as one pool shared by every screen; a screen holds only an ordered list of references into it. A screen therefore costs its reference table rather than a full set of widget arrays.

| Property | Type | Default |
| --- | --- | --- |
| `transition` | `ScreenTransition` | `slide` |
| `screens` | array of [`ScreenConfiguration`](#screenconfiguration), max 4 | absent |

### ApplicationConfiguration

Also carries the properties of [`BoardConfiguration`](#boardconfiguration), flattened: they are plain properties of this object in JSON.

| Property | Type | Default |
| --- | --- | --- |
| `hardware` | array of [`HardwareDeviceConfiguration`](#hardwaredeviceconfiguration), max 4 | absent |
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
| `invalid_hardware` | Hardware list is malformed, holds more devices than the board can drive, or an entry is not a peripheral this firmware knows. |
| `invalid_led_pin` | LED output names a pin this board does not offer, or two outputs name the same one. |
| `invalid_led_sprite` | LED sprite geometry, palette or pixel digits do not agree, or an effect names a sprite that is not declared. |
| `invalid_transport` | Unknown transport or one the board does not support. |
| `invalid_uart` | UART pins do not match the board or baud rate is out of range. |
| `invalid_module` | Peripheral segment or effect is out of range, names a segment its chain does not have, or carries a property its kind has none of. |
| `invalid_screen` | Screen section is malformed or the screen count is out of range. |
| `invalid_dashboard` | Dashboard section is malformed or references an absent module. |
| `invalid_widget` | Widget property is malformed, out of range, entirely off the display, or nested deeper than kMaximumNestingDepth. |
| `invalid_slot` | Slot widget carries an appearance it has none of, was authored somewhere other than a screen, or holds no page the tap can reach. |
| `invalid_slot_page` | Slot page is malformed, or its trigger and its source, rules and duration do not agree. |
| `unknown_property` | Property name is not part of this schema version. |
| `duplicate_property` | Property appears more than once in the same object. |
