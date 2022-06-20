import { config } from 'dotenv';

config();

export const ASSETS_URL = process.env.ASSETS_URL;
export const DB_URI = process.env.DB_URI;
