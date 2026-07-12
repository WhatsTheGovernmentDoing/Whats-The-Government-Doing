/* "Get this as an app" pill — small, bottom-right, dismissible, never modal.
   - Hidden entirely if the site is already running as an installed app.
   - Dismissal is remembered on the visitor's own device (localStorage flag);
     nothing leaves the browser.
   - On Chrome/Edge/Android, clicking triggers the native install prompt
     directly; everywhere else it opens install.html (plain instructions). */

(function () {
  "use strict";

  const isInstalled =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  if (isInstalled) return;

  let dismissed = false;
  try { dismissed = localStorage.getItem("wtgd-install-dismissed") === "1"; } catch (e) {}
  if (dismissed) return;

  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // suppress the browser's own banner; the pill is the entry point
    deferredPrompt = e;
  });

  const pill = document.createElement("div");
  pill.className = "install-pill";
  pill.innerHTML =
    '<a href="install.html" id="install-go">Get this as an app <span aria-hidden="true">→</span></a>' +
    '<button id="install-x" aria-label="Dismiss">×</button>';
  document.body.appendChild(pill);

  pill.querySelector("#install-go").addEventListener("click", (e) => {
    if (deferredPrompt) {
      e.preventDefault();
      deferredPrompt.prompt();
      deferredPrompt = null;
    }
  });

  window.addEventListener("appinstalled", () => pill.remove());

  pill.querySelector("#install-x").addEventListener("click", () => {
    try { localStorage.setItem("wtgd-install-dismissed", "1"); } catch (e) {}
    pill.remove();
  });
})();
