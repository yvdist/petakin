"""Petakin backend — floor-plan raster -> flat SVG geometry service."""
from __future__ import annotations

import copy
import io
import json

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from PIL import Image

from .extractor import detect_palette, extract
from .models import ExportRequest
from .presets import AEON_PRESET, DEFAULT_CONFIG
from .svg import emit_svg

app = FastAPI(title="Petakin", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _read_rgb(data: bytes) -> np.ndarray:
    try:
        return np.array(Image.open(io.BytesIO(data)).convert("RGB"))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Invalid image: {e}")


def _merge_config(raw: str | None) -> dict:
    cfg = copy.deepcopy(DEFAULT_CONFIG)
    if raw:
        try:
            cfg.update(json.loads(raw))
        except json.JSONDecodeError as e:
            raise HTTPException(400, f"Invalid config JSON: {e}")
    return cfg


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/preset/default")
def default_preset():
    return AEON_PRESET


@app.post("/api/detect")
async def detect(file: UploadFile = File(...)):
    arr = _read_rgb(await file.read())
    h, w, _ = arr.shape
    return {"swatches": detect_palette(arr), "width": w, "height": h}


@app.post("/api/process")
async def process(file: UploadFile = File(...), config: str | None = Form(None)):
    arr = _read_rgb(await file.read())
    cfg = _merge_config(config)
    geom = extract(arr, cfg)
    return geom


@app.post("/api/export/svg", response_class=PlainTextResponse)
def export_svg(req: ExportRequest):
    svg = emit_svg(req.floor, req.geometry, req.config, req.title)
    return PlainTextResponse(svg, media_type="image/svg+xml")
