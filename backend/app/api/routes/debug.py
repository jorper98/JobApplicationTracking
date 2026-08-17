from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.core.config import settings
from app.services.ai_service import (
    _get_model_candidates,
    _normalize_model_name,
    generate_with_model,
)

router = APIRouter()


class DebugPayload(BaseModel):
    model: str | None = None
    prompt: str | None = "Say hello"


@router.post("/genai-test")
def genai_test(payload: DebugPayload):
    """Test calling the configured Gemini/Generative AI model.

    Returns raw response or an error message to help diagnose API key/model access.
    """
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        raise HTTPException(status_code=400, detail="GEMINI_API_KEY is not configured in the backend environment")

    prompt = payload.prompt or "Say hello"
    requested_model = _normalize_model_name(payload.model or settings.GEMINI_MODEL)
    candidates = [requested_model] + [m for m in _get_model_candidates() if m != requested_model]

    tried = []
    for model in candidates:
        text = generate_with_model(model, prompt)
        result = {"model": model, "success": bool(text), "text": text or "no output"}
        tried.append(result)
        if result["success"]:
            if model == requested_model:
                return result
            return {"message": "Requested model failed, but fallback succeeded.", "tried": tried, "working_model": model, "text": text}

    raise HTTPException(status_code=500, detail={"message": "No model succeeded.", "tried": tried})
