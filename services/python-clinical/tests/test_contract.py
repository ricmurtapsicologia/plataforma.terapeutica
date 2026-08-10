from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_is_read_only_contract():
    response = client.get('/health')
    assert response.status_code == 200
    assert response.json()['mode'] == 'contract-read-only'


def test_capabilities_forbid_vault_writes():
    data = client.get('/v1/security/capabilities').json()
    assert data['storesRequestBodies'] is False
    assert data['writesVault'] is False
    assert data['writesGitHubSyncBranch'] is False
    assert data['overwritesFinalizedRecords'] is False


def test_prepare_draft_is_reviewable_and_non_persistent():
    response = client.post('/v1/draft/prepare', json={
        'source_type': 'gemini_meet',
        'text': 'Primeiro bloco.\n\nSegundo bloco.',
        'language': 'pt-BR',
    })
    assert response.status_code == 200
    data = response.json()
    assert data['status'] == 'draft'
    assert data['persistence'] == 'none'
    assert data['vault_write'] is False
    assert len(data['sections']) == 2
    assert len(data['source_hash']) == 64


def test_extra_fields_are_rejected():
    response = client.post('/v1/draft/prepare', json={
        'source_type': 'manual_note',
        'text': 'texto',
        'patient_id': 'must-not-be-accepted-by-contract',
    })
    assert response.status_code == 422
