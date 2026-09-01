export const HINTS = {
  output: {
    pin: 'GPIO the chain’s data line is wired to. Only pins the board leaves free are offered — the display, the flash, the PSRAM, the serial link and the status lamp own the rest, and the firmware refuses any of them.',
    chip: 'Which family the lamps are. ws2812b also covers WS2812, WS2813 and WS2815: they read the same three bytes and differ only in supply and redundancy. sk6812_rgbw has a fourth, white lamp in each package, so a neutral colour moves onto it and the chain takes a third longer to clock out.',
    brightness:
      'Scales every colour on this output on its way to the wire, after each layer’s own brightness and before the current limit.',
    gamma:
      'Corrects the perceptual response of the lamps. Without it the bottom of the brightness range is a handful of visibly separate steps rather than a fade.',
    current:
      'Ceiling on what this output may draw. The whole frame is scaled down when the estimate passes it, so the picture dims evenly rather than the supply sagging and the colours drifting. A lamp at full white draws around 60 mA, so one eight-by-eight panel is already past what a USB port can give. Leave it at 0 only if you know the supply.'
  },
  device: {
    count: 'Lamps in this strip.',
    size: 'Columns and rows of the panel, as it is built rather than as it is mounted.',
    wiring:
      'How the panel is wired and how it is mounted. Rows says whether alternate rows run backwards, which most ready-made panels do. First lamp names the corner the data line enters. Turn rotates everything drawn on the panel, so one mounted on its side still reads upright.'
  },
  effect: {
    stack:
      'Layers are painted in the order they are listed and a later one overwrites the lamps it covers — so a flag laid over shift lights simply comes after them. This is the opposite of a widget’s styling rules, where the first match wins: a widget resolves one appearance, while an output composes a picture out of many things being true at once.',
    type: 'What this layer paints. steps is the shift-light idiom: thresholds shared out over the lamps it covers. gauge fills in proportion to the value. gradient spreads a colour ramp across the lamps. animation moves on its own timebase. sprite and text draw on a matrix.',
    area: 'Which run of this device’s lamps the layer paints, counted from lamp 0. A count of 0 covers the rest of the device.',
    gate: 'When this layer paints at all. always paints on every frame; conditions paints while a rule over its own watched value holds; telemetry idle paints only after two seconds of silence, which is what an idle animation and a lost-link warning both want.',
    hold: 'Keeps the layer painting for this long after its gate stops holding, so a momentary event such as traction control still produces a visible flash.',
    blink: 'Full blink period of everything this layer paints. 0 paints steady.',
    shape:
      'Mirror paints the same value outward from the middle of the covered lamps towards both ends at once, which is what a centred rev bar wants. Invert fills from the far end instead of the near one.'
  }
} as const
