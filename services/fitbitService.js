import axios from "axios";
import { evaluateRisk } from "./riskengine.js";

export async function fetchFitbitData(db, userId, simulate = null) {

////////////////////////////////////////////////////////
// 🧪 SIMULATION MODE
////////////////////////////////////////////////////////

if (simulate === "true") {

  console.log("SIMULATION MODE ACTIVE 🔥");

  let heartRate;
  let steps;
  let sleepHours;

  switch (simulate) {
    case "stress":
      heartRate = 110;
      steps = 1500;
      sleepHours = 4.5;
      break;

    case "sick":
      heartRate = 115;
      steps = 800;
      sleepHours = 3.5;
      break;

    case "athlete":
      heartRate = 65;
      steps = 14000;
      sleepHours = 8;
      break;

    default:
      heartRate = Math.floor(Math.random() * (120 - 55) + 55);
      steps = Math.floor(Math.random() * 12000);
      sleepHours = Number((Math.random() * (9 - 4) + 4).toFixed(2));
      break;
  }

  const risk = await evaluateRisk({
    age: 30,
    sex: 1,
    height: 170,
    weight: 70,
    heartRate,
    sleepHours,
    steps
  });

  return {
    source: "SIMULATED",
    vitals: { heartRate, steps, sleepHours },
    risk,
  };
}

////////////////////////////////////////////////////////
// 1️⃣ GET TOKEN FROM MYSQL
////////////////////////////////////////////////////////

const [rows] = await db.execute(
  "SELECT * FROM fitbit_tokens WHERE user_id = ?",
  [userId]
);

if (rows.length === 0) {
  throw new Error("Fitbit not connected for this user");
}

let tokenData = rows[0];
let accessToken = tokenData.access_token;
let refreshToken = tokenData.refresh_token;
let expiresAt = new Date(tokenData.expires_at);
const now = new Date();

////////////////////////////////////////////////////////
// 2️⃣ REFRESH TOKEN IF EXPIRED
////////////////////////////////////////////////////////

if (now > expiresAt) {

  console.log("Access token expired. Refreshing... 🔄");

  const refreshResponse = await axios.post(
    "https://api.fitbit.com/oauth2/token",
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(
            process.env.FITBIT_CLIENT_ID +
            ":" +
            process.env.FITBIT_CLIENT_SECRET
          ).toString("base64"),
      },
    }
  );

  const { access_token, refresh_token, expires_in } =
    refreshResponse.data;

  accessToken = access_token;
  refreshToken = refresh_token;

  await db.execute(
    `UPDATE fitbit_tokens
     SET access_token = ?, 
         refresh_token = ?, 
         expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND)
     WHERE user_id = ?`,
    [accessToken, refreshToken, expires_in, userId]
  );
}

 ////////////////////////////////////////////////////////
  // 3️⃣ FETCH FITBIT VITALS
  ////////////////////////////////////////////////////////

  let heartRate = null;
  let steps = 0;
  let sleepHours = 0;
// ❤️ HEART RATE (Resilient Logic)
console.log("SERVER DATE:", new Date().toISOString());

async function getIntraday(date) {
  const response = await axios.get(
    `https://api.fitbit.com/1/user/-/activities/heart/date/${date}/1d/1min.json`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  return response.data["activities-heart-intraday"]?.dataset || [];
}

let dataset = [];

// 1️⃣ Try today
try {
  const todayString = new Date().toISOString().split("T")[0];
dataset = await getIntraday(todayString);
} catch (err) {}

if (!dataset || dataset.length === 0) {
  console.log("No intraday today. Trying yesterday...");
  try {
    const yesterday = new Date(Date.now() - 86400000)
  .toISOString()
  .split("T")[0];
dataset = await getIntraday(yesterday);
  } catch (err) {}
}

if (dataset && dataset.length > 0) {

  dataset.sort((a, b) => a.time.localeCompare(b.time));
  const lastFive = dataset.slice(-5);
  console.log("Last 5 HR samples:", lastFive); // 👈 Add this

  const filtered = lastFive.filter(e => e.value > 40 && e.value < 200);

  if (filtered.length > 0) {
    let weightedSum = 0;
    let totalWeight = 0;

    filtered.forEach((entry, index) => {
      const weight = index + 1;
      weightedSum += entry.value * weight;
      totalWeight += weight;
    });

    heartRate = Math.round(weightedSum / totalWeight);
    console.log("Smoothed HR:", heartRate);
  }

} else {
  console.log("Intraday unavailable. Trying resting HR...");

  try {
    const summaryResponse = await axios.get(
      "https://api.fitbit.com/1/user/-/activities/heart/date/today/1d.json",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const resting =
      summaryResponse.data["activities-heart"]?.[0]?.value?.restingHeartRate;

    if (resting) {
      heartRate = resting;
      console.log("Using resting HR:", heartRate);
    }

  } catch (err) {
    console.log("No heart summary data available.");
  }
}
// 🚶 STEPS (Timezone-Safe)

async function getSteps(date) {
  const response = await axios.get(
    `https://api.fitbit.com/1/user/-/activities/steps/date/${date}/1d.json`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  return Number(
    response.data["activities-steps"]?.[0]?.value ?? 0
  );
}

// 👇 Use LOCAL DATE (not UTC)

const todayString =
  now.getFullYear() +
  "-" +
  String(now.getMonth() + 1).padStart(2, "0") +
  "-" +
  String(now.getDate()).padStart(2, "0");


try {
  steps = await getSteps(todayString);
  console.log("Steps today:", steps);
} catch (err) {
  console.log("Error fetching steps today");
}

// Optional fallback
if (!steps || steps === 0) {
  const yesterday = new Date(Date.now() - 86400000);
  const yesterdayString =
    yesterday.getFullYear() +
    "-" +
    String(yesterday.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(yesterday.getDate()).padStart(2, "0");

  console.log("No steps today. Trying yesterday...");
  steps = await getSteps(yesterdayString);
  console.log("Steps yesterday:", steps);
}

  // 😴 SLEEP
  try {
    const sleepResponse = await axios.get(
      "https://api.fitbit.com/1.2/user/-/sleep/date/today.json",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (sleepResponse.data.sleep?.length > 0) {
      sleepHours =
        sleepResponse.data.sleep[0].duration / (1000 * 60 * 60);
    }

  } catch (err) {
    console.log("No sleep data today");
  }

  sleepHours = Number(sleepHours.toFixed(2));



////////////////////////////////////////////////////////
// 4️⃣ STORE / UPDATE
////////////////////////////////////////////////////////

const [existing] = await db.execute(
  `SELECT id FROM fitbit_vitals 
   WHERE user_id = ? 
   AND DATE(recorded_at) = CURDATE()`,
  [userId]
);

if (existing.length === 0) {

  await db.execute(
    `INSERT INTO fitbit_vitals 
     (user_id, heart_rate, steps, sleep_hours)
     VALUES (?, ?, ?, ?)`,
    [userId, heartRate, steps, sleepHours]
  );

} else {

  await db.execute(
    `UPDATE fitbit_vitals
     SET heart_rate = ?, 
         steps = ?, 
         sleep_hours = ?
     WHERE user_id = ?
     AND DATE(recorded_at) = CURDATE()`,
    [heartRate, steps, sleepHours, userId]
  );
}

////////////////////////////////////////////////////////
// 5️⃣ EVALUATE RISK
////////////////////////////////////////////////////////

const [userRows] = await db.execute(
  "SELECT age, sex, height, weight FROM users WHERE id = ?",
  [userId]
);

const user = userRows[0];

const risk = await evaluateRisk({
  age: user.age,
  sex: user.sex === "Male" ? 1 : 0,
  height: user.height,
  weight: user.weight,
  heartRate,
  sleepHours,
  steps
});

////////////////////////////////////////////////////////
// 6️⃣ RETURN
////////////////////////////////////////////////////////

return {
  source: "FITBIT",
  vitals: { heartRate, steps, sleepHours },
  risk
};
}

////////////////////////////////////////////////////////
// 🔹 GET LATEST VITALS
////////////////////////////////////////////////////////

export async function getLatestVitals(db, userId) {

const [rows] = await db.execute(
  `SELECT * FROM fitbit_vitals
   WHERE user_id = ?
   ORDER BY recorded_at DESC
   LIMIT 1`,
  [userId]
);
console.log("📊 DB QUERY RESULT:", rows);

if (rows.length === 0) {
  console.log("❌ NO VITALS FOUND FOR USER:", userId);
  return null;
}

const row = rows[0];

// ✅ FIX: fetch user info
const [userRows] = await db.execute(
  "SELECT age, sex, height, weight FROM users WHERE id = ?",
  [userId]
);

const user = userRows[0];

const risk = await evaluateRisk({
  age: user.age,
  sex: user.sex === "Male" ? 1 : 0,
  height: user.height,
  weight: user.weight,
  heartRate: row.heart_rate,
  sleepHours: row.sleep_hours,
  steps: row.steps
});
console.log("✅ RETURNING VITALS:", row);
return {
  source: "DATABASE",
  vitals: {
    heartRate: row.heart_rate,
    steps: row.steps,
    sleepHours: row.sleep_hours
  },
  risk
};
}