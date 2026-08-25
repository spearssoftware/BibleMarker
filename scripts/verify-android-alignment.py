#!/usr/bin/env python3
"""Fail when any native library in an Android bundle is not 16 KB page-aligned.

Google Play rejects releases whose .so LOAD segments carry p_align < 0x4000
(the 16 KB page-size requirement for targetSdk 35+), and it says so only at
submission time. CI runs this against the built AAB so a misaligned build
fails here instead.

Usage: verify-android-alignment.py <bundle.aab>
"""
import struct
import sys
import zipfile

PT_LOAD = 1
MIN_ALIGN = 0x4000


def load_alignments(elf: bytes, name: str) -> list[int]:
    if elf[:4] != b"\x7fELF":
        sys.exit(f"{name}: not an ELF file (bad magic {elf[:4]!r})")
    # Only aarch64 is built; a 32-bit .so appearing means the arch matrix
    # changed and this script needs revisiting, not silent 32-bit parsing.
    if elf[4] != 2:
        sys.exit(f"{name}: unexpected 32-bit ELF — did the target list change?")
    phoff = struct.unpack("<Q", elf[32:40])[0]
    phentsize, phnum = struct.unpack("<HH", elf[54:58])
    aligns = []
    for i in range(phnum):
        o = phoff + i * phentsize
        if struct.unpack("<I", elf[o : o + 4])[0] == PT_LOAD:
            aligns.append(struct.unpack("<Q", elf[o + 48 : o + 56])[0])
    return aligns


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    bad = []
    checked = 0
    with zipfile.ZipFile(sys.argv[1]) as z:
        for name in z.namelist():
            # Only the shipped runtime libraries. debugSymbolLevel also embeds
            # symbol copies under BUNDLE-METADATA/ that end in .so but never
            # load at runtime — scanning them would conflate the two and could
            # even mask base/lib/ going missing entirely.
            if not (name.startswith("base/lib/") and name.endswith(".so")):
                continue
            checked += 1
            aligns = load_alignments(z.read(name), name)
            print(f"{name}: LOAD p_align={[hex(a) for a in aligns]}")
            if any(a < MIN_ALIGN for a in aligns):
                bad.append(name)
    if not checked:
        sys.exit("no native libraries under base/lib/ — wrong file, or packaging broke?")
    if bad:
        sys.exit(f"native libraries not 16 KB page-aligned: {bad}")
    print(f"all {checked} native librar{'y is' if checked == 1 else 'ies are'} 16 KB page-aligned")


if __name__ == "__main__":
    main()
