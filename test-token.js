const https = require("https");

https.get(
  "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
  (res) => {
    console.log("STATUS:", res.statusCode);

    let data = "";

    res.on("data", (chunk) => {
      data += chunk;
    });

    res.on("end", () => {
      console.log("RESPONSE:", data);
    });
  }
).on("error", (err) => {
  console.log("ERROR:", err.message);
});