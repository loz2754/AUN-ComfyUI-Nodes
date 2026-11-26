# AUN Load Image Pro

`AUNImageLoaderPro` — one loader for a single picture or a folder batch, and
for the size it should come out at. It takes the card look from AusBoss's
**Load Image** and the features of two AUN loaders:

| From | Kept |
|---|---|
| AusBoss Load Image | card rows with only the settings a mode reads, before/after thumbnails with the kept part lit, click-to-pick crop, live `in → out` size line, megapixels / longest side / scale / fit inside / crop to fill / crop / crop to ratio, round-to, enlarge, 9-way keep |
| AUN Load & Resize Image | FramePack bucket sizing, mask output, cleaned filename, `max_num_words`, OBVPM bundle (`set`) |
| AUN Load Image Single/Batch | folder sources (pre-defined list or manual path), increment / decrement / random / fixed / range / search selection, `output_is_list`, preview toggle |

## Source

**Source** is `single` or `folder`.

- **single** — pick a file from ComfyUI's input folder (subfolders show as
  `sub/folder/name.png`) or press **Load** to upload one. The arrows under the
  picker step through the same list; the line beside them shows where the file
  is (`14 / 212`) and the size it goes in at and comes out at
  (`912 × 1632 → 1144 × 2048`).
- **folder** — choose `list` (the folders in `predefined_paths.local.json`) or
  `path` (type a full path), then how the next picture is picked:

| Batch | What it does |
|---|---|
| `next` | next file each run, wrapping at the end |
| `previous` | previous file each run |
| `random` | any file |
| `fixed` | the position(s) in **Positions / find**, first one only |
| `range` | walks the positions in **Positions / find**, one per run |
| `search` | filters the folder with **Positions / find**, then walks the matches |

**Positions / find** takes comma-separated 1-based positions and ranges
(`2,3,4-7,10`) for fixed/range, and for search: wildcards (`*`, `?`, `[]`),
regex (`.*face.*`), plain text, or a name with a trailing-number range
(`John [7-14]`, `John [1-5, 7-14]`). Separate alternatives with `;`
(`Jane; John [7-14]`). Files are listed in human order (2 < 10 < 101).

**All matches** (folder mode) outputs every match from `range`, `fixed` or
`search` as a list — one picture per downstream execution — with matching
filename, size and original-size lists.

In folder mode the picture is only known at run time, so the live size line
and before/after preview are shown for `single` only; the result preview under
the node shows what was loaded, and the size row above **Size** shows the size
and position the last run used (`300 × 200 → 512 × 512 · 1 / 4`).

## Size

Only the numbers the chosen mode reads are shown.

| Size | What it does | Reads |
|---|---|---|
| `off` | the file's own pixels | — |
| `megapixels` | whole picture at a total size, shape kept | Megapixels |
| `longest side` | sets the longer edge, the other follows | Longest side |
| `scale` | multiplies both edges | Scale |
| `fit inside` | as large as it can be inside the box, nothing cut | Width, Height |
| `fit + pad` | exact box, picture fitted inside, the rest black | Width, Height |
| `crop to fill` | covers the box, cuts off what sticks out | Width, Height |
| `crop` | cuts a piece of that size, no resize | Width, Height |
| `crop to ratio` | cuts the largest piece of a shape | Ratio (or Width/Height for `width : height`) |
| `stretch` | exact Width × Height, shape not kept | Width, Height |
| `framepack bucket` | nearest FramePack bucket shape for the picture's aspect | Bucket scale |

**Round to** rounds a changed size to a multiple (8 or 16 suit most models;
1 keeps exact numbers). It never applies while Size is `off`.

**Keep** picks the part a crop keeps: `center`, edges and corners. You can
also click the small before picture — the click's third picks the part.

Under **More**: **Method** (lanczos, bicubic, bilinear, nearest,
nearest-exact, area), **Enlarge** (off = never make a picture bigger), and
**Filename words** (`max_num_words`).

**Preview** off skips writing the preview file under the node.

## The picture on the node

Under the card is ComfyUI's own preview of the loaded result (right-click for
the mask editor and copy/paste, as on the stock loader). Directly above it a
label names the file: the current pick in `single`, or the file the last run
loaded in `folder` (`+N more` when `All matches` ran several, with every name
on hover).

**Collapse Connections** (right-click, or double-click the node) converges the
input and output dots onto one anchor and hides their labels, leaving the card
and every control exactly as it is; **Show Connections** spreads the dots back
onto their slots. The AUN Collapse Connections Controller node can also drive
it.

## Outputs

- `image` — the picture at its new size.
- `mask` — white where the picture is see-through, black where it is solid,
  same size as `image` (all black when the file has no transparency).
- `filename` — the file's name without folder or extension, trimmed to
  **Filename words**.
- `cleaned filename` — the same name with symbols turned into spaces and a
  trailing counter dropped (`MyImage_00012` → `MyImage`).
- `width`, `height` — the size that comes out.
- `original_width`, `original_height` — the file's size before the resize.
- `bundle` — all of the above as an OBVPM bundle. Fill **Bundle name** to
  expose it as a constant for an Unbundle (get) node.

In list mode the picture and filename outputs are lists; `bundle` holds lists
too.

## Notes

- Animated files (GIF/WebP) come through as a batch of frames at one size; a
  phone photo is turned the way its EXIF data says.
- The mask is always resampled bilinear so its edge stays smooth, whatever the
  picture's method.
- Files are read from ComfyUI's input folder, or from the folder you name.
- The node runs again when the file changes on disk or a setting changes; in
  cycling modes (`next`, `previous`, `random`, `range`, `search`) it always
  runs.
- The size line uses the same arithmetic as the run; `tools/check_load_size_parity.py`
  holds `web/aun_load_size.js` to `aun_load_image_shared.plan_load_size`.
