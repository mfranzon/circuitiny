#!/usr/bin/env python3
"""Convert a vendor STEP file into a Circuitiny board GLB.

Vendors (Seeed, Espressif, …) publish boards as STEP. build123d's
`export_gltf` does two inconvenient things:

  1. It bakes a Z-up -> Y-up rotation, which leaves a Y-up STEP standing
     on edge. We cancel that with a +90 deg X pre-rotation.
  2. It centres nothing: the STEP's own origin (often a corner of the
     module, not the board) ends up as the GLB origin.

Circuitiny places board pin anchors in world space and expects the model
to be centred on X/Z with its top face at a known Y (the pin layer). So
after export we rewrite the single node's translation to:

  * centre the part on X and Z
  * put the board's top face at --top-y (metres)

Source for the bundled XIAO ESP32-S3 model:
  https://files.seeedstudio.com/wiki/SeeedStudio-XIAO-ESP32S3/res/seeed-studio-xiao-esp32s3-3d_model.zip

Usage:
  python3 scripts/step_to_board_glb.py INPUT.step OUTPUT.glb [--top-y 0.00622]

Requires build123d. The repo's render skill ships a known-good venv:
  ~/.claude/skills/render/.venv/bin/python3 scripts/step_to_board_glb.py ...
"""

import argparse
import json
import math
import struct
import sys

from build123d import Compound, Rotation, export_gltf, import_step

# XIAO ESP32-S3: catalog pin anchors sit at y=0.006 m; the board's top face
# is placed 0.22 mm above that so the pin spheres land on the castellated
# holes. Other boards can override via --top-y.
DEFAULT_TOP_Y = 0.00622


def _quat_rotate(q, v):
    """Rotate vec3 v by quaternion q=(x,y,z,w)."""
    qx, qy, qz, qw = q
    vx, vy, vz = v
    tx = 2 * (qy * vz - qz * vy)
    ty = 2 * (qz * vx - qx * vz)
    tz = 2 * (qx * vy - qy * vx)
    return (
        vx + qw * tx + (qy * tz - qz * ty),
        vy + qw * ty + (qz * tx - qx * tz),
        vz + qw * tz + (qx * ty - qy * tx),
    )


def _post_rotation_bbox(j):
    """World-space bbox of the (single) node before its translation."""
    node = j["nodes"][0]
    q = node.get("rotation", [0, 0, 0, 1])
    pos_accessors = {
        p["attributes"]["POSITION"]
        for m in j["meshes"]
        for p in m["primitives"]
        if "POSITION" in p["attributes"]
    }
    gmin = [math.inf] * 3
    gmax = [-math.inf] * 3
    for ai in pos_accessors:
        a = j["accessors"][ai]
        if not (a.get("min") and a.get("max")):
            continue
        mn, mx = a["min"], a["max"]
        for cx in (mn[0], mx[0]):
            for cy in (mn[1], mx[1]):
                for cz in (mn[2], mx[2]):
                    r = _quat_rotate(q, (cx, cy, cz))
                    for k in range(3):
                        gmin[k] = min(gmin[k], r[k])
                        gmax[k] = max(gmax[k], r[k])
    return gmin, gmax


def _read_glb(path):
    with open(path, "rb") as f:
        f.read(12)
        jlen, _ = struct.unpack("<II", f.read(8))
        j = json.loads(f.read(jlen))
        blen, _ = struct.unpack("<II", f.read(8))
        return j, f.read(blen)


def _write_glb(path, j, bin_data):
    js = json.dumps(j, separators=(",", ":")).encode("utf8")
    js += b" " * ((4 - len(js) % 4) % 4)
    bn = bin_data + b"\x00" * ((4 - len(bin_data) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(bn)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A))
        f.write(js)
        f.write(struct.pack("<II", len(bn), 0x004E4942))
        f.write(bn)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("step", help="input STEP file")
    ap.add_argument("glb", help="output GLB file")
    ap.add_argument("--top-y", type=float, default=DEFAULT_TOP_Y,
                    help=f"world Y (m) of the board's top face (default {DEFAULT_TOP_Y})")
    ap.add_argument("--deflection", type=float, default=0.05,
                    help="linear tessellation deflection in mm (default 0.05)")
    args = ap.parse_args()

    merged = Compound(import_step(args.step).solids())
    rotated = Rotation(90, 0, 0) * merged
    export_gltf(rotated, args.glb, binary=True,
                linear_deflection=args.deflection, angular_deflection=0.2)

    j, bin_data = _read_glb(args.glb)
    gmin, gmax = _post_rotation_bbox(j)
    j["nodes"][0]["translation"] = [
        -(gmin[0] + gmax[0]) / 2,
        args.top_y - gmax[1],
        -(gmin[2] + gmax[2]) / 2,
    ]
    _write_glb(args.glb, j, bin_data)

    t = j["nodes"][0]["translation"]
    print(f"world bbox (mm): "
          f"x[{(gmin[0]+t[0])*1000:.2f},{(gmax[0]+t[0])*1000:.2f}] "
          f"y[{(gmin[1]+t[1])*1000:.2f},{(gmax[1]+t[1])*1000:.2f}] "
          f"z[{(gmin[2]+t[2])*1000:.2f},{(gmax[2]+t[2])*1000:.2f}]")
    print(f"wrote {args.glb}")


if __name__ == "__main__":
    sys.exit(main())
