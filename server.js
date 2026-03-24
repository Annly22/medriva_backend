//server.js
//main server file of the backend,handles user auth,fitbit data fetching ,rag pdf upload, 



import express from "express";
import multer from "multer";
import cors from "cors";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { PdfQA } from "./rag-pdf-qa.js";
import authRoutes from "./routes/auth.js";
import fitbitRoutes from "./routes/fitbit.js";
import { getLatestVitals, fetchFitbitData } from "./services/fitbitService.js";
import { evaluateRisk } from "./services/riskengine.js";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";



dotenv.config();

////////////////////////////////////////////////////////
// 🔥 MYSQL CONNECTION
////////////////////////////////////////////////////////

const db = await mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "hehe@123",
  database: process.env.DB_NAME || "medriva",
});

//rag initialisation//
async function initRAG() {
  const [pdfRows] = await db.execute(
    "SELECT id, file_path, user_id FROM pdf_files"
  );

  const pdfDocs = pdfRows.map(p => ({
  id: p.id,
  path: p.file_path,
  userId: p.user_id,
  role: p.role   // 🔥 ADD THIS
}));

  pdfQA = await new PdfQA({
  model: null, // disable LLM
    pdfDocuments: pdfDocs,
    chunkSize: 500,
    chunkOverlap: 50,
    kDocuments: 3,
  }).init();

  console.log("✅ RAG initialized with PDFs");
}

////////////////////////////////////////////////////////

const app = express();
app.use(cors());
app.use(express.json());
let alerts = [];
let pdfQA;

app.post("/alerts/send", (req, res) => {
  const { patientId, bpm } = req.body;

  console.log("🚨 Alert received from patient:", patientId, bpm);

    alerts.push({
    patientId,
    bpm
  });

  res.json({ message: "Alert saved" });
});

app.get("/alerts", (req, res) => {
  res.json(alerts);
});
// ✅ Register Routes
app.use(authRoutes(db));
app.use(fitbitRoutes(db));

const upload = multer({ dest: "uploads/" });


////////////////////////////////////////////////////////
// 🔐 REGISTER
////////////////////////////////////////////////////////

app.post("/register", async (req, res) => {
  try {
    const { name, email, password, role, age, sex, height, weight } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.execute(
      `INSERT INTO users 
      (name, email, password_hash, role, age, sex, height, weight)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, email, hashedPassword, role || "patient", age, sex, height, weight]
    );

    res.json({ message: "User registered successfully ✅" });

  } catch (error) {
    console.log("Register Error:", error.message);
    res.status(500).json({ error: "Registration failed" });
  }
});


app.get("/patient/:id", async (req, res) => {
  try {
    const userId = req.params.id;

    const [rows] = await db.execute(
      "SELECT name, age, sex, height, weight FROM users WHERE id = ?",
      [userId]
    );

    if (rows.length === 0) {
      return res.json({});
    }

    res.json(rows[0]);

  } catch (err) {
    console.error("Profile fetch error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

////////////////////////////////////////////////////////
// 🔐 LOGIN
////////////////////////////////////////////////////////

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const [rows] = await db.execute(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: "User not found" });
    }

    const user = rows[0];

    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return res.status(400).json({ error: "Invalid password" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      "secret_key",
      { expiresIn: "1d" }
    );

    res.json({
      message: "Login successful ✅",
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.log("Login Error:", error.message);
    res.status(500).json({ error: "Login failed" });
  }
});

////////////////////////////////////////////////////////
// 🏥 GET DOCTOR'S PATIENTS
////////////////////////////////////////////////////////

app.get("/doctor/patients", async (req, res) => {
  try {
    const { doctorId } = req.query;

    if (!doctorId) {
      return res.status(400).json({ error: "doctorId required" });
    }

    const [patients] = await db.execute(
      "SELECT id, name, email FROM users WHERE role = 'patient' AND doctor_id = ?",
      [doctorId]
    );

    res.json({ patients });

  } catch (err) {
    console.error("Doctor Patients Error:", err.message);
    res.status(500).json({ error: "Failed to fetch patients" });
  }
});

////////////////////////////////////////////////////////
// 🔹 PDF UPLOAD (RAG)
////////////////////////////////////////////////////////

////////////////////////////////////////////////////////
// 🔹 PDF UPLOAD (DB BASED)
////////////////////////////////////////////////////////

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const { userId, role } = req.body;

console.log("UPLOAD DATA:", req.body); // 👈 ADD THIS

if (!req.file) {
  return res.status(400).json({ error: "No file uploaded" });
}

if (!userId || !role) {
  return res.status(400).json({ error: "userId or role missing" });
}

    const finalUserId = role === "admin" ? null : userId;

await db.execute(
  `INSERT INTO pdf_files (user_id, file_name, file_path, role)
   VALUES (?, ?, ?, ?)`,
  [finalUserId, req.file.originalname, req.file.path, role]
);

    await initRAG();
    res.json({ message: "PDF uploaded successfully ✅" });

  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});
    
app.post("/ask", async (req, res) => {
  try {
    const { question, userId } = req.body;

    let vitalsString = "No vitals available.";
    let enrichedQuestion = question;
    let vitals = null;

    ////////////////////////////////////////////////////////
    // 🔥 FETCH VITALS
    ////////////////////////////////////////////////////////

    if (userId) {
      const vitalsData = await getLatestVitals(db, userId);

      if (vitalsData && vitalsData.vitals) {
        vitals = {
          heartRate: vitalsData.vitals.heartRate,
          sleepHours: vitalsData.vitals.sleepHours,
          steps: vitalsData.vitals.steps,
        };
      } else {
        console.log("No vitals found for user:", userId);
      }
    }

    ////////////////////////////////////////////////////////
    // 🔥 IF NO PDF → STILL ALLOW RESPONSE
    ////////////////////////////////////////////////////////

    // 🔥 Fetch PDFs from DB
if (!pdfQA || !pdfQA.db || pdfQA.db.memoryVectors.length === 0) {
  return res.json({
    answer: "No documents available yet."
  });
}
    ////////////////////////////////////////////////////////
    // 🔥 RISK SCORING
    ////////////////////////////////////////////////////////

    if (vitals) {
      const [userRows] = await db.execute(
        "SELECT age, sex, height, weight FROM users WHERE id = ?",
        [userId]
      );

      if (userRows.length === 0) {
        return res.json({ error: "User not found" });
      }

      const user = userRows[0];

      const updatedRisk = await evaluateRisk({
        age: user.age,
        sex: user.sex === "Male" ? 1 : 0,
        height: user.height,
        weight: user.weight,
        heartRate: vitals.heartRate,
        sleepHours: vitals.sleepHours,
        steps: vitals.steps
      });

      vitalsString = `
Heart Rate: ${vitals.heartRate} bpm
Steps: ${vitals.steps}
Sleep Hours: ${vitals.sleepHours}
Risk Level: ${updatedRisk.riskLevel}
Risk Flags: ${updatedRisk.flags.join(", ")}
      `;

      const q = question.toLowerCase();

      if (q.includes("heart")) {
        enrichedQuestion = `
The patient's actual heart rate from Fitbit is ${vitals.heartRate} bpm.

User question: "${question}"

1. First verify whether this heart rate is within normal adult range.
2. If elevated, check the medical document context for:
   - heart rate safety thresholds
   - medication side effects related to elevated heart rate.
3. Use ONLY the provided medical document context.
4. If no relevant information is found, clearly state that.
`;
      }
    }

    ////////////////////////////////////////////////////////
    // 🔥 CALL RAG
    ////////////////////////////////////////////////////////

    const response = await pdfQA.query(
  enrichedQuestion,
  vitalsString,
  userId
);

    res.json({
      answer: response.answer || response.output_text
    });

  } catch (err) {
    console.error("RAG Error FULL:", err);
    res.status(500).json({ error: err.message });
  }
});


// GET VITALS HISTORY FOR A PATIENT
app.get("/patient-vitals/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;

    const [rows] = await db.execute(
      `SELECT heart_rate, recorded_at
       FROM fitbit_vitals
       WHERE user_id = ?
       ORDER BY recorded_at DESC`,
      [userId]
    );

    res.json(rows);

  } catch (err) {
    console.error("Vitals history error:", err);
    res.status(500).json({ error: "Database error" });
  }
});


////////////////////////////////////////////////////////
// 📄 GET PDF HISTORY
////////////////////////////////////////////////////////

app.get("/pdfs/:userId/:role", async (req, res) => {
  try {
    const { userId, role } = req.params;

    let query;
    let params = [];

    if (role === "admin") {
      // 🛠 Admin → only their uploads (global PDFs)
      query = `
        SELECT * FROM pdf_files
        WHERE role = 'admin'
        ORDER BY uploaded_at DESC
      `;
    } else {
      // 👤 Users → only their own PDFs
      query = `
        SELECT * FROM pdf_files
        WHERE user_id = ?
        ORDER BY uploaded_at DESC
      `;
      params = [userId];
    }

    const [rows] = await db.execute(query, params);
    res.json(rows);

  } catch (err) {
    res.status(500).json({ error: "Failed to fetch PDFs" });
  }
});

///delete pdf////

app.delete("/pdf/:id", async (req, res) => {
  const pdfId = req.params.id;

  try {
    // 1. Get file path
    const [rows] = await db.query(
      "SELECT file_path FROM pdf_files WHERE id = ?",
      [pdfId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "PDF not found" });
    }

    const filePath = rows[0].file_path;

    // 2. Delete from DB
    await db.query(
      "DELETE FROM pdf_files WHERE id = ?",
      [pdfId]
    );

    // 3. Delete file
    try {
      fs.unlinkSync(filePath);
    } catch {
      console.log("File already deleted");
    }

    // 🔥 4. Remove from RAG
    pdfQA.removePdf(parseInt(pdfId));

    res.json({ message: "PDF deleted successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Delete failed" });
  }
});
////////////////////////////////////////////////////////
////////////////////////////////////////////////////////
// 🧠 ML HEALTH ANALYSIS
////////////////////////////////////////////////////////

app.get("/analyse-health/:userId", async (req, res) => {
  try {

    const userId = req.params.userId;

    const [userRows] = await db.execute(
      "SELECT age, sex, height, weight FROM users WHERE id = ?",
      [userId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userRows[0];
    const simulate = req.query.simulate;

await fetchFitbitData(db, userId, simulate);
    const vitalsData = await getLatestVitals(db, userId);
    console.log("🔥 USER ID:", userId);
console.log("🔥 VITALS DATA:", vitalsData);

    if (!vitalsData || !vitalsData.vitals) {
      return res.status(400).json({ error: "No vitals available" });
    }

    const vitals = vitalsData.vitals;

    //////////////////////////////////////////////////////
    // ✅ SINGLE SOURCE OF TRUTH (evaluateRisk)
    //////////////////////////////////////////////////////

    const risk = await evaluateRisk({
      age: user.age,
      sex: user.sex === "Male" ? 1 : 0,
      height: user.height,
      weight: user.weight,
      heartRate: vitals.heartRate,
      sleepHours: vitals.sleepHours,
      steps: vitals.steps
    });

    res.json({
      vitals,
      risk
    });

  } catch (err) {
    console.error("Analyse health error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

await initRAG();
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
