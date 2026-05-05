(function () {
  const SESSION_KEY = "biason.auth";
  const LOGIN_PAGE = "login.html";
  const HUB_PAGE = "BIASON_Hub_Cliente.html";
  const SESSION_HOURS = 8;
  const USERS = [
    {
      name: "Administrador",
      email: "admin@biason.com.br",
      hash: "b3158e184a7aa771c6f414377529d20b84c81b61be17a4d2776ae85a0f7202d5",
    },
    {
      name: "RH Biason",
      email: "rh@biason.com.br",
      hash: "0679a3c2098a02d90589beebdf7b00d5a746a8b346e06e4769c82d96aee1b71d",
    },
  ];

  const currentPage = decodeURIComponent(location.pathname.split("/").pop() || "index.html");
  const publicPages = new Set(["index.html", LOGIN_PAGE]);

  function readSession() {
    const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    try {
      const session = JSON.parse(raw);
      if (!session.expiresAt || session.expiresAt < Date.now()) {
        localStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
      return session;
    } catch (error) {
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_KEY);
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
    const next = encodeURIComponent(currentPage + location.search + location.hash);
    location.replace(`${LOGIN_PAGE}?next=${next}`);
  }

  window.BiasonAuth = {
    getSession: readSession,

    async login(email, password, remember) {
      const normalizedEmail = String(email || "").trim().toLowerCase();
      const passwordText = String(password || "");
      const credentialHash = await sha256(`${normalizedEmail}:${passwordText}`);
      const user = USERS.find((item) => item.email === normalizedEmail && item.hash === credentialHash);

      if (!user) return { ok: false };

      const session = {
        email: user.email,
        name: user.name,
        expiresAt: Date.now() + SESSION_HOURS * 60 * 60 * 1000,
      };
      const storage = remember ? localStorage : sessionStorage;
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      storage.setItem(SESSION_KEY, JSON.stringify(session));
      return { ok: true, session };
    },

    logout() {
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      location.replace(LOGIN_PAGE);
    },
  };

  if (currentPage === "index.html") {
    location.replace(readSession() ? HUB_PAGE : LOGIN_PAGE);
    return;
  }

  if (!publicPages.has(currentPage) && !readSession()) {
    redirectToLogin();
  }
})();
