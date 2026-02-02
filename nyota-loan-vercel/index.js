const express = require("express");
const cors = require("cors");
require("dotenv").config();

const mpesaRoutes = require("./routes/mpesa");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/mpesa", mpesaRoutes);

app.get("/", (req, res) => {
  res.send("Nyota Loan API is running");
});

module.exports = app;