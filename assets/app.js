/* Action page: bill selectors, letter builder, MP + senator lookup, mailto.
   No storage, no analytics. The only network call is the optional MP
   postal-code lookup to represent.opennorth.ca, made on explicit click.
   Senator matching is fully local (postal first letter -> province -> the
   embedded senators list from sencanada.ca). */

(function () {
  "use strict";

  const BILLS = window.SITE_DATA.bills;
  const SENATORS = window.SITE_DATA.senators || [];
  const byCode = Object.fromEntries(BILLS.map((b) => [b.bill.toUpperCase(), b]));

  const REGISTER_LABEL = { alarm: "Alarm", concern: "Concern", explain: "Explain" };
  const GROUP_LABEL = {
    alarm: "ALARM — reform demanded",
    concern: "CONCERN — answers required",
    explain: "EXPLAIN — explanation required",
  };
  const AFFILIATION = {
    CSG: "Canadian Senators Group",
    C: "Conservative",
    ISG: "Independent Senators Group",
    PSG: "Progressive Senate Group",
  };

  let current = null;
  let mp = null; // {name, party, riding, email}
  let senator = null; // {name, first, last, province, email, affiliation}
  let provinceSenators = [];

  const $ = (id) => document.getElementById(id);

  // The enacted file lives behind a hidden tab: default view = active bills only.
  // Enacted mode engages via ?file=enacted or a deep link to a bill that is law.
  const PARAMS = new URLSearchParams(location.search);
  const WANT = (PARAMS.get("bill") || "").toUpperCase();
  const MODE =
    PARAMS.get("file") === "enacted" ||
    (WANT && byCode[WANT] && byCode[WANT].status === "law")
      ? "enacted"
      : "active";

  /* ---------------- letter templates ---------------- */

  // appended to the lead as one paragraph — the sample's "…it makes three
  // changes this chamber should not pass unamended" move
  const INTRO = {
    alarm: "These provisions should not pass unamended:",
    concern:
      "It leaves serious questions that should be answered on the record, not waved through:",
    explain:
      "Much of its real substance is not written in its text — the public deserves clear answers on the following:",
  };

  const INTRO_LAW = {
    alarm: "These provisions are now in force, and they remain unjustified:",
    concern:
      "It leaves serious questions that must now be answered in how it is used:",
    explain:
      "Much of its real substance was left out of its text — the public deserves clear answers on the following:",
  };

  // Full stage coverage (see Graphics/stage-action-cta.md) — the mechanical
  // sync can move a bill to any of these without human editing.
  const STAGE_ASK = {
    "house-1st": {
      alarm:
        "This bill has just been introduced in the House. I am asking you to put your position on the provisions above on the record before debate begins — the earliest objection is the hardest to ignore.",
      concern:
        "This bill has just been introduced in the House. I am asking you to put these questions to the government before debate begins, so they are on the record from the start.",
      explain:
        "This bill has just been introduced in the House. I am asking you to seek these answers before debate begins, so the House starts from what the bill actually delegates.",
    },
    "house-2nd": {
      alarm:
        "The House is debating this bill now and will vote on whether to advance it. Before that vote, I am asking you to state your position on the provisions above and press for their amendment. If the government intends to keep them, it owes the public a justification on the record.",
      concern:
        "The House is debating this bill now. Before the second-reading vote, I am asking you to put these questions to the government — and to press for answers, and amendments where warranted, when the bill reaches committee.",
      explain:
        "The House is debating this bill now. Before the second-reading vote, I am asking you to seek these answers and place them on the record, so Parliament votes knowing what it is delegating.",
    },
    "house-committee": {
      alarm:
        "This bill is at committee — the stage where the text can actually change. I am asking you to press for the provisions above to be amended, and to support the witnesses and written briefs raising them. If the government intends to keep them, it owes the public a justification on the record.",
      concern:
        "This bill is at committee — the stage where the text can actually change. I am asking you to make sure these questions are put to witnesses and to the government, and answered before the bill returns to the House.",
      explain:
        "This bill is at committee — the stage where the text can actually change. I am asking you to have these answers put on the committee record before the bill returns to the House.",
    },
    "house-report": {
      alarm:
        "The House is weighing the committee's amendments and can still make more. I am asking you to press for the provisions above to be amended while the text is in play. If the government intends to keep them, it owes the public a justification on the record.",
      concern:
        "The House is weighing the committee's amendments and can still make more. I am asking you to press for these questions to be answered — and the text amended where warranted — while it is still in play.",
      explain:
        "The House is weighing the committee's amendments and can still make more. I am asking you to have these answers placed on the record while the text is still in play.",
    },
    "house-3rd": {
      alarm:
        "This bill is at third reading — the final House debate and vote. Before the House gives its last word, I am asking you to state your position on the provisions above. If the government intends to keep them, it owes the public a justification on the record.",
      concern:
        "This bill is at third reading — the final House debate and vote. I am asking you to put these questions on the record before the House gives its last word.",
      explain:
        "This bill is at third reading — the final House debate and vote. I am asking you to have these answers placed on the record before the House gives its last word.",
    },
    "senate-1st": {
      alarm:
        "I am asking you to press for these provisions to be amended at committee. The Senate is the last chamber that can. If the government intends to keep them, it owes the public a justification on the record.",
      concern:
        "This bill is now before the Senate. I am asking you to press for these questions to be answered — and the text amended where warranted — before the Senate lets it pass.",
      explain:
        "This bill is now before the Senate. I am asking you to have these answers placed on the record before the Senate lets it pass.",
    },
    "senate-2nd": {
      alarm:
        "The Senate is debating this bill's principle and will vote. Before that vote, I am asking you to state your position on the provisions above and press for their amendment at committee — the Senate is the last chamber that can.",
      concern:
        "The Senate is debating this bill now. Before the second-reading vote, I am asking you to press for these questions to be answered — and the text amended where warranted — before the Senate lets it pass.",
      explain:
        "The Senate is debating this bill now. I am asking you to have these answers placed on the record before the vote.",
    },
    "senate-committee": {
      alarm:
        "This bill is at Senate committee — the last place its text can realistically change. I am asking you to press for the provisions above to be amended, and to support the witnesses and written briefs raising them.",
      concern:
        "This bill is at Senate committee — the last place its text can realistically change. I am asking you to make sure these questions are put to witnesses and answered before the bill moves on.",
      explain:
        "This bill is at Senate committee — the last place its text can realistically change. I am asking you to have these answers put on the committee record.",
    },
    "senate-report": {
      alarm:
        "The Senate is weighing amendments and can still make more. I am asking you to press for the provisions above to be amended while the text is in play — the Senate is the last chamber that can.",
      concern:
        "The Senate is weighing amendments and can still make more. I am asking you to press for these questions to be answered while the text is still in play.",
      explain:
        "The Senate is weighing amendments and can still make more. I am asking you to have these answers placed on the record while the text is still in play.",
    },
    "senate-3rd": {
      alarm:
        "This bill is at third reading in the Senate — the last vote it will ever face. Before it, I am asking you to state your position on the provisions above. If the government intends to keep them, it owes the public a justification on the record.",
      concern:
        "This bill is at third reading in the Senate — the last vote it will ever face. I am asking you to put these questions on the record before it.",
      explain:
        "This bill is at third reading in the Senate — the last vote it will ever face. I am asking you to have these answers placed on the record before it.",
    },
    "awaiting-ra": {
      alarm:
        "This bill has passed both chambers and can no longer be voted down. The decisions that remain move to the regulations. I am asking you to scrutinize them as they appear in the Canada Gazette, to press for an early amending bill addressing the provisions above, and to demand a public accounting for how these powers will be used.",
      concern:
        "This bill has passed both chambers and can no longer be voted down. I am asking you to press for these questions to be answered as the regulations are drafted in the Canada Gazette — before the powers are used.",
      explain:
        "This bill has passed both chambers. I am asking you to obtain these answers as the regulations are drafted in the Canada Gazette, and to make them public.",
    },
    law: {
      alarm:
        "This act is now law; that ends the votes, not the accountability. I am asking you to press for an amending bill addressing the provisions above, to scrutinize the regulations as they appear in the Canada Gazette, and to demand a public accounting for how these powers are used.",
      concern:
        "This act is now law. I am asking you to watch how it is used — the first cases will show whether the concerns above were warranted — and to press publicly for correction if they are borne out.",
      explain:
        "This act is now law. I am asking you to obtain these answers from the government and make them public, and to scrutinize the regulations as they are made in the Canada Gazette.",
    },
  };

  // Escalated stance for a bill whose defect is its architecture, not a fixable
  // clause (action.json: "stance": "oppose", alarm register only). The urgency
  // comes from the directness of the ask — oppose/withhold/repeal — never from
  // louder adjectives.
  const OPPOSE_INTRO_ACTIVE =
    "It should not pass as written — the provisions below are not flaws at its margin; they are its architecture:";
  const OPPOSE_INTRO_LAW =
    "What is wrong with it is structural, not incidental:";
  const OPPOSE_ASK = {
    "house-1st":
      "This bill has just been introduced. I am asking you to oppose it from the start — on the record, before debate begins — unless these provisions are removed.",
    "house-2nd":
      "The House votes on whether to advance this bill. I am asking you to vote against it unless these provisions are removed — and to say so, on the record, before the vote.",
    "house-committee":
      "This bill is at committee — the last easy place to fix it. I am asking you to press for the provisions above to be struck, and if they are not, to vote against the bill at report stage and third reading.",
    "house-report":
      "The House can still amend this bill. I am asking you to press for the provisions above to be struck, and if they are not, to vote against the bill at third reading.",
    "house-3rd":
      "This is the House's last word on this bill. I am asking you to vote against it — these provisions should not leave the House intact.",
    "senate-1st":
      "This bill is now before the Senate — the last chamber that can stop or amend it. I am asking you to withhold your support until these provisions are removed.",
    "senate-2nd":
      "The Senate votes on this bill's principle. I am asking you to vote against advancing it unless these provisions are removed.",
    "senate-committee":
      "This bill is at Senate committee — the last place its text can change. I am asking you to press for the provisions above to be struck, and if they are not, to vote against the bill at third reading.",
    "senate-report":
      "The Senate can still amend this bill. I am asking you to press for the provisions above to be struck, and if they are not, to vote against it at third reading.",
    "senate-3rd":
      "This is the last vote this bill will ever face. I am asking you to vote against it — these provisions should not become law.",
    "awaiting-ra":
      "This bill has passed both chambers and can no longer be voted down. I am asking you to press, on the record, for an early amending bill removing the provisions above; to scrutinize every regulation made under it in the Canada Gazette; and to demand public reporting on each use of these powers.",
    law:
      "This act is now law. I am asking you to press, on the record, for the repeal or amendment of the provisions above; to scrutinize every regulation made under it in the Canada Gazette; and to demand public reporting on each use of these powers.",
  };

  // one warm closing register for MPs and senators alike — the force lives in
  // the asks, not the sign-off
  const CLOSING = {
    alarm:
      "I would be grateful for a written reply setting out your position on these provisions and what you intend to do about them.",
    concern:
      "I would be grateful for a written reply setting out your position on these concerns and how you will pursue them.",
    explain:
      "I would be grateful for a written reply with these answers, or a clear account of how and when they will be provided.",
  };

  function inSenate(b) {
    return b.status === "senate" || b.status.startsWith("senate-");
  }

  function stageKey(b) {
    if (b.status === "senate") return "senate-1st"; // legacy alias
    if (STAGE_ASK[b.status]) return b.status;
    // unknown stage: fall back to the chamber's vote-stage ask, never to "law"
    if (b.status === "law") return "law";
    return inSenate(b) ? "senate-2nd" : "house-2nd";
  }

  function unclearParagraph(b) {
    if (!b.unclear || !b.unclear.length) return "";
    const items = b.unclear
      .map((u) => `${u.text} (${u.cite})`)
      .join("; ");
    const when =
      b.status === "law"
        ? "publicly, as the regulations are made — before those powers are used"
        : "before Parliament is asked to approve them";
    return (
      `And where this bill leaves the rules undefined — ${items} — I am asking that they be explained and addressed ${when}. ` +
      `A power whose limits are set later is not a limited power.`
    );
  }

  function isOppose(b) {
    return b.register === "alarm" && b.stance === "oppose";
  }

  function buildLetter(b) {
    const isSenate = inSenate(b);
    const isLaw = b.status === "law";
    const oppose = isOppose(b);

    let greeting, constituent;
    if (isSenate) {
      greeting = senator ? `Dear Senator ${senator.last},` : "Dear Senator,";
      constituent = senator
        ? `I write to you as a resident of ${senator.province}, about Bill ${b.bill}.`
        : `I write to you from [your province], about Bill ${b.bill}.`;
    } else {
      greeting = mp ? `Dear ${mp.name},` : "Dear Member of Parliament,";
      constituent = mp
        ? `I am one of your constituents in ${mp.riding}, writing about Bill ${b.bill}.`
        : `I am one of your constituents in [your riding], writing about Bill ${b.bill}.`;
    }

    // claim -> cite -> consequence: each point is its own short paragraph
    const points = b.points
      .map((p) => `${p.text}. (${p.cite})` + (p.consequence ? ` ${p.consequence}` : ""))
      .join("\n\n");

    const intro = oppose
      ? isLaw
        ? OPPOSE_INTRO_LAW
        : OPPOSE_INTRO_ACTIVE
      : (isLaw ? INTRO_LAW : INTRO)[b.register];

    const parts = [
      `Re: Bill ${b.bill} — ${b.topic_ref} (${b.status_label})`,
      "",
      greeting,
      "",
      constituent,
      "",
      `${b.lead} ${intro}`,
      "",
      points,
    ];

    // credit-as-pivot: each bill's credit ends by turning back to the provisions
    if (b.credit) parts.push("", b.credit);

    const unclear = unclearParagraph(b);
    if (unclear) parts.push("", unclear);

    parts.push("", oppose ? OPPOSE_ASK[stageKey(b)] : STAGE_ASK[stageKey(b)][b.register]);
    parts.push("", CLOSING[b.register]);
    parts.push("", "Sincerely,", "[Your name]", "[Your address and postal code]");

    return parts.join("\n");
  }

  function buildSubject(b) {
    if (isOppose(b)) {
      return b.status === "law"
        ? `Bill ${b.bill}: this act needs repeal or amendment`
        : `Bill ${b.bill}: this bill should not pass as written`;
    }
    const s = {
      alarm: `Bill ${b.bill}: these provisions demand your action`,
      concern: `Bill ${b.bill}: questions Parliament must answer`,
      explain: `Bill ${b.bill}: the public deserves clear answers`,
    };
    return s[b.register];
  }

  /* ---------------- dropdowns (active file / enacted file) ---------------- */

  function fillSelect(sel, bills, placeholder, withDate) {
    sel.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = placeholder;
    sel.appendChild(ph);
    ["alarm", "concern", "explain"].forEach((reg) => {
      const group = bills.filter((b) => b.register === reg);
      if (!group.length) return;
      const og = document.createElement("optgroup");
      og.label = GROUP_LABEL[reg];
      group.forEach((b) => {
        const o = document.createElement("option");
        o.value = b.bill;
        const tail = withDate && b.law_date ? ` · law since ${b.law_date}` : "";
        o.textContent = `${b.bill} — ${b.descriptor}${tail}`;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
  }

  function applyMode() {
    if (MODE !== "enacted") return;
    const tab = $("tab-enacted");
    tab.classList.remove("hidden");
    tab.classList.add("active");
    $("tab-action").classList.remove("active");
    $("bill-select-label").textContent = "The enacted file — now law, still answerable";
    $("enacted-note").classList.remove("hidden");
    document.title = "The Enacted File — What Is the Government Doing";
  }

  function populateSelect() {
    const enacted = MODE === "enacted";
    fillSelect(
      $("bill-select"),
      BILLS.filter((b) => (b.status === "law") === enacted),
      enacted ? "— Select an enacted bill —" : "— Select a bill before Parliament —",
      enacted
    );
  }

  /* ---------------- render ---------------- */

  function renderBill(b) {
    current = b;
    const isLaw = b.status === "law";

    $("bill-select").value = b.bill;

    // simplified variant: recipient + letter appear only once a bill is chosen
    if (document.body.classList.contains("simple")) {
      $("recipient").classList.remove("hidden");
      $("letter-section").classList.remove("hidden");
    }

    $("bill-detail").classList.remove("hidden");
    $("bh-code").textContent = b.bill;
    const chip = $("bh-chip");
    chip.textContent = REGISTER_LABEL[b.register];
    chip.className = `chip ${b.register}`;
    const lawChip = $("bh-law");
    lawChip.classList.toggle("hidden", !isLaw);
    if (isLaw) lawChip.textContent = `Law since ${b.law_date || ""}`.trim();
    $("bh-desc").textContent = b.descriptor;
    $("bh-status").textContent = `Status — ${b.status_label}`;
    $("bh-legis").href = b.legisinfo;
    $("bh-lead").textContent = b.lead;

    const rec = $("bh-record-wrap");
    if (b.graphics && b.graphics.length) {
      rec.classList.remove("hidden");
      $("bh-record").href = `graphics.html#${b.bill}`;
    } else {
      rec.classList.add("hidden");
    }

    const isSenate = inSenate(b);
    $("mp-module").classList.toggle("hidden", isSenate);
    $("senate-module").classList.toggle("hidden", !isSenate);
    $("rcpt-title").textContent = isSenate
      ? "Find a senator from your province"
      : "Find your MP";

    $("letter").value = buildLetter(b);
    updateSendState();

    history.replaceState(null, "", `?bill=${encodeURIComponent(b.bill)}`);
    document.title = `Bill ${b.bill} — Take Action — What Is the Government Doing`;
  }

  function selectedBill(value) {
    const b = byCode[(value || "").toUpperCase()];
    if (b) renderBill(b);
  }

  /* ---------------- MP lookup (Represent, on explicit click only) ---------------- */

  async function findMP() {
    const raw = $("postal").value.replace(/\s+/g, "").toUpperCase();
    const err = $("mp-error");
    err.classList.add("hidden");
    if (!/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(raw)) {
      err.textContent = "That doesn't look like a Canadian postal code (format: K1A 0A6).";
      err.classList.remove("hidden");
      return;
    }
    const btn = $("find-mp");
    btn.disabled = true;
    btn.textContent = "Looking up…";
    try {
      const r = await fetch(`https://represent.opennorth.ca/postcodes/${raw}/`);
      if (!r.ok) throw new Error(`lookup failed (${r.status})`);
      const data = await r.json();
      const reps = (data.representatives_centroid || [])
        .concat(data.representatives_concordance || [])
        .filter((x) => x.elected_office === "MP");
      if (!reps.length) throw new Error("no MP found for that postal code");
      const m = reps[0];
      mp = {
        name: m.name,
        party: m.party_name || "",
        riding: m.district_name || "your riding",
        email: m.email || "",
      };
      $("mp-name").textContent = mp.name;
      $("mp-meta").textContent = [mp.party, mp.riding].filter(Boolean).join(" · ");
      $("mp-email").textContent = mp.email || "(no email listed — use the ourcommons.ca link below)";
      $("mp-card").classList.remove("hidden");
      if (current) $("letter").value = buildLetter(current);
      updateSendState();
    } catch (e) {
      err.textContent =
        "Lookup didn't work — the service may be busy, or the postal code may straddle ridings. " +
        "You can find your MP at ourcommons.ca (link below) and copy the letter instead.";
      err.classList.remove("hidden");
    } finally {
      btn.disabled = false;
      btn.textContent = "Find my MP";
    }
  }

  /* ---------------- senator lookup (fully local, no network) ---------------- */

  function provinceFromPostal(pc) {
    const first = pc[0];
    if (first === "X") {
      // Nunavut shares X with NWT; NU codes start X0A / X0B / X0C
      return ["X0A", "X0B", "X0C"].includes(pc.slice(0, 3)) ? "NU" : "NT";
    }
    const map = {
      A: "NL", B: "NS", C: "PE", E: "NB",
      G: "QC", H: "QC", J: "QC",
      K: "ON", L: "ON", M: "ON", N: "ON", P: "ON",
      R: "MB", S: "SK", T: "AB", V: "BC", Y: "YT",
    };
    return map[first] || null;
  }

  function splitName(listed) {
    // "Adler, Charles S." -> {first: "Charles S.", last: "Adler", full: "Charles S. Adler"}
    const i = listed.indexOf(",");
    if (i === -1) return { first: "", last: listed, full: listed };
    const last = listed.slice(0, i).trim();
    const first = listed.slice(i + 1).trim();
    return { first, last, full: `${first} ${last}` };
  }

  function setSenator(s) {
    if (!s) return;
    const n = splitName(s.name);
    senator = {
      name: s.name,
      first: n.first,
      last: n.last,
      full: n.full,
      province: s.province,
      email: s.email,
      affiliation: AFFILIATION[s.affiliation] || s.affiliation || "Non-affiliated",
      url: s.url,
    };
    $("sen-name").textContent = `Senator ${n.full}`;
    $("sen-meta").textContent = `${senator.affiliation} · ${s.province}`;
    $("sen-email").textContent = s.email;
    $("senator-card").classList.remove("hidden");
    if (current) $("letter").value = buildLetter(current);
    updateSendState();
  }

  function findSenators() {
    const raw = $("postal-sen").value.replace(/\s+/g, "").toUpperCase();
    const err = $("senator-error");
    err.classList.add("hidden");
    if (!/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(raw)) {
      if (raw.length >= 6) {
        err.textContent = "That doesn't look like a Canadian postal code (format: K1A 0A6).";
        err.classList.remove("hidden");
      }
      return;
    }
    const prov = provinceFromPostal(raw);
    provinceSenators = SENATORS.filter((s) => s.prov === prov);
    if (!prov || !provinceSenators.length) {
      err.textContent =
        "Couldn't match that postal code to a province — pick a senator in the directory (link below) and copy the letter.";
      err.classList.remove("hidden");
      return;
    }
    const sel = $("senator-select");
    sel.innerHTML = "";
    provinceSenators.forEach((s, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = `${splitName(s.name).full} — ${AFFILIATION[s.affiliation] || s.affiliation || "Non-affiliated"}`;
      sel.appendChild(o);
    });
    sel.disabled = false;
    // random default: no editorial or partisan pick, and letters spread evenly
    const pick = Math.floor(Math.random() * provinceSenators.length);
    sel.value = String(pick);
    setSenator(provinceSenators[pick]);
  }

  /* ---------------- send / copy ---------------- */

  function recipientEmail() {
    if (!current) return "";
    if (inSenate(current)) return senator ? senator.email : "";
    return mp ? mp.email : "";
  }

  function updateSendState() {
    $("copy-email").disabled = !recipientEmail();
    const hint = $("send-hint");
    hint.classList.add("hidden");
  }

  function sendMail() {
    if (!current) return;
    const subject = buildSubject(current);
    const body = $("letter").value;
    const to = recipientEmail();
    const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    if (url.length > 7500) {
      // some mail clients truncate very long mailto bodies
      copyText($("letter").value, "copy-letter");
      const hint = $("send-hint");
      hint.textContent =
        "This letter is long for a mailto link, so it was copied to your clipboard instead — paste it into your email app." +
        (to ? ` Recipient: ${to}` : "");
      hint.classList.remove("hidden");
      return;
    }
    window.location.href = url;
  }

  function copyText(text, btnId) {
    const done = () => {
      const btn = $(btnId);
      const old = btn.textContent;
      btn.textContent = "Copied ✓";
      setTimeout(() => (btn.textContent = old), 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
    done();
  }

  /* ---------------- init ---------------- */

  applyMode();
  populateSelect();

  $("bill-select").addEventListener("change", (e) => selectedBill(e.target.value));
  $("find-mp").addEventListener("click", findMP);
  $("postal").addEventListener("keydown", (e) => {
    if (e.key === "Enter") findMP();
  });
  $("postal-sen").addEventListener("input", findSenators);
  $("senator-select").addEventListener("change", (e) => {
    const s = provinceSenators[Number(e.target.value)];
    if (s) setSenator(s);
  });
  $("send-btn").addEventListener("click", sendMail);
  $("copy-letter").addEventListener("click", () => copyText($("letter").value, "copy-letter"));
  $("copy-email").addEventListener("click", () => {
    const to = recipientEmail();
    if (to) copyText(to, "copy-email");
  });

  // deep link: ?bill=C-22 (the direct landing page IS the general page, pre-selected)
  if (WANT && byCode[WANT]) {
    renderBill(byCode[WANT]);
  }
})();
