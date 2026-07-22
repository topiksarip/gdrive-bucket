import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app import db as db_mod
from app.routes import router, COOKIE_NAME

BASE_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = BASE_DIR / "frontend" / "web-build"

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

    # Serve built SPA: static assets from web-build/assets, with index.html fallback.
    if DIST_DIR.exists():
        # Mount static assets first — takes priority over catch-all routes
        app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

        # SPA catch-all: serve index.html for any non-API path (client-side routing)
        @app.get("/{full_path:path}")
        async def spa_index(request: Request, full_path: str):
            # Let API, docs, and static assets through
            if full_path.startswith("api/") or full_path.startswith("docs") \
               or full_path.startswith("openapi") or full_path == "health":
                return JSONResponse({"detail": "not found"}, status_code=404)
            # Check if it's a real file in dist (favicon, manifest, etc.)
            file_path = DIST_DIR / full_path
            if full_path and file_path.is_file():
                return FileResponse(file_path)
            # SPA fallback: serve index.html
            return FileResponse(DIST_DIR / "index.html")

    return app


app = create_app()
