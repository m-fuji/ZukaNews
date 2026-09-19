/**
 * Zuka News - Main Application Logic
 */

document.addEventListener("DOMContentLoaded", () => {
  // State
  const state = {
    articles: [],
    troupe: "all",
    star: null,
    searchQuery: "",
    onlyUnread: false,
    activeView: "feed", // 'feed' | 'favorites'
    readIds: new Set(JSON.parse(localStorage.getItem("zuka_news_read_ids") || "[]")),
    favoriteIds: new Set(JSON.parse(localStorage.getItem("zuka_news_favorite_ids") || "[]")),
  };

  // DOM Elements
  const newsFeedEl = document.getElementById("newsFeed");
  const emptyStateEl = document.getElementById("emptyState");
  const troupeTabs = document.querySelectorAll(".troupe-tab");
  const starChips = document.querySelectorAll(".star-chip");
  const unreadToggleBtn = document.getElementById("unreadToggleBtn");
  const markAllReadBtn = document.getElementById("markAllReadBtn");
  const unreadCountBadge = document.getElementById("unreadCountBadge");
  const searchToggleBtn = document.getElementById("searchToggleBtn");
  const searchContainer = document.getElementById("searchContainer");
  const searchInput = document.getElementById("searchInput");
  const searchClearBtn = document.getElementById("searchClearBtn");
  const starDrawerModal = document.getElementById("starDrawerModal");
  const starDrawerList = document.getElementById("starDrawerList");
  const closeStarDrawerBtn = document.getElementById("closeStarDrawerBtn");
  const navItems = document.querySelectorAll(".bottom-nav .nav-item");
  const toastEl = document.getElementById("toastMsg");

  // Global Toast function
  window.showToast = function (text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add("show");
    setTimeout(() => {
      toastEl.classList.remove("show");
    }, 2400);
  };

  // Helper: Format relative time
  function formatRelativeTime(isoString) {
    try {
      const now = new Date();
      const past = new Date(isoString);
      const diffMs = now - past;
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return "たった今";
      if (diffMins < 60) return `${diffMins}分前`;
      if (diffHours < 24) return `${diffHours}時間前`;
      if (diffDays < 7) return `${diffDays}日前`;
      return `${past.getMonth() + 1}月${past.getDate()}日`;
    } catch {
      return "";
    }
  }

  // Load News Data
  async function loadNews() {
    try {
      const response = await fetch("data/news.json");
      if (!response.ok) throw new Error("Network response was not ok");
      const data = await response.json();
      state.articles = data.articles || [];
      updateUnreadCounter();
      renderFeed();
    } catch (err) {
      console.warn("Could not load data/news.json:", err);
      newsFeedEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🌸</div>
          <div class="empty-state-title">ニュースデータを読み込めませんでした</div>
          <div class="empty-state-desc">少し時間をおいて再度お試しください。</div>
        </div>
      `;
    }
  }

  // Save Persistence
  function saveReadIds() {
    localStorage.setItem("zuka_news_read_ids", JSON.stringify([...state.readIds]));
  }

  function saveFavoriteIds() {
    localStorage.setItem("zuka_news_favorite_ids", JSON.stringify([...state.favoriteIds]));
  }

  // Mark article as read
  function markAsRead(id) {
    if (!state.readIds.has(id)) {
      state.readIds.add(id);
      saveReadIds();
      updateUnreadCounter();
      
      const card = document.querySelector(`.news-card[data-id="${id}"]`);
      if (card) {
        card.classList.add("is-read");
        const unreadBadge = card.querySelector(".badge-unread");
        if (unreadBadge) unreadBadge.remove();
      }
    }
  }

  // Mark all currently visible or all articles as read
  function markAllVisibleAsRead() {
    const visibleArticles = getFilteredArticles();
    let newlyRead = 0;
    visibleArticles.forEach((art) => {
      if (!state.readIds.has(art.id)) {
        state.readIds.add(art.id);
        newlyRead++;
      }
    });

    if (newlyRead > 0) {
      saveReadIds();
      updateUnreadCounter();
      renderFeed();
      window.showToast(`${newlyRead}件の記事を既読にしました`);
    } else {
      window.showToast("未読の記事はありません");
    }
  }

  // Toggle favorite
  function toggleFavorite(id, e) {
    e.stopPropagation();
    if (state.favoriteIds.has(id)) {
      state.favoriteIds.delete(id);
      window.showToast("お気に入りを解除しました");
    } else {
      state.favoriteIds.add(id);
      window.showToast("お気に入りに追加しました 💖");
    }
    saveFavoriteIds();
    renderFeed();
  }

  // Share article
  async function shareArticle(article, e) {
    e.stopPropagation();
    const safeUrl = resolveSafeUrl(article);
    if (navigator.share) {
      try {
        await navigator.share({
          title: `【Zuka News】${article.title}`,
          url: safeUrl,
        });
      } catch {
        // user cancelled
      }
    } else {
      try {
        await navigator.clipboard.writeText(`${article.title} ${safeUrl}`);
        window.showToast("URLをクリップボードにコピーしました 📋");
      } catch {
        window.showToast("共有に対応していません");
      }
    }
  }

  // Update unread count indicator
  function updateUnreadCounter() {
    const totalUnread = state.articles.filter((art) => !state.readIds.has(art.id)).length;
    if (unreadCountBadge) {
      if (totalUnread > 0) {
        unreadCountBadge.style.display = "flex";
        unreadCountBadge.innerHTML = `<span class="unread-dot"></span> 未読 ${totalUnread}`;
      } else {
        unreadCountBadge.style.display = "none";
      }
    }
  }

  // Filter Logic
  function getFilteredArticles() {
    return state.articles.filter((art) => {
      // Favorites view filter
      if (state.activeView === "favorites") {
        if (!state.favoriteIds.has(art.id)) return false;
      }

      // Troupe filter
      if (state.troupe !== "all" && art.troupe !== state.troupe) {
        return false;
      }

      // Star filter
      if (state.star) {
        const starMatch = (art.stars && art.stars.includes(state.star)) ||
                          art.title.includes(state.star) ||
                          (art.summary && art.summary.includes(state.star));
        if (!starMatch) return false;
      }

      // Unread only
      if (state.onlyUnread && state.readIds.has(art.id)) {
        return false;
      }

      // Search keyword
      if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        const titleMatch = art.title.toLowerCase().includes(q);
        const summaryMatch = (art.summary || "").toLowerCase().includes(q);
        const sourceMatch = (art.source || "").toLowerCase().includes(q);
        const starMatch = (art.stars || []).some(s => s.toLowerCase().includes(q));
        if (!titleMatch && !summaryMatch && !sourceMatch && !starMatch) {
          return false;
        }
      }

      return true;
    });
  }

  // Render Troupe Icon & Color Class
  function getTroupeMeta(troupeKey) {
    const map = {
      flower: { name: "花組", icon: "🌸", class: "troupe-flower" },
      moon: { name: "月組", icon: "🌙", class: "troupe-moon" },
      snow: { name: "雪組", icon: "❄️", class: "troupe-snow" },
      star: { name: "星組", icon: "⭐", class: "troupe-star" },
      cosmos: { name: "宙組", icon: "🪐", class: "troupe-cosmos" },
      senka: { name: "専科", icon: "💎", class: "troupe-senka" },
      all: { name: "全体", icon: "👑", class: "troupe-all" }
    };
    return map[troupeKey] || map.all;
  }

  // Render Feed
  function renderFeed() {
    const filtered = getFilteredArticles();

    if (filtered.length === 0) {
      newsFeedEl.innerHTML = "";
      emptyStateEl.style.display = "flex";
      
      const titleEl = emptyStateEl.querySelector(".empty-state-title");
      const descEl = emptyStateEl.querySelector(".empty-state-desc");
      if (state.activeView === "favorites") {
        titleEl.textContent = "お気に入りの記事がありません";
        descEl.textContent = "記事カードのハートマークをタップして、後で読みたいニュースを保存できます。";
      } else if (state.onlyUnread) {
        titleEl.textContent = "すべてのニュースを読み終えました！🌸";
        descEl.textContent = "新しいニュースの更新をお楽しみに。";
      } else {
        titleEl.textContent = "条件に一致するニュースがありません";
        descEl.textContent = "別の組やスターを選択するか、検索条件を変えてみてください。";
      }
      return;
    }

    emptyStateEl.style.display = "none";

    const cardsHtml = filtered.map((art) => {
      const isRead = state.readIds.has(art.id);
      const isFav = state.favoriteIds.has(art.id);
      const troupeMeta = getTroupeMeta(art.troupe);
      const timeStr = formatRelativeTime(art.published_at);
      const isOfficial = art.source_type === "official";

      // Stars tags HTML
      let starsHtml = "";
      if (art.stars && art.stars.length > 0) {
        starsHtml = `
          <div class="card-stars-row">
            ${art.stars.map(s => `<span class="star-tag" data-star="${s}">✨ ${s}</span>`).join("")}
          </div>
        `;
      }

      // Image or Fallback
      let mediaHtml = "";
      if (art.image) {
        mediaHtml = `
          <img class="card-img" src="${art.image}" alt="" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'card-fallback-art\\'><span class=\\'fallback-icon\\'>${troupeMeta.icon}</span><span class=\\'fallback-txt\\'>${troupeMeta.name}</span></div>';" />
        `;
      } else {
        mediaHtml = `
          <div class="card-fallback-art">
            <span class="fallback-icon">${troupeMeta.icon}</span>
            <span class="fallback-txt">${troupeMeta.name}</span>
          </div>
        `;
      }

      return `
        <article class="news-card ${isRead ? 'is-read' : ''}" data-id="${art.id}" data-link="${resolveSafeUrl(art)}">
          <div class="card-media-wrap">
            ${mediaHtml}
            <div class="card-floating-badges">
              <span class="badge-troupe ${troupeMeta.class}">
                ${troupeMeta.icon} ${troupeMeta.name}
              </span>
              ${!isRead ? '<span class="badge-unread">NEW</span>' : ''}
            </div>
          </div>
          
          <div class="card-body">
            <div class="card-source-row">
              <span class="source-pill ${isOfficial ? 'official' : ''}">${art.source}</span>
              <span class="card-time">${timeStr}</span>
            </div>

            <h2 class="news-title">${art.title}</h2>
            ${art.summary ? `<p class="news-summary">${art.summary}</p>` : ''}
            ${starsHtml}

            <div class="card-footer">
              <button class="card-action-btn share-btn" title="共有" aria-label="共有">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
              </button>
              <button class="card-action-btn favorite-btn ${isFav ? 'is-favorite' : ''}" title="お気に入り" aria-label="お気に入り">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              </button>
            </div>
          </div>
        </article>
      `;
    }).join("");

    newsFeedEl.innerHTML = cardsHtml;
  }

  // Event Listeners: Card clicks
  newsFeedEl.addEventListener("click", (e) => {
    const card = e.target.closest(".news-card");
    if (!card) return;

    const id = card.getAttribute("data-id");
    const link = card.getAttribute("data-link");
    const article = state.articles.find(a => a.id === id);

    // Star tag click inside card
    const starTag = e.target.closest(".star-tag");
    if (starTag) {
      e.stopPropagation();
      const starName = starTag.getAttribute("data-star");
      filterByStar(starName);
      return;
    }

    // Share button click
    const shareBtn = e.target.closest(".share-btn");
    if (shareBtn && article) {
      shareArticle(article, e);
      return;
    }

    // Favorite button click
    const favBtn = e.target.closest(".favorite-btn");
    if (favBtn) {
      toggleFavorite(id, e);
      return;
    }

    // Resolve safe URL & open link, marking as read
    markAsRead(id);
    const safeUrl = resolveSafeUrl(article);
    if (safeUrl) {
      window.open(safeUrl, "_blank", "noopener,noreferrer");
    }
  });

  // Helper: Direct Article URL Resolver (No search page wrappers)
  function resolveSafeUrl(article) {
    if (!article) return "https://kageki.hankyu.co.jp/news/index.html";
    let url = (article.link || "").trim();
    const troupe = article.troupe || "all";

    // 1. Block dummy/non-existent test domains
    const blockedDomains = ["example.com", "example.org", "test.com", "localhost"];
    const isBlocked = blockedDomains.some((d) => url.includes(d));

    if (!url || !url.startsWith("http") || isBlocked) {
      const troupeOfficialMap = {
        flower: "https://kageki.hankyu.co.jp/star/flower.html",
        moon: "https://kageki.hankyu.co.jp/star/moon.html",
        snow: "https://kageki.hankyu.co.jp/star/snow.html",
        star: "https://kageki.hankyu.co.jp/star/star.html",
        cosmos: "https://kageki.hankyu.co.jp/star/cosmos.html",
        senka: "https://kageki.hankyu.co.jp/star/special/index.html"
      };
      return troupeOfficialMap[troupe] || "https://kageki.hankyu.co.jp/news/index.html";
    }

    // 2. Fix known legacy broken paths to official real destinations
    if (url === "https://www.nikkansports.com/entertainment/takarazuka/" || url === "https://www.nikkansports.com/") {
      return "https://www.nikkansports.com/entertainment/column/takarazuka/";
    }
    if (url.includes("performance/index.html")) {
      return "https://kageki.hankyu.co.jp/news/index.html";
    }
    if (url.includes("star/senka.html")) {
      return "https://kageki.hankyu.co.jp/star/special/index.html";
    }

    // 3. Return 100% direct article URL for seamless 1-tap reading
    return url;
  }

  // Troupe Tab Switching
  troupeTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      troupeTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      
      const troupe = tab.getAttribute("data-troupe");
      state.troupe = troupe;
      renderFeed();
    });
  });

  // Top Star Quick Filter Switching
  function filterByStar(starName) {
    if (state.star === starName) {
      // deselect
      state.star = null;
    } else {
      state.star = starName;
    }

    starChips.forEach(chip => {
      const chipStar = chip.getAttribute("data-star");
      if (state.star && chipStar === state.star) {
        chip.classList.add("active");
      } else {
        chip.classList.remove("active");
      }
    });

    renderFeed();
    if (state.star) {
      window.showToast(`「${state.star}」のニュースを表示中 ✨`);
    }
  }

  starChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const starName = chip.getAttribute("data-star");
      filterByStar(starName);
    });
  });

  // Unread Only Toggle
  unreadToggleBtn.addEventListener("click", () => {
    state.onlyUnread = !state.onlyUnread;
    unreadToggleBtn.classList.toggle("active", state.onlyUnread);
    renderFeed();
  });

  // Mark all read button
  markAllReadBtn.addEventListener("click", markAllVisibleAsRead);

  // Search Toggle
  searchToggleBtn.addEventListener("click", () => {
    const isOpen = searchContainer.classList.toggle("open");
    if (isOpen) {
      searchInput.focus();
    } else {
      state.searchQuery = "";
      searchInput.value = "";
      searchClearBtn.classList.remove("visible");
      renderFeed();
    }
  });

  // Search Input
  searchInput.addEventListener("input", (e) => {
    state.searchQuery = e.target.value.trim();
    searchClearBtn.classList.toggle("visible", state.searchQuery.length > 0);
    renderFeed();
  });

  searchClearBtn.addEventListener("click", () => {
    searchInput.value = "";
    state.searchQuery = "";
    searchClearBtn.classList.remove("visible");
    renderFeed();
    searchInput.focus();
  });

  // Bottom Navigation Handling
  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      const target = item.getAttribute("data-target");

      if (target === "feed") {
        state.activeView = "feed";
        navItems.forEach(n => n.classList.remove("active"));
        item.classList.add("active");
        renderFeed();
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (target === "favorites") {
        state.activeView = "favorites";
        navItems.forEach(n => n.classList.remove("active"));
        item.classList.add("active");
        renderFeed();
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (target === "stars") {
        openStarDrawer();
      } else if (target === "search") {
        searchContainer.classList.add("open");
        searchInput.focus();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  });

  // Star Drawer Modal (List of all stars - Current 2026 System)
  const ALL_STARS_LIST = [
    { name: "永久輝せあ", troupe: "花組", icon: "🌸", desc: "花組トップスター" },
    { name: "星空美咲", troupe: "花組", icon: "🌸", desc: "花組トップ娘役" },
    { name: "聖乃あすか", troupe: "花組", icon: "🌸", desc: "花組男役スター" },
    { name: "極美慎", troupe: "花組", icon: "🌸", desc: "花組男役スター" },
    { name: "鳳月杏", troupe: "月組", icon: "🌙", desc: "月組トップスター" },
    { name: "天紫珠李", troupe: "月組", icon: "🌙", desc: "月組トップ娘役" },
    { name: "風間柚乃", troupe: "月組", icon: "🌙", desc: "月組男役スター" },
    { name: "礼華はる", troupe: "月組", icon: "🌙", desc: "月組男役スター" },
    { name: "朝美絢", troupe: "雪組", icon: "❄️", desc: "雪組トップスター" },
    { name: "音彩唯", troupe: "雪組", icon: "❄️", desc: "雪組トップ娘役" },
    { name: "瀬央ゆりあ", troupe: "雪組", icon: "❄️", desc: "雪組男役スター" },
    { name: "縣千", troupe: "雪組", icon: "❄️", desc: "雪組男役スター" },
    { name: "暁千星", troupe: "星組", icon: "⭐", desc: "星組トップスター" },
    { name: "詩ちづる", troupe: "星組", icon: "⭐", desc: "星組トップ娘役" },
    { name: "天飛華音", troupe: "星組", icon: "⭐", desc: "星組男役スター" },
    { name: "桜木みなと", troupe: "宙組", icon: "🪐", desc: "宙組トップスター" },
    { name: "春乃さくら", troupe: "宙組", icon: "🪐", desc: "宙組トップ娘役" },
    { name: "水美舞斗", troupe: "宙組", icon: "🪐", desc: "宙組男役スター" },
    { name: "瑠風輝", troupe: "宙組", icon: "🪐", desc: "宙組男役スター" },
    { name: "輝月ゆうま", troupe: "専科", icon: "💎", desc: "専科男役スター" },
    { name: "凛城きら", troupe: "専科", icon: "💎", desc: "専科男役スター" },
    { name: "小桜ほのか", troupe: "専科", icon: "💎", desc: "専科娘役スター" }
  ];

  function openStarDrawer() {
    if (!starDrawerList || !starDrawerModal) return;
    starDrawerList.innerHTML = ALL_STARS_LIST.map(st => `
      <div class="star-grid-card" data-star="${st.name}">
        <div class="star-grid-avatar">${st.icon}</div>
        <div class="star-grid-info">
          <span class="star-grid-name">${st.name}</span>
          <span class="star-grid-troupe">${st.troupe} / ${st.desc}</span>
        </div>
      </div>
    `).join("");

    starDrawerModal.classList.add("open");
  }

  function closeStarDrawer() {
    if (starDrawerModal) {
      starDrawerModal.classList.remove("open");
    }
  }

  if (closeStarDrawerBtn) {
    closeStarDrawerBtn.addEventListener("click", closeStarDrawer);
  }

  if (starDrawerModal) {
    starDrawerModal.addEventListener("click", (e) => {
      if (e.target === starDrawerModal) closeStarDrawer();
      const card = e.target.closest(".star-grid-card");
      if (card) {
        const star = card.getAttribute("data-star");
        closeStarDrawer();
        filterByStar(star);
      }
    });
  }

  // Brand click to reset
  const headerBrand = document.querySelector(".header-brand");
  if (headerBrand) {
    headerBrand.addEventListener("click", () => {
      state.troupe = "all";
      state.star = null;
      state.searchQuery = "";
      state.onlyUnread = false;
      state.activeView = "feed";
      
      troupeTabs.forEach(t => t.classList.toggle("active", t.getAttribute("data-troupe") === "all"));
      starChips.forEach(c => c.classList.remove("active"));
      unreadToggleBtn.classList.remove("active");
      searchContainer.classList.remove("open");
      searchInput.value = "";
      
      renderFeed();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // Kickoff
  loadNews();
});
