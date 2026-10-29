const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

export function summarizeReviews(node) {
  const bins = [0, 0, 0, 0, 0];
  const reviews = Object.entries(node || {}).filter(([, review]) =>
    review && Number.isInteger(review.stars) && review.stars >= 1 && review.stars <= 5
      && typeof review.nickname === "string" && review.nickname.trim().length > 0
      && review.nickname.length <= 12 && typeof review.comment === "string" && review.comment.length <= 80
      && Number.isFinite(review.createdAt) && Number.isFinite(review.updatedAt)
  ).map(([uid, review]) => ({ ...review, uid }));
  reviews.forEach(review => { bins[review.stars - 1] += 1; });
  reviews.sort((a, b) => b.updatedAt - a.updatedAt || a.uid.localeCompare(b.uid));
  const count = reviews.length;
  const average = count ? (reviews.reduce((sum, review) => sum + review.stars * 2, 0) / count).toFixed(1) : null;
  return { reviews, bins, count, average };
}

export function initDishRatings({ menuData, getDatabase, getNickname, setNickname }) {
  const $ = id => document.getElementById(id);
  const dialog = $("ratingDialog");
  // 老版本页面可能仍命中浏览器缓存，缺少评分面板时继续保留原有点餐流程。
  if (!dialog) return { buttonHtml: () => "", start: () => {} };
  const form = $("ratingForm");
  let database;
  let reviewsRef;
  let connected = false;
  let state = "loading";
  let allReviews = {};
  let selectedDish = null;
  let user = null;
  let identityPromise;
  let identityObserved = false;
  let loadingTimer;
  let saving = false;
  let visibleReviews = 20;

  function buttonHtml(dish) {
    const summary = summarizeReviews(allReviews[dish.id]);
    const text = state === "loading" ? "口碑加载中…" : state === "error" ? "口碑暂不可用 · 重试"
      : summary.count ? `${summary.average} 分 · ${summary.count} 人评价` : "暂无评分 · 我来评价";
    return `<button type="button" class="dish-rating" data-rating-id="${dish.id}" aria-label="查看${escapeHtml(dish.name)}口碑">${text}<span aria-hidden="true"> ›</span></button>`;
  }

  function refresh() {
    // 只刷新口碑入口，保留当前搜索、预算、购物车和价格浏览状态。
    document.querySelectorAll("[data-rating-id]").forEach(button => {
      const summary = summarizeReviews(allReviews[button.dataset.ratingId]);
      button.textContent = state === "loading" ? "口碑加载中…" : state === "error" ? "口碑暂不可用 · 重试"
        : summary.count ? `${summary.average} 分 · ${summary.count} 人评价 ›` : "暂无评分 · 我来评价 ›";
    });
    if (dialog.open) renderDetail();
  }

  function renderDetail() {
    const ready = state === "ready";
    $("ratingStatus").textContent = state === "loading" ? "正在加载食客口碑…" : state === "error" ? "口碑暂时无法加载，请稍后重试。" : "";
    $("ratingRetry").hidden = state !== "error";
    $("ratingContent").hidden = !ready || !form.hidden;
    if (!ready || !selectedDish) return;
    const summary = summarizeReviews(allReviews[selectedDish.id]);
    $("ratingAverage").textContent = summary.average || "暂无评分";
    $("ratingAverage").classList.toggle("unrated", !summary.count);
    $("ratingCount").textContent = summary.count ? `${summary.count} 人评价 · 满分 10 分` : "还没有食客评分";
    $("ratingDistribution").innerHTML = summary.bins.map((count, index) => ({ count, stars: index + 1 })).reverse().map(({ count, stars }) => {
      const percent = summary.count ? Math.round(count / summary.count * 100) : 0;
      return `<div class="rating-bar-row" aria-label="${stars}星，${count}人，${percent}%"><span>${stars}星</span><div class="rating-bar"><div style="width:${percent}%"></div></div><span>${percent}%</span></div>`;
    }).join("");
    const own = user && summary.reviews.find(review => review.uid === user.uid);
    $("ratingMine").hidden = !own;
    if (own) $("ratingMine").textContent = `我的评价 · ${own.stars * 2} 分${own.comment ? ` · ${own.comment}` : ""}`;
    $("ratingEdit").textContent = own ? "修改我的评价" : "我来评分";
    const ordered = own ? [own, ...summary.reviews.filter(review => review.uid !== own.uid)] : summary.reviews;
    $("ratingReviews").innerHTML = ordered.length ? ordered.slice(0, visibleReviews).map(review => {
      const date = new Date(review.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
      return `<article class="rating-review"><div class="rating-review-top"><span>${escapeHtml(review.nickname)}${review.uid === user?.uid ? "（我）" : ""}</span><strong>${review.stars * 2}.0 分</strong></div><p>${escapeHtml(review.comment || "这位食客只留下了评分。")}</p><time datetime="${new Date(review.updatedAt).toISOString()}">${date}</time></article>`;
    }).join("") : '<p class="rating-empty">还没有评价，来分享第一份感受。</p>';
    $("ratingMore").hidden = ordered.length <= visibleReviews;
  }

  function start() {
    clearTimeout(loadingTimer);
    state = "loading";
    refresh();
    try { database = getDatabase(); } catch { database = null; }
    if (!database) { state = "error"; refresh(); return; }
    if (!reviewsRef) {
      database.ref(".info/connected").on("value", snapshot => { connected = snapshot.val() === true; });
      reviewsRef = database.ref("dishReviews");
    }
    if (!identityObserved && typeof database.app.auth === "function") {
      identityObserved = true;
      database.app.auth().onAuthStateChanged(current => { user = current; refresh(); });
    }
    loadingTimer = setTimeout(() => { state = "error"; refresh(); }, 12000);
    reviewsRef.off("value");
    reviewsRef.on("value", snapshot => {
      clearTimeout(loadingTimer);
      allReviews = snapshot.val() || {};
      state = "ready";
      refresh();
    }, () => { clearTimeout(loadingTimer); state = "error"; refresh(); });
  }

  function getIdentity() {
    if (!identityPromise) {
      identityPromise = (async () => {
        if (!database || typeof firebase.auth !== "function") throw new Error("auth/unavailable");
        const auth = database.app.auth();
        await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        // 等待浏览器恢复已保存的匿名身份，避免刷新后重新创建身份而重复计票。
        user = await new Promise((resolve, reject) => {
          const unsubscribe = auth.onAuthStateChanged(current => { unsubscribe(); resolve(current); }, reject);
        });
        if (!user) user = (await auth.signInAnonymously()).user;
        refresh();
        return user;
      })().catch(error => { identityPromise = null; throw error; });
    }
    return identityPromise;
  }

  function errorMessage(error) {
    const code = String(error.code || error.message || "").toLowerCase();
    if (code.includes("operation-not-allowed") || code.includes("admin-restricted")) return "评分服务尚未开启，请稍后再试。";
    if (code.includes("permission") || code.includes("denied")) return "评价暂时无法保存，请稍后重试。";
    if (code.includes("web-storage") || code.includes("persistence")) return "请允许浏览器保存站点数据后再评价。";
    return "暂时无法连接评分服务，请检查网络后重试。";
  }

  function showStars(stars) {
    $("ratingStars").querySelectorAll("label").forEach((label, index) => label.classList.toggle("on", index < stars));
    const captions = ["点亮星星，说说你的真实感受", "不太推荐", "还有提升空间", "中规中矩", "值得一试", "非常推荐"];
    $("ratingCaption").textContent = stars ? `${stars * 2} 分 · ${captions[stars]}` : captions[0];
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-rating-id]");
    if (!button) return;
    selectedDish = menuData.find(dish => dish.id === Number(button.dataset.ratingId));
    if (!selectedDish) return;
    $("ratingTitle").textContent = selectedDish.name;
    $("ratingDishMeta").textContent = Number.isFinite(selectedDish.price) ? `¥${selectedDish.price}${selectedDish.unit ? `/${selectedDish.unit}` : ""}` : selectedDish.priceLabel || "时价";
    form.hidden = true;
    visibleReviews = 20;
    dialog.showModal();
    renderDetail();
    if (state === "error") start();
    // 查看口碑不强制创建匿名账户；已有身份会在进入评价时恢复。
  });
  $("ratingClose").addEventListener("click", () => dialog.close());
  $("ratingRetry").addEventListener("click", start);
  $("ratingMore").addEventListener("click", () => { visibleReviews += 20; renderDetail(); });
  $("ratingStars").innerHTML = [1, 2, 3, 4, 5].map(stars => `<label><input type="radio" name="ratingStars" value="${stars}" required aria-label="${stars}星，${stars * 2}分"><span aria-hidden="true">★</span><small>${stars * 2} 分</small></label>`).join("");
  $("ratingStars").addEventListener("change", event => showStars(Number(event.target.value)));

  $("ratingEdit").addEventListener("click", async () => {
    if (saving) return;
    const dish = selectedDish;
    $("ratingEdit").disabled = true;
    $("ratingStatus").textContent = "正在准备你的评价…";
    try {
      const currentUser = await getIdentity();
      if (!dialog.open || selectedDish.id !== dish.id) return;
      const own = summarizeReviews(allReviews[dish.id]).reviews.find(review => review.uid === currentUser.uid);
      form.reset();
      $("ratingFormError").textContent = "";
      $("ratingFormTitle").textContent = own ? "修改我的评价" : "给这道菜打个分";
      $("ratingSubmit").textContent = own ? "保存修改" : "发布评价";
      try { $("ratingNickname").value = own?.nickname || getNickname(); } catch { $("ratingNickname").value = own?.nickname || ""; }
      $("ratingComment").value = own?.comment || "";
      if (own) $("ratingStars").querySelector(`input[value="${own.stars}"]`).checked = true;
      showStars(own?.stars || 0);
      form.hidden = false;
      renderDetail();
      $("ratingNickname").focus();
    } catch (error) { $("ratingStatus").textContent = errorMessage(error); }
    finally { $("ratingEdit").disabled = false; }
  });
  $("ratingCancel").addEventListener("click", () => { form.hidden = true; renderDetail(); $("ratingEdit").focus(); });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (saving || !user || !selectedDish) return;
    const nickname = $("ratingNickname").value.trim();
    const comment = $("ratingComment").value.trim();
    const stars = Number(new FormData(form).get("ratingStars"));
    $("ratingFormError").textContent = "";
    if (!nickname || nickname.length > 12) { $("ratingFormError").textContent = "请填写 1～12 字的昵称，不能只输入空格。"; $("ratingNickname").focus(); return; }
    if (!Number.isInteger(stars) || stars < 1 || stars > 5 || comment.length > 80) return;
    if (!connected) { $("ratingFormError").textContent = "网络尚未连接，内容已保留，请联网后重试。"; return; }
    saving = true;
    const dishId = selectedDish.id;
    const submitText = $("ratingSubmit").textContent;
    form.querySelectorAll("input, textarea, button").forEach(control => { control.disabled = true; });
    $("ratingClose").disabled = true;
    $("ratingSubmit").textContent = "正在保存…";
    try {
      const ref = database.ref(`dishReviews/${dishId}/${user.uid}`);
      // 以匿名 UID 覆盖同一道菜的评价，保留首次时间；服务端确认前不显示成功或增加人数。
      const result = await ref.transaction(current => ({ nickname, stars, comment,
        createdAt: current?.createdAt ?? firebase.database.ServerValue.TIMESTAMP,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      }), undefined, false);
      if (!result.committed) throw new Error("rating/not-committed");
      allReviews[dishId] = { ...allReviews[dishId], [user.uid]: result.snapshot.val() };
      try { setNickname(nickname); } catch { /* 昵称存储失败不影响服务端已保存的评价。 */ }
      form.hidden = true;
      refresh();
      $("ratingStatus").textContent = "评价已保存，所有顾客都能看到。";
      $("ratingEdit").focus();
    } catch (error) { $("ratingFormError").textContent = errorMessage(error); }
    finally {
      saving = false;
      form.querySelectorAll("input, textarea, button").forEach(control => { control.disabled = false; });
      $("ratingClose").disabled = false;
      $("ratingSubmit").textContent = submitText;
    }
  });
  dialog.addEventListener("cancel", event => { if (saving) event.preventDefault(); });
  return { buttonHtml, start };
}
