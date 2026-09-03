# 🤖 DevOps Copilot
### AI-Driven Autonomous CI/CD Failure Prediction & Self-Healing Platform

> **Team D4** · Department of Computer Science and Engineering  
> Guide: Mrs. Sneha S, Assistant Professor

---

## 👥 Team

| Name | USN | Role |
|---|---|---|
| Tharun Gowda K | 4NI23CS230 | Backend, CI/CD, Requirement/SLO data model |
| Vikas S | 4NI23CS244 | Kubernetes, requirement-aware self-healing |
| Vishnu M | 4NI23CS249 | AI/LLM — Requirement Analyzer, RCA, Prediction, Explainability |
| Yashwanth P | 4NI23CS253 | Frontend, Monitoring, Traceability/Explainability UI |

---

## 📌 Overview

DevOps Copilot is an intelligent agent that sits inside your CI/CD pipeline and does three things autonomously:

1. **Predicts** deployment failures before they happen using an XGBoost ML model (16 features)  
2. **Explains** failures in plain English using a local LLM (Llama 3 / Gemma via Ollama)  
3. **Heals** the system automatically — restarts pods, rolls back deployments, scales replicas

The system integrates with **GitHub Actions**, **Docker**, **Kubernetes**, **Prometheus**, and **Grafana**, and is managed through a real-time **React dashboard**.

---

## 🏗️ Architecture

```
GitHub Push ──► GitHub Actions CI/CD ──► Docker Build ──► Kubernetes
                        │                                      │
                  Build Logs + SHA                    Runtime Logs + Metrics
                        │                                      │
                ◄────────────────── DevOps Copilot ───────────────────►
                        │                    │                  │
                  XGBoost Model         Ollama LLM        K8s API
                  (Failure Score)    (RCA + Explain)   (Self-Healing)
                        │
                  MongoDB (incidents, deployments, recovery history)
                        │
                  React Dashboard ◄──── Socket.IO (real-time)
                        │
                  Prometheus + Grafana (metrics + SLO monitoring)
```

---

## 🗂️ Project Structure

```
devops-copilot/
├── backend/                    # Node.js + Express API
│   ├── controllers/            # Route handlers
│   ├── models/                 # MongoDB schemas
│   ├── routes/                 # API routes
│   ├── services/               # K8s, LLM, Prometheus, GitHub, Socket.IO
│   ├── middleware/             # Auth (JWT), error handler
│   ├── config/                 # DB connection, Winston logger
│   └── server.js               # Express entrypoint
│
├── ai-service/                 # Python FastAPI + XGBoost
│   ├── core/
│   │   └── model_manager.py    # XGBoost lifecycle + SHAP explainability
│   ├── routers/
│   │   ├── predict.py          # POST /predict, POST /predict/batch
│   │   ├── train.py            # POST /train, GET /train/status
│   │   └── health.py           # GET /health
│   ├── models/                 # Persisted model files (gitignored)
│   ├── data/                   # Training CSV data
│   ├── main.py                 # FastAPI entrypoint
│   └── requirements.txt
│
├── frontend/                   # React + Vite + Tailwind CSS
│   └── src/
│       ├── pages/              # Dashboard, Deployments, Incidents,
│       │                       # Services, Recovery, Monitoring
│       ├── components/         # Layout, StatCard, StatusBadge, RiskBadge
│       ├── hooks/              # useSocket (Socket.IO)
│       ├── store/              # Zustand auth store
│       └── api/                # Axios client
│
├── k8s/                        # Kubernetes manifests
│   ├── app/                    # Backend, AI service, RBAC, Ingress
│   ├── prometheus/             # Prometheus deployment + config
│   └── grafana/                # Grafana deployment
│
├── .github/
│   └── workflows/
│       ├── deploy.yml          # Full CI/CD: lint → build → push → deploy
│       └── pr-checks.yml       # PR quality gate
│
└── docker-compose.yml          # Full local dev stack
```

---

## 🚀 Quick Start (Local Dev)

### Prerequisites
- Docker Desktop (with WSL2 on Windows) or Docker Engine on Linux
- `git`, `node >= 18`, `python >= 3.11`

### 1. Clone and configure

```bash
git clone https://github.com/devops-copilot-d4/devops-copilot.git
cd devops-copilot
cp .env.example .env
# Edit .env — set JWT_SECRET at minimum
```

### 2. Start everything with Docker Compose

```bash
docker compose up -d
```

This starts:
| Service | URL |
|---|---|
| React Dashboard | http://localhost:3000 |
| Backend API | http://localhost:5000 |
| AI Microservice | http://localhost:8000 |
| Ollama (LLM) | http://localhost:11434 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 (admin / devops2024) |

> **First start** takes ~5–10 min — Ollama pulls Llama 3 (~4 GB) and Gemma 7B.  
> Watch progress with: `docker compose logs -f ollama`

### 3. Register your first user

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","email":"admin@example.com","password":"Admin1234!","role":"admin"}'
```

Open http://localhost:3000 and log in.

---

## 🔧 Manual Setup (Without Docker)

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in MONGO_URI, JWT_SECRET, OLLAMA_URL
npm run dev            # starts on :5000
```

### AI Service

```bash
cd ai-service
python -m venv venv
venv\Scripts\activate      # Windows
# source venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

On first start the model trains automatically on synthetic data (~5 seconds).

### Frontend

```bash
cd frontend
npm install
npm run dev   # starts on :3000
```

### Ollama (LLM)

```bash
# Install from https://ollama.com
ollama pull llama3
ollama pull gemma:7b
ollama serve
```

---

## 🧠 AI & ML Modules

### XGBoost Failure Predictor (`ai-service/`)

Trained on **16 features** extracted from each deployment:

| Feature | Description |
|---|---|
| `build_duration` | Build time in seconds |
| `build_status` | Previous build result (0/1) |
| `deploy_status` | Previous deploy result (0/1) |
| `retry_count` | CI retry count |
| `test_pass_rate` | Fraction of passing tests |
| `files_changed` | Files in the commit |
| `lines_added/deleted` | Code churn |
| `hour_of_day` | Deployment hour (off-hours = riskier) |
| `day_of_week` | Weekend = higher failure rate |
| `is_hotfix` | Hotfix branch indicator |
| `image_size_mb` | Docker image size |
| `pod_restart_count` | Prior pod restarts |
| `cpu/mem_request_ratio` | Resource pressure indicators |

**SHAP explanations** show which features drove the prediction for each deployment.

**Retrain** with real data via `POST /train` once you've accumulated labelled history.

### Ollama LLM Integration (`backend/services/llm.service.js`)

Four specialised LLM calls — all running locally, no API keys needed:

| Function | Model | Purpose |
|---|---|---|
| `analyzeRootCause` | llama3 | Log → root cause JSON (+ severity, affected component) |
| `requirementToSLO` | llama3 | NL requirement → measurable SLO with PromQL |
| `explainRecoveryDecision` | gemma:7b | Plain-English justification for stakeholders |
| `predictFailure` | llama3 | Metric trend → breach prediction |

---

## 🔌 API Reference

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login (returns JWT) |
| GET | `/api/auth/github` | GitHub OAuth redirect |
| GET | `/api/auth/me` | Current user |

### Services
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/services` | List all services |
| POST | `/api/services` | Register a new service |
| GET | `/api/services/:id` | Service + live K8s status |
| GET | `/api/services/:id/logs` | Live pod logs |

### Deployments
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/deployments` | Deployment history |
| POST | `/api/deployments` | Trigger a deployment |
| GET | `/api/deployments/:id` | Status + live K8s state |

### AI
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/ai/rca` | Run root cause analysis on a deployment |
| POST | `/api/ai/slo/generate` | Convert requirement → SLO |
| GET | `/api/ai/incidents` | List incidents |
| GET | `/api/ai/health` | Ollama health check |

### Recovery
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/recovery` | Recovery action history |
| POST | `/api/recovery` | Trigger recovery action |
| PATCH | `/api/recovery/:id/approve` | Approve a high-impact action |

### Monitoring
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/monitoring/slos` | All SLOs + current status |
| POST | `/api/monitoring/slos/:id/check` | Re-evaluate SLO now |
| GET | `/api/monitoring/slos/:sloId/predict` | Predict SLO breach |
| GET | `/api/monitoring/health` | System health (Ollama/Prometheus/K8s) |

### AI Microservice (`:8000`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/predict` | Single deployment failure probability |
| POST | `/predict/batch` | Batch predictions (up to 100) |
| POST | `/train` | Retrain with labelled data |
| GET | `/train/status` | Model metrics |
| GET | `/features` | Feature schema |
| GET | `/health` | Service health |

---

## ☸️ Kubernetes Deployment

### Apply all manifests

```bash
# Create namespace first
kubectl apply -f k8s/namespace.yaml

# RBAC (ServiceAccount for self-healing)
kubectl apply -f k8s/app/rbac.yaml

# Secrets and config (edit configmap-secrets.yaml first!)
kubectl apply -f k8s/app/configmap-secrets.yaml

# Application deployments
kubectl apply -f k8s/app/backend-deployment.yaml
kubectl apply -f k8s/app/ai-service-deployment.yaml

# Monitoring
kubectl apply -f k8s/prometheus/prometheus-deployment.yaml
kubectl apply -f k8s/grafana/grafana-deployment.yaml

# Ingress
kubectl apply -f k8s/app/ingress.yaml
```

### Minikube quick start

```bash
minikube start --memory=8192 --cpus=4
minikube addons enable ingress
echo "$(minikube ip) devops-copilot.local" | sudo tee -a /etc/hosts
```

---

## 🔁 CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/deploy.yml`) has 5 stages:

```
Push to main
    │
    ├── backend-ci    (Node.js lint + test)
    ├── ai-ci         (Python lint + XGBoost smoke test)
    └── frontend-ci   (Vite build)
              │
              └── docker-build  (push images to GHCR)
                        │
                        └── deploy  (kubectl set image + rollout status)
                                │
                                └── notify  (POST to Copilot API)
```

### Required GitHub Secrets

| Secret | Description |
|---|---|
| `KUBECONFIG_B64` | Base64-encoded kubeconfig |
| `COPILOT_API_URL` | Your deployed Copilot API URL |
| `COPILOT_API_TOKEN` | JWT for the notification call |
| `COPILOT_SERVICE_ID` | MongoDB ObjectId of the target service |

---

## 🔴 Real-Time Events (Socket.IO)

Connect from any client and listen for:

| Event | Payload |
|---|---|
| `deployment:update` | `{ deploymentId, buildStatus, deployStatus, deployment }` |
| `incident:new` | `{ incidentId, rootCause, severity, xgboostScore }` |
| `incident:predicted` | `{ incidentId, prediction }` |
| `recovery:new` | `{ actionId, actionType, requiresApproval }` |
| `recovery:update` | `{ actionId, status, verified }` |

Subscribe to a specific service room:
```js
socket.emit('subscribe:service', serviceId);
```

---

## 🔮 Requirement → SLO Traceability

A key differentiator of this project — full traceability from business requirement to runtime verification:

```
Business Requirement (natural language)
    ↓  [POST /api/ai/slo/generate — Llama 3]
Service Level Objective (PromQL + threshold)
    ↓  [Prometheus polling every 15s]
Runtime Metric
    ↓  [Violation detected]
Incident (auto-opened)
    ↓  [LLM RCA]
Recovery Action
    ↓  [SLO re-check after recovery]
Requirement Verified ✓
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 20, Express 4, MongoDB 7, Socket.IO |
| AI / ML | Python 3.11, FastAPI, XGBoost 2.0, SHAP, scikit-learn |
| LLM | Ollama (Llama 3, Gemma 7B) — local, no API key |
| Frontend | React 18, Vite, Tailwind CSS, Recharts, Zustand |
| Kubernetes | @kubernetes/client-node, Minikube / Kind |
| Monitoring | Prometheus, Grafana |
| CI/CD | GitHub Actions, GHCR (container registry) |
| Auth | JWT + GitHub OAuth (passport-github2) |

---

## 📄 License

MIT © 2025 Team D4 — 4NI23CS Batch
