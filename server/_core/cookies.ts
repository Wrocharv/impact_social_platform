import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  const hostname = req.hostname || "";
  const isLocalHost = LOCAL_HOSTS.has(hostname) || isIpAddress(hostname) || hostname.endsWith(".local");
  const isSecure = isSecureRequest(req);

  return {
    httpOnly: true,
    path: "/",
    // Only require Secure when the connection is actually HTTPS. On local HTTP
    // the Secure flag causes the browser to silently drop the cookie.
    sameSite: isLocalHost ? "lax" : "none",
    secure: isSecure,
  };
}
