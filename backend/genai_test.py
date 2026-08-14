import os
import json
from google import genai
from dotenv import load_dotenv

# Load .env from backend folder
here = os.path.dirname(__file__)
env_path = os.path.join(here, '.env')
if os.path.exists(env_path):
    load_dotenv(env_path)

API_KEY = os.getenv('GEMINI_API_KEY')
if not API_KEY:
    print('GEMINI_API_KEY not found in .env')
    raise SystemExit(1)

client = genai.Client()

RAW_MODEL = 'gemini-3.6-flash'
MODEL = RAW_MODEL if RAW_MODEL.startswith('models/') or RAW_MODEL.startswith('tunedModels/') else f'models/{RAW_MODEL}'
PROMPT = 'Write a single sentence: "Hello from Gemini".'

print('Testing model:', MODEL)
try:
    resp = client.models.generate_content(model=MODEL, contents=PROMPT)
    # Try to extract text
    text = getattr(resp, 'text', None) or getattr(resp, 'output', None) or str(resp)
    print('Response type:', type(resp))
    print('Raw response:', resp)
    print('Extracted text:', text)
except Exception as e:
    print('Error calling model:', repr(e))
    raise


