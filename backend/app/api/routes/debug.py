from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.core.config import settings

try:
    from google import genai
    USE_GENAI_CLIENT = True
except ImportError:
    import google.generativeai as genai
    USE_GENAI_CLIENT = False
    genai.configure(api_key=settings.GEMINI_API_KEY)

client = genai.Client(api_key=settings.GEMINI_API_KEY) if USE_GENAI_CLIENT else None

router = APIRouter()


class DebugPayload(BaseModel):
    model: str | None = None
    prompt: str | None = "Say hello"


def _normalize_model_name(model_name: str) -> str:
    if model_name.startswith("models/") or model_name.startswith("tunedModels/"):
        return model_name
    return f"models/{model_name}"


def _try_model(model: str, prompt: str):
    try:
        if USE_GENAI_CLIENT and client is not None:
            resp = client.models.generate_content(model=model, contents=prompt)
        else:
            resp = genai.generate_text(model=model, prompt=prompt)
        text = getattr(resp, "text", None) or getattr(resp, "output", None) or str(resp)
        return {"model": model, "success": True, "text": text, "raw": str(resp)}
    except Exception as e:
        return {"model": model, "success": False, "error": str(e)}


@router.post("/genai-test")
def genai_test(payload: DebugPayload):
    """Test calling the configured Gemini/Generative AI model.

    Returns raw response or an error message to help diagnose API key/model access.
    """
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        raise HTTPException(status_code=400, detail="GEMINI_API_KEY is not configured in the backend environment")

    prompt = payload.prompt or "Say hello"
    requested_model = payload.model or "gemini-3.5-flash-lite"
    normalized_model = _normalize_model_name(requested_model)

    primary_result = _try_model(normalized_model, prompt)
    if primary_result["success"]:
        return primary_result

    fallback_models = [
        _normalize_model_name(settings.GEMINI_MODEL),
        _normalize_model_name("gemini-3.6-flash"),
        _normalize_model_name("gemini-3.5-flash-lite"),
        _normalize_model_name("gemini-3.5-flash"),
        _normalize_model_name("gemini-3.1-flash-lite"),
    ]
    tried = [primary_result]
    for model in fallback_models:
        if model == normalized_model:
            continue
        result = _try_model(model, prompt)
        tried.append(result)
        if result["success"]:
            return {"message": "Requested model failed, but fallback succeeded.", "tried": tried, "working_model": model, "text": result.get("text"), "raw": result.get("raw")}

    raise HTTPException(status_code=500, detail={"message": "No model succeeded.", "tried": tried})


