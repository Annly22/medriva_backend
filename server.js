import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

////////////////////////////////////////////////////////
// 🗄️ DATABASE CONNECTION
////////////////////////////////////////////////////////

const db = await mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "medriva",
  waitForConnections: true,
  connectionLimit: 10
});

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
// 🧠 DB-TUNED RISK MODEL
////////////////////////////////////////////////////////

function predictHeartRisk(user, vitals) {
  return new Promise((resolve) => {
    const age = user.age || 30;
    const height = user.height || 165;
    const weight = user.weight || 60;

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
    // 📊 NORMALIZATION (BASED ON YOUR DB)
    ////////////////////////////////////////////////////////

    const ageN = normalize(age, 20, 65);
    const bmiN = normalize(bmi, 18, 30);
    const hrN = normalize(heartRate, 70, 125);
    const stepsN = normalize(steps, 0, 5000);

    ////////////////////////////////////////////////////////
    // 🧠 WEIGHTED RISK
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

  if (vitals.heart_rate > 95) score++;
  if (vitals.steps < 3000) score++;
  if (calculateBMI(user.height, user.weight) > 25) score++;

  const ml = await predictHeartRisk(user, vitals);

  const probability = ml.risk_probability;

  return {
    score,
    probability,
    level:
      probability > 75
        ? "High"
        : probability > 45
        ? "Moderate"
        : "Low"
  };
}

////////////////////////////////////////////////////////
// 🌐 API ROUTE (REAL DB DATA)
////////////////////////////////////////////////////////

app.get("/analyse-health/:id", async (req, res) => {
  try {
    const userId = req.params.id;

    ////////////////////////////////////////////////////////
    // 👤 GET USER
    ////////////////////////////////////////////////////////

    const [users] = await db.query(
      "SELECT * FROM users WHERE id = ?",
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = users[0];

    ////////////////////////////////////////////////////////
    // ❤️ GET LATEST VITALS
    ////////////////////////////////////////////////////////

    const [vitalsRows] = await db.query(
      `SELECT * FROM fitbit_vitals 
       WHERE user_id = ? 
       ORDER BY recorded_at DESC 
       LIMIT 1`,
      [userId]
    );

    if (vitalsRows.length === 0) {
      return res.status(404).json({ error: "No vitals found" });
    }

    const vitals = vitalsRows[0];

    ////////////////////////////////////////////////////////
    // 🧠 CALCULATE RISK
    ////////////////////////////////////////////////////////

    const risk = await evaluateRisk(user, vitals);

    ////////////////////////////////////////////////////////

    res.json({
      user: {
        id: user.id,
        age: user.age,
        sex: user.sex,
        height: user.height,
        weight: user.weight
      },
      vitals: {
        heart_rate: vitals.heart_rate,
        steps: vitals.steps
      },
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
// 🚀 SERVER START
////////////////////////////////////////////////////////

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});