const { SmartAPI } = require("smartapi-javascript");
const { generate } = require("otplib");

let smartApi = null;
let sessionData = null;

/* =========================================
   CREATE SMARTAPI CLIENT
========================================= */

function createSmartApi() {
  if (!process.env.ANGELONE_API_KEY) {
    throw new Error(
      "ANGELONE_API_KEY is missing"
    );
  }

  return new SmartAPI({
    api_key:
      process.env.ANGELONE_API_KEY,
  });
}

/* =========================================
   LOGIN TO ANGEL ONE
========================================= */

async function loginToAngelOne() {
  try {
    if (
      !process.env.ANGELONE_API_KEY ||
      !process.env.ANGELONE_CLIENT_CODE ||
      !process.env.ANGELONE_PIN ||
      !process.env.ANGELONE_TOTP_SECRET
    ) {
      throw new Error(
        "Angel One credentials are missing from environment variables"
      );
    }

    smartApi = createSmartApi();

    console.log(
      "🔐 Generating Angel One TOTP..."
    );

    const totp = await generate({
      secret:
        process.env.ANGELONE_TOTP_SECRET,
    });

    console.log(
      "🔐 Connecting to Angel One SmartAPI..."
    );

    const response =
      await smartApi.generateSession(
        process.env.ANGELONE_CLIENT_CODE,
        process.env.ANGELONE_PIN,
        totp
      );

    if (
      !response ||
      response.status !== true
    ) {
      throw new Error(
        response?.message ||
          "Angel One authentication failed"
      );
    }

    sessionData = response.data;

    console.log(
      "✅ Angel One SmartAPI connected"
    );

    console.log(
      `👤 Angel One Client: ${process.env.ANGELONE_CLIENT_CODE}`
    );

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    console.error(
      "❌ Angel One authentication failed:",
      error?.message || error
    );

    smartApi = null;
    sessionData = null;

    throw error;
  }
}

/* =========================================
   GET AUTHENTICATED SMARTAPI CLIENT
========================================= */

async function getSmartApi() {
  if (
    smartApi &&
    sessionData?.jwtToken
  ) {
    return smartApi;
  }

  await loginToAngelOne();

  return smartApi;
}

/* =========================================
   GET ANGEL ONE PROFILE
========================================= */

async function getAngelProfile() {
  const api =
    await getSmartApi();

  const response =
    await api.getProfile(
      sessionData.refreshToken
    );

  return response;
}

/* =========================================
   SESSION STATUS
========================================= */

async function getSessionStatus() {
  return {
    connected: Boolean(
      smartApi &&
        sessionData?.jwtToken
    ),

    clientCode:
      process.env.ANGELONE_CLIENT_CODE ||
      null,
  };
}

/* =========================================
   EXPORTS
========================================= */

module.exports = {
  loginToAngelOne,
  getSmartApi,
  getAngelProfile,
  getSessionStatus,
};