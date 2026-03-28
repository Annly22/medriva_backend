from fastapi import FastAPI
import joblib
import numpy as np
import os

app = FastAPI()

# Fix path for Railway
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "ai", "heart_model.pkl")

model = joblib.load(MODEL_PATH)

@app.get("/")
def home():
    return {"message": "ML API running"}

@app.get("/predict")
def predict(
    age: int,
    gender: int,
    bmi: float,
    heartRate: int,
    activityDays: int,
    steps: int
):
    features = np.array([[age, gender, bmi, heartRate, activityDays, steps]])
    
    prediction = model.predict(features)[0]
    probability = model.predict_proba(features)[0][1]

    return {
        "prediction": int(prediction),
        "risk_probability": float(probability)
    }