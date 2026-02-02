export default function handler(req, res) {
  console.log("M-Pesa callback received:", req.body);
  res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
}
