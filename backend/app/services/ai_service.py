import json
from app.core.config import settings
import httpx
from bs4 import BeautifulSoup

try:
    from google.api_core.exceptions import GoogleAPIError
except ImportError:
    GoogleAPIError = Exception

try:
    from google import genai
    USE_GENAI_CLIENT = True
except ImportError:
    import google.generativeai as genai
    USE_GENAI_CLIENT = False

client = None
if USE_GENAI_CLIENT and hasattr(genai, "Client"):
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
else:
    genai.configure(api_key=settings.GEMINI_API_KEY)

# Normalize a model name to an API-compatible form.
def _normalize_model_name(model_name: str) -> str:
    if model_name.startswith("models/") or model_name.startswith("tunedModels/"):
        return model_name
    return f"models/{model_name}"

# Try a set of candidate model names (order matters). If one isn't available for the account
# the code will try the next one instead of failing with a 404.
MODEL_CANDIDATES = [
    _normalize_model_name(settings.GEMINI_MODEL),
    _normalize_model_name("gemini-3.6-flash"),
    _normalize_model_name("gemini-3.5-flash-lite"),
    _normalize_model_name("gemini-3.5-flash"),
    _normalize_model_name("gemini-3.1-flash-lite"),
]


def _get_response_text(response) -> str:
    if response is None:
        return ""
    return getattr(response, "text", "") or getattr(response, "output", "") or ""


def _generate_text(prompt: str) -> str:
    last_exc = None
    for model_name in MODEL_CANDIDATES:
        try:
            if USE_GENAI_CLIENT and client is not None:
                response = client.models.generate_content(model=model_name, contents=prompt)
            else:
                response = genai.generate_text(model=model_name, prompt=prompt)
            text = _get_response_text(response).strip()
            if text:
                print(f"AI generation succeeded with model: {model_name}")
                return text
        except GoogleAPIError as exc:
            # Log and try the next model candidate
            print(f"AI generation failed for {model_name}:", exc)
            last_exc = exc
        except Exception as exc:
            # Non-Google errors (httpx, parsing, etc.) — log and continue trying
            print(f"Unexpected error when calling model {model_name}:", exc)
            last_exc = exc

    # If we reach here, all candidates failed — log the last exception and return empty string
    if last_exc is not None:
        print("AI generation failed (all model candidates):", last_exc)
    return ""


def _generate_json(prompt: str):
    text = _generate_text(prompt)
    if not text:
        return None
    try:
        cleaned = text.replace("```json", "").replace("```", "").strip()
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        print("JSON parse failed for AI response:", exc, "response:", text)
        return None


def extract_skills_from_job(job_description: str) -> dict:
    prompt = f"""Analyze this job description and extract structured data.

Job Description:
{job_description}

Return ONLY a JSON object with this exact structure (no markdown, no extra text):
{{
  "skills": ["skill1", "skill2"],
  "requirements": ["requirement1"],
  "nice_to_have": ["nice1"],
  "experience_years": 2,
  "role_level": "junior|mid|senior|lead",
  "remote": true
}}"""

    result = _generate_json(prompt)
    return result if result is not None else {
        "skills": [],
        "requirements": [],
        "nice_to_have": [],
        "experience_years": 0,
        "role_level": "mid",
        "remote": False,
    }


def extract_skills_from_resume(resume_text: str) -> list:
    prompt = f"""Extract all technical and professional skills from this resume.

Resume:
{resume_text[:4000]}

Return ONLY a JSON array, no markdown, no extra text:
["skill1", "skill2", "skill3"]"""

    result = _generate_json(prompt)
    return result if isinstance(result, list) else []


def analyze_match(resume_text: str, job_description: str, job_skills: list) -> dict:
    prompt = f"""You are an expert resume analyst. Compare this resume against the job description.

RESUME:
{resume_text[:3000]}

JOB DESCRIPTION:
{job_description[:2000]}

JOB REQUIRED SKILLS: {json.dumps(job_skills)}

Return ONLY a JSON object (no markdown):
{{
  "match_score": 75,
  "matching_skills": ["Python", "Git"],
  "missing_skills": ["Docker", "Kubernetes"],
  "resume_suggestions": [
    "Highlight your FastAPI REST API projects"
  ],
  "summary": "Strong Python background, but missing containerization experience"
}}"""

    result = _generate_json(prompt)
    return result if isinstance(result, dict) else {
        "match_score": 0,
        "matching_skills": [],
        "missing_skills": [],
        "resume_suggestions": [],
        "summary": "No match information available at this time.",
    }


def generate_cover_letter(resume_text: str, job_title: str, company: str, job_description: str) -> str:
    prompt = f"""Write a compelling, personalized cover letter for this job application.

APPLICANT RESUME:
{resume_text[:2500]}

JOB TITLE: {job_title}
COMPANY: {company}
JOB DESCRIPTION:
{job_description[:1500]}

Write a professional cover letter (3-4 paragraphs). Be specific and connect resume skills to job requirements. Return only the cover letter text."""

    text = _generate_text(prompt)
    return text if text else "Unable to generate a cover letter at this time."

def fetch_job_from_url(url: str) -> str:
    """Fetch a job posting URL and return cleaned readable text."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    }
    try:
        resp = httpx.get(url, headers=headers, timeout=15, follow_redirects=True)
        resp.raise_for_status()
    except Exception as e:
        raise ValueError(f"Could not fetch the URL: {e}")

    soup = BeautifulSoup(resp.text, "html.parser")

    for tag in soup(["script", "style", "nav", "footer", "header", "noscript"]):
        tag.decompose()

    text = soup.get_text(separator="\n")
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    cleaned = "\n".join(lines)

    if len(cleaned) < 100:
        raise ValueError("Page returned too little text — it may require login or block scraping.")

    return cleaned[:8000]


def extract_job_from_text(page_text: str) -> dict:
    """Use AI to pull structured job info from scraped page text."""
    prompt = f"""Below is the raw text of a job posting web page. Extract the job details.

PAGE TEXT:
{page_text}

Return ONLY a JSON object (no markdown):
{{
  "title": "job title",
  "company": "company name",
  "location": "location or null",
  "description": "a clean 2-4 paragraph summary of the role and requirements",
  "skills": ["skill1", "skill2"]
}}

If you cannot find a field, use null. Extract real skills mentioned in the posting."""

    result = _generate_json(prompt)
    return result if isinstance(result, dict) else {
        "title": None,
        "company": None,
        "location": None,
        "description": None,
        "skills": [],
    }


