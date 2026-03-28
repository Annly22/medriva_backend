import { execFile } from "child_process";

function predictHeartRisk(features) {
  return new Promise((resolve, reject) => {
    execFile("python3", ["ai/predict.py", ...features.map(String)], (error, stdout, stderr) => {
      
      if (error) {
        console.error("ERROR:", error);
        console.error("STDERR:", stderr);
        return reject(error);
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (err) {
        console.error("PARSE ERROR:", stdout);
        reject(err);
      }
    });
  });
}