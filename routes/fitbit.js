//fitbit.js
//fitbit routes file, handles routes related to fetching data from fitbit api and evaluating risk based on that data using the risk engine logic in riskengine.js

import express from "express";
import { fetchFitbitData } from "../services/fitbitService.js";

export default function fitbitRoutes(db) {
  const router = express.Router();

  ////////////////////////////////////////////////////////
  // 🔹 GET FITBIT DATA (REAL OR SIMULATED)
  ////////////////////////////////////////////////////////

  router.get("/fitbit/data", async (req, res) => {
    const userId = req.query.userId;
    const simulate = req.query.simulate === "true";
    // simulate can be:
    // true
    // stress
    // sick
    // athlete

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    try {
      
      const data = await fetchFitbitData(db, userId, simulate);
      res.json(data);
    } catch (error) {
      console.error("Fitbit Data Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
