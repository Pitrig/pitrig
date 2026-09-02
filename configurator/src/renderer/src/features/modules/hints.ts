export const HINTS = {
  output: {
    pin: 'GPIO the chain’s data line is wired to. Only pins the board leaves free are offered — the display, the flash, the PSRAM, the serial link and the status lamp own the rest, and the firmware refuses any of them.',
    chip: 'Which family the lamps are. ws2812b also covers WS2812, WS2813 and WS2815: they read the same three bytes and differ only in supply and redundancy. sk6812_rgbw has a fourth, white lamp in each package, so a neutral colour moves onto it and the chain takes a third longer to clock out.',
    brightness:
      'Scales every colour on this output on its way to the wire, before the current limit. It is the one brightness the device has — layers carry none of their own.',
    gamma:
      'Corrects the perceptual response of the lamps. Without it the bottom of the brightness range is a handful of visibly separate steps rather than a fade.',
    current:
      'Ceiling on what this output may draw. The whole frame is scaled down when the estimate passes it, so the picture dims evenly rather than the supply sagging and the colours drifting. A lamp at full white draws around 60 mA, so one eight-by-eight panel is already past what a USB port can give. Leave it at 0 only if you know the supply.'
  },
  device: {
    count: 'Lamps in this strip. With an arrangement described below, it is the sum of the runs.',
    segments:
      'How the strip is physically mounted, as straight runs in wire order — say 8 lamps up the left side, 16 across the top, 8 down the right. The board clocks the chain out the same either way; the runs bend the previews to match the mounting and give profiles ready-made targets. Their counts must add up to the whole strip.',
    size: 'Columns and rows of the panel, as it is built rather than as it is mounted.',
    wiring:
      'How the panel is wired and how it is mounted. Rows says whether alternate rows run backwards, which most ready-made panels do. First lamp names the corner the data line enters. Turn rotates everything drawn on the panel, so one mounted on its side still reads upright.'
  },
  sprite: {
    pictures:
      'Pictures this panel can draw, each a grid of palette-indexed pixels and up to sixteen frames of it. They travel inside the modules document rather than being uploaded, so they cost no partition, no upload and no restart — and a saved configuration carries its own artwork.',
    name:
      'What layers name this picture by. Renaming it follows through to every layer that draws it. Two pictures on one panel may not share a name.',
    size:
      'Columns and rows of the picture itself, which need not match the panel: a smaller picture is drawn centred on whatever the layer paints on. The bigger it is the fewer frames fit, because every picture shares the same 1024-digit budget.',
    palette:
      'Colours this picture is drawn from, at most fifteen of them. Pick one to paint with, or Clear to leave a pixel unpainted so the layers below stay visible — that is a digit past the end of the palette rather than a colour, which is why the last one is kept free. Entry 1 is the unlit lamp by convention rather than by rule: it paints black over whatever is under it.',
    frames:
      'Frames of the animation, played in order by a layer with Play frames switched on. How many fit follows the size: sixteen of eight by eight, four of sixteen by sixteen. Duplicate a frame to draw the next one from it.',
    mirror:
      'Plays this picture on the connected board while you draw, on its own, the way a layer previews. Needs a board and live apply switched on; the panel goes back to the whole configuration when it is switched off.'
  },
  effect: {
    stack:
      'Every layer whose gate holds paints at once. Where two of them cover the same lamp, the one that lit most recently wins it — so a flag comes up over shift lights whichever way round the two are listed — and layers that came up together keep the order they are in here. This is the opposite of a widget’s styling rules, where the first match wins: a widget resolves one appearance, while an output composes a picture out of many things being true at once.',
    type: 'What this layer paints. steps is the shift-light idiom: thresholds shared out over the lamps it covers. gauge fills in proportion to the value. gradient spreads a colour ramp across the lamps. animation moves on its own timebase. sprite and text draw on a matrix.',
    area: 'Which run of this device’s lamps the layer paints. Lamps are numbered from 1 here, while the saved document counts them from zero. A count of 0 covers the rest of the device.',
    panel:
      'Which pixels of the panel this layer paints on. Click one to turn it off or on, or drag across several; All and Invert do the whole grid at once. Every pixel is the default and costs the document nothing. The layer works over the smallest box holding what you picked, so text and a picture still centre on the shape rather than on the panel.',
    sprite:
      'Which of the panel’s pictures this layer draws. Pictures are drawn on the Pictures tab, and a profile brings its own — the flags carry their artwork with them; a layer whose picture the panel does not carry is a composition error rather than a blank panel.',
    loop:
      'Walks the picture’s frames on this layer’s own clock, one every frame time, which is how artwork moves without telemetry driving it. Left off, the layer holds the one frame named below.',
    gate: 'When this layer paints at all. always paints on every frame; conditions paints while a rule over its own watched value holds; telemetry idle paints only after two seconds of silence, which is what an idle animation and a lost-link warning both want.',
    hold: 'Keeps the layer painting for this long after its gate stops holding, so a momentary event such as traction control still produces a visible flash.',
    background:
      'Fills every lamp this layer covers before it draws, so a glyph or a picture sits on a ground of its own rather than on whatever the layers below left. Off paints no ground, which is what a layer over shift lights wants.',
    ruleTiming:
      'Blink is the period the whole layer flashes at while this rule holds, so one band of a value can flash without a second layer over it; it takes over from the layer’s own blink. Hold keeps the rule applied for that long after it stops matching, so a momentary trigger still leaves a visible flash of colour.',
    colors:
      'Colours this layer takes while the watched value matches, the first matching rule winning — a gear that turns amber and then red as the revs climb. They describe rather than select: the gate says whether the layer paints at all, these say what colour it paints in. On a picture the colour repaints every lit pixel, so one drawing serves every state — the pixels it paints black stay black.',
    blink: 'Full blink period of everything this layer paints. 0 paints steady.',
    shape:
      'Which way the layer fills the lamps it covers. Along the run starts at the first lamp; backwards starts at the last. Out from the middle paints both ways at once from the centre, which is what a centred rev bar wants; in from the ends does the opposite, closing on the centre.'
  }
} as const
