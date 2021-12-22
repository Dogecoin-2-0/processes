class CustomError extends Error {
  constructor(code, message) {
    this.errorCode = code;
    super(message);
  }
}

module.exports = CustomError;
