# QSAR Backend

This directory contains the FastAPI backend that runs the real `qsarmodelingpy` pipeline behind the frontend.

Endpoints
- POST /load -> multipart upload with `matrix_file` and `vector_file`
- POST /sessions/{sessionId}/filters -> JSON `FilterSettings`
- POST /sessions/{sessionId}/selection -> JSON `{ filterSettings, selectionSettings }`
- POST /sessions/{sessionId}/validate -> JSON `{ validationSettings }`
- POST /sessions/{sessionId}/pipeline -> JSON `{ filterSettings, selectionSettings, validationSettings }`

Run locally (using `uv`):

```bash
# sync dependencies for the backend workspace
uv sync

# run the server (development)
uv run uvicorn app:app --reload --host 127.0.0.1 --port 27051
```

The frontend expects the backend at `http://127.0.0.1:27051`.
