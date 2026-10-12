"""Load the built XPI in an isolated Zotero profile and inspect actual add-on state.

Runs a separate application instance and only terminates that instance and its
children. The user's profile, library, credentials and running Zotero stay intact.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile
import time

parser = argparse.ArgumentParser()
parser.add_argument("--zotero", required=True, help="Path to the Zotero executable")
parser.add_argument("--timeout", type=int, default=25)
parser.add_argument("--sidebar", action="store_true", help="Verify native sidebar and PDF routing in a headless test instance")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
addon_id = manifest["applications"]["zotero"]["id"]
dist = root / "dist"
dist.mkdir(exist_ok=True)
xpi = dist / f"zotero-paperlens-{manifest['version']}.xpi"
if not xpi.exists():
    raise SystemExit("Build the XPI first")

class TestDirectory(tempfile.TemporaryDirectory):
    def cleanup(self):
        # Windows may release SQLite/antivirus handles shortly after taskkill.
        for attempt in range(20):
            try:
                super().cleanup()
                return
            except PermissionError:
                if attempt == 19:
                    raise
                time.sleep(0.25)


with TestDirectory(prefix="install-check-", dir=dist) as temporary:
    folder = Path(temporary)
    profile, data = folder / "profile", folder / "data"
    extensions = profile / "extensions"
    extensions.mkdir(parents=True)
    data.mkdir()
    test_xpi = extensions / (addon_id + ".xpi")
    if args.sidebar:
        with zipfile.ZipFile(xpi) as source, zipfile.ZipFile(test_xpi, "w", zipfile.ZIP_DEFLATED) as target:
            for name in source.namelist():
                contents = source.read(name)
                if name == "bootstrap.js":
                    contents = contents.replace(b'  Zotero.debug?.("PaperLens: startup complete");',
                        b'  Zotero.debug?.("PaperLens: startup complete");\n'
                        b'  Zotero.Promise.delay(0).then(() => Services.scriptloader.loadSubScript(rootURI + "test/sidebar-probe.js", {Zotero, Services, rootURI}, "UTF-8"));')
                target.writestr(name, contents)
            target.writestr("test/sidebar-probe.js", (root / "tests" / "sidebar-probe.js").read_bytes())
    else:
        shutil.copy2(xpi, test_xpi)
    preferences = {
        "extensions.zotero.useDataDir": True,
        "extensions.zotero.dataDir": str(data),
        "extensions.zotero.firstRun": False,
        "extensions.zotero.firstRun2": False,
        "extensions.zotero.sync.autoSync": False,
        "extensions.autoDisableScopes": 0,
        "extensions.enabledScopes": 15,
        "extensions.checkUpdateSecurity": True,
        "browser.shell.checkDefaultBrowser": False,
        "extensions.zoteroWinWordIntegration.skipInstallation": True,
        "extensions.zoteroOpenOfficeIntegration.skipInstallation": True,
    }
    (profile / "prefs.js").write_text("\n".join(
        "user_pref(" + json.dumps(k) + ", " + json.dumps(v) + ");"
        for k, v in preferences.items()), encoding="utf-8")
    command = [args.zotero, "-no-remote", "-profile", str(profile),
               "-purgecaches", "-ZoteroDebugText", "-console"]
    if args.sidebar:
        command.append("-headless")
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    addon = None
    log = b""
    try:
        try:
            if args.sidebar:
                # Drain debug output while polling, so early probe completion can
                # end the run without waiting for the full timeout or blocking a pipe.
                deadline = time.monotonic() + args.timeout
                probe = folder / "sidebar-probe.json"
                while time.monotonic() < deadline and process.poll() is None:
                    try:
                        state = json.loads(probe.read_text(encoding="utf-8"))
                        if state.get("ok") or state.get("error"):
                            break
                    except (OSError, ValueError):
                        pass
                    # communicate() drains stdout while waiting; preserve its final buffer
                    # in the finally block after terminating this specific test process.
                    try:
                        log, _ = process.communicate(timeout=0.5)
                        break
                    except subprocess.TimeoutExpired:
                        pass
                raise subprocess.TimeoutExpired(command, args.timeout)
            log, _ = process.communicate(timeout=args.timeout)
        except subprocess.TimeoutExpired:
            metadata = profile / "extensions.json"
            if metadata.exists():
                addons = json.loads(metadata.read_text(encoding="utf-8")).get("addons", [])
                addon = next((a for a in addons if a.get("id") == addon_id), None)
        if addon is None and (profile / "extensions.json").exists():
            addons = json.loads((profile / "extensions.json").read_text(encoding="utf-8")).get("addons", [])
            addon = next((a for a in addons if a.get("id") == addon_id), None)
    finally:
        if process.poll() is None:
            if os.name == "nt":
                subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            else:
                process.terminate()
        remaining, _ = process.communicate(timeout=10)
        if remaining:
            log = remaining
    text = log.decode("utf-8", errors="replace")
    result = {
        "version": manifest["version"],
        "isolatedProfile": True,
        "addonFound": addon is not None,
        "active": addon.get("active") if addon else None,
        "appDisabled": addon.get("appDisabled") if addon else None,
        "userDisabled": addon.get("userDisabled") if addon else None,
        "startupComplete": "PaperLens: startup complete" in text,
    }
    if args.sidebar:
        probe = folder / "sidebar-probe.json"
        result["sidebar"] = json.loads(probe.read_text(encoding="utf-8")) if probe.exists() else {"ok": False, "error": "Sidebar probe did not finish"}
    (dist / "install-check.log").write_text(text, encoding="utf-8")
    (dist / "install-check.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    if (not result["addonFound"] or not result["active"] or result["appDisabled"]
            or result["userDisabled"] or not result["startupComplete"]
            or args.sidebar and not result["sidebar"]["ok"]):
        relevant = [line for line in text.splitlines()
                    if any(word in line.lower() for word in ["paperlens", "invalid", "manifest", "error"])]
        print("\n".join(relevant[-35:]))
        raise SystemExit("Actual Zotero installation check failed")
    print("Actual Zotero accepted the XPI in the isolated profile.")
