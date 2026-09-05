const supabaseUrl = "https://kzengnggyagfaphzgqgt.supabase.co";
const supabaseKey = "sb_publishable_UDaI0zbpdoG019uRLEyMCA_ID1lYUvD";
const superAdminQq = "2803450053A";

const state = {
  user: JSON.parse(localStorage.getItem("ticketUser") || "null"),
  rushes: [],
  tickets: [],
  claims: [],
  adminClaims: [],
  claimCounts: {},
  currentRushId: localStorage.getItem("currentRushId") || "main",
  currentView: localStorage.getItem("currentView") || "home",
  loadedRushDetails: new Set()
};

const fallbackRush = {
  id: "main",
  title: "？？？开卡",
  start_time: new Date(new Date().setHours(21, 30, 0, 0)).toISOString(),
  hero_image_url: "",
  max_cards_per_account: 2,
  admin_qq: "3896596088A"
};

const loginPage = document.querySelector("#loginPage");
const ticketPage = document.querySelector("#ticketPage");
const homeView = document.querySelector("#homeView");
const ticketsView = document.querySelector("#ticketsView");
const profileView = document.querySelector("#profileView");
const adminView = document.querySelector("#adminView");
const toast = document.querySelector("#toast");
const heroBand = document.querySelector("#heroBand");
const rushList = document.querySelector("#rushList");
const ticketList = document.querySelector("#ticketList");
const adminTicketList = document.querySelector("#adminTicketList");
const createRushForm = document.querySelector("#createRushForm");
const createCardForm = document.querySelector("#createCardForm");
const ownedTicketList = document.querySelector("#ownedTicketList");
const adminClaimsList = document.querySelector("#adminClaimsList");
let lastRushOpen = false;

function saveUser() {
  localStorage.setItem("ticketUser", JSON.stringify(state.user));
}

function saveCurrentRush() {
  localStorage.setItem("currentRushId", state.currentRushId);
}

function saveCurrentView(view) {
  const nextView = ["home", "tickets", "profile", "admin"].includes(view) ? view : "home";
  state.currentView = nextView;
  localStorage.setItem("currentView", nextView);
}

function isSuperAdmin() {
  return Boolean(state.user && state.user.qq === superAdminQq);
}

function getCurrentRush() {
  return state.rushes.find((rush) => rush.id === state.currentRushId) || state.rushes[0] || fallbackRush;
}

function isAdmin(rush = getCurrentRush()) {
  return Boolean(state.user && (isSuperAdmin() || rush.admin_qq === state.user.qq));
}

function isRushOpen(rush = getCurrentRush()) {
  return Date.now() >= new Date(rush.start_time).getTime();
}

function formatRushTime(isoValue) {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return "时间待定";

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}月${day}日 ${hours}:${minutes}`;
}

function formatRemainingTime(isoValue) {
  const remaining = new Date(isoValue).getTime() - Date.now();
  if (remaining <= 0) return "";

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return days > 0 ? `${days}天 ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
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
  const existingCards = new Map(state.tickets.map((ticket) => [ticket.id, ticket]));
  const data = await rpc("get_homepage_data", {
    p_qq: state.user?.qq || ""
  });
  const rushes = data.rushes || [];
  const cards = data.cards || [];
  const claimCounts = data.claim_counts || [];
  const userClaims = data.user_claims || [];

  state.rushes = rushes.length
    ? rushes.map((rush) => ({ ...rush, hero_image_url: getCurrentRushImage(rush.id) }))
    : [fallbackRush];
  state.tickets = cards.map((card) => ({ ...existingCards.get(card.id), ...card }));
  state.claims = userClaims;
  state.claimCounts = Object.fromEntries(
    claimCounts.map((item) => [item.card_id, Number(item.claim_count || 0)])
  );

  if (!state.rushes.some((rush) => rush.id === state.currentRushId)) {
    state.currentRushId = state.rushes[0].id;
    saveCurrentRush();
  }
}

async function loadAdminClaims() {
  if (!isAdmin()) {
    state.adminClaims = [];
    return;
  }

  const cardIds = currentTickets().map((ticket) => ticket.id);
  if (cardIds.length === 0) {
    state.adminClaims = [];
    return;
  }

  const inList = cardIds.map((id) => `"${String(id).replaceAll('"', '\\"')}"`).join(",");
  state.adminClaims = await api(`/rest/v1/claims?select=*&card_id=in.(${encodeURIComponent(inList)})&order=claimed_at.desc`);
}

function getCurrentRushImage(rushId) {
  return state.rushes.find((rush) => rush.id === rushId)?.hero_image_url || "";
}

async function loadRushPreviews() {
  try {
    const rushImages = await api("/rest/v1/rush_events?select=id,hero_image_url&order=sort_order.asc");
    state.rushes = state.rushes.map((rush) => ({
      ...rush,
      hero_image_url: rushImages.find((item) => item.id === rush.id)?.hero_image_url || rush.hero_image_url || ""
    }));
    renderHome();
    if (homeView.classList.contains("active")) updateAdminNav();
  } catch (error) {
    showToast("主预览图加载较慢，稍后会再试");
  }
}

async function loadRushDetails(rushId, force = false) {
  if (!force && state.loadedRushDetails.has(rushId)) return;

  if (force) {
    state.loadedRushDetails.delete(rushId);
  }

  const rushRows = await api(`/rest/v1/rush_events?select=*&id=eq.${encodeURIComponent(rushId)}`);

  if (rushRows[0]) {
    state.rushes = state.rushes.map((rush) => (rush.id === rushId ? { ...rush, ...rushRows[0] } : rush));
  }
  renderAfterDetailUpdate(rushId);

  const detailedCards = await api(`/rest/v1/cards?select=*&rush_id=eq.${encodeURIComponent(rushId)}&order=sort_order.asc`);
  detailedCards.forEach((card) => mergeCardDetail(card));

  state.loadedRushDetails.add(rushId);
  renderAfterDetailUpdate(rushId);
}

function mergeCardDetail(card) {
  const index = state.tickets.findIndex((ticket) => ticket.id === card.id);
  if (index >= 0) {
    state.tickets[index] = { ...state.tickets[index], ...card };
  } else {
    state.tickets.push(card);
  }
  state.tickets.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
}

function renderAfterDetailUpdate(rushId) {
  if (getCurrentRush().id !== rushId) return;

  renderHome();
  if (ticketsView.classList.contains("active")) renderTickets();
  if (profileView.classList.contains("active")) renderProfile();
  if (adminView.classList.contains("active")) {
    renderTickets();
    renderAdmin();
  }
  updateAdminNav();
}

function refreshLightData() {
  loadData()
    .then(() => {
      renderHome();
      renderTickets();
      renderProfile();
      if (isAdmin()) {
        loadAdminClaims().then(() => renderAdminClaims()).catch(() => showToast("绠＄悊鍚嶅崟鍚屾杈冩參"));
      }
      updateAdminNav();
    })
    .catch(() => showToast("状态同步较慢，请稍后刷新"));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

function showLoading(message) {
  rushList.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function applyLazyBackground(element) {
  const url = element.dataset.bg;
  if (!url) return;
  element.style.backgroundImage = `url('${url}')`;
  element.classList.add("image-loaded");
  element.classList.remove("lazy-bg", "deferred-bg");
  delete element.dataset.bg;
}

const lazyImageQueue = [];
const queuedLazyImages = new WeakSet();
let activeLazyImageLoads = 0;
const maxConcurrentImageLoads = 2;

function loadQueuedBackground(element) {
  const url = element.dataset.bg;
  if (!url) {
    activeLazyImageLoads -= 1;
    drainLazyImageQueue();
    return;
  }

  const image = new Image();
  image.onload = () => {
    applyLazyBackground(element);
    activeLazyImageLoads -= 1;
    drainLazyImageQueue();
  };
  image.onerror = () => {
    element.classList.remove("lazy-bg", "deferred-bg");
    activeLazyImageLoads -= 1;
    drainLazyImageQueue();
  };
  image.src = url;
}

function drainLazyImageQueue() {
  while (activeLazyImageLoads < maxConcurrentImageLoads && lazyImageQueue.length > 0) {
    const element = lazyImageQueue.shift();
    if (!element.isConnected || !element.dataset.bg) continue;
    activeLazyImageLoads += 1;
    loadQueuedBackground(element);
  }
}

function enqueueLazyBackground(element) {
  if (queuedLazyImages.has(element)) return;
  queuedLazyImages.add(element);
  lazyImageQueue.push(element);
  drainLazyImageQueue();
}

const lazyImageObserver = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        enqueueLazyBackground(entry.target);
        lazyImageObserver.unobserve(entry.target);
      });
    }, { rootMargin: "80px 0px" })
  : null;

function queueLazyBackgrounds(root = document) {
  const lazyImages = root.querySelectorAll(".lazy-bg[data-bg]");
  lazyImages.forEach((element) => {
    if (lazyImageObserver) {
      lazyImageObserver.observe(element);
    } else {
      enqueueLazyBackground(element);
    }
  });
}

async function showApp() {
  const loggedIn = Boolean(state.user);
  loginPage.classList.toggle("active", !loggedIn);
  ticketPage.classList.toggle("active", loggedIn);
  if (!loggedIn) return;

  showLoading("正在加载开卡信息...");

  try {
    await loadData();
    updateAdminNav();
    updateCountdown();
    switchView(state.currentView);
    loadRushPreviews();
  } catch (error) {
    showLoading("数据加载失败，请刷新重试。");
    showToast("数据库连接失败");
  }
}

function updateAdminNav() {
  document.querySelector("#adminNavButton").classList.toggle("visible", isAdmin());
  createRushForm.classList.toggle("visible", isSuperAdmin());
}

function switchView(view) {
  if (!["home", "tickets", "profile", "admin"].includes(view)) {
    view = "home";
  }

  if (view === "admin" && !isAdmin()) {
    showToast("当前账号没有这个开卡的管理员权限");
    view = "home";
  }
  saveCurrentView(view);

  homeView.classList.toggle("active", view === "home");
  ticketsView.classList.toggle("active", view === "tickets");
  profileView.classList.toggle("active", view === "profile");
  adminView.classList.toggle("active", view === "admin");
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  if (view === "home") renderHome();
  if (view === "tickets") renderTickets();
  if (view === "profile") renderProfile();
  if (view === "admin") renderAdmin();

  if ((view === "tickets" || view === "admin") && !state.loadedRushDetails.has(getCurrentRush().id)) {
    renderTickets(true);
    loadRushDetails(getCurrentRush().id)
      .then(() => {
        renderHome();
        renderTickets();
        renderProfile();
        updateAdminNav();
        if (adminView.classList.contains("active")) renderAdmin();
      })
      .catch(() => showToast("卡片图片加载失败，文字信息可先查看"));
  }
}

function currentTickets() {
  return state.tickets.filter((ticket) => (ticket.rush_id || "main") === getCurrentRush().id);
}

function currentClaims() {
  const ids = new Set(currentTickets().map((ticket) => ticket.id));
  return state.adminClaims.filter((claim) => ids.has(claim.card_id));
}

function getTicket(cardId) {
  return state.tickets.find((ticket) => ticket.id === cardId);
}

function getCurrentUserClaims() {
  if (!state.user) return [];
  return state.claims.filter((claim) => claim.qq === state.user.qq);
}

function getCardOwnedCount(cardId) {
  return Number(state.claimCounts[cardId] || 0);
}

function getRemainingCards(cardId) {
  const ticket = getTicket(cardId);
  return Math.max(0, Number(ticket?.quota || 0) - getCardOwnedCount(cardId));
}

function getRushTickets(rushId) {
  return state.tickets.filter((ticket) => (ticket.rush_id || "main") === rushId);
}

function getRushClaimCount(rushId) {
  return getRushTickets(rushId).reduce((total, ticket) => total + getCardOwnedCount(ticket.id), 0);
}

function getRushRemainingCount(rushId) {
  return getRushTickets(rushId).reduce((total, ticket) => total + getRemainingCards(ticket.id), 0);
}

function isRushSoldOut(rush) {
  const tickets = getRushTickets(rush.id);
  return tickets.length > 0 && getRushRemainingCount(rush.id) <= 0;
}

function cardInfoItems(ticket) {
  return [ticket.venue, ticket.show_time].filter((item) => String(item || "").trim());
}

function getTicketImages(ticket) {
  const images = Array.isArray(ticket.image_urls) ? ticket.image_urls.filter(Boolean) : [];
  if (ticket.image_url) images.unshift(ticket.image_url);
  return [...new Set(images)];
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function imageStyle(url) {
  return url ? ` style="background-image: url('${url}')"` : "";
}

function lazyImageAttributes(url) {
  return url ? ` data-bg="${escapeAttribute(url)}"` : "";
}

function lazyImageClass(url) {
  return url ? " lazy-bg" : "";
}

function ticketImageMarkup(ticket, className = "ticket-image") {
  const images = getTicketImages(ticket);
  if (images.length === 0) {
    const detailLoaded = state.loadedRushDetails.has(ticket.rush_id || "main");
    return `<div class="${className} image-placeholder" role="img" aria-label="${escapeHtml(ticket.title)}预览图"><span>${detailLoaded ? "暂无图片" : "图片加载中"}</span></div>`;
  }

  if (images.length <= 1) {
    return `<div class="${className} ${ticket.image_class}${lazyImageClass(images[0])}" role="img" aria-label="${escapeHtml(ticket.title)}预览图"${lazyImageAttributes(images[0])}></div>`;
  }

  const slides = images
    .map((image, index) => {
      return `<div class="${className} carousel-slide ${index === 0 ? "active lazy-bg" : "deferred-bg"}" role="img" aria-label="${escapeHtml(ticket.title)}预览图 ${index + 1}"${lazyImageAttributes(image)}></div>`;
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
  return `<div class="owned-thumb ticket-image ${ticket.image_class}${lazyImageClass(image)}" role="img" aria-label="${escapeHtml(ticket.title)}预览图"${lazyImageAttributes(image)}></div>`;
}

function rushPreviewStyle(rush) {
  if (rush.hero_image_url) return imageStyle(rush.hero_image_url);
  const firstTicket = state.tickets.find((ticket) => (ticket.rush_id || "main") === rush.id);
  const firstImage = firstTicket ? getTicketImages(firstTicket)[0] : "";
  return imageStyle(firstImage);
}

function rushStatusMarkup(rush) {
  if (isRushSoldOut(rush)) {
    return '<span class="status-pill ended">已结束</span>';
  }

  return isRushOpen(rush)
    ? '<span class="status-pill open">已开卡</span>'
    : '<span class="status-pill pending">待开卡</span>';
}

function rushTimeMarkup(rush) {
  const timeText = formatRushTime(rush.start_time);
  if (isRushSoldOut(rush)) {
    return `<p class="rush-time">已结束 · ${escapeHtml(timeText)}</p>`;
  }

  if (isRushOpen(rush)) {
    return `<p class="rush-time">${escapeHtml(timeText)}</p>`;
  }

  return `<p class="rush-time countdown">距离开卡 ${escapeHtml(formatRemainingTime(rush.start_time))} · ${escapeHtml(timeText)}</p>`;
}

function renderHome() {
  createRushForm.classList.toggle("visible", isSuperAdmin());

  if (state.rushes.length === 0) {
    rushList.innerHTML = '<div class="empty-state">还没有开卡。</div>';
    return;
  }

  rushList.innerHTML = [...state.rushes]
    .sort((a, b) => {
      const soldOutSort = Number(isRushSoldOut(a)) - Number(isRushSoldOut(b));
      if (soldOutSort !== 0) return soldOutSort;
      return Number(a.sort_order || 0) - Number(b.sort_order || 0);
    })
    .map((rush) => {
      const tickets = getRushTickets(rush.id);
      const claimCount = getRushClaimCount(rush.id);
      return `
        <article class="rush-card ${rush.id === state.currentRushId ? "selected" : ""}" data-rush-id="${rush.id}">
          <div class="rush-preview" role="img" aria-label="${escapeHtml(rush.title)}主预览图"${rushPreviewStyle(rush)}></div>
          <div>
            ${rushStatusMarkup(rush)}
            <h3>${escapeHtml(rush.title)}</h3>
            ${rushTimeMarkup(rush)}
            <p>卡种 ${tickets.length} 个 · 已抢 ${claimCount} 张</p>
          </div>
          <button type="button" class="grab-button">进入</button>
        </article>
      `;
    })
    .join("");
  queueLazyBackgrounds(rushList);
}

function renderTickets(isLoadingDetails = false) {
  const rush = getCurrentRush();
  const tickets = currentTickets();
  document.querySelector("#rushTitle").textContent = rush.title;
  document.querySelector("#grabSummary").textContent = isLoadingDetails ? "正在加载卡片详情..." : `已抢 ${getRushClaimCount(rush.id)} 张`;
  heroBand.style.backgroundImage = rush.hero_image_url
    ? `linear-gradient(100deg, rgba(23, 21, 31, 0.9), rgba(230, 63, 79, 0.75)), url('${rush.hero_image_url}')`
    : "";

  if (tickets.length === 0) {
    ticketList.innerHTML = '<div class="empty-state">这次开卡还没有添加卡。</div>';
    return;
  }

  ticketList.innerHTML = tickets
    .map((ticket) => {
      const owned = getCurrentUserClaims().some((claim) => claim.card_id === ticket.id);
      const disabled = !isRushOpen(rush);
      const soldOut = getRemainingCards(ticket.id) <= 0;
      const buttonText = owned ? "已抢到" : soldOut ? "已抢完" : disabled ? "未开卡" : "立即抢卡";
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
                ${cardInfoItems(ticket).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
                <span>限额 ${Number(ticket.quota || 0)} 张</span>
                <span>剩余 ${getRemainingCards(ticket.id)} 张</span>
              </div>
            </div>
            <button type="button" class="grab-button ${owned ? "done" : soldOut ? "sold-out" : ""}" ${(disabled || soldOut) && !owned ? "disabled" : ""}>${buttonText}</button>
          </div>
        </article>
      `;
    })
    .join("");
  queueLazyBackgrounds(ticketList);
}

function updateCountdown() {
  const rush = getCurrentRush();
  const remaining = new Date(rush.start_time).getTime() - Date.now();
  const label = document.querySelector("#rushLabel");
  const countdownText = document.querySelector("#countdownText");

  if (homeView.classList.contains("active")) {
    renderHome();
  }

  if (remaining <= 0) {
    label.textContent = "已开卡";
    countdownText.textContent = "开卡中";
    if (!lastRushOpen) {
      lastRushOpen = true;
      renderHome();
      renderTickets();
    }
    return;
  }

  lastRushOpen = false;

  label.textContent = "距离开卡";
  countdownText.textContent = formatRemainingTime(rush.start_time);
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
      const rush = state.rushes.find((item) => item.id === (ticket.rush_id || "main"));
      return `
        <article class="owned-ticket">
          ${ticketThumbMarkup(ticket)}
          <div>
            <h3>${escapeHtml(ticket.title)}</h3>
            <p>${escapeHtml(rush?.title || "开卡")} · ${escapeHtml(cardInfoItems(ticket).join(" · ") || "暂无更多信息")}</p>
          </div>
          <strong>${escapeHtml(ticket.price)}</strong>
          <button type="button" class="return-button" data-claim-id="${claim.id}">退卡</button>
        </article>
      `;
    })
    .join("");
  queueLazyBackgrounds(ownedTicketList);
}

function renderAdmin() {
  const rush = getCurrentRush();
  const tickets = currentTickets();
  document.querySelector("#adminRushTitle").value = rush.title;
  document.querySelector("#adminStartTime").value = toDateTimeLocalValue(rush.start_time);
  document.querySelector("#adminMaxCards").value = rush.max_cards_per_account;

  adminTicketList.innerHTML = tickets
    .map((ticket, index) => {
      return `
        <form class="admin-ticket-card" data-ticket-id="${ticket.id}">
          <div class="admin-ticket-preview">
            ${ticketImageMarkup(ticket)}
          </div>
          <div class="admin-fields">
            <label>卡名<input name="title" type="text" value="${escapeHtml(ticket.title)}" required /></label>
            <label>价格<input name="price" type="text" value="${escapeHtml(ticket.price)}" required /></label>
            <label>信息1<input name="venue" type="text" value="${escapeHtml(ticket.venue)}" /></label>
            <label>信息2<input name="time" type="text" value="${escapeHtml(ticket.show_time)}" /></label>
            <label>卡数限制<input name="quota" type="number" min="0" step="1" value="${Number(ticket.quota || 0)}" required /></label>
            <label class="wide-field">介绍<input name="description" type="text" value="${escapeHtml(ticket.description)}" required /></label>
            <label class="wide-field">上传预览图<input name="image" type="file" accept="image/*" multiple /></label>
            <div class="admin-card-actions">
              <button type="submit" class="grab-button">保存</button>
              <button type="button" class="delete-card-button" data-ticket-id="${ticket.id}">删除</button>
            </div>
          </div>
        </form>
      `;
    })
    .join("");
  queueLazyBackgrounds(adminTicketList);

  renderAdminClaims();
  loadAdminClaims()
    .then(() => renderAdminClaims())
    .catch(() => showToast("管理员名单加载较慢，请稍后刷新"));
}

function renderAdminClaims() {
  const claims = currentClaims();
  document.querySelector("#claimsCount").textContent = `${claims.length} 条`;

  if (claims.length === 0) {
    adminClaimsList.innerHTML = '<div class="empty-state">这次开卡还没有用户抢到卡。</div>';
    return;
  }

  adminClaimsList.innerHTML = claims
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

async function compressImage(file, maxSize = 1200, quality = 0.76) {
  if (!file || file.size === 0 || file.type === "image/gif") return file;
  if (!file.type.startsWith("image/")) return file;

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";

  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = objectUrl;
    });

    const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webp`, { type: "image/webp" });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function getImageExtension(file) {
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (extension) return extension;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function buildImagePath(file) {
  const userPart = String(state.user?.qq || "guest").replace(/[^a-zA-Z0-9_-]/g, "");
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${userPart}/${id}.${getImageExtension(file)}`;
}

async function uploadImage(file) {
  if (!file || file.size === 0) return null;

  const uploadFile = await compressImage(file);
  const path = buildImagePath(uploadFile);
  const response = await fetch(`${supabaseUrl}/storage/v1/object/ticket-images/${path}`, {
    method: "POST",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": uploadFile.type || "application/octet-stream",
      "x-upsert": "false"
    },
    body: uploadFile
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "图片上传失败");
  }

  return `${supabaseUrl}/storage/v1/object/public/ticket-images/${path}`;
}

async function uploadImages(files) {
  const selectedFiles = Array.from(files || []).filter((file) => file.size > 0);
  if (selectedFiles.length === 0) return null;
  return Promise.all(selectedFiles.map((file) => uploadImage(file)));
}

function updateCarousel(carousel, direction) {
  const slides = Array.from(carousel.querySelectorAll(".carousel-slide"));
  if (slides.length === 0) return;

  const current = Number(carousel.dataset.slide || 0);
  const next = direction === "next"
    ? (current + 1) % slides.length
    : (current - 1 + slides.length) % slides.length;

  carousel.dataset.slide = next;
  slides.forEach((slide, index) => {
    const isActive = index === next;
    slide.classList.toggle("active", isActive);
    if (isActive) enqueueLazyBackground(slide);
  });
  carousel.querySelector(".carousel-count").textContent = `${next + 1} / ${slides.length}`;
}

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const qq = document.querySelector("#qqInput").value.trim();
  const name = document.querySelector("#idInput").value.trim();
  state.user = { qq, name };
  saveUser();
  await showApp();
  showToast("登录成功");
});

document.querySelectorAll(".nav-button").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

rushList.addEventListener("click", (event) => {
  const card = event.target.closest(".rush-card");
  if (!card) return;

  state.currentRushId = card.dataset.rushId;
  saveCurrentRush();
  lastRushOpen = isRushOpen();
  renderHome();
  renderTickets();
  renderProfile();
  updateAdminNav();
  updateCountdown();
  switchView("tickets");
});

createRushForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(createRushForm);

  try {
    const result = await rpc("create_rush_event", {
      p_admin_qq: state.user.qq,
      p_title: formData.get("title").trim(),
      p_event_admin_qq: formData.get("adminQq").trim(),
      p_start_time: fromDateTimeLocalValue(formData.get("startTime")),
      p_max_cards_per_account: Number(formData.get("maxCards"))
    });
    createRushForm.reset();
    createRushForm.querySelector('input[name="maxCards"]').value = 2;
    await loadData();
    state.currentRushId = result.rush_id;
    saveCurrentRush();
    await loadRushDetails(state.currentRushId, true);
    renderHome();
    renderTickets();
    updateAdminNav();
    showToast(result.message);
  } catch (error) {
    showToast("创建失败，请检查总管理员权限或更新 Supabase SQL");
  }
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
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "抢卡中...";

  try {
    const result = await rpc("claim_card", {
      p_qq: state.user.qq,
      p_name: state.user.name,
      p_card_id: ticketId
    });

    showToast(result.message);
    if (!result.ok) {
      button.disabled = false;
      button.textContent = originalText;
      refreshLightData();
      return;
    }

    state.claims.unshift({
      id: result.claim_id || `local-${Date.now()}`,
      card_id: ticketId,
      qq: state.user.qq,
      display_name: state.user.name,
      claimed_at: new Date().toISOString()
    });
    state.claimCounts[ticketId] = getCardOwnedCount(ticketId) + 1;
    renderHome();
    renderTickets();
    renderProfile();
    if (isAdmin()) renderAdminClaims();
    refreshLightData();
  } catch (error) {
    showToast("抢卡失败，请稍后再试");
    button.disabled = false;
    button.textContent = originalText;
  }
});

document.querySelector("#settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const heroImageFile = document.querySelector("#adminHeroImage").files[0];

  try {
    const heroImageUrl = await uploadImage(heroImageFile);
    const result = await rpc("update_rush_event", {
      p_admin_qq: state.user.qq,
      p_rush_id: getCurrentRush().id,
      p_title: document.querySelector("#adminRushTitle").value.trim(),
      p_start_time: fromDateTimeLocalValue(document.querySelector("#adminStartTime").value),
      p_hero_image_url: heroImageUrl,
      p_max_cards_per_account: Number(document.querySelector("#adminMaxCards").value)
    });
    await loadData();
    await loadRushDetails(getCurrentRush().id, true);
    renderHome();
    renderTickets();
    renderAdmin();
    updateCountdown();
    showToast(result.message);
  } catch (error) {
    showToast("保存失败，请检查这个开卡的管理员权限");
  }
});

adminTicketList.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target.closest(".admin-ticket-card");
  const ticket = getTicket(form.dataset.ticketId);
  const formData = new FormData(form);

  try {
    const imageUrls = await uploadImages(formData.getAll("image"));
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
    await loadRushDetails(getCurrentRush().id, true);
    renderHome();
    renderTickets();
    renderAdmin();
    renderProfile();
    showToast(result.message);
  } catch (error) {
    showToast("保存失败，请检查这个开卡的管理员权限");
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

  const ticket = getTicket(button.dataset.ticketId);
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
    await loadRushDetails(getCurrentRush().id, true);
    renderHome();
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

  try {
    const imageUrls = await uploadImages(formData.getAll("image"));
    const result = await rpc("create_card", {
      p_admin_qq: state.user.qq,
      p_rush_id: getCurrentRush().id,
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
    await loadRushDetails(getCurrentRush().id, true);
    renderHome();
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
    await loadRushDetails(getCurrentRush().id, true);
    renderHome();
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
