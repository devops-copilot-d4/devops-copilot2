"""
Prediction router
=================
POST /predict        — single deployment prediction
POST /predict/batch  — batch predictions (up to 100)
GET  /features       — feature schema
"""

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
import logging

logger = logging.getLogger("ai-service.predict")
router = APIRouter()


class DeploymentFeatures(BaseModel):
    build_duration:    float = Field(0,   description="Build time in seconds")
    build_status:      int   = Field(0,   description="0=success, 1=failed (prev build)")
    deploy_status:     int   = Field(0,   description="0=success, 1=failed (prev deploy)")
    commit_sha_len:    int   = Field(40,  description="Length of commit SHA (7–40)")
    retry_count:       int   = Field(0,   description="Number of CI retries")
    test_pass_rate:    float = Field(1.0, ge=0.0, le=1.0, description="Test pass rate 0–1")
    files_changed:     int   = Field(0,   description="Files changed in commit")
    lines_added:       int   = Field(0,   description="Lines added")
    lines_deleted:     int   = Field(0,   description="Lines deleted")
    hour_of_day:       Optional[int]   = Field(None, ge=0, le=23)
    day_of_week:       Optional[int]   = Field(None, ge=0, le=6)
    is_hotfix:         int   = Field(0,   description="1 if hotfix branch")
    image_size_mb:     float = Field(200, description="Docker image size in MB")
    pod_restart_count: int   = Field(0,   description="Prior pod restart count")
    cpu_request_ratio: float = Field(1.0, description="Actual/requested CPU ratio")
    mem_request_ratio: float = Field(1.0, description="Actual/requested memory ratio")


class PredictionResponse(BaseModel):
    model_config = {"protected_namespaces": ()}

    failure_probability: float
    risk_level: str
    model_version: str
    top_features: list


@router.post("/predict", response_model=PredictionResponse, summary="Predict deployment failure probability")
async def predict(request: Request, features: DeploymentFeatures):
    manager = request.app.state.model_manager
    try:
        result = manager.predict(features.model_dump())
        logger.info(
            f"Prediction: prob={result['failure_probability']} "
            f"risk={result['risk_level']}"
        )
        return result
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/predict/batch", summary="Batch predict (up to 100 deployments)")
async def predict_batch(request: Request, records: list[DeploymentFeatures]):
    if len(records) > 100:
        raise HTTPException(status_code=400, detail="Batch size limit is 100")
    manager = request.app.state.model_manager
    try:
        results = manager.predict_batch([r.model_dump() for r in records])
        return {"predictions": results, "count": len(results)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/features", summary="Feature schema and descriptions")
async def get_features(request: Request):
    manager = request.app.state.model_manager
    meta    = manager.model_info()
    return {
        "features": meta.get("features", []),
        "description": {
            "build_duration":    "Build time in seconds. Longer builds often indicate dependency issues.",
            "build_status":      "Whether the previous build of this service failed (1) or succeeded (0).",
            "deploy_status":     "Whether the previous deployment failed (1) or succeeded (0).",
            "commit_sha_len":    "Length of commit SHA. Short SHAs (< 40) may indicate manual triggers.",
            "retry_count":       "Number of CI retries. Higher = more flaky pipeline.",
            "test_pass_rate":    "Fraction of tests that passed (0.0 – 1.0).",
            "files_changed":     "Number of files modified. Large diffs increase risk.",
            "lines_added":       "Total lines added in the commit.",
            "lines_deleted":     "Total lines deleted in the commit.",
            "hour_of_day":       "Hour of deployment (0–23 UTC). Off-hours deploys are riskier.",
            "day_of_week":       "Day of week (0=Mon … 6=Sun). Weekends have higher failure rates.",
            "is_hotfix":         "1 if the branch name contains hotfix/fix (rushed changes).",
            "image_size_mb":     "Docker image size. Oversized images cause pull failures.",
            "pod_restart_count": "Prior restart count of this service's pods.",
            "cpu_request_ratio": "Ratio of actual CPU usage to requested. > 1 means under-provisioned.",
            "mem_request_ratio": "Ratio of actual memory to requested. > 1 means OOM risk.",
        }
    }
