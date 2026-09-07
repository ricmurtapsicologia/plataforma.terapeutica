# Reconciliation gate trigger: identity policy v2.2
from pathlib import Path
import json

manifest_path=Path('rastreios/pipeline/instruments.manifest.json')
manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
manifest['schemaVersion']='2.1.0'
manifest['experiencePolicy']='Patient-facing clinical flows use RM Clinical Screening System v2 with explicit identity profiles. Dedicated clinical screenings use screening_canonical (Nome completo, Data de nascimento e Data de aplicação do rastreio). Longitudinal monitorings use monitoring_longitudinal and may only request identity fields actually persisted by the active collector; application date may be derived from the collector timestamp. Items, answer options and scoring logic remain unchanged until separately validated.'
manifest['identityProfiles']={
    'screening_canonical':{
        'scope':'Dedicated clinical screenings',
        'required':['Nome completo','Data de nascimento','Data de aplicação do rastreio'],
        'persistence':'Each field must have an explicit persistent destination before production delivery is enabled.'
    },
    'monitoring_longitudinal':{
        'scope':['humor','ansiedade','autoestima'],
        'required':['Nome completo'],
        'applicationDate':'Collector field when available; otherwise collector timestamp.',
        'birthDate':'Not collected until the active collector has an explicit persistent field. The UI must not synthesize a non-persistent birth date.'
    }
}
for item in manifest.get('instruments',[]):
    item['identityProfile']='monitoring_longitudinal' if item.get('id') in {'humor','ansiedade','autoestima'} else 'screening_canonical'
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

public_path=Path('rastreios/pipeline/public-experience-v2.json')
public=json.loads(public_path.read_text(encoding='utf-8'))
public['schemaVersion']='2.1.0'
public['identity']={
    'defaultProfile':'screening_canonical',
    'profiles':{
        'screening_canonical':{
            'required':['Nome completo','Data de nascimento','Data de aplicação do rastreio'],
            'scope':'Dedicated clinical screenings'
        },
        'monitoring_longitudinal':{
            'required':['Nome completo'],
            'derived':['Data de aplicação do rastreio quando proveniente do timestamp do coletor'],
            'notCollected':['Data de nascimento enquanto o coletor ativo não possuir campo persistente explícito'],
            'scope':['humor','ansiedade','autoestima']
        }
    }
}
for iid,item in public.get('instruments',{}).items():
    item['identityProfile']='monitoring_longitudinal' if iid in {'humor','ansiedade','autoestima'} else 'screening_canonical'
public_path.write_text(json.dumps(public,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

forms_path=Path('rastreios/pipeline/forms-contract.md')
text=forms_path.read_text(encoding='utf-8')
marker='## Campos do respondente\n'
policy='''## Perfis de identidade\n\nA identidade da interface deve refletir apenas dados que possuem destino persistente real. Há dois perfis canônicos:\n\n- `screening_canonical` — rastreios clínicos dedicados: `Nome completo`, `Data de nascimento` e `Data de aplicação do rastreio`, todos com destino persistente explícito antes de qualquer liberação de entrega em produção.\n- `monitoring_longitudinal` — Humor, Ansiedade e Autoestima: exige `Nome completo`; a data de aplicação usa o campo real do coletor quando existente ou o carimbo de data/hora do Google Forms. `Data de nascimento` não é solicitada nem sintetizada enquanto o coletor ativo não possuir campo persistente próprio.\n\nÉ proibido criar campo visual ou hidden de identidade que não seja efetivamente persistido pelo mecanismo de coleta.\n\n'''
if '## Perfis de identidade' not in text:
    if marker not in text: raise SystemExit('FORMS_CONTRACT_MARKER_MISSING')
    text=text.replace(marker,policy+marker,1)
forms_path.write_text(text,encoding='utf-8')
