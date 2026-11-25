"""Pack the stable files from a Next.js standalone production build."""

import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import tarfile


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def select_files(source, prefix):
    if not source.is_dir() or source.is_symlink():
        raise ValueError(f"missing build directory: {source}")
    for file in sorted(source.rglob("*")):
        relative = file.relative_to(source)
        name = prefix / PurePosixPath(*relative.parts)
        if any(part.startswith(".env") or part in {".npmrc", ".git"} for part in name.parts):
            raise ValueError(f"forbidden release member: {name}")
        if file.is_symlink() or not (file.is_file() or file.is_dir()):
            raise ValueError(f"unsupported release member: {name}")
        yield name.as_posix(), file


def create(root, output, commit):
    standalone = root / ".next/standalone"
    build = (standalone / ".next/BUILD_ID").read_text(encoding="ascii").strip()
    if not (re.fullmatch(r"[0-9a-f]{40}", commit) and re.fullmatch(r"[A-Za-z0-9._-]{1,80}", build)
            and build not in (".", "..") and (standalone / "server.js").is_file()):
        raise ValueError("incomplete standalone release")
    public_build = root / ".next/static" / build / "_buildManifest.js"
    public_digest = sha256(public_build)
    sources = [(standalone, PurePosixPath(".")),
               (root / ".next/static", PurePosixPath(".next/static")),
               (root / "public", PurePosixPath("public"))]
    entries = {}
    for source, prefix in sources:
        for name, file in select_files(source, prefix):
            if name in entries or name == ".commit-sha":
                raise ValueError(f"duplicate release member: {name}")
            entries[name] = file

    output.mkdir(mode=0o700)
    archive_path = output / "web.tar.gz"
    with archive_path.open("xb") as stream:
        os.fchmod(stream.fileno(), 0o600)
        with tarfile.open(fileobj=stream, mode="w:gz", compresslevel=6, dereference=True) as package:
            for name, file in entries.items():
                package.add(file, arcname=name, recursive=False)
            contents = (commit + "\n").encode("ascii")
            marker = tarfile.TarInfo(".commit-sha")
            marker.mode = 0o600
            marker.size = len(contents)
            package.addfile(marker, io.BytesIO(contents))
    report = {"commit_sha": commit, "build_id": build, "archive_sha256": sha256(archive_path),
              "public_build_manifest_sha256": public_digest}
    with (output / "web-release.json").open("x", encoding="utf-8") as stream:
        json.dump(report, stream, indent=2)
        stream.write("\n")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--commit", required=True)
    args = parser.parse_args()
    print(json.dumps(create(Path.cwd(), args.output, args.commit)))
