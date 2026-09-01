const tickets = {
  "aurora-vip": {
    title: "星河巡演 · VIP内场",
    price: "¥1280",
    venue: "上海梅赛德斯中心",
    time: "10月18日 19:30",
    imageClass: "aurora"
  },
  "neon-a": {
    title: "霓虹心跳 · 看台A区",
    price: "¥680",
    venue: "北京国家体育馆",
    time: "11月02日 20:00",
    imageClass: "neon"
  },
  "summer-b": {
    title: "夏夜回声 · 草坪双人票",
    price: "¥520",
    venue: "广州海心沙",
    time: "11月16日 18:00",
    imageClass: "summer"
  },
  "moonlight-c": {
    title: "月光电台 · 看台C区",
    price: "¥380",
    venue: "成都凤凰山体育公园",
    time: "12月06日 19:00",
    imageClass: "moonlight"
  }
};

const state = {
  user: JSON.parse(localStorage.getItem("ticketUser") || "null"),
  owned: JSON.parse(localStorage.getItem("ownedTickets") || "[]")
};

if (state.user && !state.user.qq) {
  state.user = null;
  localStorage.removeItem("ticketUser");
}

const loginPage = document.querySelector("#loginPage");
const ticketPage = document.querySelector("#ticketPage");
const ticketsView = document.querySelector("#ticketsView");
const profileView = document.querySelector("#profileView");
const toast = document.querySelector("#toast");

function saveState() {
  localStorage.setItem("ticketUser", JSON.stringify(state.user));
  localStorage.setItem("ownedTickets", JSON.stringify(state.owned));
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
    renderProfile();
    renderTicketButtons();
  }
}

function switchView(view) {
  const isProfile = view === "profile";
  ticketsView.classList.toggle("active", !isProfile);
  profileView.classList.toggle("active", isProfile);
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  if (isProfile) {
    renderProfile();
  }
}

function renderTicketButtons() {
  document.querySelector("#grabCount").textContent = state.owned.length;
  document.querySelectorAll(".ticket-card").forEach((card) => {
    const button = card.querySelector(".grab-button");
    const owned = state.owned.includes(card.dataset.ticketId);
    button.textContent = owned ? "已抢到" : "立即抢票";
    button.classList.toggle("done", owned);
  });
}

function renderProfile() {
  if (!state.user) return;

  document.querySelector("#profileName").textContent = state.user.name;
  document.querySelector("#profileQq").textContent = `QQ：${state.user.qq}`;
  document.querySelector("#avatarInitial").textContent = state.user.name.slice(0, 1);
  document.querySelector("#ownedCount").textContent = `${state.owned.length} 张`;

  const list = document.querySelector("#ownedTicketList");
  if (state.owned.length === 0) {
    list.innerHTML = '<div class="empty-state">还没有抢到票，回到抢票大厅试试看。</div>';
    return;
  }

  list.innerHTML = state.owned
    .map((ticketId) => {
      const ticket = tickets[ticketId];
      return `
        <article class="owned-ticket">
          <div class="owned-thumb ticket-image ${ticket.imageClass}"></div>
          <div>
            <h3>${ticket.title}</h3>
            <p>${ticket.venue} · ${ticket.time}</p>
          </div>
          <strong>${ticket.price}</strong>
        </article>
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

document.querySelectorAll(".grab-button").forEach((button) => {
  button.addEventListener("click", () => {
    const ticketId = button.closest(".ticket-card").dataset.ticketId;
    if (!state.owned.includes(ticketId)) {
      state.owned.push(ticketId);
      saveState();
      renderTicketButtons();
      showToast("抢票成功，已加入个人信息页");
      return;
    }
    showToast("这张票已经抢到啦");
  });
});

document.querySelector("#logoutButton").addEventListener("click", () => {
  state.user = null;
  saveState();
  showApp();
});

showApp();
