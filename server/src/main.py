from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from src.core.database import init_db
from src.api.repositories import repo_router
from src.api.commits import commit_router
from src.api.branches import branch_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(title="git-visualizer", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://127.0.0.1:8000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(repo_router, prefix=f"/repositories", tags = ["repositories"])
app.include_router(commit_router, prefix="/repositories", tags=["commits"])
app.include_router(branch_router, prefix="/repositories", tags=["branches"])

@app.get("/")
async def root():
    return {"message": "running"}
