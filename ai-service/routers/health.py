from fastapi import APIRouter, Request
from datetime import datetime
import xgboost as xgb

router = APIRouter()


@router.get("/health", summary="Service health check")
async def health(request: Request):
    manager = request.app.state.model_manager
    info    = manager.model_info()

    return {
        "status":       "ok",
        "timestamp":    datetime.utcnow().isoformat(),
        "model_loaded": manager.model is not None,
        "model_version": info.get("version", "none"),
        "xgboost_version": xgb.__version__,
    }
