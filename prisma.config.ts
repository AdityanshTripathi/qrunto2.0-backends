import "dotenv/config";
import { defineConfig } from "prisma/config";

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
const secureConnectionString =
  connectionString && !/[?&]sslmode=/.test(connectionString)
    ? `${connectionString}${connectionString.includes("?") ? "&" : "?"}sslmode=require`
    : connectionString;

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: secureConnectionString,
  },
});
