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

# 配置 CORS
# 允许任何来源访问 backend
# Hackathon demo 阶段这样最方便
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

<<<<<<< HEAD
=======
AGNIC_TOKEN = os.getenv("AGNIC_TOKEN")
# ADDED: Safety check. Backend will stop clearly if token is missing.
if not AGNIC_TOKEN:
    raise ValueError("Missing AGNIC_TOKEN. Please add it to backend/.env")
>>>>>>> d0c2f1c (Frontend and Backend Connection Achieved)

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

Your job:
1. Understand what the user is actually asking for.
2. If the user asks about groceries, food, meals, or fridge, provide a practical meal plan and grocery list.
3. If the user asks about energy, wellness, or health, provide health-based suggestions including adding/removing activities in calendar.
4. If the user asks something general, respond naturally as a helpful companion.
5. Do not force a meal plan unless the user clearly needs grocery or food help.
6. Keep the response concise, practical, and personalized.

When creating a meal plan, choose the length naturally:
- urgent grocery refill = 1 to 3 days
- weekly planning = 7 days
- general suggestion = one simple recommendation

Keep the tone warm, practical, and concise.
"""

    url = "https://api.agnic.ai/v1/chat/completions"

    headers = {
<<<<<<< HEAD
        "X-Agnic-Token": os.getenv("AGNIC_TOKEN", ""),
=======
        "X-Agnic-Token": AGNIC_TOKEN, # to be changed to user's own token
        # UPDATED: Use the real token variable from .env.
        # Do NOT write "AGNIC_TOKEN" as a string.
>>>>>>> d0c2f1c (Frontend and Backend Connection Achieved)
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

    # ADDED: Print clean response in terminal for debugging.
    print("\n===== CLEAN AI RESPONSE =====\n")
    print(clean_reply)
    print("\n=============================\n")
    
    return {
        "status": "success",
        "user_message": request.message,
        "ai_response": clean_reply
    }
