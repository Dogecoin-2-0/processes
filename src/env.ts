import { config } from 'dotenv';

config();

export const ASSETS_URL = process.env.ASSETS_URL;
export const DB_URI = process.env.DB_URI;
export const GCM_API_KEY = process.env.GCM_API_KEY;