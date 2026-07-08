// Centralized, typed environment access. Server-only values are read lazily so
// that importing this module in a client bundle never leaks secrets.

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function opt(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  get databaseUrl() {
    return req("DATABASE_URL");
  },
  enableBanking: {
    get appId() {
      return req("ENABLE_BANKING_APP_ID");
    },
    get privateKeyBase64() {
      return req("ENABLE_BANKING_PRIVATE_KEY_BASE64");
    },
    get redirectUrl() {
      return req("ENABLE_BANKING_REDIRECT_URL");
    },
    get aspspName() {
      return req("ENABLE_BANKING_ASPSP_NAME");
    },
    get aspspCountry() {
      return req("ENABLE_BANKING_ASPSP_COUNTRY");
    },
    get psuType() {
      return opt("ENABLE_BANKING_PSU_TYPE", "personal");
    },
    get consentDays() {
      return parseInt(opt("ENABLE_BANKING_CONSENT_DAYS", "90"), 10);
    },
  },
  gemini: {
    get apiKey() {
      return req("GEMINI_API_KEY");
    },
    get model() {
      return opt("GEMINI_MODEL", "gemini-2.5-flash");
    },
  },
  ntfy: {
    get server() {
      return opt("NTFY_SERVER", "https://ntfy.sh");
    },
    get topic() {
      return req("NTFY_TOPIC");
    },
  },
  get cronSecret() {
    return req("CRON_SECRET");
  },
  get appUrl() {
    return opt("APP_URL", "http://localhost:3000");
  },
};
