import os
import json
import requests
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Simone AI Companion Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

AGNIC_TOKEN = os.getenv("AGNIC_TOKEN")
DATA_PATH = Path(__file__).parent / "data" / "mock_health_data.json"


class ChatRequest(BaseModel):
    message: str


@app.get("/")
def home():
    return {
        "status": "running",
        "message": "Simone AI Companion backend is running"
    }


@app.get("/health-data")
def get_health_data():
    with open(DATA_PATH, "r", encoding="utf-8") as file:
        health_data = json.load(file)

    return health_data


@app.post("/chat")
def chat(request: ChatRequest):
    with open(DATA_PATH, "r", encoding="utf-8") as file:
        health_data = json.load(file)

    prompt = f"""
You are Simone, a personal AI companion.

The user typed this message:
"{request.message}"

Here is the user's current mock health and fridge context:

{json.dumps(health_data, indent=2)}

The user likely needs help because they ran out of groceries.

Return your answer in this exact structure:

1. Short understanding:
Briefly explain what the user needs.

2. 3-day meal plan:
Create a simple 3-day meal plan with breakfast, lunch, dinner, and one snack.

3. Recommendations:
Give 3 practical recommendations based on the user's low energy, beginner cooking skill, and goal to eat healthier.

4. Grocery list:
Group the grocery list by category:
- Protein
- Vegetables
- Fruits
- Carbs
- Dairy / Alternatives
- Pantry

Keep the tone warm, practical, and concise.
Do not suggest extreme dieting.
"""

    url = "https://api.agnic.ai/v1/chat/completions"

    headers = {
        "X-Agnic-Token": "AGNIC_TOKEN", # to be changed to user's own token
        "Content-Type": "application/json"
    }

    payload = {
        "model": "openai/gpt-4o-mini",
        "messages": [
            {
                "role": "user",
                "content": prompt
            }
        ]
    }

    response = requests.post(url, headers=headers, json=payload)

    ai_result = response.json()
    clean_reply = ai_result["choices"][0]["message"]["content"]

    print("CLEAN AI RESPONSE:")
    print(clean_reply)

    return {
        "status": "success",
        "user_message": request.message,
        "ai_response": clean_reply
    }
