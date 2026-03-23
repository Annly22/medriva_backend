////////////////////////////////////////////////////////
// 🧠 MEDRIVA AI RISK ENGINE
////////////////////////////////////////////////////////

import { execFile } from "child_process";
import path from "path";

////////////////////////////////////////////////////////
// 🤖 CALL PYTHON MODEL
////////////////////////////////////////////////////////

export function predictHeartRisk(features) {
  return new Promise((resolve, reject) => {
    const script = path.join(process.cwd(), "ai/predict.py");

    execFile("python", [script, ...features.map(String)], (error, stdout) => {
      if (error) {
        console.error("AI prediction error:", error);
        return reject(error);
      }

      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (err) {
        console.error("Invalid AI output:", stdout);
        reject(err);
      }
    });
  });
}

////////////////////////////////////////////////////////
// ❤️ RISK EVALUATION
////////////////////////////////////////////////////////

export async function evaluateRisk({
  age,
  sex,
  height,
  weight,
  heartRate,
  sleepHours,
  steps
}) {

  let flags = [];
  let riskScore = 0;

  //////////////////////////////////////////////////////
  // BMI CALCULATION
  //////////////////////////////////////////////////////

  let bmi = null;

  if (height && weight) {
    const heightMeters = Number(height) / 100;
    const weightKg = Number(weight);
    bmi = Number((weightKg / (heightMeters * heightMeters)).toFixed(2));
  }

  console.log("BMI:", bmi);

  //////////////////////////////////////////////////////
  // HEART RATE CHECK
  //////////////////////////////////////////////////////

  if (heartRate && heartRate > 100) {
    flags.push("Elevated Heart Rate");
    riskScore += 2;
  }

  //////////////////////////////////////////////////////
  // ACTIVITY CHECK
  //////////////////////////////////////////////////////

  if (steps !== null && steps < 2000) {
    flags.push("Low Physical Activity");
    riskScore += 1;
  }

  //////////////////////////////////////////////////////
  // BMI CHECK
  //////////////////////////////////////////////////////

  if (bmi && bmi > 30) {
    flags.push("High BMI");
    riskScore += 2;
  }

  //////////////////////////////////////////////////////
  // AI PREDICTION
  //////////////////////////////////////////////////////

  let aiPrediction = null;

  try {
const safeSleep =
  sleepHours === null || sleepHours === undefined
    ? 0   // send 0 → Python treats as missing
    : Number(sleepHours);

  aiPrediction = await predictHeartRisk([
  Number(age) || 40,
  Number(sex) || 1,
  Number(bmi) || 25,
  Number(heartRate) || 80,
  Number(safeSleep) || 0,
  Number(steps) || 5000

]);
    console.log("AI Prediction:", aiPrediction);

  } catch (err) {
    console.log("AI prediction failed");
  }

  //////////////////////////////////////////////////////
  // FINAL RISK LEVEL (IMPROVED LOGIC)
  //////////////////////////////////////////////////////

  let riskLevel = "LOW";

if (aiPrediction) {
  const prob = aiPrediction.risk_probability;

  if (prob > 0.6) {
    riskLevel = "HIGH";
  } else if (prob > 0.25) {
    riskLevel = "MODERATE";
  } else {
    riskLevel = "LOW";
  }
}

  //////////////////////////////////////////////////////
  // OPTIONAL: EXPLANATION (VERY USEFUL)
  //////////////////////////////////////////////////////

  let reason = [...flags];

  if (aiPrediction?.prediction === 1) {
    reason.push("AI detected elevated cardiovascular risk");
  }

  reason = [...new Set(reason)];

  //////////////////////////////////////////////////////
  // RETURN RESULT
  //////////////////////////////////////////////////////

  return {
  riskLevel,
  riskScore,
  bmi,
  flags,
  reason,
  aiPrediction,
  aiRiskLevel: aiPrediction
    ? (aiPrediction.risk_probability > 0.6
        ? "HIGH"
        : aiPrediction.risk_probability > 0.3
        ? "MODERATE"
        : "LOW")
    : null
};
}