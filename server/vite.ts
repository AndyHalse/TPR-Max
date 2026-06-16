import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { injectSeo } from "./seo";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
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
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      const injected = await injectSeo(page, url);
      res.status(200).set({ "Content-Type": "text/html" }).end(injected);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

// Cached base template for production (read once, inject per request)
let cachedProdTemplate: string | null = null;

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // For HTML navigation requests: read template, inject per-page SEO, send
  app.use("*", async (req, res) => {
    const indexPath = path.resolve(distPath, "index.html");

    // Skip non-HTML requests (assets, API — those are already handled above)
    const url = req.originalUrl;
    const hasExt = /\.[a-zA-Z0-9]+$/.test(url.split('?')[0]);
    if (hasExt || url.startsWith('/api/')) {
      res.sendFile(indexPath);
      return;
    }

    try {
      if (!cachedProdTemplate) {
        cachedProdTemplate = await fs.promises.readFile(indexPath, "utf-8");
      }
      const injected = await injectSeo(cachedProdTemplate, url);
      res.status(200).set({ "Content-Type": "text/html" }).end(injected);
    } catch {
      // Fallback: send unmodified template so the app never fails to load
      res.sendFile(indexPath);
    }
  });
}
