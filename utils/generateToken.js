const jwt = require("jsonwebtoken");

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE ? process.env.JWT_EXPIRE.trim() : "1d",
  });
};

module.exports = generateToken;
