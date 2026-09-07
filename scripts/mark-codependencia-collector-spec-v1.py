from pathlib import Path
import json

p=Path('rastreios/pipeline/instruments.manifest.json')
data=json.loads(p.read_text(encoding='utf-8'))
match=[i for i in data['instruments'] if i.get('id')=='codependencia']
if len(match)!=1:
    raise SystemExit('CODEPENDENCIA_MANIFEST_ENTRY_INVALID')
i=match[0]
if i.get('formState')!='CREATE_REQUIRED':
    raise SystemExit('FORM_STATE_MUST_REMAIN_CREATE_REQUIRED')
if i.get('productionReady') is not False:
    raise SystemExit('PRODUCTION_READY_MUST_REMAIN_FALSE')
i['contractState']='COLLECTOR_SPEC_PREPARED_DEPLOYMENT_REQUIRED'
i['collectorContract']={
    'repository':'ricmurtapsicologia/Escala-de-Co-Depenpencia-Emocional',
    'path':'contracts/collector-v1.json',
    'version':'1.0.0',
    'deploymentState':'SPEC_ONLY'
}
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('CODEPENDENCIA_COLLECTOR_SPEC_RECONCILED')
