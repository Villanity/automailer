const { google } = require("googleapis");
const nodemailer = require("nodemailer");
const fs = require("fs");
const readline = require("readline");

const SCOPES = ["https://www.googleapis.com/auth/gmail.modify"];
const TOKEN_PATH = "token.json";

const credentials = require("./credentials.json");

const { client_secret, client_id, redirect_uris } = credentials.installed;
const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
);

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    type: "OAuth2",
    user: "agentshrapnelcsgo@gmail.com",
    clientId: client_id,
    clientSecret: client_secret,
    refreshToken: "", 
    accessToken: "",
  },
});

function getAccessToken() {
  return new Promise((resolve, reject) => {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
    });
    console.log("Authorize this app by visiting this URL:", authUrl);
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question("Enter the code from that page here: ", (code) => {
      rl.close();
      oAuth2Client.getToken(code, (err, token) => {
        if (err) {
          console.error("Error retrieving access token:", err);
          reject(err);
        } else {
          oAuth2Client.setCredentials(token);
          transporter.options.auth.refreshToken = token.refresh_token;
          transporter.options.auth.accessToken = token.access_token;
          fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
          console.log("Access token and refresh token stored in token.json");
          resolve();
        }
      });
    });
  });
}

async function authorize() {
  try {
    const token = fs.readFileSync(TOKEN_PATH);
    oAuth2Client.setCredentials(JSON.parse(token));
    transporter.options.auth.refreshToken = JSON.parse(token).refresh_token;
    transporter.options.auth.accessToken = JSON.parse(token).access_token;
    console.log("Access token and refresh token loaded from token.json");
  } catch (err) {
    await getAccessToken();
  }
}

async function sendEmailResponse(email, subject, body) {
  try {
    const res = await transporter.sendMail({
      from: "agentshrapnelcsgo@gmail.com",
      to: email,
      subject: subject,
      text: body,
    });
    console.log("Response sent:", res);
  } catch (error) {
    console.error("Error sending response:", error);
    throw error;
  }
}

async function processIncomingEmails() {
  try {
    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

    const response = await gmail.users.messages.list({
      userId: "me",
      labelIds: ["INBOX"],
      q: "is:unread",
    });

    const messages = response.data.messages;
    if (messages && messages.length) {
      for (const message of messages) {
        const email = await gmail.users.messages.get({
          userId: "me",
          id: message.id,
        });

        const { subject, body } = extractEmailDetails(email.data);

        try {
          await sendEmailResponse(
            email.data.payload.headers.find(
              (header) => header.name === "Reply-To"
            ).value,
            subject,
            body
          );
        } catch (error) {
          console.error("Error sending response:", error);
        }

        await gmail.users.messages.modify({
          userId: "me",
          id: message.id,
          resource: {
            removeLabelIds: ["UNREAD"],
          },
        });
      }
    }
  } catch (error) {
    console.error("Error processing emails:", error);
  }
}

function extractEmailDetails(email) {
  // Extract subject
  const subject = email.payload.headers.find(
    (header) => header.name === "Subject"
  ).value;

  let body = "";
  if (email.payload.parts && email.payload.parts.length) {
    body = Buffer.from(email.payload.parts[0].body.data, "base64").toString(
      "utf-8"
    );
  } else if (email.payload.body && email.payload.body.data) {
    body = Buffer.from(email.payload.body.data, "base64").toString("utf-8");
  }

  return { subject, body };
}

authorize().then(() => {
  setInterval(processIncomingEmails, 30000); // Check for emails every 30 seconds
});
