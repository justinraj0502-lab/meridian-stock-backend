const https = require("https");

const sendBrevoEmail = ({
  apiKey,
  senderEmail,
  to,
  name,
  subject,
  html,
}) => {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      sender: {
        name: "Meridian Security",
        email: senderEmail,
      },

      to: [
        {
          email: to,
          name: name || "Meridian User",
        },
      ],

      subject,
      htmlContent: html,
    });

    const request = https.request(
      {
        hostname: "api.brevo.com",

        path: "/v3/smtp/email",

        method: "POST",

        headers: {
          accept: "application/json",

          "api-key": apiKey,

          "content-type":
            "application/json",

          "content-length":
            Buffer.byteLength(data),
        },

        timeout: 30000,
      },

      (response) => {
        let body = "";

        response.on(
          "data",
          (chunk) => {
            body += chunk.toString();
          }
        );

        response.on(
          "end",
          () => {
            let result = {};

            try {
              result = body
                ? JSON.parse(body)
                : {};
            } catch {
              result = {};
            }

            if (
              response.statusCode >=
                200 &&
              response.statusCode < 300
            ) {
              console.log(
                `✅ Email sent successfully to ${to}`
              );

              resolve(result);

              return;
            }

            const error =
              new Error(
                result?.message ||
                  `Brevo error: ${response.statusCode}`
              );

            error.status =
              response.statusCode;

            error.response =
              result;

            reject(error);
          }
        );
      }
    );

    request.on(
      "timeout",
      () => {
        request.destroy();

        const error =
          new Error(
            "Brevo request timed out"
          );

        error.code =
          "BREVO_TIMEOUT";

        reject(error);
      }
    );

    request.on(
      "error",
      (error) => {
        reject(error);
      }
    );

    request.write(data);

    request.end();
  });
};


/* =========================================================
   SEND OTP EMAIL
========================================================= */

const sendOtpEmail = async ({
  email,
  name,
  otp,
  purpose,
}) => {
  const apiKey =
    process.env.BREVO_API_KEY;

  const senderEmail =
    process.env.BREVO_SENDER_EMAIL;

  if (!apiKey) {
    throw new Error(
      "BREVO_API_KEY is missing"
    );
  }

  if (!senderEmail) {
    throw new Error(
      "BREVO_SENDER_EMAIL is missing"
    );
  }


  /* =======================================================
     EMAIL TYPE
  ======================================================= */

  const isRegistration =
    purpose === "register";

  const isLogin =
    purpose === "login";

  const isForgotPassword =
    purpose === "forgot-password";


  /* =======================================================
     SUBJECT
  ======================================================= */

  let subject;

  if (isRegistration) {
    subject =
      "Verify your Meridian account";
  } else if (isLogin) {
    subject =
      "Your Meridian login verification code";
  } else if (isForgotPassword) {
    subject =
      "Reset your Meridian password";
  } else {
    subject =
      "Your Meridian verification code";
  }


  /* =======================================================
     TITLE
  ======================================================= */

  let title;

  if (isRegistration) {
    title =
      "Verify your Meridian account";
  } else if (isLogin) {
    title =
      "Verify your Meridian login";
  } else if (isForgotPassword) {
    title =
      "Reset your Meridian password";
  } else {
    title =
      "Your Meridian verification code";
  }


  /* =======================================================
     DESCRIPTION
  ======================================================= */

  let description;

  if (isRegistration) {
    description =
      "Use the verification code below to confirm your email address and activate your Meridian account.";
  } else if (isLogin) {
    description =
      "Use the verification code below to complete your Meridian login.";
  } else if (isForgotPassword) {
    description =
      "Use the verification code below to securely reset your Meridian account password.";
  } else {
    description =
      "Use the verification code below to continue.";
  }


  /* =======================================================
     EMAIL HTML
  ======================================================= */

  const html = `
<!DOCTYPE html>

<html>

<head>

  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>${title}</title>

</head>


<body
  style="
    margin:0;
    padding:0;
    background:#080d12;
    font-family:Arial,Helvetica,sans-serif;
    color:#f4f7fa;
  "
>

<div
  style="
    width:100%;
    padding:40px 16px;
    box-sizing:border-box;
    background:#080d12;
  "
>

  <div
    style="
      max-width:560px;
      margin:0 auto;
      background:#0d1319;
      border:1px solid #26313a;
      border-radius:18px;
      overflow:hidden;
    "
  >


    <!-- HEADER -->

    <div
      style="
        padding:28px 32px;
        border-bottom:1px solid #202a32;
        background:#101820;
      "
    >

      <div
        style="
          font-size:13px;
          letter-spacing:3px;
          font-weight:700;
          color:#f5b91b;
          margin-bottom:8px;
        "
      >
        MERIDIAN
      </div>


      <div
        style="
          font-size:12px;
          color:#81909d;
          letter-spacing:1px;
        "
      >
        STOCK MARKET DASHBOARD
      </div>

    </div>


    <!-- CONTENT -->

    <div
      style="
        padding:36px 32px;
      "
    >


      <!-- ICON -->

      <div
        style="
          width:48px;
          height:48px;
          border-radius:14px;
          background:#172018;
          border:1px solid #294332;
          display:flex;
          align-items:center;
          justify-content:center;
          color:#20d493;
          font-size:22px;
          margin-bottom:24px;
        "
      >
        ${
          isForgotPassword
            ? "🔐"
            : "✓"
        }
      </div>


      <!-- TITLE -->

      <h1
        style="
          margin:0 0 12px;
          font-size:26px;
          line-height:1.25;
          color:#ffffff;
        "
      >
        ${title}
      </h1>


      <!-- DESCRIPTION -->

      <p
        style="
          margin:0 0 26px;
          color:#91a0ad;
          font-size:15px;
          line-height:1.7;
        "
      >

        Hi ${name || "there"},<br><br>

        ${description}

      </p>


      <!-- OTP -->

      <div
        style="
          padding:24px;
          border-radius:14px;
          background:#080d12;
          border:1px solid #26313a;
          text-align:center;
          margin-bottom:26px;
        "
      >

        <div
          style="
            font-size:11px;
            color:#71808c;
            letter-spacing:2px;
            margin-bottom:12px;
          "
        >
          VERIFICATION CODE
        </div>


        <div
          style="
            font-size:36px;
            font-weight:800;
            letter-spacing:10px;
            color:#f5b91b;
          "
        >
          ${otp}
        </div>


        <div
          style="
            margin-top:12px;
            color:#697783;
            font-size:12px;
          "
        >
          This code expires in 5 minutes.
        </div>

      </div>


      <!-- SECURITY MESSAGE -->

      <p
        style="
          margin:0;
          color:#667580;
          font-size:12px;
          line-height:1.7;
        "
      >

        ${
          isForgotPassword
            ? "If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged."
            : "If you did not request this verification code, you can safely ignore this email."
        }

      </p>

    </div>


    <!-- FOOTER -->

    <div
      style="
        padding:20px 32px;
        border-top:1px solid #202a32;
        color:#52606b;
        font-size:11px;
        line-height:1.6;
      "
    >

      This is an automated security email from Meridian.
      Please do not reply to this message.

    </div>

  </div>

</div>

</body>

</html>
`;


  /* =======================================================
     SEND THROUGH BREVO
  ======================================================= */

  return sendBrevoEmail({
    apiKey,

    senderEmail,

    to: email,

    name,

    subject,

    html,
  });
};


/* =========================================================
   VERIFY EMAIL SERVICE
========================================================= */

const verifyEmailTransport =
  async () => {

    if (
      !process.env.BREVO_API_KEY
    ) {
      throw new Error(
        "BREVO_API_KEY is missing"
      );
    }

    if (
      !process.env.BREVO_SENDER_EMAIL
    ) {
      throw new Error(
        "BREVO_SENDER_EMAIL is missing"
      );
    }

    console.log(
      "✅ Brevo email service configured successfully"
    );

    console.log(
      `📧 Sender: ${process.env.BREVO_SENDER_EMAIL}`
    );

    return true;
  };


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  sendOtpEmail,
  verifyEmailTransport,
};