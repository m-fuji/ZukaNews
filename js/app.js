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
    focusedStars: new Set(JSON.parse(localStorage.getItem("zuka_news_focused_stars") || "[]")),
  };

  // DOM Elements
  const newsFeedEl = document.getElementById("newsFeed");
  const emptyStateEl = document.getElementById("emptyState");
  const troupeTabs = document.querySelectorAll(".troupe-tab");
  const starChips = document.querySelectorAll(".star-chip");
  const starFilterSection = document.getElementById("starFilterSection");
  const toggleStarCollapseBtn = document.getElementById("toggleStarCollapseBtn");
  const starActiveBadge = document.getElementById("starActiveBadge");
  const newsDigestSection = document.getElementById("newsDigestSection");
  const digestBody = document.getElementById("digestBody");
  const digestCounter = document.getElementById("digestCounter");
  const digestBadge = document.getElementById("digestBadge");
  const manageFocusedStarsBtn = document.getElementById("manageFocusedStarsBtn");
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
      updateFocusedStarChips();
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

  function saveFocusedStars() {
    localStorage.setItem("zuka_news_focused_stars", JSON.stringify([...state.focusedStars]));
  }

  // Toggle focused star (My Oshi)
  function toggleFocusedStar(starName, e) {
    if (e) e.stopPropagation();
    if (state.focusedStars.has(starName)) {
      state.focusedStars.delete(starName);
      window.showToast(`${starName} さんの注目を解除しました`);
    } else {
      state.focusedStars.add(starName);
      window.showToast(`${starName} さんを注目スターに登録しました！💖`);
    }
    saveFocusedStars();
    updateFocusedStarChips();
    // Re-render star drawer if open
    if (starDrawerModal && starDrawerModal.classList.contains("open")) {
      openStarDrawer();
    }
    renderFeed();
  }

  // Update visual markers on star chips in horizontal scroll
  function updateFocusedStarChips() {
    starChips.forEach((chip) => {
      const star = chip.getAttribute("data-star");
      const wrap = chip.querySelector(".star-avatar-wrap");
      const existingHeart = chip.querySelector(".star-focus-heart-tag");

      if (state.focusedStars.has(star)) {
        chip.classList.add("is-focused");
        if (!existingHeart && wrap) {
          const heartTag = document.createElement("span");
          heartTag.className = "star-focus-heart-tag";
          heartTag.textContent = "💖";
          wrap.appendChild(heartTag);
        }
      } else {
        chip.classList.remove("is-focused");
        if (existingHeart) existingHeart.remove();
      }
    });
  }

  // Calculate intelligent ranking score
  // 1. Focused Stars (+80 pts)
  // 2. Priority Troupes: 星組, 花組, 宙組 (+35 pts)
  // 3. Recency Score (up to 40 pts)
  function calculateArticleScore(art) {
    let score = 0;

    // 1. Priority Troupe Boost (星組・花組・宙組を中心にランキング)
    const priorityTroupes = ["star", "flower", "cosmos"];
    if (priorityTroupes.includes(art.troupe)) {
      score += 35;
    }

    // 2. Focused Star Boost (注目スターが記事に含まれる場合)
    if (state.focusedStars && state.focusedStars.size > 0) {
      let hasFocusedStar = false;
      if (art.stars && Array.isArray(art.stars)) {
        hasFocusedStar = art.stars.some((s) => state.focusedStars.has(s));
      }
      if (!hasFocusedStar) {
        for (const starName of state.focusedStars) {
          if (art.title.includes(starName) || (art.summary && art.summary.includes(starName))) {
            hasFocusedStar = true;
            break;
          }
        }
      }
      if (hasFocusedStar) {
        score += 80;
      }
    }

    // 3. Recency Score (up to 40 points based on published_at)
    try {
      const pubTime = new Date(art.published_at).getTime();
      const nowTime = Date.now();
      const diffHours = Math.max(0, (nowTime - pubTime) / (1000 * 60 * 60));
      // Gradual decay over days
      const recencyScore = Math.max(0, 40 - diffHours * 0.5);
      score += recencyScore;
    } catch {
      // ignore date parse errors
    }

    return score;
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
      renderNewsDigest();
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

  // Filter & Intelligent Ranking Logic
  function getFilteredArticles() {
    const list = state.articles.filter((art) => {
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

    // Rank articles based on weighted score:
    // 1. Focused Star (+80 pts)
    // 2. Priority Troupes (星組, 花組, 宙組 +35 pts)
    // 3. Recency (up to 40 pts)
    return list.sort((a, b) => {
      const scoreA = calculateArticleScore(a);
      const scoreB = calculateArticleScore(b);
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      return new Date(b.published_at) - new Date(a.published_at);
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

  // Render "最新ニュース見どころ！" (3-line summary of top unread highlights)
  function renderNewsDigest() {
    if (!digestBody) return;

    // Only show digest in feed view
    if (newsDigestSection) {
      newsDigestSection.style.display = (state.activeView === "feed") ? "block" : "none";
    }
    if (state.activeView !== "feed") return;

    // Filter unread articles in overall articles
    const unreadArticles = state.articles.filter((art) => !state.readIds.has(art.id));
    const totalUnread = unreadArticles.length;

    if (digestCounter) {
      if (totalUnread > 0) {
        digestCounter.textContent = `未読 ${totalUnread}件`;
      } else {
        digestCounter.textContent = "全記事既読✨";
      }
    }

    if (totalUnread === 0) {
      if (digestBadge) digestBadge.textContent = "読了完了";
      digestBody.innerHTML = `
        <div class="digest-all-read">
          <div class="digest-all-read-icon">🌸</div>
          <div class="digest-all-read-txt">
            <strong>未読の最新ニュースはすべて読み終えました！</strong><br>
            星組・花組・宙組をはじめ、新着記事が配信され次第自動で更新されます。
          </div>
        </div>
      `;
      return;
    }

    if (digestBadge) digestBadge.textContent = "未読厳選";

    // Sort unread articles by intelligent score to highlight top 3
    const sortedUnread = [...unreadArticles].sort((a, b) => {
      return calculateArticleScore(b) - calculateArticleScore(a);
    });

    // Pick top 3 notable unread articles
    const top3 = sortedUnread.slice(0, 3);

    const itemsHtml = top3.map((art) => {
      const troupeMeta = getTroupeMeta(art.troupe);
      
      let tagText = troupeMeta.name;
      let tagClass = `tag-${art.troupe}`;
      
      let focusedStarName = null;
      if (state.focusedStars && state.focusedStars.size > 0) {
        if (art.stars && Array.isArray(art.stars)) {
          focusedStarName = art.stars.find((s) => state.focusedStars.has(s));
        }
        if (!focusedStarName) {
          for (const s of state.focusedStars) {
            if (art.title.includes(s) || (art.summary && art.summary.includes(s))) {
              focusedStarName = s;
              break;
            }
          }
        }
      }

      if (focusedStarName) {
        tagText = `💖 ${focusedStarName}`;
        tagClass = "tag-focused";
      }

      let cleanTitle = art.title
        .replace(/^【.*?】/, "")
        .replace(/^[\[\(].*?[\]\)]/, "")
        .trim();
      
      let summaryText = art.summary ? art.summary.replace(/<[^>]+>/g, "").trim() : "";
      if (!summaryText) {
        summaryText = `${troupeMeta.name}の注目トピックスをチェック`;
      }

      return `
        <div class="digest-item" data-article-id="${art.id}" title="記事へ移動">
          <span class="digest-item-troupe">${troupeMeta.icon}</span>
          <div class="digest-item-content">
            <div class="digest-item-headline">
              <span class="digest-item-tag ${tagClass}">${tagText}</span>
              ${cleanTitle}
            </div>
            <div class="digest-item-desc">${summaryText}</div>
          </div>
        </div>
      `;
    }).join("");

    digestBody.innerHTML = itemsHtml;

    // Attach click events on digest items to smooth-scroll to article
    digestBody.querySelectorAll(".digest-item").forEach((item) => {
      item.addEventListener("click", () => {
        const artId = item.getAttribute("data-article-id");
        if (!artId) return;

        // If currently filtering out this article, reset filters
        const targetCard = document.querySelector(`.news-card[data-id="${artId}"]`);
        if (!targetCard) {
          state.troupe = "all";
          state.star = null;
          state.onlyUnread = false;
          troupeTabs.forEach((t) => t.classList.toggle("active", t.getAttribute("data-troupe") === "all"));
          starChips.forEach((c) => c.classList.remove("active"));
          if (starActiveBadge) starActiveBadge.style.display = "none";
          unreadToggleBtn.classList.remove("active");
          renderFeed();
        }

        setTimeout(() => {
          const card = document.querySelector(`.news-card[data-id="${artId}"]`);
          if (card) {
            card.scrollIntoView({ behavior: "smooth", block: "center" });
            card.classList.remove("flash-highlight");
            void card.offsetWidth; // trigger reflow
            card.classList.add("flash-highlight");
          }
        }, 80);
      });
    });
  }

  // Render Feed
  function renderFeed() {
    renderNewsDigest();
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

      // Check if article is related to focused star
      let isFocusedNews = false;
      if (state.focusedStars && state.focusedStars.size > 0) {
        if (art.stars && Array.isArray(art.stars)) {
          isFocusedNews = art.stars.some((s) => state.focusedStars.has(s));
        }
        if (!isFocusedNews) {
          for (const starName of state.focusedStars) {
            if (art.title.includes(starName) || (art.summary && art.summary.includes(starName))) {
              isFocusedNews = true;
              break;
            }
          }
        }
      }

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
        <article class="news-card ${isRead ? 'is-read' : ''} ${isFocusedNews ? 'is-focused-news' : ''}" data-id="${art.id}" data-link="${resolveSafeUrl(art)}">
          <div class="card-media-wrap">
            ${mediaHtml}
            <div class="card-floating-badges">
              <span class="badge-troupe ${troupeMeta.class}">
                ${troupeMeta.icon} ${troupeMeta.name}
              </span>
              ${isFocusedNews ? '<span class="badge-focused-star">💖 注目スター</span>' : ''}
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

    if (starActiveBadge) {
      if (state.star) {
        starActiveBadge.style.display = "inline-flex";
        starActiveBadge.innerHTML = `<span>✨ ${state.star}</span> <span style="font-size:10px;opacity:0.8;margin-left:2px;">✕</span>`;
      } else {
        starActiveBadge.style.display = "none";
        starActiveBadge.innerHTML = "";
      }
    }

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

  // Toggle "スターで探す" section collapse
  if (toggleStarCollapseBtn && starFilterSection) {
    toggleStarCollapseBtn.addEventListener("click", () => {
      const isCollapsed = starFilterSection.classList.toggle("is-collapsed");
      toggleStarCollapseBtn.setAttribute("aria-expanded", !isCollapsed);
    });
  }

  // Active star badge click inside toggle button to clear filter
  if (starActiveBadge) {
    starActiveBadge.addEventListener("click", (e) => {
      e.stopPropagation();
      if (state.star) {
        filterByStar(state.star);
      }
    });
  }

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

  // Star Drawer Modal (List of all stars - Reordered: 星組 → 花組 → 宙組 → 月組 → 雪組 → 専科)
  const ALL_STARS_LIST = [
    // 星組 (Star)
    { name: "暁千星", troupe: "星組", icon: "⭐", desc: "星組トップスター" },
    { name: "詩ちづる", troupe: "星組", icon: "⭐", desc: "星組トップ娘役" },
    { name: "天飛華音", troupe: "星組", icon: "⭐", desc: "星組男役スター" },

    // 花組 (Flower)
    { name: "永久輝せあ", troupe: "花組", icon: "🌸", desc: "花組トップスター" },
    { name: "星空美咲", troupe: "花組", icon: "🌸", desc: "花組トップ娘役" },
    { name: "聖乃あすか", troupe: "花組", icon: "🌸", desc: "花組男役スター" },
    { name: "極美慎", troupe: "花組", icon: "🌸", desc: "花組男役スター" },

    // 宙組 (Cosmos)
    { name: "桜木みなと", troupe: "宙組", icon: "🪐", desc: "宙組トップスター" },
    { name: "春乃さくら", troupe: "宙組", icon: "🪐", desc: "宙組トップ娘役" },
    { name: "水美舞斗", troupe: "宙組", icon: "🪐", desc: "宙組男役スター" },
    { name: "瑠風輝", troupe: "宙組", icon: "🪐", desc: "宙組男役スター" },

    // 月組 (Moon)
    { name: "鳳月杏", troupe: "月組", icon: "🌙", desc: "月組トップスター" },
    { name: "天紫珠李", troupe: "月組", icon: "🌙", desc: "月組トップ娘役" },
    { name: "風間柚乃", troupe: "月組", icon: "🌙", desc: "月組男役スター" },
    { name: "礼華はる", troupe: "月組", icon: "🌙", desc: "月組男役スター" },

    // 雪組 (Snow)
    { name: "朝美絢", troupe: "雪組", icon: "❄️", desc: "雪組トップスター" },
    { name: "音彩唯", troupe: "雪組", icon: "❄️", desc: "雪組トップ娘役" },
    { name: "瀬央ゆりあ", troupe: "雪組", icon: "❄️", desc: "雪組男役スター" },
    { name: "縣千", troupe: "雪組", icon: "❄️", desc: "雪組男役スター" },

    // 専科 (Senka)
    { name: "輝月ゆうま", troupe: "専科", icon: "💎", desc: "専科男役スター" },
    { name: "凛城きら", troupe: "専科", icon: "💎", desc: "専科男役スター" },
    { name: "小桜ほのか", troupe: "専科", icon: "💎", desc: "専科娘役スター" }
  ];

  function openStarDrawer() {
    if (!starDrawerList || !starDrawerModal) return;
    starDrawerList.innerHTML = ALL_STARS_LIST.map(st => {
      const isFocused = state.focusedStars.has(st.name);
      return `
        <div class="star-grid-card ${isFocused ? 'is-focused' : ''}" data-star="${st.name}">
          <div class="star-grid-main">
            <div class="star-grid-avatar">${st.icon}</div>
            <div class="star-grid-info">
              <span class="star-grid-name">${st.name}</span>
              <span class="star-grid-troupe">${st.troupe} / ${st.desc}</span>
            </div>
          </div>
          <button type="button" class="star-focus-toggle-btn" title="${isFocused ? '注目スターを解除' : '注目スターに登録'}" aria-label="注目スター設定">
            ${isFocused ? '💖' : '🤍'}
          </button>
        </div>
      `;
    }).join("");

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

      // Heart toggle button click
      const focusBtn = e.target.closest(".star-focus-toggle-btn");
      if (focusBtn) {
        e.stopPropagation();
        const card = focusBtn.closest(".star-grid-card");
        if (card) {
          const star = card.getAttribute("data-star");
          toggleFocusedStar(star, e);
        }
        return;
      }

      // Card click for filter
      const card = e.target.closest(".star-grid-card");
      if (card) {
        const star = card.getAttribute("data-star");
        closeStarDrawer();
        filterByStar(star);
      }
    });
  }

  if (manageFocusedStarsBtn) {
    manageFocusedStarsBtn.addEventListener("click", openStarDrawer);
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
      if (starActiveBadge) {
        starActiveBadge.style.display = "none";
        starActiveBadge.innerHTML = "";
      }
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
