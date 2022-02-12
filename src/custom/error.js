class CustomError extends Error {
  constructor(code, message) {
    super(message);
    this.errorCode = code;
  }
}

module.exports = CustomError;
