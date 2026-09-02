const supabaseUrl = "https://kzengnggyagfaphzgqgt.supabase.co";
const supabaseKey = "sb_publishable_UDaI0zbpdoG019uRLEyMCA_ID1lYUvD";
const adminQqNumbers = ["2803450053A", "3896596088A"];

const state = {
  user: JSON.parse(localStorage.getItem("ticketUser") || "null"),
  tickets: [],
  claims: [],
  settings: null
};

const fallbackSettings = {
  rush_title: "？？？开卡",
  start_time: new Date(new Date().setHours(21, 30, 0, 0)).toISOString(),
  hero_image_url: "",
  max_cards_per_account: 2
};

const loginPage = document.querySelector("#loginPage");
const ticketPage = document.querySelector("#ticketPage");
const ticketsView = document.querySelector("#ticketsView");
const profileView = document.querySelector("#profileView");
const adminView = document.querySelector("#adminView");
const toast = document.querySelector("#toast");
const heroBand = document.querySelector("#heroBand");
const ticketList = document.querySelector("#ticketList");
const adminTicketList = document.querySelector("#adminTicketList");
const createCardForm = document.querySelector("#createCardForm");
const ownedTicketList = document.querySelector("#ownedTicketList");
const adminClaimsList = document.querySelector("#adminClaimsList");
let lastRushOpen = false;

function saveUser() {
  localStorage.setItem("ticketUser", JSON.stringify(state.user));
}

function isAdmin() {
  return Boolean(state.user && adminQqNumbers.includes(state.user.qq));
}

function isRushOpen() {
  return Date.now() >= new Date((state.settings || fallbackSettings).start_time).getTime();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path, options = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Supabase 请求失败");
  }

  if (response.status === 204) return null;
  return response.json();
}

async function rpc(name, body) {
  return api(`/rest/v1/rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

async function loadData() {
  const [settingsRows, cards, claims] = await Promise.all([
    api("/rest/v1/app_settings?id=eq.main&select=*&limit=1"),
    api("/rest/v1/cards?select=*&order=sort_order.asc"),
    api("/rest/v1/claims?select=*&order=claimed_at.desc")
  ]);

  state.settings = settingsRows[0] || fallbackSettings;
  state.tickets = cards;
  state.claims = claims;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

function showLoading(message) {
  ticketList.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

async function showApp() {
  const loggedIn = Boolean(state.user);
  loginPage.classList.toggle("active", !loggedIn);
  ticketPage.classList.toggle("active", loggedIn);
  if (!loggedIn) return;

  document.querySelector("#adminNavButton").classList.toggle("visible", isAdmin());
  showLoading("正在加载抢卡信息...");

  try {
    await loadData();
    renderTickets();
    renderProfile();
    if (isAdmin()) renderAdmin();
    updateCountdown();
  } catch (error) {
    showLoading("Supabase 还没准备好，请先运行建表 SQL。");
    showToast("数据库连接失败");
  }
}

function switchView(view) {
  if (view === "admin" && !isAdmin()) {
    showToast("当前账号没有管理员权限");
    view = "tickets";
  }
  ticketsView.classList.toggle("active", view === "tickets");
  profileView.classList.toggle("active", view === "profile");
  adminView.classList.toggle("active", view === "admin");
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  if (view === "profile") renderProfile();
  if (view === "admin") renderAdmin();
}

function getTicket(cardId) {
  return state.tickets.find((ticket) => ticket.id === cardId);
}

function getCurrentUserClaims() {
  if (!state.user) return [];
  return state.claims.filter((claim) => claim.qq === state.user.qq);
}

function getCardOwnedCount(cardId) {
  return state.claims.filter((claim) => claim.card_id === cardId).length;
}

function getRemainingCards(cardId) {
  const ticket = getTicket(cardId);
  return Math.max(0, Number(ticket?.quota || 0) - getCardOwnedCount(cardId));
}

function getTicketImages(ticket) {
  const images = Array.isArray(ticket.image_urls) ? ticket.image_urls.filter(Boolean) : [];
  if (ticket.image_url) images.unshift(ticket.image_url);
  return [...new Set(images)];
}

function imageStyle(url) {
  return url ? ` style="background-image: url('${url}')"` : "";
}

function ticketImageMarkup(ticket, className = "ticket-image") {
  const images = getTicketImages(ticket);
  if (images.length <= 1) {
    return `<div class="${className} ${ticket.image_class}" role="img" aria-label="${escapeHtml(ticket.title)}预览图"${imageStyle(images[0])}></div>`;
  }

  const slides = images
    .map((image, index) => {
      return `<div class="${className} carousel-slide ${index === 0 ? "active" : ""}" role="img" aria-label="${escapeHtml(ticket.title)}预览图 ${index + 1}"${imageStyle(image)}></div>`;
    })
    .join("");

  return `
    <div class="image-carousel ${className} ${ticket.image_class}" data-slide="0">
      ${slides}
      <button type="button" class="carousel-button prev" data-carousel-action="prev" aria-label="上一张">‹</button>
      <button type="button" class="carousel-button next" data-carousel-action="next" aria-label="下一张">›</button>
      <span class="carousel-count">1 / ${images.length}</span>
    </div>
  `;
}

function ticketThumbMarkup(ticket) {
  const image = getTicketImages(ticket)[0];
  return `<div class="owned-thumb ticket-image ${ticket.image_class}" role="img" aria-label="${escapeHtml(ticket.title)}预览图"${imageStyle(image)}></div>`;
}

function renderTickets() {
  const settings = state.settings || fallbackSettings;
  document.querySelector("#rushTitle").textContent = settings.rush_title;
  document.querySelector("#grabSummary").textContent = `已抢 ${state.claims.length} 张`;
  heroBand.style.backgroundImage = settings.hero_image_url
    ? `linear-gradient(100deg, rgba(23, 21, 31, 0.9), rgba(230, 63, 79, 0.75)), url('${settings.hero_image_url}')`
    : "";

  if (state.tickets.length === 0) {
    ticketList.innerHTML = '<div class="empty-state">还没有可抢的卡。</div>';
    return;
  }

  ticketList.innerHTML = state.tickets
    .map((ticket) => {
      const owned = getCurrentUserClaims().some((claim) => claim.card_id === ticket.id);
      const disabled = !isRushOpen();
      return `
        <article class="ticket-card" data-ticket-id="${ticket.id}">
          ${ticketImageMarkup(ticket)}
          <div class="ticket-info">
            <div>
              <div class="ticket-heading">
                <h3>${escapeHtml(ticket.title)}</h3>
                <span>${escapeHtml(ticket.price)}</span>
              </div>
              <p>${escapeHtml(ticket.description)}</p>
              <div class="ticket-meta">
                <span>${escapeHtml(ticket.venue)}</span>
                <span>${escapeHtml(ticket.show_time)}</span>
                <span>限额 ${Number(ticket.quota || 0)} 张</span>
                <span>剩余 ${getRemainingCards(ticket.id)} 张</span>
              </div>
            </div>
            <button type="button" class="grab-button ${owned ? "done" : ""}" ${disabled ? "disabled" : ""}>${owned ? "已抢到" : disabled ? "未开抢" : "立即抢卡"}</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function updateCountdown() {
  const settings = state.settings || fallbackSettings;
  const remaining = new Date(settings.start_time).getTime() - Date.now();
  const label = document.querySelector("#rushLabel");
  const countdownText = document.querySelector("#countdownText");

  if (remaining <= 0) {
    label.textContent = "开抢中";
    countdownText.textContent = "已开抢";
    if (!lastRushOpen) {
      lastRushOpen = true;
      renderTickets();
    }
    return;
  }

  lastRushOpen = false;
  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  label.textContent = "距离开抢";
  countdownText.textContent = days > 0 ? `${days}天 ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

function toDateTimeLocalValue(isoValue) {
  const date = new Date(isoValue);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value) {
  return new Date(value).toISOString();
}

function renderProfile() {
  if (!state.user) return;

  document.querySelector("#profileName").textContent = state.user.name;
  document.querySelector("#profileQq").textContent = `QQ：${state.user.qq}`;
  document.querySelector("#avatarInitial").textContent = state.user.name.slice(0, 1);
  const currentClaims = getCurrentUserClaims();
  document.querySelector("#ownedCount").textContent = `${currentClaims.length} 张`;

  if (currentClaims.length === 0) {
    ownedTicketList.innerHTML = '<div class="empty-state">还没有抢到卡，回到抢卡大厅试试看。</div>';
    return;
  }

  ownedTicketList.innerHTML = currentClaims
    .map((claim) => {
      const ticket = getTicket(claim.card_id);
      if (!ticket) return "";
      return `
        <article class="owned-ticket">
          ${ticketThumbMarkup(ticket)}
          <div>
            <h3>${escapeHtml(ticket.title)}</h3>
            <p>${escapeHtml(ticket.venue)} · ${escapeHtml(ticket.show_time)}</p>
          </div>
          <strong>${escapeHtml(ticket.price)}</strong>
          <button type="button" class="return-button" data-claim-id="${claim.id}">退卡</button>
        </article>
      `;
    })
    .join("");
}

function renderAdmin() {
  const settings = state.settings || fallbackSettings;
  document.querySelector("#adminRushTitle").value = settings.rush_title;
  document.querySelector("#adminStartTime").value = toDateTimeLocalValue(settings.start_time);
  document.querySelector("#adminMaxCards").value = settings.max_cards_per_account;

  adminTicketList.innerHTML = state.tickets
    .map((ticket, index) => {
      return `
        <form class="admin-ticket-card" data-ticket-index="${index}">
          <div class="admin-ticket-preview">
            ${ticketImageMarkup(ticket)}
          </div>
          <div class="admin-fields">
            <label>卡名<input name="title" type="text" value="${escapeHtml(ticket.title)}" required /></label>
            <label>价格<input name="price" type="text" value="${escapeHtml(ticket.price)}" required /></label>
            <label>地点<input name="venue" type="text" value="${escapeHtml(ticket.venue)}" required /></label>
            <label>演出时间<input name="time" type="text" value="${escapeHtml(ticket.show_time)}" required /></label>
            <label>卡数限制<input name="quota" type="number" min="0" step="1" value="${Number(ticket.quota || 0)}" required /></label>
            <label class="wide-field">介绍<input name="description" type="text" value="${escapeHtml(ticket.description)}" required /></label>
            <label class="wide-field">上传预览图<input name="image" type="file" accept="image/*" multiple /></label>
            <div class="admin-card-actions">
              <button type="submit" class="grab-button">保存</button>
              <button type="button" class="delete-card-button" data-card-index="${index}">删除</button>
            </div>
          </div>
        </form>
      `;
    })
    .join("");

  renderAdminClaims();
}

function renderAdminClaims() {
  document.querySelector("#claimsCount").textContent = `${state.claims.length} 条`;

  if (state.claims.length === 0) {
    adminClaimsList.innerHTML = '<div class="empty-state">还没有用户抢到卡。</div>';
    return;
  }

  adminClaimsList.innerHTML = state.claims
    .map((claim) => {
      const ticket = getTicket(claim.card_id);
      return `
        <article class="claim-row">
          <div>
            <strong>${escapeHtml(claim.qq)}</strong>
            <span>${escapeHtml(claim.display_name)}</span>
          </div>
          <p>${escapeHtml(ticket?.title || "已删除卡片")}</p>
        </article>
      `;
    })
    .join("");
}

function readImageAsDataUrl(file) {
  return new Promise((resolve) => {
    if (!file || file.size === 0) {
      resolve(null);
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.readAsDataURL(file);
  });
}

async function readImagesAsDataUrls(files) {
  const selectedFiles = Array.from(files || []).filter((file) => file.size > 0);
  if (selectedFiles.length === 0) return null;
  return Promise.all(selectedFiles.map((file) => readImageAsDataUrl(file)));
}

function updateCarousel(carousel, direction) {
  const slides = Array.from(carousel.querySelectorAll(".carousel-slide"));
  if (slides.length === 0) return;

  const current = Number(carousel.dataset.slide || 0);
  const next = direction === "next"
    ? (current + 1) % slides.length
    : (current - 1 + slides.length) % slides.length;

  carousel.dataset.slide = next;
  slides.forEach((slide, index) => slide.classList.toggle("active", index === next));
  carousel.querySelector(".carousel-count").textContent = `${next + 1} / ${slides.length}`;
}

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const qq = document.querySelector("#qqInput").value.trim();
  const name = document.querySelector("#idInput").value.trim();
  state.user = { qq, name };
  saveUser();
  await showApp();
  switchView("tickets");
  showToast("登录成功，准备开抢");
});

document.querySelectorAll(".nav-button").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

ticketList.addEventListener("click", async (event) => {
  const carouselButton = event.target.closest("[data-carousel-action]");
  if (carouselButton) {
    updateCarousel(carouselButton.closest(".image-carousel"), carouselButton.dataset.carouselAction);
    return;
  }

  const button = event.target.closest(".grab-button");
  if (!button) return;

  const ticketId = button.closest(".ticket-card").dataset.ticketId;
  button.disabled = true;

  try {
    const result = await rpc("claim_card", {
      p_qq: state.user.qq,
      p_name: state.user.name,
      p_card_id: ticketId
    });
    await loadData();
    renderTickets();
    renderProfile();
    if (isAdmin()) renderAdminClaims();
    showToast(result.message);
  } catch (error) {
    showToast("抢卡失败，请稍后再试");
    renderTickets();
  }
});

document.querySelector("#settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const heroImageFile = document.querySelector("#adminHeroImage").files[0];
  const heroImageUrl = await readImageAsDataUrl(heroImageFile);

  try {
    const result = await rpc("update_app_settings", {
      p_admin_qq: state.user.qq,
      p_rush_title: document.querySelector("#adminRushTitle").value.trim(),
      p_start_time: fromDateTimeLocalValue(document.querySelector("#adminStartTime").value),
      p_hero_image_url: heroImageUrl,
      p_max_cards_per_account: Number(document.querySelector("#adminMaxCards").value)
    });
    await loadData();
    renderTickets();
    renderAdmin();
    updateCountdown();
    showToast(result.message);
  } catch (error) {
    showToast("保存失败，请检查管理员权限");
  }
});

adminTicketList.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target.closest(".admin-ticket-card");
  const index = Number(form.dataset.ticketIndex);
  const ticket = state.tickets[index];
  const formData = new FormData(form);
  const imageUrls = await readImagesAsDataUrls(formData.getAll("image"));

  try {
    const result = await rpc("update_card", {
      p_admin_qq: state.user.qq,
      p_card_id: ticket.id,
      p_title: formData.get("title").trim(),
      p_price: formData.get("price").trim(),
      p_venue: formData.get("venue").trim(),
      p_show_time: formData.get("time").trim(),
      p_description: formData.get("description").trim(),
      p_image_urls: imageUrls,
      p_quota: Number(formData.get("quota"))
    });
    await loadData();
    renderTickets();
    renderAdmin();
    renderProfile();
    showToast(result.message);
  } catch (error) {
    showToast("保存失败，请检查管理员权限");
  }
});

adminTicketList.addEventListener("click", async (event) => {
  const carouselButton = event.target.closest("[data-carousel-action]");
  if (carouselButton) {
    updateCarousel(carouselButton.closest(".image-carousel"), carouselButton.dataset.carouselAction);
    return;
  }

  const button = event.target.closest(".delete-card-button");
  if (!button) return;

  const ticket = state.tickets[Number(button.dataset.cardIndex)];
  if (!ticket) return;

  const confirmed = window.confirm(`确定删除「${ticket.title}」吗？已经抢到这张卡的记录也会一起删除。`);
  if (!confirmed) return;

  button.disabled = true;
  try {
    const result = await rpc("delete_card", {
      p_admin_qq: state.user.qq,
      p_card_id: ticket.id
    });
    await loadData();
    renderTickets();
    renderAdmin();
    renderProfile();
    showToast(result.message);
  } catch (error) {
    showToast("删除失败，请先更新 Supabase SQL");
  }
});

createCardForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(createCardForm);
  const imageUrls = await readImagesAsDataUrls(formData.getAll("image"));

  try {
    const result = await rpc("create_card", {
      p_admin_qq: state.user.qq,
      p_title: formData.get("title").trim(),
      p_price: formData.get("price").trim(),
      p_venue: formData.get("venue").trim(),
      p_show_time: formData.get("time").trim(),
      p_description: formData.get("description").trim(),
      p_image_urls: imageUrls,
      p_quota: Number(formData.get("quota"))
    });
    createCardForm.reset();
    createCardForm.querySelector('input[name="quota"]').value = 10;
    await loadData();
    renderTickets();
    renderAdmin();
    showToast(result.message);
  } catch (error) {
    showToast("添加失败，请先更新 Supabase SQL");
  }
});

ownedTicketList.addEventListener("click", async (event) => {
  const button = event.target.closest(".return-button");
  if (!button) return;

  button.disabled = true;
  try {
    const result = await rpc("return_card", {
      p_claim_id: button.dataset.claimId,
      p_qq: state.user.qq
    });
    await loadData();
    renderTickets();
    renderProfile();
    if (isAdmin()) renderAdminClaims();
    showToast(result.message);
  } catch (error) {
    showToast("退卡失败，请稍后再试");
  }
});

document.querySelector("#resetAdminButton").addEventListener("click", () => {
  showToast("接入 Supabase 后，请在后台逐项修改，不再本地恢复默认");
});

document.querySelector("#logoutButton").addEventListener("click", () => {
  state.user = null;
  localStorage.removeItem("ticketUser");
  showApp();
});

window.setInterval(updateCountdown, 1000);
showApp();
