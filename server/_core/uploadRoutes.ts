import type { Express } from "express";
import multer from "multer";
import { saveLocalCampaignUpload } from "../campaigns";
import { storagePut } from "../storage";
import { getAdminSessionFromRequest } from "./adminAuth";

const ALLOWED_VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

function extensionForVideoMimeType(mimeType: string) {
  if (mimeType === "video/webm") return "webm";
  if (mimeType === "video/ogg") return "ogv";
  if (mimeType === "video/quicktime") return "mov";
  return "mp4";
}

function cleanFileNameBase(name: string) {
  return name.replace(/[^A-Za-z0-9._ -]/g, "_").replace(/\.[^.]+$/, "").trim().slice(0, 200) || "video";
}

// Upload de vídeo via multipart/form-data — em vez de converter o arquivo pra
// base64 e mandar como JSON (o que trava/estoura em arquivos grandes), o
// navegador manda o arquivo direto, do jeito que ele é.
export function registerUploadRoutes(app: Express) {
  app.post("/api/upload/video", (req, res) => {
    upload.single("file")(req, res, async (err) => {
      if (err) {
        const message = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
          ? "O vídeo deve ter no máximo 200MB."
          : "Não foi possível processar o arquivo enviado.";
        res.status(400).json({ error: message });
        return;
      }

      const admin = await getAdminSessionFromRequest(req);
      if (!admin) {
        res.status(403).json({ error: "Não autorizado." });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: "Nenhum arquivo enviado." });
        return;
      }

      if (!ALLOWED_VIDEO_MIME_TYPES.includes(req.file.mimetype)) {
        res.status(400).json({ error: "Selecione um vídeo válido (.mp4, .mov, .webm ou .ogg)." });
        return;
      }

      const extension = extensionForVideoMimeType(req.file.mimetype);
      const safeName = cleanFileNameBase(req.file.originalname);

      try {
        const uploaded = await storagePut(`campaigns/${Date.now()}-${safeName}.${extension}`, req.file.buffer, req.file.mimetype);
        res.json({ success: true, url: uploaded.url, key: uploaded.key });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao enviar vídeo.";
        const storageNotConfigured = /Storage config missing|BUILT_IN_FORGE_API_(URL|KEY)/i.test(message);

        if (storageNotConfigured) {
          const localUpload = saveLocalCampaignUpload(safeName, extension, req.file.buffer);
          res.json({ success: true, url: localUpload.url, key: localUpload.key });
          return;
        }

        res.status(502).json({ error: message });
      }
    });
  });
}
