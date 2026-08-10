from __future__ import annotations

import hashlib
import re
from enum import Enum
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

SERVICE_VERSION = "0.1.0-contract"
MAX_TEXT_CHARS = 120_000

app = FastAPI(
    title="Clinical Sidecar Contract",
    version=SERVICE_VERSION,
    docs_url="/docs",
    redoc_url=None,
)


class SourceType(str, Enum):
    gemini_meet = "gemini_meet"
    manual_note = "manual_note"
    document = "document"


class PrepareDraftRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_type: SourceType
    text: str = Field(min_length=1, max_length=MAX_TEXT_CHARS)
    language: Literal["pt-BR"] = "pt-BR"


class DraftSection(BaseModel):
    order: int
    text: str


class PrepareDraftResponse(BaseModel):
    status: Literal["draft"] = "draft"
    service_version: str
    source_hash: str
    source_type: SourceType
    normalized_text: str
    sections: list[DraftSection]
    warnings: list[str]
    persistence: Literal["none"] = "none"
    vault_write: Literal[False] = False


def normalize_text(value: str) -> str:
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in value.split("\n")]
    compact: list[str] = []
    previous_blank = False
    for line in lines:
        if not line:
            if not previous_blank and compact:
                compact.append("")
            previous_blank = True
            continue
        compact.append(line)
        previous_blank = False
    return "\n".join(compact).strip()


def split_sections(text: str) -> list[DraftSection]:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    return [DraftSection(order=i + 1, text=p) for i, p in enumerate(paragraphs)]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": SERVICE_VERSION, "mode": "contract-read-only"}


@app.get("/v1/security/capabilities")
def security_capabilities() -> dict[str, object]:
    return {
        "storesRequestBodies": False,
        "writesVault": False,
        "writesGitHubSyncBranch": False,
        "overwritesFinalizedRecords": False,
        "acceptsSecretsInPayload": False,
        "intendedUse": "prepare a reviewable draft only",
    }


@app.post("/v1/draft/prepare", response_model=PrepareDraftResponse)
def prepare_draft(payload: PrepareDraftRequest) -> PrepareDraftResponse:
    normalized = normalize_text(payload.text)
    if not normalized:
        raise HTTPException(status_code=422, detail="text becomes empty after normalization")
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    warnings = [
        "Output is a draft and must not overwrite a finalized clinical record.",
        "This contract service does not persist the request and does not write to the vault.",
    ]
    return PrepareDraftResponse(
        service_version=SERVICE_VERSION,
        source_hash=digest,
        source_type=payload.source_type,
        normalized_text=normalized,
        sections=split_sections(normalized),
        warnings=warnings,
    )
