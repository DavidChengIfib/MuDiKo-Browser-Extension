"""Creates the small ZIP fixtures for zip-reader.test.js (python make_fixtures.py)."""
import json
import zipfile
from pathlib import Path

HERE = Path(__file__).parent
METADATA = {
    "name": "Pitch Piano - Tonhöhen-Erkennung",
    "description": "Echtzeit-Tonhöhenerkennung mit digitalem Klavier.",
    "requestFramePermissions": ["microphone"],
}


def write(name, entries, compression=zipfile.ZIP_STORED):
    with zipfile.ZipFile(HERE / name, "w", compression=compression) as archive:
        for path, content in entries:
            archive.writestr(path, content)


# Like an AI Studio export: uncompressed, metadata.json at the root.
write("ai-studio-export.zip", [
    ("metadata.json", json.dumps(METADATA, ensure_ascii=False, indent=2)),
    ("package.json", '{"name": "react-example"}'),
    ("src/App.tsx", "export default function App() { return null; }"),
])

# Re-zipped on a Mac: deflated, inside one top-level folder, with __MACOSX noise.
write("deflated-in-folder.zip", [
    ("__MACOSX/projekt/._metadata.json", "binary junk"),
    ("projekt/src/data/metadata.json", json.dumps({"name": "Falsche Datei"})),
    ("projekt/metadata.json", json.dumps({"name": "  Rhythmus-Quiz  ", "description": "x" * 1500})),
    ("projekt/package.json", '{"name": "quiz"}'),
], compression=zipfile.ZIP_DEFLATED)

write("no-metadata.zip", [("package.json", '{"name": "plain"}')])
write("broken-metadata.zip", [("metadata.json", "{ das ist kein json")])
print("fixtures written")
