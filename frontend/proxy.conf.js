const target = process.env.FARM_C_API_URL || "http://localhost:4000";
module.exports = {
  "/api": {
    target,
    secure: false,
    changeOrigin: true,
  },
};
