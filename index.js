import express from "express";
import cors from "cors";
import { db, messaging } from "./firebaseConfig.js";

const app = express();

app.use(cors());
app.use(express.json());

// GET /health
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "ShadowChat backend funcionando"
  });
});

// POST /sendMessage
// Body JSON de ejemplo:
// {
//   "toUsername": "nombreUsuarioDestino",
//   "text": "texto del mensaje",
//   "fromUsername": "nombreUsuarioOrigen"  // opcional
// }
app.post("/sendMessage", async (req, res) => {
  try {
    const { toUsername, text, fromUsername } = req.body;

    if (!toUsername || !text) {
      return res.status(400).json({
        error: "Campos requeridos: toUsername y text"
      });
    }

    const userDoc = await db.collection("users").doc(toUsername).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        error: "Usuario destino no encontrado en Firestore"
      });
    }

    const userData = userDoc.data();
    const fcmToken = userData?.fcmToken;

    if (!fcmToken) {
      return res.status(400).json({
        error: "El usuario destino no tiene fcmToken guardado"
      });
    }

    const message = {
      token: fcmToken,
      notification: {
        title: fromUsername
          ? `Nuevo mensaje de ${fromUsername}`
          : "Nuevo mensaje",
        body: text
      },
      data: {
        toUsername,
        fromUsername: fromUsername || "",
        text
      }
    };

    const response = await messaging.send(message);
    console.log("Notificación enviada:", response);

    return res.json({
      ok: true,
      messageId: response
    });
  } catch (err) {
    console.error("Error en /sendMessage:", err);
    return res.status(500).json({
      error: "Error interno en el servidor"
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
