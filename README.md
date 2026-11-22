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
| `npm run qa -- <scene> [object]` | Visual QA contact sheet + stats (see below) |
| `npm run validate` | Check every `scenes/*.scene.json` against the schema |
| `npm test` | Unit tests |

## Visual QA

```bash
npm run qa -- demo                       # whole scene
npm run qa -- demo counter --frame 40    # one object (and its children) at a given frame
npm run qa -- demo actor-a --ref ~/photo.jpg --turntable --full
```

Writes to `out/qa/`:

- **`<name>.png`, the contact sheet:** front / right / top orthographic views, 3/4 perspective, wireframe with bounds and pivot axes, and the reference image (or a 3/4 back view). The header shows size in metres, polygon counts and any issues.
- **`<name>.stats.json`:** the same numbers per object, machine-readable.
- **`<name>-turntable.mp4`** (with `--turntable`): a 360° orbit.

Reading the sheet:

- **Orange figure:** a 1.8 m person for judging scale (it moves beside the object in side views)
- **Magenta:** back faces, which means flipped normals or holes. The CLI counts magenta pixels and warns automatically.
- **Yellow box:** bounding box. **RGB axes:** each object's pivot.

Automatic checks: objects floating above or sinking below the floor, possible interpenetration between separate objects (bounding-box test), zero or negative scale, and parts over the 2,000-triangle greybox budget. The CLI exits with status 1 if it finds an error.

The same sheets are available in Studio as `QA-<scene>` and `Turntable-<scene>`. Set `objectId`, `frame` and `reference` in the props panel. Reference images must live under `public/` (the CLI copies them to `public/refs/` for you).

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
