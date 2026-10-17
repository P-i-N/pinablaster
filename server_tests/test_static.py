import tempfile
import unittest
from pathlib import Path

from lan import static


class StaticTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "index.html").write_text("<html></html>")
        (self.root / "Game").mkdir()
        (self.root / "Game" / "a.js").write_text("1")
        (self.root / "docs").mkdir()
        (self.root / "docs" / "x.md").write_text("secret")
        (self.root / "server.py").write_text("print(1)")
        (self.root / ".env").write_text("k=v")
        (self.root.parent / "outside.js").write_text("nope")

    def tearDown(self):
        (self.root.parent / "outside.js").unlink(missing_ok=True)
        self.tmp.cleanup()

    def r(self, url):
        return static.resolve(self.root, url)

    def test_root_is_index(self):
        self.assertEqual(self.r("/"), self.root / "index.html")

    def test_normal_file_and_query_string(self):
        self.assertEqual(self.r("/Game/a.js?v=2"), (self.root / "Game" / "a.js"))

    def test_traversal_is_rejected(self):
        for url in ["/../outside.js", "/Game/../../outside.js", "/%2e%2e/outside.js",
                    "/Game/%2e%2e/%2e%2e/outside.js", "/..%5coutside.js", "\..\outside.js"]:
            self.assertIsNone(self.r(url), url)

    def test_blocked_dirs_extensions_and_dotfiles(self):
        for url in ["/docs/x.md", "/server.py", "/.env", "/Game/missing.js", "/Game", "/lan/rooms.py"]:
            self.assertIsNone(self.r(url), url)

    def test_nul_byte_rejected(self):
        self.assertIsNone(self.r("/index.html%00.js"))

    def test_mime_types(self):
        self.assertEqual(static.mime_type(Path("a.js")), "application/javascript; charset=utf-8")
        self.assertEqual(static.mime_type(Path("a.png")), "image/png")
        self.assertEqual(static.mime_type(Path("a.wav")), "audio/wav")


if __name__ == "__main__":
    unittest.main()
