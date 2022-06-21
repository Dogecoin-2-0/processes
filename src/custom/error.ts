export default class CustomError extends Error {
  errorCode: number;

  constructor(code: number, message: string) {
    super(message);
    this.errorCode = code;
  }
}
