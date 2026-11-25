import importlib.util
import json
from pathlib import Path
import tarfile
import tempfile
import unittest


PACKAGER = Path(__file__).resolve().parents[1] / "scripts" / "package-web-release.py"
COMMIT = "a" * 40


class WebReleasePackageTest(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location("web_release_packager", PACKAGER)
        self.package = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.package)
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        for path, content in {
            ".next/standalone/server.js": "test server",
            ".next/standalone/.next/BUILD_ID": "build-id\n",
            ".next/static/chunks/app.js": "app client",
            ".next/static/build-id/_buildManifest.js": "manifest",
            "public/asset.txt": "asset",
        }.items():
            file = self.root / path
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text(content)
        self.output = self.root / "package"

    def test_packages_the_nodes_static_assets_and_exact_source_identity(self):
        self.package.create(self.root, self.output, COMMIT)
        archive = self.output / "web.tar.gz"
        report = json.loads((self.output / "web-release.json").read_text())
        self.assertEqual(report["commit_sha"], COMMIT)
        self.assertEqual(report["build_id"], "build-id")
        self.assertEqual(archive.stat().st_mode & 0o777, 0o600)
        with tarfile.open(archive) as package:
            self.assertEqual(package.extractfile(".commit-sha").read().decode().strip(), COMMIT)
            self.assertEqual(package.extractfile(".next/static/chunks/app.js").read(), b"app client")
            self.assertEqual(package.extractfile("public/asset.txt").read(), b"asset")

    def test_dotenv_does_not_enter_the_artifact(self):
        (self.root / ".next/standalone/.env.production").write_text("FIXTURE=1")
        with self.assertRaisesRegex(ValueError, "forbidden"):
            self.package.create(self.root, self.output, COMMIT)
        self.assertFalse((self.output / "web.tar.gz").exists())


if __name__ == "__main__":
    unittest.main()
