const defaultTickets = [
  {
    id: "aurora-vip",
    title: "星河巡演 · VIP内场",
    price: "¥1280",
    venue: "上海梅赛德斯中心",
    time: "10月18日 19:30",
    description: "近距离内场视角，含纪念手环与提前入场通道。",
    imageClass: "aurora",
    imageUrl: ""
  },
  {
    id: "neon-a",
    title: "霓虹心跳 · 看台A区",
    price: "¥680",
    venue: "北京国家体育馆",
    time: "11月02日 20:00",
    description: "正对主舞台，适合完整观看灯光秀和大屏互动。",
    imageClass: "neon",
    imageUrl: ""
  },
  {
    id: "summer-b",
    title: "夏夜回声 · 草坪双人票",
    price: "¥520",
    venue: "广州海心沙",
    time: "11月16日 18:00",
    description: "户外音乐节双人套票，含入场饮品券和专属拍照区。",
    imageClass: "summer",
    imageUrl: ""
  },
  {
    id: "moonlight-c",
    title: "月光电台 · 看台C区",
    price: "¥380",
    venue: "成都凤凰山体育公园",
    time: "12月06日 19:00",
    description: "高性价比票档，视野开阔，适合和朋友一起合唱。",
    imageClass: "moonlight",
    imageUrl: ""
  }
];

function getTonightStartTime() {
  const date = new Date();
  date.setHours(21, 30, 0, 0);
  return date.toISOString();
}

function toDateTimeLocalValue(isoValue) {
  const date = new Date(isoValue);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value) {
  return new Date(value).toISOString();
}

const defaultSettings = {
  rushTitle: "星河巡演 · 上海站",
  startTime: getTonightStartTime(),
  heroImageUrl: ""
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const state = {
  user: JSON.parse(localStorage.getItem("ticketUser") || "null"),
  owned: JSON.parse(localStorage.getItem("ownedTickets") || "[]"),
  tickets: JSON.parse(localStorage.getItem("ticketData") || "null") || defaultTickets,
  settings: JSON.parse(localStorage.getItem("ticketSettings") || "null") || defaultSettings
};

if (state.user && !state.user.qq) {
  state.user = null;
  localStorage.removeItem("ticketUser");
}

const loginPage = document.querySelector("#loginPage");
const ticketPage = document.querySelector("#ticketPage");
const ticketsView = document.querySelector("#ticketsView");
const profileView = document.querySelector("#profileView");
const adminView = document.querySelector("#adminView");
const toast = document.querySelector("#toast");
const heroBand = document.querySelector("#heroBand");
const ticketList = document.querySelector("#ticketList");
const adminTicketList = document.querySelector("#adminTicketList");
let lastRushOpen = isRushOpen();

function saveState() {
  localStorage.setItem("ticketUser", JSON.stringify(state.user));
  localStorage.setItem("ownedTickets", JSON.stringify(state.owned));
  localStorage.setItem("ticketData", JSON.stringify(state.tickets));
  localStorage.setItem("ticketSettings", JSON.stringify(state.settings));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

function showApp() {
  const loggedIn = Boolean(state.user);
  loginPage.classList.toggle("active", !loggedIn);
  ticketPage.classList.toggle("active", loggedIn);
  if (loggedIn) {
    renderTickets();
    renderProfile();
    renderAdmin();
    updateCountdown();
  }
}

function switchView(view) {
  ticketsView.classList.toggle("active", view === "tickets");
  profileView.classList.toggle("active", view === "profile");
  adminView.classList.toggle("active", view === "admin");
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  if (view === "profile") renderProfile();
  if (view === "admin") renderAdmin();
}

function getTicket(ticketId) {
  return state.tickets.find((ticket) => ticket.id === ticketId);
}

function isRushOpen() {
  return Date.now() >= new Date(state.settings.startTime).getTime();
}

function ticketImageMarkup(ticket, className = "ticket-image") {
  const style = ticket.imageUrl ? ` style="background-image: url('${ticket.imageUrl}')"` : "";
  return `<div class="${className} ${ticket.imageClass}" role="img" aria-label="${escapeHtml(ticket.title)}预览图"${style}></div>`;
}

function renderTickets() {
  document.querySelector("#rushTitle").textContent = state.settings.rushTitle;
  document.querySelector("#grabSummary").textContent = `已抢 ${state.owned.length} 张`;
  heroBand.style.backgroundImage = state.settings.heroImageUrl
    ? `linear-gradient(100deg, rgba(23, 21, 31, 0.9), rgba(230, 63, 79, 0.75)), url('${state.settings.heroImageUrl}')`
    : "";

  ticketList.innerHTML = state.tickets
    .map((ticket) => {
      const owned = state.owned.includes(ticket.id);
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
                <span>${escapeHtml(ticket.time)}</span>
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
  const now = Date.now();
  const startAt = new Date(state.settings.startTime).getTime();
  const remaining = startAt - now;
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

function renderProfile() {
  if (!state.user) return;

  document.querySelector("#profileName").textContent = state.user.name;
  document.querySelector("#profileQq").textContent = `QQ：${state.user.qq}`;
  document.querySelector("#avatarInitial").textContent = state.user.name.slice(0, 1);
  document.querySelector("#ownedCount").textContent = `${state.owned.length} 张`;

  const list = document.querySelector("#ownedTicketList");
  if (state.owned.length === 0) {
    list.innerHTML = '<div class="empty-state">还没有抢到卡，回到抢卡大厅试试看。</div>';
    return;
  }

  list.innerHTML = state.owned
    .map((ticketId) => {
      const ticket = getTicket(ticketId);
      if (!ticket) return "";
      return `
        <article class="owned-ticket">
          ${ticketImageMarkup(ticket, "owned-thumb ticket-image")}
          <div>
            <h3>${escapeHtml(ticket.title)}</h3>
            <p>${escapeHtml(ticket.venue)} · ${escapeHtml(ticket.time)}</p>
          </div>
          <strong>${escapeHtml(ticket.price)}</strong>
        </article>
      `;
    })
    .join("");
}

function renderAdmin() {
  document.querySelector("#adminRushTitle").value = state.settings.rushTitle;
  document.querySelector("#adminStartTime").value = toDateTimeLocalValue(state.settings.startTime);

  adminTicketList.innerHTML = state.tickets
    .map((ticket, index) => {
      return `
        <form class="admin-ticket-card" data-ticket-index="${index}">
          <div class="admin-ticket-preview">
            ${ticketImageMarkup(ticket)}
          </div>
          <div class="admin-fields">
            <label>
              票名
              <input name="title" type="text" value="${escapeHtml(ticket.title)}" required />
            </label>
            <label>
              价格
              <input name="price" type="text" value="${escapeHtml(ticket.price)}" required />
            </label>
            <label>
              地点
              <input name="venue" type="text" value="${escapeHtml(ticket.venue)}" required />
            </label>
            <label>
              演出时间
              <input name="time" type="text" value="${escapeHtml(ticket.time)}" required />
            </label>
            <label class="wide-field">
              介绍
              <input name="description" type="text" value="${escapeHtml(ticket.description)}" required />
            </label>
            <label class="wide-field">
              上传预览图
              <input name="image" type="file" accept="image/*" />
            </label>
            <button type="submit" class="grab-button">保存这张票</button>
          </div>
        </form>
      `;
    })
    .join("");
}

document.querySelector("#loginForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const qq = document.querySelector("#qqInput").value.trim();
  const name = document.querySelector("#idInput").value.trim();
  state.user = { qq, name };
  saveState();
  showApp();
  switchView("tickets");
  showToast("登录成功，准备开抢");
});

document.querySelectorAll(".nav-button").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

ticketList.addEventListener("click", (event) => {
  const button = event.target.closest(".grab-button");
  if (!button) return;

  const ticketId = button.closest(".ticket-card").dataset.ticketId;
  if (!isRushOpen()) {
    showToast("还没到开抢时间，请等倒计时结束");
    return;
  }

  if (!state.owned.includes(ticketId)) {
    state.owned.push(ticketId);
    saveState();
    renderTickets();
    renderProfile();
    showToast("抢卡成功，已加入个人信息页");
    return;
  }
  showToast("这张卡已经抢到啦");
});

document.querySelector("#settingsForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const heroImageFile = document.querySelector("#adminHeroImage").files[0];
  const saveSettings = () => {
    state.settings.rushTitle = document.querySelector("#adminRushTitle").value.trim();
    state.settings.startTime = fromDateTimeLocalValue(document.querySelector("#adminStartTime").value);
    saveState();
    renderTickets();
    updateCountdown();
    showToast("开抢设置已保存");
  };

  if (heroImageFile) {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      state.settings.heroImageUrl = reader.result;
      saveSettings();
    });
    reader.readAsDataURL(heroImageFile);
    return;
  }

  saveSettings();
});

adminTicketList.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target.closest(".admin-ticket-card");
  const index = Number(form.dataset.ticketIndex);
  const formData = new FormData(form);
  const ticket = state.tickets[index];

  ticket.title = formData.get("title").trim();
  ticket.price = formData.get("price").trim();
  ticket.venue = formData.get("venue").trim();
  ticket.time = formData.get("time").trim();
  ticket.description = formData.get("description").trim();

  const imageFile = formData.get("image");
  if (imageFile && imageFile.size > 0) {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      ticket.imageUrl = reader.result;
      saveState();
      renderTickets();
      renderAdmin();
      renderProfile();
      showToast("票务图片已更新");
    });
    reader.readAsDataURL(imageFile);
    return;
  }

  saveState();
  renderTickets();
  renderAdmin();
  renderProfile();
  showToast("票务信息已保存");
});

document.querySelector("#resetAdminButton").addEventListener("click", () => {
  state.tickets = JSON.parse(JSON.stringify(defaultTickets));
  state.settings = { ...defaultSettings, startTime: getTonightStartTime() };
  state.owned = [];
  saveState();
  renderTickets();
  renderAdmin();
  renderProfile();
  updateCountdown();
  showToast("已恢复默认抢卡信息");
});

document.querySelector("#logoutButton").addEventListener("click", () => {
  state.user = null;
  saveState();
  showApp();
});

window.setInterval(updateCountdown, 1000);
showApp();
