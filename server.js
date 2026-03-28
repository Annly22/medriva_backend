import express from "express";
import cors from "cors";
import { execFile } from "child_process";

const app = express();
app.use(cors());
app.use(express.json());

////////////////////////////////////////////////////////
// 🚀 START SERVER FIRST (VERY IMPORTANT)
////////////////////////////////////////////////////////

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});

////////////////////////////////////////////////////////
// 🤖 PYTHON ML CALL
////////////////////////////////////////////////////////

function predictHeartRisk(features) {
  return new Promise((resolve, reject) => {
    execFile("python3", ["./ai/predict.py", ...features.map(String)], (error, stdout, stderr) => {

      console.log("STDOUT:", stdout);
      console.log("STDERR:", stderr);

      if (error) {
        console.error("ERROR:", error);
        return reject(error);
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    });
  });
}

////////////////////////////////////////////////////////
// 🧠 RISK ENGINE
////////////////////////////////////////////////////////

async function evaluateRisk(user) {
  let score = 0;

  if (user.bmi > 25) score++;
  if (user.heartRate > 90) score++;
  if (user.steps < 4000) score++;

  const ml = await predictHeartRisk([
    user.age,
    user.gender,
    user.bmi,
    user.heartRate,
    user.activityDays,
    user.steps
  ]);

  return {
    score,
    probability: ml.risk_probability
  };
}

////////////////////////////////////////////////////////
// 🌐 API ROUTE
////////////////////////////////////////////////////////

app.get("/analyse-health/:id", async (req, res) => {
  try {
    const user = {
      age: 40,
      gender: 1,
      bmi: 26,
      heartRate: 85,
      activityDays: 5,
      steps: 3500
    };

    const risk = await evaluateRisk(user);

    res.json({
      vitals: user,
      risk
    });

  } catch (err) {
    console.error("REAL ERROR:", err);

    res.status(500).json({
      error: err.message || "Server error"
    });
  }
});