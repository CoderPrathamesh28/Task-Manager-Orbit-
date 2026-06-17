import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.database import init_db
from app.routes import auth, tasks

app = FastAPI(
    title="Task Manager API",
    description="Full-stack Task Management API with JWT Auth and WebSockets",
    version="1.0.0"
)

# CORS Configuration
# Useful if running frontend dev server separately in the future
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(auth.router)
app.include_router(tasks.router)

@app.on_event("startup")
def startup_event():
    # Initialize SQLite database
    init_db()

# Resolve absolute path for static files to avoid path issues
current_dir = os.path.dirname(os.path.abspath(__file__))
static_dir = os.path.join(current_dir, "static")

# Ensure static directory exists
os.makedirs(static_dir, exist_ok=True)

# Mount the static directory for the Single Page App (SPA)
# This serves index.html at root (/) automatically
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
