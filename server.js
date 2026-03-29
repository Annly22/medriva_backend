import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

////////////////////////////////////////////////////////
// 🧠 HELPER FUNCTIONS
////////////////////////////////////////////////////////

function calculateBMI(heightCm, weightKg) {
  if (!heightCm || !weightKg) return 0;
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

function normalize(val, min, max) {
  return (val - min) / (max - min);
}

////////////////////////////////////////////////////////
// 🧠 SMART RISK MODEL (NO DB)
////////////////////////////////////////////////////////

function predictHeartRisk(user, vitals) {
  return new Promise((resolve) => {
    const age = user.age;
    const height = user.height;
    const weight = user.weight;

    const heartRate =
      vitals.heart_rate !== null && vitals.heart_rate !== undefined
        ? vitals.heart_rate
        : 80;

    const steps =
      vitals.steps !== null && vitals.steps !== undefined
        ? vitals.steps
        : 2000;

    const bmi = calculateBMI(height, weight);

    ////////////////////////////////////////////////////////
    // 📊 NORMALIZATION
    ////////////////////////////////////////////////////////

    const ageN = normalize(age, 20, 65);
    const bmiN = normalize(bmi, 18, 30);
    const hrN = normalize(heartRate, 70, 125);
    const stepsN = normalize(steps, 0, 5000);

    ////////////////////////////////////////////////////////
    // 🧠 WEIGHTED SCORING
    ////////////////////////////////////////////////////////

    let risk =
      ageN * 15 +
      bmiN * 25 +
      hrN * 25 +
      (1 - stepsN) * 30;

    ////////////////////////////////////////////////////////
    // 🎯 INTERACTIONS
    ////////////////////////////////////////////////////////

    if (bmi > 26 && steps < 3000) risk += 8;
    if (heartRate > 100 && steps < 2000) risk += 10;
    if (age > 50 && bmi > 25) risk += 6;

    ////////////////////////////////////////////////////////
    // ⚖️ MICRO DIFFERENCE BOOST
    ////////////////////////////////////////////////////////

    risk += (bmi % 1) * 6;
    risk += (heartRate % 7);
    risk += (steps % 300) / 50;

    ////////////////////////////////////////////////////////
    // 🎲 RANDOMNESS
    ////////////////////////////////////////////////////////

    risk += Math.random() * 5;

    ////////////////////////////////////////////////////////
    // 🔒 FINAL SCALE
    ////////////////////////////////////////////////////////

    risk = Math.min(100, Math.max(0, Math.round(risk)));

    resolve({
      risk_probability: risk
    });
  });
}

////////////////////////////////////////////////////////
// 🧠 RISK ENGINE
////////////////////////////////////////////////////////

async function evaluateRisk(user, vitals) {
  let score = 0;

  if (vitals.steps < 3000) score++;
  if (vitals.heart_rate && vitals.heart_rate > 95) score++;
  if (calculateBMI(user.height, user.weight) > 25) score++;

  const ml = await predictHeartRisk(user, vitals);
  const probability = ml.risk_probability;

  const reasons = [];

  if (vitals.steps < 3000) reasons.push("Low daily activity");
  if (vitals.heart_rate == null) reasons.push("Missing heart rate data");
  if (calculateBMI(user.height, user.weight) > 25)
    reasons.push("High BMI");
  if (calculateBMI(user.height, user.weight) < 18.5)
    reasons.push("Low BMI");

  let insight = "";

  if (probability > 75) {
    insight =
      "High cardiovascular risk. Immediate lifestyle changes recommended.";
  } else if (probability > 45) {
    insight =
      "Moderate risk. Increase activity and monitor vitals.";
  } else {
    insight = "Low risk. Maintain current lifestyle.";
  }

  return {
    score,
    probability,
    level:
      probability > 75
        ? "High"
        : probability > 45
        ? "Moderate"
        : "Low",
    reasons,
    insight
  };
}

////////////////////////////////////////////////////////
// 🌐 API ROUTE
////////////////////////////////////////////////////////

app.get("/analyse-health/:id", async (req, res) => {
  try {
    ////////////////////////////////////////////////////////
    // 🔁 HARDCODED DATA (SIMULATED USER)
    ////////////////////////////////////////////////////////

    const user = {
      id: req.params.id,
      age: 21,
      sex: "Female",
      height: 152,
      weight: 45
    };

    const vitals = {
      heart_rate: null,
      steps: 741
    };

    ////////////////////////////////////////////////////////

    const risk = await evaluateRisk(user, vitals);

    res.json({
      user,
      vitals,
      risk
    });

  } catch (err) {
    console.error("ERROR:", err);

    res.status(500).json({
      error: err.message || "Server error"
    });
  }
});

////////////////////////////////////////////////////////
// 🟢 ROOT ROUTE (IMPORTANT FOR RAILWAY)
////////////////////////////////////////////////////////

app.get("/", (req, res) => {
  res.send("Backend running ✅");
});


////////////////////////////////////////////////////////
// 🚀 SERVER START
////////////////////////////////////////////////////////

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});