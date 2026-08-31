# Load environment variables first
from dotenv import load_dotenv

load_dotenv()


from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import BACKEND_PATH_PREFIX, IS_DEBUG_ENABLED
from routes import (
    capabilities,
    screenshot,
    generate_code,
    home,
    evals,
    export,
    design_systems,
    prompt_reports,
    agent_runs,
    eval_sets,
)
from uploaded_assets import configure_uploaded_asset_routes


async def log_debug_mode() -> None:
    debug_status = "ENABLED" if IS_DEBUG_ENABLED else "DISABLED"
    print(f"Backend startup complete. Debug mode is {debug_status}.")


async def probe_screenshot_preview_on_startup() -> None:
    # Detect (and warm up) headless Chromium so the screenshot_preview tool is
    # only offered when it can actually run. Logs the outcome.
    from preview_screenshot import probe_screenshot_preview

    await probe_screenshot_preview()


ROUTERS = (
    generate_code.router,
    screenshot.router,
    home.router,
    capabilities.router,
    evals.router,
    export.router,
    design_systems.router,
    prompt_reports.router,
    agent_runs.router,
    eval_sets.router,
)


def create_route_app() -> FastAPI:
    route_app = FastAPI(openapi_url=None, docs_url=None, redoc_url=None)
    configure_uploaded_asset_routes(route_app)
    for router in ROUTERS:
        route_app.include_router(router)
    return route_app


def create_app(path_prefix: str = BACKEND_PATH_PREFIX) -> FastAPI:
    route_app = create_route_app()
    application = route_app
    if path_prefix:
        application = FastAPI(openapi_url=None, docs_url=None, redoc_url=None)
        application.mount(path_prefix, route_app)
    application.add_event_handler("startup", log_debug_mode)
    application.add_event_handler("startup", probe_screenshot_preview_on_startup)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    return application


app = create_app()
