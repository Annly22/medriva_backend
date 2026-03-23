import sys
import joblib
import os
import json
import pandas as pd

try:
    # ---------------------------------------------------
    # LOAD MODEL
    # ---------------------------------------------------
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    model_path = os.path.join(BASE_DIR, "heart_model.pkl")

    saved = joblib.load(model_path)
    model = saved["model"]
    features = saved["features"]

    # ---------------------------------------------------
    # INPUT / TEST MODE
    # ---------------------------------------------------
    if len(sys.argv) >= 7:
        age = float(sys.argv[1])
        sex = float(sys.argv[2])
        bmi = float(sys.argv[3])
        heartRate = float(sys.argv[4])
        sleep_input = float(sys.argv[5])
        steps = float(sys.argv[6])

        # ✅ FIXED: Proper missing sleep handling
        if sleep_input == 0:
            sleep = 7            # neutral value
            sleep_missing = 1
        else:
            sleep = sleep_input
            sleep_missing = 0

        test_cases = [[age, sex, bmi, heartRate, sleep, steps, sleep_missing]]
        node_mode = True

    else:
        print("Running TEST MODE...\n")

        test_cases = [
            [25, 1, 22, 110, 8, 9000, 0],   # high HR but healthy lifestyle
            [70, 0, 24, 70, 7, 8000, 0],    # old but active
            [30, 1, 35, 65, 8, 10000, 0],   # high BMI but otherwise healthy
        ]
        node_mode = False

    # ---------------------------------------------------
    # FEATURE IMPORTANCE
    # ---------------------------------------------------
    if hasattr(model, "feature_importances_"):
        importance = model.feature_importances_
    else:
        importance = [0] * len(features)

    top_factors = [f for f, _ in sorted(
        zip(features, importance),
        key=lambda x: x[1],
        reverse=True
    )[:3]]

    # ---------------------------------------------------
    # PREDICTION
    # ---------------------------------------------------
    THRESHOLD = 0.4  # more sensitive for healthcare

    for case in test_cases:
        data = pd.DataFrame([case], columns=features)

        prob = float(model.predict_proba(data)[0][1])

        sleep_missing = case[-1]

        if sleep_missing == 1:
            pred = 1 if prob > 0.6 else 0
        else:
            pred = 1 if prob > THRESHOLD else 0

        if node_mode:
            print(json.dumps({
                "prediction": pred,
                "risk_probability": round(prob, 3),
                "top_factors": top_factors
            }))
        else:
            print("Input:", case)
            print("Prediction:", pred)
            print("Risk Probability:", round(prob, 3))
            print("Top Factors:", top_factors)
            print("-" * 40)

except Exception as e:
    print(json.dumps({
        "error": str(e)
    }))