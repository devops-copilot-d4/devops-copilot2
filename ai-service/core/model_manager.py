"""
ModelManager
============
Handles XGBoost model lifecycle:
  - load from disk (models/xgb_model.json)
  - train from scratch on synthetic seed data if no model exists
  - retrain on new labelled data (incremental)
  - persist model + feature metadata
  - expose prediction with SHAP explanations
"""

import os
import json
import logging
import numpy as np
import pandas as pd
import xgboost as xgb
from datetime import datetime
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    roc_auc_score, precision_score, recall_score,
    f1_score, average_precision_score,
)
from sklearn.preprocessing import LabelEncoder

try:
    import shap
    SHAP_AVAILABLE = True
except ImportError:
    SHAP_AVAILABLE = False

logger = logging.getLogger("ai-service.model_manager")

MODEL_DIR  = Path(__file__).parent.parent / "models"
MODEL_PATH = MODEL_DIR / "xgb_model.json"
META_PATH  = MODEL_DIR / "model_meta.json"

# ── Feature schema ─────────────────────────────────────────────────────────────
FEATURES = [
    "build_duration",        # seconds; long builds correlate with flakiness
    "build_status",          # 0=success, 1=failed (previous build of same service)
    "deploy_status",         # 0=success, 1=failed (previous deploy)
    "commit_sha_len",        # proxy for merge complexity (short sha = manual/unusual)
    "retry_count",           # number of CI retries in this run
    "test_pass_rate",        # 0.0–1.0; missing → 1.0 (assume pass)
    "files_changed",         # number of files in the commit
    "lines_added",           # lines added
    "lines_deleted",         # lines deleted
    "hour_of_day",           # 0–23; late-night deployments fail more
    "day_of_week",           # 0=Mon … 6=Sun
    "is_hotfix",             # 1 if branch name contains hotfix/fix
    "image_size_mb",         # Docker image size in MB; bloated images fail pulls
    "pod_restart_count",     # prior restarts of this service's pods
    "cpu_request_ratio",     # actual CPU / requested CPU (from metrics)
    "mem_request_ratio",     # actual mem / requested mem
]


class ModelManager:
    def __init__(self):
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        self.model: xgb.XGBClassifier | None = None
        self._meta: dict = {}
        self._explainer = None

    # ── public API ─────────────────────────────────────────────────────────────

    def load_or_train(self):
        if MODEL_PATH.exists():
            self._load()
        else:
            logger.info("No saved model found — training on synthetic seed data.")
            df = self._generate_seed_data(n=3000)
            self._train(df)

    def predict(self, features: dict) -> dict:
        """
        Predict failure probability for a single deployment.
        Returns:
          failure_probability: float [0, 1]
          risk_level: "low" | "medium" | "high" | "critical"
          top_features: list of {feature, impact} sorted by |SHAP value|
        """
        if self.model is None:
            raise RuntimeError("Model not loaded")

        X = self._dict_to_frame(features)
        proba = float(self.model.predict_proba(X)[0][1])

        result = {
            "failure_probability": round(proba, 4),
            "risk_level": self._risk_level(proba),
            "model_version": self._meta.get("version", "unknown"),
            "top_features": [],
        }

        if SHAP_AVAILABLE and self._explainer is not None:
            try:
                shap_vals = self._explainer(X)
                importances = list(zip(FEATURES, shap_vals.values[0].tolist()))
                importances.sort(key=lambda x: abs(x[1]), reverse=True)
                result["top_features"] = [
                    {"feature": f, "impact": round(v, 4)}
                    for f, v in importances[:5]
                ]
            except Exception as e:
                logger.warning(f"SHAP explanation failed: {e}")

        return result

    def predict_batch(self, records: list[dict]) -> list[dict]:
        return [self.predict(r) for r in records]

    def retrain(self, labelled_data: list[dict]) -> dict:
        """Retrain model with new labelled samples + existing seed data."""
        new_df  = pd.DataFrame(labelled_data)
        seed_df = self._generate_seed_data(n=2000)
        combined = pd.concat([seed_df, new_df], ignore_index=True)
        metrics = self._train(combined)
        return metrics

    def model_info(self) -> dict:
        return self._meta

    # ── internals ──────────────────────────────────────────────────────────────

    def _load(self):
        self.model = xgb.XGBClassifier()
        self.model.load_model(str(MODEL_PATH))
        if META_PATH.exists():
            with open(META_PATH) as f:
                self._meta = json.load(f)
        self._init_explainer()
        logger.info(f"Model loaded from {MODEL_PATH}")

    def _train(self, df: pd.DataFrame) -> dict:
        X = df[FEATURES].fillna(0)
        y = df["failed"].astype(int)

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )

        scale_pos_weight = max(1, (y == 0).sum() / max((y == 1).sum(), 1))

        self.model = xgb.XGBClassifier(
            n_estimators=300,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            scale_pos_weight=scale_pos_weight,
            use_label_encoder=False,
            eval_metric="logloss",
            random_state=42,
            n_jobs=-1,
        )

        self.model.fit(
            X_train, y_train,
            eval_set=[(X_test, y_test)],
            verbose=False,
        )

        y_proba = self.model.predict_proba(X_test)[:, 1]
        y_pred  = (y_proba >= 0.5).astype(int)

        metrics = {
            "roc_auc":           round(roc_auc_score(y_test, y_proba), 4),
            "avg_precision":     round(average_precision_score(y_test, y_proba), 4),
            "precision":         round(precision_score(y_test, y_pred, zero_division=0), 4),
            "recall":            round(recall_score(y_test, y_pred, zero_division=0), 4),
            "f1":                round(f1_score(y_test, y_pred, zero_division=0), 4),
            "train_samples":     len(X_train),
            "test_samples":      len(X_test),
            "failure_rate":      round(float(y.mean()), 4),
        }

        self.model.save_model(str(MODEL_PATH))
        self._meta = {
            "version":      datetime.utcnow().strftime("%Y%m%d_%H%M%S"),
            "features":     FEATURES,
            "metrics":      metrics,
            "trained_at":   datetime.utcnow().isoformat(),
            "n_samples":    len(df),
        }
        with open(META_PATH, "w") as f:
            json.dump(self._meta, f, indent=2)

        self._init_explainer()
        logger.info(f"Model trained — AUC: {metrics['roc_auc']}, F1: {metrics['f1']}")
        return metrics

    def _init_explainer(self):
        if SHAP_AVAILABLE and self.model is not None:
            try:
                self._explainer = shap.TreeExplainer(self.model)
            except Exception as e:
                logger.warning(f"Could not init SHAP explainer: {e}")

    def _dict_to_frame(self, features: dict) -> pd.DataFrame:
        row = {f: features.get(f, 0) for f in FEATURES}
        # Derive time features if not explicitly provided
        if "hour_of_day" not in features:
            row["hour_of_day"] = datetime.utcnow().hour
        if "day_of_week" not in features:
            row["day_of_week"] = datetime.utcnow().weekday()
        return pd.DataFrame([row])[FEATURES].fillna(0)

    @staticmethod
    def _risk_level(proba: float) -> str:
        if proba < 0.25:  return "low"
        if proba < 0.50:  return "medium"
        if proba < 0.75:  return "high"
        return "critical"

    @staticmethod
    def _generate_seed_data(n: int = 3000) -> pd.DataFrame:
        """
        Synthetic training data that encodes realistic DevOps heuristics:
          - Long builds, high retry counts, recent failures → higher failure probability
          - Low test pass rates, large diffs, hotfixes → higher probability
          - Late-night / weekend deploys → slightly higher
        """
        rng = np.random.default_rng(42)

        df = pd.DataFrame({
            "build_duration":    rng.integers(30, 1800, n),
            "build_status":      rng.integers(0, 2, n),
            "deploy_status":     rng.integers(0, 2, n),
            "commit_sha_len":    rng.integers(7, 40, n),
            "retry_count":       rng.integers(0, 5, n),
            "test_pass_rate":    rng.uniform(0.5, 1.0, n),
            "files_changed":     rng.integers(1, 200, n),
            "lines_added":       rng.integers(0, 5000, n),
            "lines_deleted":     rng.integers(0, 3000, n),
            "hour_of_day":       rng.integers(0, 24, n),
            "day_of_week":       rng.integers(0, 7, n),
            "is_hotfix":         rng.integers(0, 2, n),
            "image_size_mb":     rng.uniform(50, 2000, n),
            "pod_restart_count": rng.integers(0, 20, n),
            "cpu_request_ratio": rng.uniform(0.1, 3.0, n),
            "mem_request_ratio": rng.uniform(0.1, 3.0, n),
        })

        # Compute a realistic failure probability based on feature values
        score = (
              0.25 * df["build_status"]
            + 0.20 * df["deploy_status"]
            + 0.10 * (df["retry_count"] / 5)
            + 0.10 * (1 - df["test_pass_rate"])
            + 0.08 * (df["build_duration"] / 1800)
            + 0.06 * (df["pod_restart_count"] / 20)
            + 0.05 * df["is_hotfix"]
            + 0.04 * np.where((df["hour_of_day"] < 6) | (df["hour_of_day"] > 22), 1, 0)
            + 0.04 * np.where(df["day_of_week"] >= 5, 1, 0)
            + 0.04 * (df["files_changed"] / 200).clip(0, 1)
            + 0.02 * (df["image_size_mb"] / 2000)
            + 0.02 * ((df["cpu_request_ratio"] - 1).abs() / 2)
        )

        # Add noise and threshold at 0.45 to get binary label
        noise = rng.normal(0, 0.05, n)
        df["failed"] = ((score + noise) > 0.45).astype(int)

        return df
