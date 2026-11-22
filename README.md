# three-buildout — greybox / previs studio

three.js scenes rendered, previewed and exported with [Remotion](https://www.remotion.dev). Runs CPU-only (SwiftShader WebGL), so a 2-core Codespace is enough.

> Remotion is free for individuals and companies of up to 3 people; larger organisations need a [company license](https://www.remotion.pro/license).

## Commands

| Command | What it does |
|---|---|
| `npm run studio` | Remotion Studio on port 3000: browse scenes/shots, scrub the timeline, render from the UI |
| `npm run still -- <comp> out/x.png --frame=N` | Render one frame to PNG |
| `npm run still:draft -- <comp> out/x.png --frame=N` | Same at 75% size (faster) |
| `npm run render -- <comp> out/x.mp4` | Render a composition to MP4 |
| `npm run validate` | Check every `scenes/*.scene.json` against the schema |
| `npm test` | Unit tests |

## Scenes

Every `scenes/<slug>.scene.json` becomes these compositions:

- `<slug>`: the whole timeline. Shots act as camera cuts.
- `<slug>-<shotId>`: one per shot. These are the export units and storyboard panels.

Conventions: **metres, Y-up, rotations in degrees**, integer frames. Primitives sit on their base by default (`"pivot": "bottom"`), so `y = 0` is on the floor. The full schema with defaults and validation rules is in [`src/scene/schema.ts`](src/scene/schema.ts); see [`scenes/demo.scene.json`](scenes/demo.scene.json) for a worked example.

```jsonc
{
  "name": "My scene",
  "fps": 24,
  "durationInFrames": 96,
  "cameras": [{ "id": "wide", "position": [6, 3, 7], "target": [0, 1, 0], "fov": 40 }],
  "objects": [
    { "id": "table", "type": "primitive", "shape": { "kind": "box", "size": [1.6, 0.75, 0.9] }, "color": "dark" },
    { "id": "cup", "parent": "table", "type": "primitive", "color": "red",
      "shape": { "kind": "cylinder", "radiusTop": 0.04, "radiusBottom": 0.04, "height": 0.1 },
      "transform": { "position": [0.3, 0.75, 0] } }
  ],
  "tracks": [
    { "target": "table", "property": "rotation",
      "keys": [{ "frame": 0, "value": [0, 0, 0] }, { "frame": 48, "value": [0, 90, 0], "ease": "easeInOut" }] }
  ],
  "shots": [{ "id": "sh010", "camera": "wide", "start": 0, "end": 96 }]
}
```

- **Shapes:** `box`, `cylinder`, `cone`, `sphere`, `capsule`, `wedge`, `plane`
- **Object types:** `primitive`, `group` (empty node for parenting)
- **Palette colours:** `grey light dark floor wall red orange yellow green teal blue purple`, or any hex value
- **Track properties:** objects animate `position`/`rotation`/`scale`; cameras animate `position`/`target`/`fov`
- **Eases:** `linear easeIn easeOut easeInOut step`. A key's ease applies from that key to the next one.
- **Settings:** `background`, `grid`, `edges` (outlines), `shadows` (off by default; slow on CPU)

## Running outside Codespaces

If Remotion can't download its headless Chrome, point it at an installed one:

```bash
export REMOTION_BROWSER_EXECUTABLE=/path/to/chrome-headless-shell
```
