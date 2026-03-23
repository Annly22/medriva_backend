//auth.js
//auth routes file, handles routes related to user authentication and fitbit oauth flow




import express from "express";
import axios from "axios";
import qs from "querystring";

const router = express.Router();

// We export a function so we can pass db from server.js
export default function authRoutes(db) {

  ////////////////////////////////////////////////////////
  // 🔥 FITBIT OAUTH START
  ////////////////////////////////////////////////////////

  router.get("/auth/fitbit", (req, res) => {
    const userId = req.query.userId;

    if (!userId) {
      return res.send("Missing user ID ❌");
    }

    const scope = "activity heartrate profile sleep";

    const authUrl =
      "https://www.fitbit.com/oauth2/authorize?" +
      qs.stringify({
        response_type: "code",
        client_id: process.env.FITBIT_CLIENT_ID,
        redirect_uri: process.env.FITBIT_REDIRECT_URI,
        scope: scope,
        state: userId,
      });

    res.redirect(authUrl);
  });

  ////////////////////////////////////////////////////////
  // 🔥 FITBIT CALLBACK
  ////////////////////////////////////////////////////////

  router.get("/auth/fitbit/callback", async (req, res) => {
    const code = req.query.code;
    const userId = req.query.state;

    if (!code || !userId) {
      return res.send("Missing authorization data ❌");
    }

    try {
      const tokenResponse = await axios.post(
        "https://api.fitbit.com/oauth2/token",
        qs.stringify({
          grant_type: "authorization_code",
          redirect_uri: process.env.FITBIT_REDIRECT_URI,
          code: code,
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

      const { access_token, refresh_token, expires_in, user_id } =
        tokenResponse.data;

      ////////////////////////////////////////////////////////
      // 🔥 STORE TOKEN IN MYSQL
      ////////////////////////////////////////////////////////

      await db.execute(
        `INSERT INTO fitbit_tokens 
        (user_id, access_token, refresh_token, expires_at, fitbit_user_id) 
        VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND), ?)
        ON DUPLICATE KEY UPDATE
        access_token = VALUES(access_token),
        refresh_token = VALUES(refresh_token),
        expires_at = VALUES(expires_at)`,
        [userId, access_token, refresh_token, expires_in, user_id]
      );

     res.redirect(`medriva://fitbit-success?userId=${userId}`);
    } catch (error) {
      console.log("FITBIT TOKEN ERROR:", error.response?.data || error.message);
      res.send("Fitbit Connection Failed ❌");
    }
  });

  return router;
}
