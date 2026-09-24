const nodemailer = require("nodemailer");

const createTransporter = () => {
  if (
    !process.env.EMAIL_USER ||
    !process.env.EMAIL_APP_PASSWORD
  ) {
    throw new Error(
      "EMAIL_USER or EMAIL_APP_PASSWORD is missing from .env"
    );
  }

  return nodemailer.createTransport({
    service: "gmail",

    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });
};

const sendOtpEmail = async ({
  email,
  name,
  otp,
  purpose,
}) => {
  const transporter = createTransporter();

  const isRegistration = purpose === "register";

  const subject = isRegistration
    ? "Verify your Meridian account"
    : "Your Meridian login verification code";

  const title = isRegistration
    ? "Verify your Meridian account"
    : "Verify your Meridian login";

  const description = isRegistration
    ? "Use the verification code below to confirm your email address and activate your Meridian account."
    : "Use the verification code below to complete your Meridian login.";

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        />

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

            <div style="padding:36px 32px;">

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
                ✓
              </div>

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

              <p
                style="
                  margin:0 0 26px;
                  color:#91a0ad;
                  font-size:15px;
                  line-height:1.7;
                "
              >
                Hi ${name || "there"},<br /><br />
                ${description}
              </p>

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

              <p
                style="
                  margin:0;
                  color:#667580;
                  font-size:12px;
                  line-height:1.7;
                "
              >
                If you did not request this verification code,
                you can safely ignore this email.
              </p>

            </div>

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

  await transporter.sendMail({
    from: `"Meridian Security" <${process.env.EMAIL_USER}>`,
    to: email,
    subject,
    html,
  });
};

const verifyEmailTransport = async () => {
  const transporter = createTransporter();

  await transporter.verify();

  console.log(
    "✅ Email service connected successfully"
  );
};

module.exports = {
  sendOtpEmail,
  verifyEmailTransport,
};