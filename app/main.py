import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app import db as db_mod
from app.routes import router, COOKIE_NAME

BASE_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = BASE_DIR / "frontend" / "dist"

# Google OAuth callback (real mode) — must be defined before SPA fallback
OAUTH_CALLBACK = "/api/v1/accounts/oauth/callback"


def create_app():
    app = FastAPI(title="Bucket Pribadi — Google Drive Pool")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    db_mod.init_db()
    app.include_router(router)

    @app.middleware("http")
    async def inject_session_cookie(request: Request, call_next):
        request.state.session_cookie = request.cookies.get(COOKIE_NAME)
        return await call_next(request)

    # Serve built SPA when present (single-process: UI + API on one port).
    if DIST_DIR.exists():
        app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

        @app.get("/{full_path:path}")
        async def spa_index(request: Request, full_path: str):
            # Let API + docs through; everything else -> index.html (SPA routing).
            if full_path.startswith("api") or full_path.startswith("docs") \
               or full_path.startswith("openapi") or full_path == "health":
                return JSONResponse({"detail": "not found"}, status_code=404)
            index = DIST_DIR / "index.html"
            return FileResponse(index)

    return app


app = create_app()
