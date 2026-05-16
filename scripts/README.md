# scripts

## step_to_board_glb.py

Converts a vendor STEP file into a Circuitiny board GLB (`resources/boards/<id>.glb`).
Handles build123d's Z-up to Y-up quirk, centres the part on X/Z, and puts the
board's top face at the pin layer so the catalog's pin anchors line up.

Needs `build123d`. The render skill ships a known-good venv:

```sh
~/.claude/skills/render/.venv/bin/python3 \
  scripts/step_to_board_glb.py INPUT.step resources/boards/<id>.glb
```

`<id>` must match the `BoardDef.id` in `src/catalog/index.ts`. The loader
keys board GLBs by filename.

### Regenerating xiao-esp32s3.glb

Source: official Seeed STEP (MIT-licensed via their OSHW repo).

```sh
curl -sL -o /tmp/xiao.zip \
  https://files.seeedstudio.com/wiki/SeeedStudio-XIAO-ESP32S3/res/seeed-studio-xiao-esp32s3-3d_model.zip
unzip -o /tmp/xiao.zip -d /tmp/xiao
~/.claude/skills/render/.venv/bin/python3 scripts/step_to_board_glb.py \
  "/tmp/xiao/XIAO-ESP32S3 v2.step" resources/boards/xiao-esp32s3.glb
```

Expected output: `world bbox (mm): x[-11.24,11.24] y[1.76,6.22] z[-8.89,8.89]`.

`--top-y` (default 0.00622 m) sets the world Y of the top face. Only adjust
if a board's catalog pin anchors use a different layer.
