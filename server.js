import express from "express";
import cors from "cors";
import { execFile } from "child_process";
import path from "path";

const app = express();
app.use(cors());
app.use(express.json());

function predictHeartRisk(features) {
  return new Promise((resolve, reject) => {
    const script = path.join(process.cwd(), "ai/predict.py");

    execFile("python", [script, ...features.map(String)], (error, stdout) => {
      if (error) return reject(error);

      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        console.log(stdout);
        reject(e);
      }
    });
  });
}

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

app.get("/analyse-health/:id", async (req, res) => {
  const user = {
    age: 40,
    gender: 1,
    bmi: 26,
    heartRate: 85,
    activityDays: 5,
    steps: 3500
  };

  const risk = await evaluateRisk(user);

  res.json({ vitals: user, risk });
});

app.listen(3000, () => console.log("✅ running"));