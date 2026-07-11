/* The Record: bill carousels grouped by register, then roundups/primers/reference.
   Static render from embedded data; lightbox viewer; no network, no storage. */

(function () {
  "use strict";

  const DATA = window.SITE_DATA;
  const root = document.getElementById("gallery-root");

  const REGISTER_HEAD = {
    alarm: ["Alarm", "Bills whose provisions demand reform"],
    concern: ["Concern", "Real tensions Parliament must answer"],
    explain: ["Explain", "Consequential bills whose substance is set later"],
  };

  let lbImages = [];
  let lbIndex = 0;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function strip(images, altBase) {
    const s = el("div", "strip");
    images.forEach((src, i) => {
      const img = el("img");
      img.loading = "lazy";
      img.src = src;
      img.alt = `${altBase} — slide ${i + 1} of ${images.length}`;
      img.addEventListener("click", () => openLightbox(images, i));
      s.appendChild(img);
    });
    return s;
  }

  function renderBills() {
    ["alarm", "concern", "explain"].forEach((reg) => {
      const bills = DATA.bills.filter((b) => b.register === reg && b.graphics.length);
      if (!bills.length) return;

      const sec = el("section", "block gallery-group");
      const eye = el("div", "eyebrow", `Register · ${REGISTER_HEAD[reg][0]}`);
      const h = el("h2", "section-title", REGISTER_HEAD[reg][1]);
      sec.appendChild(eye);
      sec.appendChild(h);

      bills.forEach((b) => {
        const item = el("div", "gallery-item");
        item.id = b.bill;

        const head = el("div", "g-head");
        head.appendChild(el("span", "g-code", b.bill));
        const chip = el("span", `chip ${b.register}`, REGISTER_HEAD[reg][0]);
        head.appendChild(chip);
        if (b.status === "law")
          head.appendChild(
            el("span", "chip law", b.law_date ? `Law since ${b.law_date}` : "Now law")
          );
        head.appendChild(el("span", "g-desc", b.descriptor));
        const act = el("a", "g-act", "Take action on this bill →");
        act.href = `index.html?bill=${encodeURIComponent(b.bill)}`;
        head.appendChild(act);

        item.appendChild(head);
        item.appendChild(strip(b.graphics, `Bill ${b.bill}: ${b.descriptor}`));
        sec.appendChild(item);
      });

      root.appendChild(sec);
    });
  }

  function renderExtras() {
    const sections = [...new Set(DATA.extras.map((e) => e.section))];
    sections.forEach((section) => {
      const items = DATA.extras.filter((e) => e.section === section);
      if (!items.length) return;
      const sec = el("section", "block gallery-group");
      sec.appendChild(el("div", "eyebrow", `File · ${section}`));
      sec.appendChild(el("h2", "section-title", section));
      items.forEach((e) => {
        const item = el("div", "gallery-item");
        const head = el("div", "g-head");
        head.appendChild(el("span", "g-desc", e.name));
        item.appendChild(head);
        item.appendChild(strip(e.images, e.name));
        sec.appendChild(item);
      });
      root.appendChild(sec);
    });
  }

  /* ---------- lightbox ---------- */

  const lb = document.getElementById("lightbox");
  const lbImg = document.getElementById("lb-img");
  const lbCount = document.getElementById("lb-count");

  function openLightbox(images, i) {
    lbImages = images;
    lbIndex = i;
    updateLightbox();
    lb.classList.add("open");
  }
  function updateLightbox() {
    lbImg.src = lbImages[lbIndex];
    lbCount.textContent = `${lbIndex + 1} / ${lbImages.length}`;
  }
  function move(delta) {
    lbIndex = (lbIndex + delta + lbImages.length) % lbImages.length;
    updateLightbox();
  }

  document.getElementById("lb-close").addEventListener("click", () => lb.classList.remove("open"));
  document.getElementById("lb-prev").addEventListener("click", (e) => { e.stopPropagation(); move(-1); });
  document.getElementById("lb-next").addEventListener("click", (e) => { e.stopPropagation(); move(1); });
  lb.addEventListener("click", (e) => { if (e.target === lb) lb.classList.remove("open"); });
  document.addEventListener("keydown", (e) => {
    if (!lb.classList.contains("open")) return;
    if (e.key === "Escape") lb.classList.remove("open");
    if (e.key === "ArrowLeft") move(-1);
    if (e.key === "ArrowRight") move(1);
  });

  /* ---------- init ---------- */

  renderBills();
  renderExtras();

  // deep link: graphics.html#C-22 scrolls to that bill's strip
  if (location.hash) {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) setTimeout(() => target.scrollIntoView({ behavior: "smooth" }), 150);
  }
})();
