(function () {
  const SESSION_KEY = "biason.auth";
  const LOGIN_PAGE = "login.html";
  const HUB_PAGE = "BIASON_Hub_Cliente.html";
  const SESSION_HOURS = 8;
  const PROTECTED_PAGES = {
    [HUB_PAGE]: "hub",
    "dirf_debiason_indv.html": "dirf",
    "dirf_debiason_v2.html": "dirf",
    "rubricas_debiason_atualizado.html": "rubricas",
  };

  const USERS = [
    {
      name: "Administrador",
      email: "admin@biason.com.br",
      hash: "b3158e184a7aa771c6f414377529d20b84c81b61be17a4d2776ae85a0f7202d5",
      scopes: ["hub", "dirf", "rubricas"],
    },
    {
      name: "RH Biason",
      email: "rh@biason.com.br",
      hash: "0679a3c2098a02d90589beebdf7b00d5a746a8b346e06e4769c82d96aee1b71d",
      scopes: ["hub", "dirf", "rubricas"],
    },
    {
      name: "Lucas Biason",
      email: "lucasg@biason.net",
      hash: "bca50f9e2979cfe88613a8f028d1ab0472544e94bb7c4de4bb62229d32527dff",
      scopes: ["hub"],
    },
  ];

  const pathParts = location.pathname.split("/");
  const currentPage = decodeURIComponent(pathParts.pop() || "index.html");
  const isNestedPage = pathParts.includes("dirf");
  const rootPrefix = isNestedPage ? "../" : "";
  const currentPath = isNestedPage ? `dirf/${currentPage}` : currentPage;
  const publicPages = new Set(["index.html", LOGIN_PAGE]);

  function keyFor(scope) {
    return `${SESSION_KEY}.${scope || "hub"}`;
  }

  function clearSession(scope) {
    localStorage.removeItem(keyFor(scope));
    sessionStorage.removeItem(keyFor(scope));
  }

  function readSession(scope) {
    const sessionKey = keyFor(scope);
    const raw = localStorage.getItem(sessionKey) || sessionStorage.getItem(sessionKey);
    if (!raw) return null;

    try {
      const session = JSON.parse(raw);
      if (!session.expiresAt || session.expiresAt < Date.now()) {
        clearSession(scope);
        return null;
      }
      return session;
    } catch (error) {
      clearSession(scope);
      return null;
    }
  }

  async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  function redirectToLogin() {
    const next = encodeURIComponent(currentPath + location.search + location.hash);
    const scope = PROTECTED_PAGES[currentPage];
    const scopeParam = scope ? `&scope=${encodeURIComponent(scope)}` : "";
    location.replace(`${rootPrefix}${LOGIN_PAGE}?next=${next}${scopeParam}`);
  }

  function hasScope(session, scope) {
    return !!session && Array.isArray(session.scopes) && session.scopes.includes(scope);
  }

  window.BiasonAuth = {
    getSession: readSession,
    hasScope,

    async login(email, password, remember, requiredScope) {
      const normalizedEmail = String(email || "").trim().toLowerCase();
      const passwordText = String(password || "");
      const credentialHash = await sha256(`${normalizedEmail}:${passwordText}`);
      const user = USERS.find((item) => item.email === normalizedEmail && item.hash === credentialHash);

      if (!user) return { ok: false };
      if (requiredScope && !user.scopes.includes(requiredScope)) {
        return { ok: false, forbidden: true };
      }

      const session = {
        email: user.email,
        name: user.name,
        scope: requiredScope || "hub",
        scopes: user.scopes,
        expiresAt: Date.now() + SESSION_HOURS * 60 * 60 * 1000,
      };
      const storage = remember ? localStorage : sessionStorage;
      clearSession(requiredScope || "hub");
      storage.setItem(keyFor(requiredScope || "hub"), JSON.stringify(session));
      return { ok: true, session };
    },

    logout() {
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      ["hub", "dirf", "rubricas"].forEach(clearSession);
      location.replace(LOGIN_PAGE);
    },
  };

  if (currentPage === "index.html") {
    location.replace(hasScope(readSession("hub"), "hub") ? HUB_PAGE : LOGIN_PAGE);
    return;
  }

  const requiredScope = PROTECTED_PAGES[currentPage];
  if (!publicPages.has(currentPage) && requiredScope && !hasScope(readSession(requiredScope), requiredScope)) {
    redirectToLogin();
  }
})();
