import express from "express";
import cors from "cors";
import crypto from "crypto";
import { db, messaging } from "./firebaseConfig.js";

const app = express();

app.use(cors());
app.use(express.json());

const keyHex = process.env.ENCRYPTION_KEY_HEX;

if (!keyHex) {
  throw new Error("ENCRYPTION_KEY_HEX no está definida");
}

const KEY = Buffer.from(keyHex, "hex");
if (KEY.length !== 32) {
  throw new Error("ENCRYPTION_KEY_HEX debe tener 32 bytes");
}

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function decryptBase64AesGcm(cipherBase64) {
  if (!cipherBase64) return "";

  const combined = Buffer.from(cipherBase64, "base64");
  const iv = combined.subarray(0, IV_BYTES);
  const tag = combined.subarray(combined.length - TAG_BYTES);
  const encrypted = combined.subarray(IV_BYTES, combined.length - TAG_BYTES);

  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

function encryptBase64AesGcm(plaintext) {
  if (!plaintext) return "";

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ]);

  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, encrypted, tag]);

  return combined.toString("base64");
}

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/sendMessage", async (req, res) => {
  try {
    const { toUsername, text, fromUsername } = req.body;
    if (!toUsername || !text) {
      return res.status(400).json({ error: "Campos requeridos" });
    }

    const decToUsername = decryptBase64AesGcm(toUsername);
    const decText = decryptBase64AesGcm(text);
    const decFromUsername = fromUsername ? decryptBase64AesGcm(fromUsername) : "";

    const userDoc = await db.collection("users").doc(decToUsername).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const fcmToken = userDoc.data().fcmToken;
    if (!fcmToken) {
      return res.status(400).json({ error: "Usuario sin token" });
    }

    const encTo = encryptBase64AesGcm(decToUsername);
    const encFrom = encryptBase64AesGcm(decFromUsername);
    const encText = encryptBase64AesGcm(decText);

    const encTitle = encryptBase64AesGcm(
      decFromUsername
        ? `Nuevo mensaje de ${decFromUsername}`
        : "Nuevo mensaje"
    );

    const encBody = encryptBase64AesGcm(decText);

    const message = {
      token: fcmToken,
      data: {
        title: encTitle,
        body: encBody,
        toUsername: encTo,
        fromUsername: encFrom,
        text: encText
      },
      android: {
        priority: "high"
      },
      apns: {
        payload: {
          aps: {
            "content-available": 1
          }
        }
      }
    };

    const response = await messaging.send(message);

    return res.json({ ok: true, messageId: response });

  } catch (err) {
    return res.status(500).json({ error: "Error interno" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {});
