from fastapi import FastAPI
import joblib
import numpy as np

app = FastAPI()

# Load your model
model = joblib.load("ai/heart_model.pkl")

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