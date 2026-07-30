from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class ExportRequest(BaseModel):
    floor: str = "1F"
    geometry: dict[str, Any]
    config: dict[str, Any]
    title: str = "Petakin"
