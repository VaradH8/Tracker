from fastapi import FastAPI

app = FastAPI(title="Project Tracker", version="0.1.0")


@app.get("/api/v1/ping")
def ping() -> dict[str, str]:
    return {"status": "ok"}
