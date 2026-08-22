"""
Celery app — moves AI inference off the API process. Before this, a job ran
inline (via FastAPI BackgroundTasks) inside the same event loop serving every
other request, so one inference job blocked the entire API for every user
until it finished. A separate worker process picks these up instead.

Job status/results live in Postgres (the AIJob row itself), not Celery's
result backend — there's nothing else worth persisting in Redis.
"""
from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "marineannotate",
    broker=settings.REDIS_URL,
    # `include` is imported lazily by Celery's loader (on worker startup),
    # not at construction time — that's what lets inference.py import
    # `celery_app` back from here without a circular-import failure.
    include=["app.services.inference"],
)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    task_ignore_result=True,
    worker_max_tasks_per_child=10,  # recycle workers — torch/YOLO can leak memory across many jobs
    broker_connection_retry_on_startup=True,
)
