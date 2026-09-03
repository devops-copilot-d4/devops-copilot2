# Training Data

Place labelled CSV files here for retraining. Required columns:

| Column             | Type    | Description                                |
|--------------------|---------|--------------------------------------------|
| build_duration     | float   | Build time in seconds                      |
| build_status       | int     | 0=success, 1=failed (previous build)       |
| deploy_status      | int     | 0=success, 1=failed (previous deploy)      |
| commit_sha_len     | int     | Length of commit SHA                       |
| retry_count        | int     | Number of CI retries                       |
| test_pass_rate     | float   | Test pass rate 0.0–1.0                     |
| files_changed      | int     | Files changed in commit                    |
| lines_added        | int     | Lines added                                |
| lines_deleted      | int     | Lines deleted                              |
| hour_of_day        | int     | Hour of deployment (0–23)                  |
| day_of_week        | int     | Day of week (0=Mon … 6=Sun)                |
| is_hotfix          | int     | 1 if hotfix branch                         |
| image_size_mb      | float   | Docker image size in MB                    |
| pod_restart_count  | int     | Prior pod restart count                    |
| cpu_request_ratio  | float   | Actual/requested CPU                       |
| mem_request_ratio  | float   | Actual/requested memory                    |
| **failed**         | **int** | **Ground truth: 0=success, 1=failure**     |

Use `POST /train` with a JSON body to retrain:
```json
{
  "samples": [ { ...row... }, ... ]
}
```
