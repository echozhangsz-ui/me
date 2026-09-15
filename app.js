(function () {
  const allNodes = window.experienceNodes || [];
  const timelineNodes = allNodes
    .filter((node) => !node.opportunity)
    .slice()
    .reverse();
  const journeyPanel = document.querySelector(".journey-panel");
  const journeyList = document.querySelector(".journey-list");
  const languageSwitch = document.querySelector(".language-switch");
  const curveTrack = document.querySelector(".curve-track");
  const curveActive = document.querySelector(".curve-line.is-active");
  const curveHighlight = document.querySelector(".curve-highlight");
  const modal = document.querySelector(".modal");
  const modalPanel = document.querySelector(".modal-panel");
  const modalCurveOverlay = document.createElement("div");
  modalCurveOverlay.className = "modal-curve-overlay";
  modalCurveOverlay.setAttribute("aria-hidden", "true");
  modal.insertBefore(modalCurveOverlay, modalPanel);
  let activeTrigger = null;
  let activeModalNodeId = null;
  let activeProjects = [];
  let currentJourneyId = "";
  let snapTimer = 0;
  let snapTargetId = "";
  let isSnapping = false;
  let nodeCueEnabled = false;
  const nodeCueAudio = new Audio("sfx/highlight.mp3");
  nodeCueAudio.preload = "auto";
  nodeCueAudio.volume = 0.62;
  const projectLimit = 12;
  const curveVisualWidth = 96;
  const curveLineLeft = 44;
  const curveTileScaledHeight = 480;
  const curveAmplitude = 18;
  const translations = window.portfolioTranslations || {};
  const supportedLanguages = ["en", "fr", "cn"];
  let currentLang = supportedLanguages.includes(localStorage.getItem("portfolioLanguage"))
    ? localStorage.getItem("portfolioLanguage")
    : "en";

  function activeTranslation() {
    return translations[currentLang] || translations.en || { ui: {}, experiences: {} };
  }

  function uiText(key) {
    return activeTranslation().ui?.[key] || translations.en?.ui?.[key] || key;
  }

  function experienceTranslation(nodeId) {
    return activeTranslation().experiences?.[nodeId] || {};
  }

  function localizeContent(content, node) {
    if (currentLang === "en") return content;
    const translated = experienceTranslation(node.id);
    return {
      ...content,
      company: translated.company || content.company,
      role: translated.role || content.role,
      preview: translated.preview || content.preview,
      summary: translated.summary || content.summary,
      tags: translated.tags || content.tags,
      roleMarkdown: translated.roleMarkdown || content.roleMarkdown
    };
  }

  function localizeProjects(projects, nodeId) {
    if (currentLang === "en") return projects;
    const translatedProjects = experienceTranslation(nodeId).projects || {};
    const translatedDescriptions = activeTranslation().projectDescriptions || {};
    return projects.map((project) => {
      const translated = translatedProjects[project.key] || {};
      return {
        ...project,
        title: translated.title || project.title,
        description: translated.description || translatedDescriptions[project.description] || project.description
      };
    });
  }

  function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  }

  function updateStaticText() {
    const translation = activeTranslation();
    document.documentElement.lang = translation.htmlLang || "en";
    setText(".eyebrow", uiText("eyebrow"));
    setText(".hero-line", uiText("heroLine"));
    setText(".hero-meta", uiText("heroMeta"));
    setText(".profile-section h2", uiText("profileTitle"));
    setText(".skills-heading", uiText("skillsTitle"));
    const downloadButton = document.querySelector(".button-primary");
    if (downloadButton) {
      downloadButton.innerHTML = `<span aria-hidden="true">↓</span>${escapeHtml(uiText("downloadCv"))}`;
    }
    setText(".button-ghost", uiText("contact"));
    setText(".journey-heading h2", uiText("journeyTitle"));
    setText(".modal-section-kicker", uiText("myRole"));

    const profileBullets = document.querySelector(".profile-bullets");
    if (profileBullets) {
      profileBullets.innerHTML = (uiText("profileBullets") || [])
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("");
    }

    document.querySelectorAll(".skill-grid > span").forEach((skill, index) => {
      const copy = uiText("skills")?.[index];
      if (!copy) return;
      const title = skill.querySelector("strong");
      const detail = skill.querySelector("small");
      if (title) title.textContent = copy[0];
      if (detail) detail.textContent = copy[1];
    });

    languageSwitch?.querySelectorAll("button[data-lang]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.lang === currentLang);
    });
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatInlineMarkdown(value) {
    return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }

  function textToHtml(text) {
    const lines = String(text || "").split(/\r?\n/);
    const html = [];
    let inList = false;

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        if (inList) {
          html.push("</ul>");
          inList = false;
        }
        return;
      }
      if (trimmed.startsWith("#")) {
        if (inList) {
          html.push("</ul>");
          inList = false;
        }
        html.push(`<h4>${escapeHtml(trimmed.replace(/^#+\s*/, ""))}</h4>`);
        return;
      }
      if (trimmed.startsWith("- ") || trimmed.startsWith("• ") || trimmed.startsWith("* ")) {
        if (!inList) {
          html.push("<ul>");
          inList = true;
        }
        html.push(`<li>${formatInlineMarkdown(trimmed.slice(2))}</li>`);
        return;
      }
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      const roleSubhead = trimmed.match(/^\*\*(.+?)\*\*$/);
      if (roleSubhead) {
        html.push(`<p class="role-subhead"><strong>${escapeHtml(roleSubhead[1])}</strong></p>`);
        return;
      }
      html.push(`<p>${formatInlineMarkdown(trimmed)}</p>`);
    });

    if (inList) html.push("</ul>");
    return html.join("");
  }

  async function fetchText(path) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) return "";
      return (await response.text()).trim();
    } catch {
      return "";
    }
  }

  function stripHeading(text, heading = "My role") {
    return String(text || "")
      .replace(new RegExp(`^#\\s*${heading}\\s*`, "i"), "")
      .trim();
  }

  function parseExperienceMarkdown(text, node) {
    const content = {
      company: node.company,
      role: node.role || "Details to come",
      year: node.year || "",
      location: node.location || "",
      preview: node.preview || "",
      summary: node.summary || "",
      tags: Array.isArray(node.tags) ? node.tags : [],
      roleMarkdown: "",
      projects: []
    };
    const source = String(text || "").replace(/\r\n/g, "\n").trim();
    if (!source) return content;

    const lines = source.split("\n");
    const firstHeading = lines.find((line) => /^#\s+/.test(line));
    if (firstHeading) content.company = firstHeading.replace(/^#\s+/, "").trim() || content.company;

    const sections = {};
    let sectionName = "meta";
    sections[sectionName] = [];
    lines.forEach((line) => {
      const heading = line.match(/^##\s+(.+)$/);
      if (heading) {
        sectionName = heading[1].trim().toLowerCase();
        sections[sectionName] = [];
        return;
      }
      const projectHeading = line.match(/^###\s+(.+)$/);
      if (projectHeading && /^project-\d+/i.test(projectHeading[1].trim())) {
        sectionName = "projects";
        if (!sections[sectionName]) sections[sectionName] = [];
        sections[sectionName].push(line);
        return;
      }
      if (!/^#\s+/.test(line)) sections[sectionName].push(line);
    });

    sections.meta.forEach((line) => {
      const match = line.match(/^([A-Za-z ]+):\s*(.*)$/);
      if (!match) return;
      const key = match[1].trim().toLowerCase();
      const value = match[2].trim();
      if (key === "role") content.role = value.replace(/\\([&|])/g, "$1") || content.role;
      if (key === "year") content.year = value || content.year;
      if (key === "location") content.location = value || content.location;
      if (key === "preview") content.preview = value || content.preview;
      if (key === "tags") content.tags = value.split(",").map((tag) => tag.trim()).filter(Boolean);
    });

    const summary = (sections.summary || []).join("\n").trim();
    if (summary) content.summary = summary;
    const roleMarkdown = (sections["my role"] || sections.responsibilities || []).join("\n").trim();
    if (roleMarkdown) content.roleMarkdown = roleMarkdown;

    const projectLines = sections.projects || [];
    let current = null;
    let readingDescription = false;
    projectLines.forEach((line) => {
      const projectHeading = line.match(/^###\s+(.+)$/);
      if (projectHeading) {
        if (current) content.projects.push(current);
        current = { key: projectHeading[1].trim(), title: "", description: "" };
        readingDescription = false;
        return;
      }
      if (!current) return;
      const titleMatch = line.match(/^Title:\s*(.*)$/);
      if (titleMatch) {
        current.title = titleMatch[1].trim();
        readingDescription = false;
        return;
      }
      const descriptionMatch = line.match(/^Description:\s*(.*)$/);
      if (descriptionMatch) {
        current.description = descriptionMatch[1].trim();
        readingDescription = true;
        return;
      }
      if (readingDescription) {
        current.description = [current.description, line.trim()].filter(Boolean).join(" ");
      }
    });
    if (current) content.projects.push(current);
    return content;
  }

  async function loadExperienceContent(node) {
    const root = `content/experiences/${node.id}`;
    const unified = await fetchText(`${root}/content.md`);
    const parsed = parseExperienceMarkdown(unified, node);
    if (unified) return parsed;
    const [titleText, responsibilityText] = await Promise.all([
      fetchText(`${root}/title.md`),
      fetchText(`${root}/responsibility.md`)
    ]);
    const title = parseTitleMarkdown(titleText, node);
    return {
      ...parsed,
      company: title.company,
      role: title.role,
      preview: title.note || parsed.preview,
      roleMarkdown: stripHeading(responsibilityText)
    };
  }

  async function firstExisting(paths) {
    for (const path of paths) {
      try {
        const response = await fetch(path, { method: "HEAD", cache: "no-store" });
        if (response.ok) return path;
      } catch {
        continue;
      }
    }
    return "";
  }

  function parseTitleMarkdown(text, node) {
    const lines = String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^#\s*/, ""))
      .filter(Boolean);
    return {
      company: lines[0] || node.company,
      role: lines[1] || node.role || "Details to come",
      meta: lines[2] || [node.year, node.location].filter(Boolean).join(" · "),
      note: lines[3] || node.preview || ""
    };
  }

  function titleFromProjectKey(key) {
    const slug = String(key || "").replace(/^project-\d{2}-?/i, "");
    if (!slug) return "";
    return slug
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function manifestEntriesFor(nodeId) {
    const manifest = window.experienceProjectMedia?.[nodeId] || {};
    if (Array.isArray(manifest)) return manifest;
    return Object.entries(manifest).map(([key, value]) => ({ key, ...value }));
  }

  function projectContentFor(projects, key, numericKey) {
    return (projects || []).find((project) => project.key === key || project.key === numericKey) || {};
  }

  async function loadProjects(node, contentProjects = []) {
    const root = `content/experiences/${node.id}`;
    const manifestEntries = manifestEntriesFor(node.id);
    const manifestKeys = new Set();
    const usesNamedFlatProjects = manifestEntries.some((item) => /^project-\d{2}-/i.test(item.key || ""));
    const projects = [];

    if (manifestEntries.length) {
      for (const manifestProject of manifestEntries) {
        const key = manifestProject.key;
        const numericKey = String(key || "").match(/^project-\d{2}/i)?.[0] || key;
        const contentProject = projectContentFor(contentProjects, key, numericKey);
        const base = `${root}/projects/${numericKey}`;
        manifestKeys.add(numericKey);
        const [titleText, legacyTitle, legacyDescription, fallbackThumbnail, fallbackVideo] = await Promise.all([
          fetchText(`${root}/projects/${key}.md`),
          fetchText(`${base}/title.md`),
          fetchText(`${base}/description.md`),
          manifestProject.thumbnail ? Promise.resolve("") : firstExisting([
            `${base}/thumbnail.png`,
            `${base}/thumbnail.jpg`,
            `${base}/thumbnail.webp`,
            `${root}/thumbnails/${numericKey}.png`,
            `${root}/thumbnails/${numericKey}.jpg`,
            `${root}/thumbnails/${numericKey}.webp`
          ]),
          manifestProject.video ? Promise.resolve("") : firstExisting([
            `${base}/video.mp4`,
            `${base}/video.webm`,
            `${base}/video.mov`,
            `${root}/videos/${numericKey}.mp4`,
            `${root}/videos/${numericKey}.webm`,
            `${root}/videos/${numericKey}.mov`
          ])
        ]);
        const lines = titleText
          .split(/\r?\n/)
          .map((line) => line.trim().replace(/^#\s*/, ""))
          .filter(Boolean);
        if (!lines.length && !legacyTitle && !legacyDescription && !manifestProject.thumbnail && !manifestProject.image && !manifestProject.video && !fallbackThumbnail && !fallbackVideo) {
          continue;
        }
        projects.push({
          key,
          title: contentProject.title || lines[0] || legacyTitle.replace(/^#\s*/, "") || manifestProject.title || titleFromProjectKey(key) || "Project",
          description: contentProject.description || lines.slice(1).join(" ") || legacyDescription || manifestProject.description || "Project details to come.",
          image: manifestProject.image || "",
          thumbnail: manifestProject.thumbnail || fallbackThumbnail,
          video: manifestProject.video || fallbackVideo,
          fit: manifestProject.fit || ""
        });
      }
      if (usesNamedFlatProjects) return projects;
    }

    for (let index = 1; index <= projectLimit; index += 1) {
      const key = `project-${String(index).padStart(2, "0")}`;
      if (manifestKeys.has(key)) continue;
      const contentProject = projectContentFor(contentProjects, key, key);
      const base = `${root}/projects/${key}`;
      const [title, description, thumbnail, fallbackVideo] = await Promise.all([
        fetchText(`${base}/title.md`),
        fetchText(`${base}/description.md`),
        firstExisting([
          `${base}/thumbnail.png`,
          `${base}/thumbnail.jpg`,
          `${base}/thumbnail.webp`,
          `${root}/thumbnails/${key}.png`,
          `${root}/thumbnails/${key}.jpg`,
          `${root}/thumbnails/${key}.webp`
        ]),
        firstExisting([
          `${base}/video.mp4`,
          `${base}/video.webm`,
          `${base}/video.mov`,
          `${root}/videos/${key}.mp4`,
          `${root}/videos/${key}.webm`,
          `${root}/videos/${key}.mov`
        ])
      ]);
      if (!title && !description && !thumbnail && !fallbackVideo) continue;
      projects.push({
        key,
        title: contentProject.title || title.replace(/^#\s*/, "") || `Project ${String(index).padStart(2, "0")}`,
        description: contentProject.description || description || "Project details to come.",
        thumbnail,
        video: fallbackVideo
      });
    }
    return projects;
  }

  function projectTeasers(projects) {
    return projects
      .filter((project) => project.thumbnail)
      .slice(0, 2)
      .map((project) => `
        <figure class="work-teaser">
          <img src="${project.thumbnail}" alt="" />
          <figcaption>${escapeHtml(project.title)}</figcaption>
        </figure>`)
      .join("");
  }

  function journeyCardMarkup(node, title, projects = []) {
    const teasers = projectTeasers(projects);
    return `
      <p class="journey-year">${escapeHtml(title.year || node.year || title.meta)}</p>
      <h3>${escapeHtml(title.company)}</h3>
      <p class="journey-role">${escapeHtml(title.role)}</p>
      <p class="journey-summary">${escapeHtml(title.preview || title.note || node.preview || node.summary)}</p>
      ${teasers ? `<div class="work-teasers">${teasers}</div>` : ""}
      <button class="explore-projects" type="button" data-open-experience="${node.id}">
        ${escapeHtml(uiText("exploreProjects"))} <span aria-hidden="true">↗</span>
      </button>`;
  }

  function bindImageLayoutRefresh(scope = journeyList) {
    scope.querySelectorAll("img").forEach((image) => {
      image.addEventListener("load", () => {
        syncCurveHeight();
        updateScrollProgress();
      }, { once: true });
    });
  }

  function curveXAt(trackY) {
    const repeatedY = ((trackY % curveTileScaledHeight) + curveTileScaledHeight) % curveTileScaledHeight;
    return curveLineLeft + curveVisualWidth / 2 + curveAmplitude * Math.sin(Math.PI * repeatedY / (curveTileScaledHeight / 2));
  }

  function setHighlightPosition(trackY, trackX = curveXAt(trackY)) {
    curveHighlight.style.top = `${trackY}px`;
    curveHighlight.style.left = `${trackX}px`;
  }

  function nodeViewportCenter(item, nodeButton) {
    const itemRect = item.getBoundingClientRect();
    const nodeLeft = Number.parseFloat(nodeButton.style.left) || nodeButton.offsetLeft;
    const nodeTop = Number.parseFloat(nodeButton.style.top) || nodeButton.offsetTop;
    return {
      x: itemRect.left + nodeLeft + nodeButton.offsetWidth / 2,
      y: itemRect.top + nodeTop + nodeButton.offsetHeight / 2
    };
  }

  function enableNodeCue() {
    nodeCueEnabled = true;
    nodeCueAudio.load();
  }

  function playNodeCue() {
    if (!nodeCueEnabled) return;
    nodeCueAudio.pause();
    nodeCueAudio.currentTime = 0;
    nodeCueAudio.play().catch(() => {});
  }

  function renderJourney() {
    const entries = timelineNodes.map((node) => ({
      node,
      title: localizeContent(parseTitleMarkdown("", node), node),
      projects: []
    }));

    journeyList.innerHTML = entries.map(({ node, title, projects }, index) => {
      return `
        <article class="journey-item" data-id="${node.id}" style="--item-index: ${index}">
          <button class="journey-node" type="button" aria-label="Open ${escapeHtml(title.company)} projects" data-open-experience="${node.id}">
            <img src="portfolio-assets/png/node.png" alt="" />
          </button>
          <div class="journey-card">${journeyCardMarkup(node, title, projects)}</div>
        </article>`;
    }).join("");

    bindImageLayoutRefresh();
    syncCurveHeight();
    updateScrollProgress();

    entries.forEach(({ node }) => {
      Promise.all([
        loadExperienceContent(node)
      ]).then(([content]) => {
        const item = journeyList.querySelector(`.journey-item[data-id="${node.id}"]`);
        const card = item?.querySelector(".journey-card");
        if (!card) return;
        loadProjects(node, content.projects).then((projects) => {
          const localizedContent = localizeContent(content, node);
          const localizedProjects = localizeProjects(projects, node.id);
          card.innerHTML = journeyCardMarkup(node, localizedContent, localizedProjects);
          bindImageLayoutRefresh(card);
          syncCurveHeight();
          updateScrollProgress();
        });
      }).catch(() => {});
    });
  }

  function modalLogoMarkup(node) {
    if (!node.logo || node.opportunity || node.moon) return "";
    return `<img class="modal-logo" src="${node.logo}" alt="" />`;
  }

  function yearLocationLabel(year, location) {
    return [year, location]
      .map((part) => String(part || "").trim().replace(/，/g, ","))
      .filter(Boolean)
      .join(" · ");
  }

  function modalHeaderMarkup(node, title) {
    const tags = Array.isArray(title.tags) ? title.tags.filter(Boolean) : Array.isArray(node.tags) ? node.tags.filter(Boolean) : [];
    const yearLocation = yearLocationLabel(title.year, title.location || node.location);
    return `
      <div class="modal-heading-row">
        <div>
          <div class="modal-company-line">
            ${modalLogoMarkup(node)}
            <h2 id="modal-title">${escapeHtml(title.company)}</h2>
          </div>
          <p class="modal-title-role">
            <span>${escapeHtml(title.role)}</span>
            ${yearLocation ? `<span class="modal-title-year">${escapeHtml(yearLocation)}</span>` : ""}
          </p>
        </div>
        ${tags.length ? `<div class="modal-expertise">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      </div>`;
  }

  function normalizeRoleHeading() {
    const heading = modal.querySelector(".modal-role-copy h4");
    if (heading && heading.textContent.trim().toLowerCase() === "responsibilities") {
      heading.textContent = uiText("myRole");
    }
  }

  function youtubeEmbedUrl(url) {
    if (!url) {
      return "";
    }
    try {
      const parsed = new URL(url, window.location.href);
      const host = parsed.hostname.replace(/^www\./, "");
      let videoId = "";
      if (host === "youtube.com" || host === "m.youtube.com") {
        videoId = parsed.searchParams.get("v") || "";
        if (!videoId && parsed.pathname.startsWith("/embed/")) {
          videoId = parsed.pathname.split("/")[2] || "";
        }
      } else if (host === "youtu.be") {
        videoId = parsed.pathname.slice(1).split("/")[0] || "";
      }
      if (!videoId) {
        return "";
      }
      return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;
    } catch (error) {
      return "";
    }
  }

  function renderProjectMedia(project) {
    if (!project) {
      return `
        <div class="project-empty">
          <span>${escapeHtml(uiText("mediaPending"))}</span>
          <small>${escapeHtml(uiText("mediaPendingNote"))}</small>
        </div>`;
    }
    if (project.video) {
      const embedUrl = youtubeEmbedUrl(project.video);
      if (embedUrl) {
        return `<iframe class="project-youtube" src="${embedUrl}" title="${escapeHtml(project.title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
      }
      const fitClass = project.fit === "contain" ? " class=\"is-contain\"" : "";
      return `<video${fitClass} src="${project.video}"${project.thumbnail ? ` poster="${project.thumbnail}"` : ""} controls playsinline></video>`;
    }
    if (project.image) {
      return `<img src="${project.image}" alt="" />`;
    }
    if (project.thumbnail) {
      return `<img src="${project.thumbnail}" alt="" />`;
    }
    return `
      <div class="project-empty">
        <span>${escapeHtml(project.title)}</span>
        <small>${escapeHtml(uiText("thumbnailPending"))}</small>
      </div>`;
  }

  function renderProjects(projects, selectedIndex = 0) {
    const selected = projects[selectedIndex];
    const thumbs = projects
      .map((project, index) => `
        <button class="project-thumb${index === selectedIndex ? " is-active" : ""}" type="button" data-project-index="${index}">
          ${project.thumbnail ? `<img src="${project.thumbnail}" alt="" />` : `<span>${escapeHtml(project.title)}</span>`}
          <em>${escapeHtml(project.title)}</em>
        </button>`)
      .join("");

    return `
      <div class="project-heading">
        <h3>${escapeHtml(uiText("selectedProjects"))}</h3>
      </div>
      <div class="project-caption is-above">
        <strong>${escapeHtml(selected ? selected.title : uiText("projectsComingSoon"))}</strong>
        <span>${escapeHtml(selected ? selected.description : uiText("mediaPendingNote"))}</span>
      </div>
      <div class="project-stage">
        ${renderProjectMedia(selected)}
      </div>
      ${projects.length ? `<div class="project-strip${projects.length > 3 ? " is-scrollable" : ""}">${thumbs}</div>` : ""}`;
  }

  async function hydrateModal(node) {
    const [content] = await Promise.all([
      loadExperienceContent(node)
    ]);
    const projects = await loadProjects(node, content.projects);
    if (activeModalNodeId !== node.id || modal.getAttribute("aria-hidden") === "true") return;

    const localizedContent = localizeContent(content, node);
    const localizedProjects = localizeProjects(projects, node.id);
    modal.querySelector(".modal-title-block").innerHTML = modalHeaderMarkup(node, localizedContent);
    modal.querySelector(".modal-role-copy").innerHTML = textToHtml(localizedContent.roleMarkdown || localizedContent.summary || node.summary);
    normalizeRoleHeading();
    activeProjects = localizedProjects;
    modal.querySelector(".modal-projects").innerHTML = renderProjects(localizedProjects);
    resetModalScroll();
    requestAnimationFrame(resetModalScroll);
  }

  function stopModalMedia() {
    modal.querySelectorAll("video").forEach((video) => {
      video.pause();
      video.currentTime = 0;
      video.src = "";
      video.removeAttribute("src");
      video.load();
    });
  }

  function resetModalScroll() {
    modalPanel.scrollTop = 0;
    modalPanel.scrollLeft = 0;
    modalPanel.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function openModal(node, trigger) {
    activeTrigger = trigger;
    activeModalNodeId = node.id;
    activeProjects = [];
    resetModalScroll();
    const initialContent = localizeContent({
      company: node.company,
      role: node.role || "Details to come",
      year: node.year || "",
      location: node.location || "",
      preview: node.preview || "",
      tags: node.tags || []
    }, node);
    modal.querySelector(".modal-title-block").innerHTML = modalHeaderMarkup(node, initialContent);
    modal.querySelector(".modal-role-copy").innerHTML = textToHtml(initialContent.summary || node.summary);
    normalizeRoleHeading();
    modal.querySelector(".modal-projects").innerHTML = renderProjects([]);
    updateModalCurveEdge();
    resetModalScroll();
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    hydrateModal(node);
    setTimeout(() => {
      resetModalScroll();
      updateModalCurveEdge();
      modalPanel.focus();
    }, 0);
  }

  function closeModal() {
    stopModalMedia();
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    resetModalCurveEdge();
    activeModalNodeId = null;
    activeProjects = [];
    if (activeTrigger) activeTrigger.focus();
  }

  function updateScrollProgress() {
    syncCurveHeight();
    const scrollState = journeyScrollState();
    const progress = Math.min(Math.max(scrollState.scrollTop / scrollState.maxScroll, 0), 1);
    const curveRange = getCurveNodeRange();
    let highlightY = curveRange.start + progress * (curveRange.end - curveRange.start);
    let highlightX = curveXAt(highlightY);
    const collisionThreshold = 24;
    const snapThreshold = 82;
    curveActive.style.top = `${curveRange.start}px`;
    curveActive.style.height = `${Math.max(8, highlightY - curveRange.start)}px`;
    curveActive.style.backgroundPosition = `center -${curveRange.start}px`;
    setHighlightPosition(highlightY, highlightX);

    const trackRect = curveTrack.getBoundingClientRect();
    const highlightCenterX = trackRect.left + highlightX;
    const highlightCenterY = trackRect.top + highlightY;
    let closest = null;
    let closestCenter = null;
    let closestDistance = Infinity;
    document.querySelectorAll(".journey-item").forEach((item) => {
      const nodeButton = item.querySelector(".journey-node");
      if (!nodeButton) return;
      const nodeCenter = nodeViewportCenter(item, nodeButton);
      const nodeCenterX = nodeCenter.x;
      const nodeCenterY = nodeCenter.y;
      const distance = Math.hypot(nodeCenterX - highlightCenterX, nodeCenterY - highlightCenterY);
      if (distance < closestDistance) {
        closest = item;
        closestCenter = { x: nodeCenterX, y: nodeCenterY };
        closestDistance = distance;
      }
    });
    document.querySelectorAll(".journey-item.is-current").forEach((item) => item.classList.remove("is-current"));
    curveHighlight.classList.remove("is-colliding");
    snapTargetId = "";
    if (closest && closestDistance <= collisionThreshold) {
      highlightX = closestCenter.x - trackRect.left;
      highlightY = closestCenter.y - trackRect.top;
      setHighlightPosition(highlightY, highlightX);
      curveActive.style.height = `${Math.max(8, highlightY - curveRange.start)}px`;
      closest.classList.add("is-current");
      curveHighlight.classList.add("is-colliding");
      const nextJourneyId = closest.dataset.id || "";
      if (nextJourneyId && nextJourneyId !== currentJourneyId) {
        playNodeCue();
        currentJourneyId = nextJourneyId;
      }
    } else {
      currentJourneyId = "";
      if (closest && closestDistance <= snapThreshold) {
        snapTargetId = closest.dataset.id || "";
      }
    }
    updateModalCurveEdge();
  }

  function resetModalCurveEdge() {
    modalPanel.style.removeProperty("--modal-left");
    modalPanel.style.removeProperty("--modal-content-left");
    modalPanel.style.removeProperty("--modal-edge-clip");
    modalPanel.style.removeProperty("--modal-shadow-clip");
    modalCurveOverlay.innerHTML = "";
  }

  function updateModalCurveEdge() {
    if (modal.getAttribute("aria-hidden") === "true") return;
    const trackRect = curveTrack.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const samples = [];
    const edgeOffset = 0;

    for (let y = 0; y <= viewportHeight; y += 24) {
      const trackY = y - trackRect.top;
      const curveX = trackRect.left + curveXAt(trackY) + edgeOffset;
      samples.push({ x: curveX, y });
    }
    if (!samples.some((point) => point.y === viewportHeight)) {
      const trackY = viewportHeight - trackRect.top;
      samples.push({ x: trackRect.left + curveXAt(trackY) + edgeOffset, y: viewportHeight });
    }

    const minX = Math.min(...samples.map((point) => point.x));
    const modalLeft = Math.max(0, Math.round(minX - 24));
    const edgePoints = samples.map((point) => {
      const x = Math.max(0, Math.round(point.x - modalLeft));
      return `${x}px ${Math.round(point.y)}px`;
    });
    const shadowPoints = samples.map((point) => {
      const x = Math.max(0, Math.round(point.x - modalLeft));
      return `${x}px ${Math.round(point.y)}px`;
    });
    const shadowWidth = 86;
    const contentInset = Math.max(112, Math.round(Math.max(...samples.map((point) => point.x)) - modalLeft + 96));
    const edgeClip = `polygon(${edgePoints.join(", ")}, 100% 100%, 100% 0)`;
    const shadowClip = `polygon(${shadowPoints.join(", ")}, ${shadowWidth}px ${viewportHeight}px, ${shadowWidth}px 0)`;

    modalPanel.style.setProperty("--modal-left", `${modalLeft}px`);
    modalPanel.style.setProperty("--modal-content-left", `${contentInset}px`);
    modalPanel.style.setProperty("--modal-edge-clip", edgeClip);
    modalPanel.style.setProperty("--modal-shadow-clip", shadowClip);
    renderModalCurveOverlay(samples);
  }

  function renderModalCurveOverlay(samples) {
    const pathData = samples
      .map((point, index) => `${index ? "L" : "M"} ${Math.round(point.x)} ${Math.round(point.y)}`)
      .join(" ");
    const nodeCopies = Array.from(journeyList.querySelectorAll(".journey-node"))
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        if (rect.bottom < -24 || rect.top > window.innerHeight + 24) return "";
        return `<img class="modal-node-copy" src="portfolio-assets/png/node.png" alt="" style="left:${x}px;top:${y}px" />`;
      })
      .join("");
    const highlightRect = curveHighlight.getBoundingClientRect();
    const highlightX = highlightRect.left + highlightRect.width / 2;
    const highlightY = highlightRect.top + highlightRect.height / 2;
    const highlightCopy = highlightRect.bottom < -40 || highlightRect.top > window.innerHeight + 40
      ? ""
      : `<img class="modal-highlight-copy" src="portfolio-assets/png/highlight.png" alt="" style="left:${highlightX}px;top:${highlightY}px" />`;

    modalCurveOverlay.innerHTML = `
      <svg viewBox="0 0 ${window.innerWidth} ${window.innerHeight}" preserveAspectRatio="none">
        <path d="${pathData}" />
      </svg>
      ${nodeCopies}
      ${highlightCopy}`;
  }

  function snapHighlightToNearestNode() {
    if (!snapTargetId || isSnapping) return;
    const target = Array.from(journeyList.querySelectorAll(".journey-item"))
      .find((item) => item.dataset.id === snapTargetId);
    if (!target) return;
    const scrollState = journeyScrollState();
    const maxScroll = scrollState.maxScroll;
    const curveRange = getCurveNodeRange();
    const curveSpan = Math.max(curveRange.end - curveRange.start, 1);
    const nodeCenterY = itemTitleCenterY(target);
    const targetScrollTop = Math.min(Math.max(((nodeCenterY - curveRange.start) / curveSpan) * maxScroll, 0), maxScroll);
    if (Math.abs(scrollState.scrollTop - targetScrollTop) < 2) {
      updateScrollProgress();
      return;
    }
    isSnapping = true;
    if (scrollState.usesWindow) {
      window.scrollTo({ top: scrollState.panelTop + targetScrollTop, behavior: "smooth" });
    } else {
      journeyPanel.scrollTo({ top: targetScrollTop, behavior: "smooth" });
    }
    window.setTimeout(() => {
      isSnapping = false;
      updateScrollProgress();
    }, 260);
  }

  function journeyScrollState() {
    const usesWindow = window.matchMedia("(max-width: 1120px)").matches;
    if (usesWindow) {
      const panelTop = journeyPanel.getBoundingClientRect().top + window.scrollY;
      const maxScroll = Math.max(journeyPanel.scrollHeight - window.innerHeight, 1);
      return {
        usesWindow,
        panelTop,
        scrollTop: Math.min(Math.max(window.scrollY - panelTop, 0), maxScroll),
        maxScroll
      };
    }
    return {
      usesWindow,
      panelTop: 0,
      scrollTop: journeyPanel.scrollTop,
      maxScroll: Math.max(journeyPanel.scrollHeight - journeyPanel.clientHeight, 1)
    };
  }

  function syncCurveHeight() {
    const height = window.matchMedia("(max-width: 1120px)").matches
      ? journeyList.scrollHeight
      : Math.max(journeyList.scrollHeight, journeyPanel.clientHeight);
    curveTrack.style.height = `${height}px`;
    alignJourneyNodes();
    updateModalCurveEdge();
  }

  function getCurveNodeRange() {
    const items = Array.from(journeyList.querySelectorAll(".journey-item"));
    const trackHeight = Math.max(curveTrack.offsetHeight, 1);
    if (!items.length) return { start: 0, end: trackHeight };
    const start = itemTitleCenterY(items[0]);
    const end = Math.max(itemTitleCenterY(items[items.length - 1]), start + 1);
    return { start, end };
  }

  function itemTitleCenterY(item) {
    return item.offsetTop + itemTitleLocalCenterY(item);
  }

  function itemTitleLocalCenterY(item) {
    const title = item.querySelector(".journey-card h3");
    if (!title) return 30;
    const itemRect = item.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    return (titleRect.top - itemRect.top) + titleRect.height / 2;
  }

  function alignJourneyNodes() {
    const trackRect = curveTrack.getBoundingClientRect();
    journeyList.querySelectorAll(".journey-item").forEach((item) => {
      const nodeButton = item.querySelector(".journey-node");
      if (!nodeButton) return;
      const itemRect = item.getBoundingClientRect();
      const nodeCenterY = itemTitleCenterY(item);
      const nodeLocalCenterY = itemTitleLocalCenterY(item);
      const targetViewportX = trackRect.left + curveXAt(nodeCenterY);
      nodeButton.style.left = `${targetViewportX - itemRect.left - 18}px`;
      nodeButton.style.top = `${nodeLocalCenterY - 18}px`;
    });
  }

  modal.querySelector(".modal-projects").addEventListener("click", (event) => {
    const button = event.target.closest(".project-thumb");
    if (!button || !activeProjects.length) return;
    event.preventDefault();
    const strip = modal.querySelector(".project-strip");
    const scrollLeft = strip ? strip.scrollLeft : 0;
    stopModalMedia();
    modal.querySelector(".modal-projects").innerHTML = renderProjects(activeProjects, Number(button.dataset.projectIndex));
    const nextStrip = modal.querySelector(".project-strip");
    if (nextStrip) {
      nextStrip.scrollLeft = scrollLeft;
      requestAnimationFrame(() => {
        nextStrip.scrollLeft = scrollLeft;
      });
    }
  });

  journeyList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-experience]");
    if (!button || !journeyList.contains(button)) return;
    const node = allNodes.find((item) => item.id === button.dataset.openExperience);
    if (node) openModal(node, button);
  });

  document.querySelectorAll("[data-close-modal]").forEach((control) => {
    control.addEventListener("click", closeModal);
  });

  languageSwitch?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-lang]");
    if (!button || !supportedLanguages.includes(button.dataset.lang) || button.dataset.lang === currentLang) return;
    currentLang = button.dataset.lang;
    localStorage.setItem("portfolioLanguage", currentLang);
    updateStaticText();
    renderJourney();
    if (modal.getAttribute("aria-hidden") === "false" && activeModalNodeId) {
      const node = allNodes.find((item) => item.id === activeModalNodeId);
      if (node) openModal(node, activeTrigger);
    }
  });

  document.addEventListener("keydown", (event) => {
    enableNodeCue();
    if (event.key === "Escape" && modal.getAttribute("aria-hidden") === "false") {
      closeModal();
    }
  });

  ["pointerdown", "touchstart", "wheel"].forEach((eventName) => {
    window.addEventListener(eventName, enableNodeCue, { once: true, passive: true });
  });

  journeyPanel.addEventListener("scroll", () => {
    updateScrollProgress();
    window.clearTimeout(snapTimer);
    snapTimer = window.setTimeout(snapHighlightToNearestNode, 150);
  }, { passive: true });
  window.addEventListener("scroll", () => {
    if (!window.matchMedia("(max-width: 1120px)").matches) return;
    updateScrollProgress();
    window.clearTimeout(snapTimer);
    snapTimer = window.setTimeout(snapHighlightToNearestNode, 150);
  }, { passive: true });
  window.addEventListener("resize", () => {
    syncCurveHeight();
    updateScrollProgress();
  });
  updateStaticText();
  renderJourney();
})();
