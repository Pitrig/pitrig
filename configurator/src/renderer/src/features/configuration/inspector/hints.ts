export const HINTS = {
  geometry: {
    position:
      'The top-left corner in logical display pixels. Inside a container this is measured from the container box rather than from the screen.',
    size: 'Width and height in logical display pixels.',
    z: 'Drawing order among siblings: a higher value is drawn later, so it covers a lower one. Widgets with the same value keep the order of the layer list.'
  },
  data: {
    binding:
      'The telemetry field this widget reads. Names come from the catalog, so the device binds them once at startup and never looks one up while drawing.',
    modifier:
      'A stateful reading of the field, computed on the device. The lap timer turns the current lap time into one that keeps running between the updates SimHub sends.',
    range:
      'The window the value is read against: the widget shows where the value sits between the two, clamped at both ends. The unit is the one the bound field reports.'
  },
  text: {
    sources:
      'Sources are rendered in order, each through its own transform, into one string. The prefix and suffix are what separate one from the next, so "P 3/24" is a position source followed by a participants source prefixed with "/".',
    transform:
      'How the raw value becomes text. A number is scaled, offset and rounded; a duration is formatted as a lap time. Only the transforms the bound field supports are offered.',
    preset:
      'A ready scale, offset and suffix for the usual unit conversions of this field — kph to mph, celsius to fahrenheit.',
    scale:
      'Applied before the offset: the drawn number is value × scale + offset, rounded to the decimals set beside it.',
    affix:
      'Literal text drawn immediately before and after this source. With several sources this is the only separator between them.',
    alignment: 'Where the text sits inside the widget box, after the padding is taken off.',
    fallback:
      'Drawn while the field has no value yet — before the first telemetry frame arrives, or when the game does not report it. Empty draws nothing.'
  },
  title: {
    fallback:
      'A second installed family to try for glyphs the first does not have — an icon family beside a text one, which is how a value carries an icon and its number in one widget. It is built at the same size, so it costs one more font.',
    text: 'A caption drawn on the widget box. Clearing the text removes the caption entirely, which is what a panel used as a container or a tap zone usually wants.',
    font: 'The family comes from the font library and the size is this caption’s alone — the board holds one face per family and rasterizes any size from it.',
    alignment:
      'The point on the widget box the caption is anchored to. The top and bottom rows straddle their border line; the middle row sits inside the box.',
    offset: 'Moves the caption from its anchor, in pixels. Positive is right and down.',
    cut: 'A caption on the top or bottom row breaks the border line it sits on instead of being drawn over it. Turn this off to draw the border straight through.',
    gap: 'How much clear space the cut leaves on each side of the caption.'
  },
  box: {
    fillCorners:
      'How the background and a value fill meet the rounded corners. Rounded gives them the same curve; square leaves them straight and cuts them on the box outline instead, so a bar keeps a flat leading edge while its ends still follow the rounding.',
    background:
      'The fill behind the widget. Unset draws nothing, which is what leaves the screen background showing through.',
    gradient:
      'The far end of the background fill. On the ESP32-P4 a gradient falls back to the software renderer, which costs frame time.',
    axis: 'The direction the background gradient runs in.',
    padding: 'Keeps the contents this far inside the box on each side. It does not move the box itself.',
    border: 'The outline drawn on the box edge. A zero width draws none.',
    radius: 'Rounds the box corners, border and background alike.',
    inset:
      'Shrinks the background fill inside the border by this much, so a thick border and its fill do not overlap on the curve.'
  },
  conditions: {
    source:
      'The field the rules are read against. It is independent of what the widget shows, so a gear readout can turn red on engine speed.',
    ramp: 'Moves the colour smoothly with the value between the stops. Rules paint over it; a ramp alone needs at least two stops.',
    rampTarget: 'Which part of the widget the ramp colours.',
    rule: 'The first rule that holds wins. Anything a rule leaves unset stays as authored, so a rule may change only the colour and nothing else.',
    blink: 'Alternates the widget on and off while the rule holds. Zero leaves it steady.',
    hold: 'Keeps the rule applied for this long after it stops holding, so a momentary event stays readable. Zero applies it only while it holds.'
  },
  action: {
    tap: 'What a tap on this widget does on a board with a digitizer. An empty transparent shape with an action is an invisible tap zone.',
    screen: 'The screen a tap goes to, named rather than numbered — renaming a screen repoints every action that names it.'
  },
  container: {
    clip: 'Whether the contents end at this box. With it off, a widget inside is drawn where it lands even past the box, which is what a caption straddling a child’s top border needs.'
  },
  ring: {
    start:
      'Where the sweep begins. Zero degrees is three o\u2019clock and the angle grows clockwise, so a start of 135 with a 270 sweep is the usual car gauge.',
    sweep: 'How far the ring runs from its start angle, as an extent rather than an end angle.',
    thickness: 'How thick the band is. It grows either side of the radius, so the radius stays where it is.',
    radius:
      'Radius of the band\u2019s centre line. Zero takes it from the box, which is what an arc has always done. A radius of its own may be larger than the box: the widget still clips to its box, so only the band crossing it is drawn.',
    centre:
      'Moves the centre of the circle away from the centre of the box. Pushing it outside the box, with a radius to match, is how a shallow band across the top of a round display is authored.'
  },
  arc: {
    track: 'The unfilled part of the arc. Unset leaves it undrawn.',
    mark:
      'What the value draws at its angle. A ring fills the sweep up to it; a needle points a line from the centre at it, as thick as the ring would be, with the track left as the scale behind it.',
    inverted: 'Fills from the far end of the sweep instead of from the start angle.'
  },
  bar: {
    origin:
      'The fill runs between this value and the current one instead of from the minimum, so a signed window with a zero origin reads as a centred meter.',
    fill: 'The colour of the filled part. The box background underneath is the track the fill runs over.',
    inverted: 'Fills from the far end of the bar instead of from the near one.'
  },
  strip: {
    segments:
      'Each lamp lights at its own fraction of the range, so one strip suits any engine. Thresholds must not decrease down the list.',
    gap: 'The space left between lamps, and the corner radius of each one. An arc spends the gap along its own ring, and any non-zero radius rounds the lamp ends instead.',
    shape:
      'A strip runs the lamps along its orientation. An arc spaces them around a sweep, which is the rev ring a round dashboard is built on.',
    blink:
      'Blinking starts at this fraction of the range. A threshold above 1 never blinks, and neither does a zero period.',
    off: 'The colour of a lamp that is not lit. Unset leaves it undrawn.',
    inverted:
      'Lights from the far end instead of the near one, which is what makes a mirrored pair of rev bars out of one authored strip. Which lamp lights when does not change.'
  },
  graph: {
    points:
      'How many samples each trace keeps and how often one is taken — together they are the window the plot shows. One clock for the whole widget, so several traces line up along it. The trace is the most expensive widget to draw, so keep the point count only as high as it needs to be.',
    traces:
      'Further sources drawn over the same plot, up to three in all counting the widget\u2019s own. Each carries its own range, which is what lets speed and throttle share one field without either flattening against an edge.',
    width:
      'Thickness of every trace. Half of it is kept clear inside the plot on each side — plus whatever a rounded frame needs for the corners to clear the curve — so a value at the top or the bottom of its range is drawn whole rather than cut by the frame.'
  },
  image: {
    image:
      'Images are uploaded to the board and converted in the configurator to the size they are drawn at. The device neither scales nor rotates, so match the widget box to the bitmap.',
    frame:
      'Which picture of a sprite sheet to draw. A sheet is several images uploaded as one, so switching between them costs nothing on the board and spends one of its 32 entries rather than one per picture.',
    frameSource:
      'Chooses the picture from telemetry instead: the value is rounded to a whole number and clamped to the frames the sheet holds, so 0 is the first and anything past the last stays on the last. This is what draws a gear, a flag or a lamp set from one widget rather than a stack of them.',
    recolor:
      'Tints the bitmap towards this colour, which is how one white icon serves every state. An alpha8 image is the colour rather than tinted by it: it carries only coverage, and is drawn white until this says otherwise.',
    strength:
      'How far the tint goes, from untouched at 0 to fully the tint colour at 255. An alpha8 image ignores it — there the colour is the image, not a tint over one.'
  },
  shape: {
    kind: 'A line is a thin rectangle: give it a small height or width. A shape is also the container other widgets are placed inside.'
  },
  slot: {
    pages:
      'A tap on the board cycles the pages that are in the loop. Page order is priority: when two are triggered at once the device shows the earlier one.',
    loop: 'Whether a tap on the slot can reach this page. A page out of the loop is only ever raised by its trigger.',
    trigger:
      'What raises this page over the loop on its own. Without one the page is reached only by tapping the slot.',
    duration:
      'How long the page stays up. A value-changed trigger needs one; with rules, zero shows the page only while a rule holds.'
  },
  dashboard: {
    transition:
      'How the board swaps one screen for another, whether a swipe or a tap asked for it. slide is the sliding animation; none replaces the screen in a single frame. The slide draws both screens for every one of its frames, so a screen full of widgets is where it is felt — set this to none if swiping stutters.',
    font: 'The family new widgets take. It is the editor’s own setting — the device resolves a font per widget, so the document carries no dashboard-wide one.',
    budget:
      'What the chosen families cost on the board. Faces are uploaded whole and the partition holds 2 MiB of them.'
  },
  screen: {
    name: 'What a "go to screen" action points at. Renaming repoints every action that names this screen.',
    background: 'The colour behind every widget on this screen.'
  },
  widget: {
    id: 'The name this widget is known by in the layer list, in the JSON, and to anything that refers to it. The device stores it and never draws it.'
  }
} as const
