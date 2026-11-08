import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

// O WhatsApp le a pagina sem rodar o React: a previa do link so aparece se as etiquetas ja vierem no HTML.
const PREVIA_SOCIO_DOADOR = {
  titulo: "Você viveu o Maanaim? Ajude a construir o Hotel Recanto de Paz",
  descricao: "Seja um Sócio Doador com R$ 100 por mês ou o valor que puder. Você escolhe as parcelas e o dia de pagar.",
  url: "https://www.parceriadobem.com.br/socio-doador",
  imagem: "https://www.parceriadobem.com.br/socio-doador-previa.jpg",
};

export function comPreviaSocioDoador(html: string): string {
  const { titulo, descricao, url, imagem } = PREVIA_SOCIO_DOADOR;
  const etiquetas = [
    `<meta name="description" content="${descricao}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Parceria do Bem" />`,
    `<meta property="og:title" content="${titulo}" />`,
    `<meta property="og:description" content="${descricao}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${imagem}" />`,
    `<meta property="og:image:type" content="image/jpeg" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].join("\n    ");
  return html
    .replace(/<title>[^<]*<\/title>/, () => `<title>${titulo}</title>`)
    .replace("</head>", () => `    ${etiquetas}\n  </head>`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // Uploads em runtime (fotos/vídeos de campanha) são gravados em client/public/uploads,
  // fora do diretório de build (dist/public), que é sobrescrito a cada deploy. Servir essa
  // pasta separadamente garante que o arquivo fique visível assim que é salvo, sem esperar
  // um novo build — e, com o disco persistente do Render montado ali, sobrevive a deploys.
  const uploadsPath = path.resolve(process.cwd(), "client", "public", "uploads");
  fs.mkdirSync(uploadsPath, { recursive: true });
  app.use(
    "/uploads",
    express.static(uploadsPath, {
      setHeaders: (res, filePath) => {
        // Vídeo gravado no iPhone chega como .mov, e o Express anuncia "video/quicktime" —
        // que Chrome, Firefox e Edge se recusam a tocar. Só que o conteúdo é H.264/AAC, o
        // mesmo do MP4: o que atrapalha é a etiqueta, não o vídeo. Anunciar como mp4 faz os
        // arquivos que já estão no ar voltarem a funcionar, sem ninguém reenviar nada.
        if (/\.mov$/i.test(filePath)) {
          res.setHeader("Content-Type", "video/mp4");
        }
      },
    }),
  );

  app.use(express.static(distPath));

  app.get("/socio-doador", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.type("html").send(comPreviaSocioDoador(fs.readFileSync(path.resolve(distPath, "index.html"), "utf-8")));
  });

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    // Ensure clients always revalidate the HTML shell and receive latest asset hashes.
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
