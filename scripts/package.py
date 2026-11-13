"""Package only committed extension files; never overwrite arbitrary folders."""
from pathlib import Path
import hashlib
import json
import platform
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]

def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args], text=True).strip()

def main():
    if git('status', '--porcelain', '--untracked-files=normal'):
        raise SystemExit('Build from a clean committed checkout; commit or remove source changes first.')
    source = git('rev-parse', 'HEAD')
    version = json.loads((ROOT/'extension/manifest.json').read_text('utf-8'))['version']
    if not all(p.isdigit() for p in version.split('.')) or len(version.split('.')) != 3:
        raise SystemExit('Invalid extension version')
    files = [name for name in git('ls-files').splitlines() if name.startswith(('extension/', 'demo/'))]
    files += ['LICENSE']
    contents = {}
    for name in sorted(files):
        path = ROOT/name
        if path.is_symlink() or not path.resolve().is_relative_to(ROOT):
            raise SystemExit('Refusing linked or out-of-tree package input')
        contents[name] = subprocess.check_output(['git', '-C', str(ROOT), 'show', f'{source}:{name}'])
    contents['README.txt'] = subprocess.check_output(['git', '-C', str(ROOT), 'show', f'{source}:docs/extension-package.txt'])
    manifest = {
        'source_sha': source, 'version': version,
        'configuration': 'committed extension + synthetic demo; ZIP_STORED; fixed timestamps',
        'toolchain': {'python': platform.python_version(), 'node': subprocess.check_output(['node', '--version'], text=True).strip()},
        'files': {name: hashlib.sha256(data).hexdigest() for name,data in sorted(contents.items())},
    }
    contents['BUILD-MANIFEST.json'] = (json.dumps(manifest,indent=2)+'\n').encode()
    dist = ROOT/'dist'
    if dist.is_symlink() or (dist.exists() and dist.resolve() != dist):
        raise SystemExit('dist must be a real workspace directory')
    dist.mkdir(exist_ok=True)
    target = dist/f'BugKit-MARK-{version}.zip'
    if target.is_symlink():
        raise SystemExit('Refusing linked archive destination')
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_STORED) as archive:
        for name,data in sorted(contents.items()):
            entry = zipfile.ZipInfo(f'BugKit-MARK-{version}/{name}', date_time=(2026,1,1,0,0,0))
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry,data)
    manifest['artifact'] = {'name': target.name, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'bytes': target.stat().st_size}
    (dist/'build-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n','utf-8')
    (dist/'SHA256SUMS.txt').write_text(f"{manifest['artifact']['sha256']}  {target.name}\n",'utf-8')
    print(f'{target.name}: {target.stat().st_size} bytes, source {source}')
    print(f"SHA256 {manifest['artifact']['sha256']}")

if __name__ == '__main__':
    main()
