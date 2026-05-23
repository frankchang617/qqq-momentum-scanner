import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import https from "https";

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.get({ hostname: u.hostname, path: u.pathname + u.search, headers }, (res) => {
      let body = "";
      const cookies = (res.headers["set-cookie"] || []).map(c => c.split(";")[0]).join("; ");
      res.on("data", d => body += d);
      res.on("end", () => resolve({ body, cookies, status: res.statusCode }));
    }).on("error", reject);
  });
}

async function fetchYahooCrumb() {
  try {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    const init = await httpsGet("https://fc.yahoo.com/", { "User-Agent": ua });
    const cookie = init.cookies;
    const crumbRes = await httpsGet("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      "User-Agent": ua,
      "Cookie": cookie,
    });
    const crumb = crumbRes.body.trim();
    console.log(`[yahoo] crumb ready: ${crumb.slice(0, 6)}…`);
    return { crumb, cookie };
  } catch (e) {
    console.warn("[yahoo] crumb fetch failed:", e.message);
    return { crumb: "", cookie: "" };
  }
}

export default defineConfig(async () => {
  const yahoo = await fetchYahooCrumb();

  return {
    plugins: [react()],
    server: {
      open: false,
      port: 5174,
      strictPort: true,
      proxy: {
        "/yahoo": {
          target: "https://query2.finance.yahoo.com",
          changeOrigin: true,
          rewrite: (path) => {
            const stripped = path.replace(/^\/yahoo/, "");
            return yahoo.crumb ? `${stripped}&crumb=${encodeURIComponent(yahoo.crumb)}` : stripped;
          },
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.setHeader("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36");
              proxyReq.setHeader("Accept", "application/json, text/plain, */*");
              if (yahoo.cookie) proxyReq.setHeader("Cookie", yahoo.cookie);
            });
          },
        },
      },
    },
  };
});
