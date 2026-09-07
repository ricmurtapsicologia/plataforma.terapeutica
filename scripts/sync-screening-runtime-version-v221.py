from pathlib import Path

runtime = Path('assets/js/screening-system-v2.js')
loader = Path('assets/js/screening-uniformity-v1.js')
hardening = Path('scripts/harden-legacy-results-hide-v1.py')

r = runtime.read_text(encoding='utf-8')
l = loader.read_text(encoding='utf-8')
h = hardening.read_text(encoding='utf-8')

r = r.replace("const VERSION='2.2.0';", "const VERSION='2.2.1';", 1)
l = l.replace("screening-system-v2.js?v=2.1.0", "screening-system-v2.js?v=2.2.1", 1)
l = l.replace("version:'2.1.0-loading'", "version:'2.2.1-loading'", 1)
h = h.replace("\"const VERSION='2.2.0'\"", "\"const VERSION='2.2.1'\"", 1)

for text, sentinel, label in [
    (r, "const VERSION='2.2.1';", 'runtime'),
    (r, "n.style.setProperty('display','none','important')", 'hardening'),
    (l, "screening-system-v2.js?v=2.2.1", 'loader'),
    (l, "version:'2.2.1-loading'", 'loader-placeholder'),
    (h, "\"const VERSION='2.2.1'\"", 'guard'),
]:
    if sentinel not in text:
        raise SystemExit('VERSION_SYNC_FAILED:' + label)

runtime.write_text(r, encoding='utf-8')
loader.write_text(l, encoding='utf-8')
hardening.write_text(h, encoding='utf-8')
print('SCREENING_RUNTIME_VERSION_221_SYNCED')
