"""
AI Microservice — FastAPI
========================
Endpoints:
  POST /predict          — XGBoost failure probability for a deployment
  POST /predict/batch    — batch predictions
  POST /train            — retrain model on new labelled data
  GET  /model/info       — current model metadata
  GET  /health           — service health check
  GET  /features         — feature schema documentation

Run locally:
  uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from routers import predict, train, health
from core.model_manager import ModelManager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("ai-service")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load (or train from scratch) the XGBoost model at startup."""
    logger.info("AI Service starting up — loading model...")
    manager = ModelManager()
    manager.load_or_train()
    app.state.model_manager = manager
    logger.info(f"Model ready: {manager.model_info()}")
    yield
    logger.info("AI Service shutting down.")


app = FastAPI(
    title="DevOps Copilot — AI Microservice",
    description="XGBoost deployment failure prediction + model management",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(predict.router, prefix="",      tags=["Prediction"])
app.include_router(train.router,   prefix="/train", tags=["Training"])
app.include_router(health.router,  prefix="",       tags=["Health"])
