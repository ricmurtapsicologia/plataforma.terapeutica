from pathlib import Path

p=Path('assets/js/screening-system-v2.js')
s=p.read_text(encoding='utf-8')
old="forEach(n=>{if(!n.closest('.rm-completion'))n.hidden=true})"
new="forEach(n=>{if(!n.closest('.rm-completion')){n.hidden=true;n.style.setProperty('display','none','important');n.setAttribute('aria-hidden','true')}})"

if old in s:
    s=s.replace(old,new,1)
elif new not in s:
    raise SystemExit('LEGACY_RESULT_HIDE_PATTERN_NOT_FOUND')

# Guardas: não alterar política de submissão ou contrato clínico.
for sentinel in [
    "const VERSION='2.2.0'",
    "function blockUnvalidatedActions()",
    "if(cfg?.productionReady===true&&adapter?.submissionSupported!==false)return",
    "function confirmDelivery(detail={})",
]:
    if sentinel not in s:
        raise SystemExit('RUNTIME_SENTINEL_MISSING:'+sentinel)

p.write_text(s,encoding='utf-8')
print('LEGACY_RESULTS_HIDE_HARDENED')
