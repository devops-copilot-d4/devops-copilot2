"""
Training router
===============
POST /train          — retrain model with new labelled data
GET  /train/status   — model metadata + metrics
"""

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
import logging

logger = logging.getLogger("ai-service.train")
router = APIRouter()


class LabelledSample(BaseModel):
    build_duration:    float = 0
    build_status:      int   = 0
    deploy_status:     int   = 0
    commit_sha_len:    int   = 40
    retry_count:       int   = 0
    test_pass_rate:    float = 1.0
    files_changed:     int   = 0
    lines_added:       int   = 0
    lines_deleted:     int   = 0
    hour_of_day:       Optional[int] = None
    day_of_week:       Optional[int] = None
    is_hotfix:         int   = 0
    image_size_mb:     float = 200
    pod_restart_count: int   = 0
    cpu_request_ratio: float = 1.0
    mem_request_ratio: float = 1.0
    failed:            int   = Field(..., description="Ground truth label: 0=success, 1=failure")


class TrainRequest(BaseModel):
    samples: list[LabelledSample] = Field(..., min_length=10, description="Min 10 labelled samples required")


@router.post("/", summary="Retrain XGBoost model with new labelled data")
async def retrain(request: Request, body: TrainRequest):
    manager = request.app.state.model_manager
    try:
        metrics = manager.retrain([s.model_dump() for s in body.samples])
        logger.info(f"Retrain complete: {metrics}")
        return {"status": "retrained", "metrics": metrics}
    except Exception as e:
        logger.error(f"Retrain failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status", summary="Model metadata and last training metrics")
async def model_status(request: Request):
    manager = request.app.state.model_manager
    info    = manager.model_info()
    if not info:
        raise HTTPException(status_code=503, detail="Model not yet trained")
    return info
