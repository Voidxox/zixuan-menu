import { catNames, menuData, PY } from "./data/menu-data.js";

    function getInitials(name) {
      let s = "";
      for (const ch of name) {
        if (PY[ch]) s += PY[ch];
        else if (/[a-zA-Z0-9]/.test(ch)) s += ch.toLowerCase();
      }
      return s;
    }
    // 预处理首字母
    menuData.forEach(d => { d.py = getInitials(d.name); });

    const HISTORY_KEY = "zixuan_order_history";
    // 价格浏览默认只筛选目标价附近的菜单；用户点击加号后，才加入当前购物车
    const PRICE_BROWSE_TOLERANCE = 5;

    let people = 6;
    let cart = {};
    let activeTastes = new Set();
    let searchQuery = "";

    const $ = id => document.getElementById(id);

    // 吸顶偏移：按顶栏 / 已选条真实高度写入 CSS 变量，避免写死像素错位
    function syncStickyOffsets() {
      const header = document.querySelector(".header");
      const selected = $("selectedBar");
      if (header) {
        document.documentElement.style.setProperty("--header-h", header.offsetHeight + "px");
      }
      if (selected && selected.classList.contains("show")) {
        document.documentElement.style.setProperty("--selected-h", selected.offsetHeight + "px");
        document.body.classList.add("has-selected");
      } else {
        document.documentElement.style.setProperty("--selected-h", "0px");
        document.body.classList.remove("has-selected");
      }
    }
    window.addEventListener("resize", syncStickyOffsets);
    window.addEventListener("orientationchange", syncStickyOffsets);

    const peopleNumEl = $("peopleNum"), budgetAmountEl = $("budgetAmount");
    const menuContainer = $("menuContainer"), cartTotalEl = $("cartTotal");
    const cartCountEl = $("cartCount"), diffTagEl = $("diffTag");
    const btnOrder = $("btnOrder"), modalMask = $("modalMask");
    const orderListEl = $("orderList"), modalTotalEl = $("modalTotal");
    const modalBudgetTip = $("modalBudgetTip"), copyTextEl = $("copyText");
    const btnCopy = $("btnCopy"), toolHint = $("toolHint");
    const tastePanel = $("tastePanel"), historyPanel = $("historyPanel");
    const btnRecommend = $("btnRecommend"), recommendHintEl = $("recommendHint");
    const btnPriceBrowse = $("btnPriceBrowse"), priceModalMask = $("priceModalMask");
    const priceInput = $("priceInput"), btnPriceSearch = $("btnPriceSearch");
    const priceResultMeta = $("priceResultMeta"), priceResults = $("priceResults");

    function getBudget() { return people * 17; }
    function hasNumericPrice(dish) { return Number.isFinite(dish?.price); }
    function getDefaultRecommendationHint() {
      return "保留已选菜品，优先补充特色和家常小炒大菜，尽量贴近预算";
    }
    function resetRecommendUI() {
      recommendHintEl.textContent = getDefaultRecommendationHint();
      btnRecommend.textContent = "一键补齐菜品";
      btnRecommend.classList.remove("done");
    }

    function renderPriceResults() {
      const raw = priceInput.value.trim();
      priceResults.innerHTML = "";
      if (!raw) {
        priceResultMeta.textContent = "请输入目标价格后查看附近菜品。当前点菜单不会受到影响。";
        return;
      }

      const targetPrice = Number(raw);
      if (!Number.isFinite(targetPrice) || targetPrice < 0) {
        priceResultMeta.textContent = "请输入有效的非负价格。";
        return;
      }

      const minPrice = Math.max(0, targetPrice - PRICE_BROWSE_TOLERANCE);
      const maxPrice = targetPrice + PRICE_BROWSE_TOLERANCE;
      const matches = menuData
        .filter(dish => hasNumericPrice(dish) && dish.price > 0 && dish.price >= minPrice && dish.price <= maxPrice)
        .sort((a, b) => Math.abs(a.price - targetPrice) - Math.abs(b.price - targetPrice)
          || a.price - b.price || a.id - b.id);

      priceResultMeta.textContent = `目标 ¥${targetPrice}，显示 ¥${minPrice}～¥${maxPrice} 的菜单（共 ${matches.length} 道）。点击加号可加入当前点菜单。`;
      if (!matches.length) {
        priceResults.innerHTML = `<div class="empty-tip">暂时没有 ¥${minPrice}～¥${maxPrice} 的菜品。</div>`;
        return;
      }

      const fragment = document.createDocumentFragment();
      matches.forEach(dish => {
        const offset = dish.price - targetPrice;
        const offsetText = offset === 0 ? "刚好" : offset > 0 ? `高 ¥${offset}` : `低 ¥${-offset}`;
        const unit = dish.unit ? `/${dish.unit}` : "";
        const qty = cart[dish.id] || 0;
        const item = document.createElement("div");
        item.className = "price-result-item";
        item.innerHTML = `
          <div class="price-result-main">
            <div class="price-result-name">${dish.name}</div>
            <div class="price-result-category">${catNames[dish.cat] || "其他"}</div>
          </div>
          <div class="price-result-side">
            <div class="price-result-price">
              <div>¥${dish.price}${unit}</div>
              <div class="price-result-offset">${offsetText}</div>
            </div>
            <div class="price-result-actions">
              <button type="button" class="price-result-qty" data-id="${dish.id}" data-price-action="minus" ${qty === 0 ? "disabled" : ""} aria-label="减少${dish.name}">−</button>
              <span class="price-result-qty-value">${qty}</span>
              <button type="button" class="price-result-qty plus" data-id="${dish.id}" data-price-action="plus" aria-label="加入${dish.name}">+</button>
            </div>
          </div>`;
        fragment.appendChild(item);
      });
      priceResults.appendChild(fragment);
    }

    // ========== 多人协同（Firebase Realtime Database）==========
    // 配置：把下方替换为 Firebase 控制台 Web 应用配置后重新部署。
    // 也可在浏览器控制台执行：
    // localStorage.setItem('zixuan_firebase', JSON.stringify({ apiKey, authDomain, databaseURL, projectId, appId }))
    // 然后刷新页面。
        const FIREBASE_DEFAULT = {
      apiKey: "AIzaSyAByiBey8_Hrqyrdn8SMnU_cx5vxHmoYCo",
      authDomain: "ziweixuan.firebaseapp.com",
      databaseURL: "https://ziweixuan-default-rtdb.asia-southeast1.firebasedatabase.app",
      projectId: "ziweixuan",
      storageBucket: "ziweixuan.firebasestorage.app",
      messagingSenderId: "659226341305",
      appId: "1:659226341305:web:94bbce8513b1d6a4f49068"
    };
    function loadFirebaseConfig() {
      const base = Object.assign({}, FIREBASE_DEFAULT);
      try {
        const raw = localStorage.getItem("zixuan_firebase");
        if (!raw) return base;
        const extra = JSON.parse(raw) || {};
        // 仅用非空字段覆盖，避免本机旧空配置把默认值冲掉
        Object.keys(extra).forEach(k => {
          if (extra[k] !== undefined && extra[k] !== null && String(extra[k]).trim() !== "") {
            base[k] = extra[k];
          }
        });
      } catch (_) {}
      return base;
    }
    const FIREBASE_CONFIG = loadFirebaseConfig();
    const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
    const MEMBER_KEY = "zixuan_member_id";
    const NICK_KEY = "zixuan_nickname";

    let collabRoomId = null;
    let collabActive = false;
    let cartMeta = {}; // dishId -> { lastBy }
    let fbDb = null;
    let roomRef = null;
    let roomListener = null;
    let applyingRemote = false;
    let nickResolver = null;

    function firebaseConfigured() {
      return !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.databaseURL && FIREBASE_CONFIG.projectId);
    }
    function ensureFirebase() {
      if (fbDb) return true;
      if (!firebaseConfigured()) return false;
      if (typeof firebase === "undefined") {
        toolHint.textContent = "Firebase SDK 未加载，请检查网络";
        return false;
      }
      try {
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
        fbDb = firebase.database();
        return true;
      } catch (e) {
        console.error(e);
        toolHint.textContent = "Firebase 初始化失败：" + (e && e.message ? e.message : e);
        return false;
      }
    }
    function getMemberId() {
      let id = localStorage.getItem(MEMBER_KEY);
      if (!id) {
        id = "m_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
        localStorage.setItem(MEMBER_KEY, id);
      }
      return id;
    }
    function getNickname() {
      return (localStorage.getItem(NICK_KEY) || "").trim();
    }
    function setNickname(name) {
      localStorage.setItem(NICK_KEY, name.trim().slice(0, 12));
    }
    function genRoomId() {
      const chars = "abcdefghjkmnpqrstuvwxyz23456789";
      let s = "";
      for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
      return s;
    }
    function roomLink(id) {
      const u = new URL(location.href);
      u.searchParams.set("room", id);
      return u.toString();
    }
    function now() { return Date.now(); }
    function touchExpires() { return now() + ROOM_TTL_MS; }

    function updateCollabUI() {
      const meta = $("collabMeta");
      const btnCreate = $("btnCollabCreate");
      const btnCopy = $("btnCollabCopy");
      const btnNick = $("btnCollabNick");
      const btnEnd = $("btnCollabEnd");
      if (!firebaseConfigured()) {
        meta.innerHTML = "协同未启用：请先在页面配置 Firebase（见说明），或控制台写入 <code>zixuan_firebase</code>。单人点餐不受影响。";
        btnCreate.textContent = "配置说明";
        btnCreate.classList.remove("hidden");
        btnCopy.classList.add("hidden");
        btnNick.classList.add("hidden");
        btnEnd.classList.add("hidden");
        return;
      }
      if (!collabActive) {
        meta.textContent = "单人模式。点「创建房间」生成分享链接，同伴打开后实时同步购物车。";
        btnCreate.textContent = "创建房间";
        btnCreate.classList.remove("hidden");
        btnCopy.classList.add("hidden");
        btnNick.classList.add("hidden");
        btnEnd.classList.add("hidden");
        return;
      }
      const nick = getNickname() || "未命名";
      meta.innerHTML = `协同中 · 房间 <strong>${collabRoomId}</strong> · 我是 <strong>${nick}</strong> · 链接 24 小时无操作将过期`;
      btnCreate.classList.add("hidden");
      btnCopy.classList.remove("hidden");
      btnNick.classList.remove("hidden");
      btnEnd.classList.remove("hidden");
    }

    function promptNickname(force) {
      return new Promise(resolve => {
        const existing = getNickname();
        if (existing && !force) {
          resolve(existing);
          return;
        }
        const mask = $("nickModalMask");
        const input = $("nickInput");
        input.value = existing || "";
        mask.classList.add("show");
        nickResolver = (val) => {
          mask.classList.remove("show");
          nickResolver = null;
          resolve(val);
        };
        setTimeout(() => input.focus(), 50);
      });
    }

    function stopRoomListener() {
      if (roomRef && roomListener) {
        roomRef.off("value", roomListener);
      }
      roomRef = null;
      roomListener = null;
    }

    function cartFromRemote(cartNode) {
      const next = {};
      const meta = {};
      if (cartNode && typeof cartNode === "object") {
        Object.entries(cartNode).forEach(([id, item]) => {
          if (!item) return;
          const qty = +item.qty || 0;
          if (qty > 0) {
            next[id] = qty;
            meta[id] = { lastBy: item.lastBy || "" };
          }
        });
      }
      return { cart: next, meta };
    }

    function applyRemoteSnapshot(val) {
      if (!val || !val.meta) return;
      if (val.meta.status === "ended") {
        collabActive = false;
        collabRoomId = null;
        stopRoomListener();
        history.replaceState(null, "", location.pathname);
        toolHint.textContent = "房间已结束，已回到单人模式";
        updateCollabUI();
        return;
      }
      if (val.meta.expiresAt && val.meta.expiresAt < now()) {
        collabActive = false;
        collabRoomId = null;
        stopRoomListener();
        history.replaceState(null, "", location.pathname);
        toolHint.textContent = "房间已过期（24 小时无操作），请重新创建";
        updateCollabUI();
        return;
      }
      applyingRemote = true;
      try {
        const parsed = cartFromRemote(val.cart);
        cart = parsed.cart;
        cartMeta = parsed.meta;
        if (typeof val.meta.people === "number" && val.meta.people >= 1) {
          people = val.meta.people;
          peopleNumEl.textContent = people;
          budgetAmountEl.textContent = "¥" + people * 17;
        }
        const activeCat = document.querySelector(".tab.active")?.dataset.cat || "all";
        renderMenu(activeCat);
        updateCartUI();
        if (priceModalMask.classList.contains("show") && priceInput.value.trim()) renderPriceResults();
      } finally {
        applyingRemote = false;
      }
    }

    async function touchRoomMeta(extra) {
      if (!collabActive || !fbDb) return;
      const patch = Object.assign({
        updatedAt: now(),
        expiresAt: touchExpires()
      }, extra || {});
      await fbDb.ref(`rooms/${collabRoomId}/meta`).update(patch);
    }

    async function joinRoom(roomId, opts) {
      opts = opts || {};
      if (!ensureFirebase()) {
        alert("请先配置 Firebase 才能使用多人点餐。\n\n1. 打开 Firebase 控制台创建项目并启用 Realtime Database\n2. 创建 Web 应用，复制配置\n3. 在控制台执行：\nlocalStorage.setItem('zixuan_firebase', JSON.stringify({apiKey,authDomain,databaseURL,projectId,appId}))\n4. 刷新页面；把同一配置写入 index.html 后部署，同伴才能使用");
        return false;
      }
      const nick = await promptNickname(!!opts.forceNick);
      if (!nick) {
        toolHint.textContent = "需要昵称才能进入协同房间";
        return false;
      }
      setNickname(nick);
      const snap = await fbDb.ref(`rooms/${roomId}`).once("value");
      const val = snap.val();
      if (!val || !val.meta) {
        alert("房间不存在或链接无效");
        return false;
      }
      if (val.meta.status === "ended") {
        alert("该房间已结束点餐");
        return false;
      }
      if (val.meta.expiresAt && val.meta.expiresAt < now()) {
        alert("该房间已过期，请重新创建房间");
        return false;
      }
      const memberId = getMemberId();
      await fbDb.ref(`rooms/${roomId}/members/${memberId}`).set({
        name: nick,
        joinedAt: val.members && val.members[memberId] && val.members[memberId].joinedAt || now(),
        lastSeenAt: now()
      });
      await fbDb.ref(`rooms/${roomId}/meta`).update({
        updatedAt: now(),
        expiresAt: touchExpires()
      });

      stopRoomListener();
      collabRoomId = roomId;
      collabActive = true;
      roomRef = fbDb.ref(`rooms/${roomId}`);
      roomListener = roomRef.on("value", snapshot => {
        applyRemoteSnapshot(snapshot.val());
      });
      history.replaceState(null, "", roomLink(roomId));
      updateCollabUI();
      toolHint.textContent = `已加入房间 ${roomId}，购物车将实时同步`;
      return true;
    }

    async function createRoom() {
      const btn = $("btnCollabCreate");
      if (!ensureFirebase()) {
        alert("Firebase 未就绪。请确认 Web 配置与 databaseURL 正确。");
        return;
      }
      const nick = await promptNickname(false);
      if (!nick) {
        toolHint.textContent = "需要填写昵称才能创建房间";
        return;
      }
      setNickname(nick);
      const id = genRoomId();
      const memberId = getMemberId();
      const t = now();
      // 创建时可带上当前本地已选，方便先点再开房
      const cartNode = {};
      Object.entries(cart).forEach(([dishId, qty]) => {
        if (qty > 0) cartNode[dishId] = { qty, lastBy: nick, updatedAt: t };
      });
      const prevLabel = btn ? btn.textContent : "";
      if (btn) {
        btn.disabled = true;
        btn.textContent = "创建中…";
      }
      toolHint.textContent = "正在创建房间…";
      try {
        await fbDb.ref(`rooms/${id}`).set({
          meta: {
            createdAt: t,
            updatedAt: t,
            expiresAt: touchExpires(),
            people,
            status: "active",
            createdBy: nick
          },
          members: {
            [memberId]: { name: nick, joinedAt: t, lastSeenAt: t }
          },
          cart: cartNode
        });
        await joinRoom(id, { forceNick: false });
        try {
          await navigator.clipboard.writeText(roomLink(id));
          toolHint.textContent = `房间已创建，链接已复制，发给同伴即可一起点`;
        } catch (_) {
          toolHint.textContent = `房间已创建，请点「复制链接」发给同伴`;
        }
      } catch (e) {
        console.error("createRoom failed", e);
        const code = (e && (e.code || e.message)) || String(e);
        let tip = "创建房间失败：" + code;
        if (String(code).includes("PERMISSION_DENIED") || String(code).includes("permission_denied")) {
          tip = "创建失败：权限被拒。请到 Firebase 控制台 → Realtime Database → 规则，发布允许 rooms 读写的规则后重试。";
        } else if (String(code).includes("404") || String(code).toLowerCase().includes("not found")) {
          tip = "创建失败：数据库地址不正确。请核对 databaseURL 是否与控制台顶部一致。";
        }
        toolHint.textContent = tip;
        alert(tip);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = prevLabel || "创建房间";
        }
        updateCollabUI();
      }
    }

    async function endRoom() {
      if (!collabActive || !fbDb) return;
      if (!confirm("结束本次点餐后，房间链接将失效，所有人退出协同。确定吗？")) return;
      await fbDb.ref(`rooms/${collabRoomId}/meta`).update({
        status: "ended",
        updatedAt: now()
      });
      stopRoomListener();
      collabActive = false;
      collabRoomId = null;
      history.replaceState(null, "", location.pathname);
      updateCollabUI();
      toolHint.textContent = "已结束协同，可继续单人点餐";
    }

    async function collabChangeQty(dishId, delta) {
      if (!collabActive || !fbDb) return false;
      const nick = getNickname() || "食客";
      const ref = fbDb.ref(`rooms/${collabRoomId}/cart/${dishId}`);
      await ref.transaction(cur => {
        const base = cur && typeof cur === "object" ? cur : { qty: 0 };
        const qty = Math.max(0, (+base.qty || 0) + delta);
        if (qty === 0) return null;
        return { qty, lastBy: nick, updatedAt: now() };
      });
      await touchRoomMeta();
      await fbDb.ref(`rooms/${collabRoomId}/members/${getMemberId()}/lastSeenAt`).set(now());
      return true;
    }

    async function collabSetPeople(nextPeople) {
      if (!collabActive || !fbDb) return false;
      await touchRoomMeta({ people: nextPeople });
      return true;
    }

    async function collabReplaceCart(nextCart) {
      if (!collabActive || !fbDb) return false;
      const nick = getNickname() || "食客";
      const t = now();
      const snap = await fbDb.ref(`rooms/${collabRoomId}/cart`).once("value");
      const old = snap.val() || {};
      const updates = {};
      Object.keys(old).forEach(k => { updates[`rooms/${collabRoomId}/cart/${k}`] = null; });
      Object.entries(nextCart).forEach(([id, qty]) => {
        if (qty > 0) updates[`rooms/${collabRoomId}/cart/${id}`] = { qty, lastBy: nick, updatedAt: t };
      });
      updates[`rooms/${collabRoomId}/meta/updatedAt`] = t;
      updates[`rooms/${collabRoomId}/meta/expiresAt`] = touchExpires();
      await fbDb.ref().update(updates);
      return true;
    }

    async function changeCartQty(dishId, delta) {
      const dish = menuData.find(item => item.id === dishId);
      // 时价菜先展示给顾客，价格未确认前不进入在线点餐和预算计算。
      if (delta > 0 && dish && !hasNumericPrice(dish)) {
        toolHint.textContent = `${dish.name}为时价菜品，请现场确认价格后再加入点菜单`;
        return;
      }
      if (collabActive) {
        try {
          await collabChangeQty(dishId, delta);
        } catch (e) {
          console.error(e);
          toolHint.textContent = "同步失败，请检查网络或 Firebase 配置";
        }
        return;
      }
      if (delta > 0) cart[dishId] = (cart[dishId] || 0) + delta;
      else {
        if (cart[dishId] > 0) cart[dishId] += delta;
        if (!cart[dishId]) delete cart[dishId];
      }
      renderMenu(document.querySelector(".tab.active")?.dataset.cat || "all");
      updateCartUI();
    }

    async function replaceCartLocalOrRemote(nextCart, confirmMsg) {
      if (collabActive) {
        if (confirmMsg && !confirm(confirmMsg)) return false;
        try {
          await collabReplaceCart(nextCart);
        } catch (e) {
          console.error(e);
          toolHint.textContent = "批量同步失败，请重试";
          return false;
        }
        return true;
      }
      cart = nextCart;
      cartMeta = {};
      return true;
    }


    function matchTaste(dish) {
      if (activeTastes.size === 0) return true;
      const t = dish.tastes || [];
      if (activeTastes.has("mild") && !t.includes("mild")) return false;
      if (activeTastes.has("spicy") && !t.includes("spicy")) return false;
      if (activeTastes.has("meat") && !t.includes("meat")) return false;
      if (activeTastes.has("veg") && !t.includes("veg")) return false;
      if (activeTastes.has("no-cilantro")) { /* 当前数据无香菜标记，默认通过 */ }
      if (activeTastes.has("no-onion") && !t.includes("no-onion") && t.includes("meat")) {
        // 简化：有 no-onion 标签的优先，其余不强制隐藏
      }
      // 多选取交集逻辑：只要满足任一已选偏好即可（更宽松好用）
      for (const a of activeTastes) {
        if (a === "no-cilantro" || a === "no-onion") continue;
        if (t.includes(a)) return true;
      }
      // 如果只选了忌口类
      if ([...activeTastes].every(x => x === "no-cilantro" || x === "no-onion")) return true;
      return activeTastes.size === 0;
    }

    function renderMenu(filterCat = "all") {
      menuContainer.innerHTML = "";
      const cats = filterCat === "all" ? ["liangcai","xiaochao","tese","tang","jiushui"] : [filterCat];
      cats.forEach(cat => {
        const dishes = menuData.filter(d => {
          if (d.cat !== cat) return false;
          if (!matchTaste(d)) return false;
          if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const hitName = d.name.includes(searchQuery);
            const hitPy = (d.py || "").includes(q);
            if (!hitName && !hitPy) return false;
          }
          return true;
        });
        if (!dishes.length) return;
        const section = document.createElement("div");
        section.className = "section";
        section.innerHTML = `<div class="section-title">${catNames[cat]}</div>`;
        const list = document.createElement("div");
        list.className = "dish-list";
        dishes.forEach(dish => {
          const qty = cart[dish.id] || 0;
          const unit = dish.unit ? `/${dish.unit}` : "";
          const priceText = hasNumericPrice(dish) ? `¥${dish.price}` : (dish.priceLabel || "时价");
          const imageHtml = dish.image ? `<img class="dish-image" src="${dish.image}" alt="${dish.name}" loading="lazy">` : "";
          const tags = (dish.tastes || []).filter(t => t === "spicy" || t === "mild").map(t =>
            `<span class="dish-tag ${t === "spicy" ? "spicy" : ""}">${t === "spicy" ? "辣" : "清淡"}</span>`
          ).join("");
          const div = document.createElement("div");
          div.className = "dish";
          const by = (cartMeta[dish.id] && cartMeta[dish.id].lastBy) ? cartMeta[dish.id].lastBy : "";
          const byHtml = by ? `<div class="dish-by">${by} 操作</div>` : "";
          div.innerHTML = `
            ${imageHtml}
            <div class="dish-info">
              <div class="dish-name">${dish.name}</div>
              <div class="dish-tags">${tags}</div>
              <div class="dish-price${hasNumericPrice(dish) ? "" : " market"}">${priceText}<span>${unit}</span></div>
              ${byHtml}
            </div>
            <div class="qty-control">
              <button class="qty-btn" data-id="${dish.id}" data-act="minus" ${qty===0?"disabled":""}>−</button>
              <span class="qty">${qty}</span>
              <button class="qty-btn plus" data-id="${dish.id}" data-act="plus" ${hasNumericPrice(dish) ? "" : "disabled"} aria-label="${hasNumericPrice(dish) ? `加入${dish.name}` : `${dish.name}为时价，暂不可在线计价`}">+</button>
            </div>`;
          list.appendChild(div);
        });
        section.appendChild(list);
        menuContainer.appendChild(section);
      });
      if (!menuContainer.children.length) {
        const tip = document.createElement("div");
        tip.className = "empty-tip";
        tip.style.padding = "40px 16px";
        tip.textContent = searchQuery ? `未找到「${searchQuery}」相关菜品` : "暂无符合条件的菜品";
        menuContainer.appendChild(tip);
      }
    }

    function updateCartUI() {
      let total = 0, count = 0;
      Object.entries(cart).forEach(([id, qty]) => {
        if (qty > 0) {
          const d = menuData.find(x => x.id == id);
          total += d.price * qty; count += qty;
        }
      });
      const budget = people * 17;
      cartTotalEl.textContent = total;
      cartCountEl.textContent = count === 0 ? "未选择菜品" : `已选 ${count} 道`;
      const budgetTipEl = $("budgetTip");
      if (count === 0) {
        diffTagEl.classList.add("hidden");
        btnOrder.disabled = true;
        budgetTipEl.className = "budget-tip";
        budgetTipEl.innerHTML = "";
      } else {
        btnOrder.disabled = false;
        const diff = total - budget;
        diffTagEl.classList.remove("hidden");
        if (diff > 0) { diffTagEl.textContent = `超 ¥${diff}`; diffTagEl.className = "diff over"; }
        else if (diff < 0) { diffTagEl.textContent = `余 ¥${-diff}`; diffTagEl.className = "diff under"; }
        else { diffTagEl.textContent = "刚好"; diffTagEl.className = "diff under"; }

        // 预算接近提醒
        budgetTipEl.className = "budget-tip show";
        if (diff === 0) {
          budgetTipEl.classList.add("ok");
          budgetTipEl.innerHTML = "刚好卡在预算线上，可以下单了。";
        } else if (diff > 0 && diff <= 15) {
          budgetTipEl.classList.add("warn");
          budgetTipEl.innerHTML = `略超预算 ¥${diff}，可考虑去掉一道小菜，或现场补差价。`;
        } else if (diff > 15) {
          budgetTipEl.classList.add("warn");
          budgetTipEl.innerHTML = `已超预算 ¥${diff}，建议减少菜品或换更便宜的搭配。`;
        } else if (diff < 0 && diff >= -12) {
          budgetTipEl.classList.add("ok");
          // 推荐一道接近剩余预算的便宜菜
          const remain = -diff;
          const candidates = menuData
            .filter(d => d.cat !== "jiushui" && d.price > 0 && d.price <= remain + 3 && !cart[d.id] && matchTaste(d))
            .sort((a, b) => Math.abs(a.price - remain) - Math.abs(b.price - remain));
          const suggest = candidates[0];
          if (suggest) {
            budgetTipEl.innerHTML = `还差 ¥${remain} 到预算。可以加「${suggest.name}」¥${suggest.price}<span class="tip-action" data-add-id="${suggest.id}">一键加入</span>`;
          } else {
            budgetTipEl.innerHTML = `还差 ¥${remain} 到预算，再挑一道小菜就更合适。`;
          }
        } else if (diff < -12) {
          budgetTipEl.classList.add("ok");
          budgetTipEl.innerHTML = `预算还剩 ¥${-diff}，可以再加 1～2 道菜。`;
        } else {
          budgetTipEl.className = "budget-tip";
          budgetTipEl.innerHTML = "";
        }
      }
    // 已选吸顶条
      const selectedBar = $("selectedBar");
      const selCount = $("selCount");
      const selNames = $("selNames");
      const selPrice = $("selPrice");
      if (count === 0) {
        selectedBar.classList.remove("show");
      } else {
        selectedBar.classList.add("show");
        selCount.textContent = `已选 ${count} 道`;
        selPrice.textContent = `¥${total}`;
        const names = Object.entries(cart)
          .filter(([, q]) => q > 0)
          .map(([id, q]) => {
            const d = menuData.find(x => x.id == id);
            return q > 1 ? `${d.name}×${q}` : d.name;
          });
        selNames.textContent = names.join("、");
      }
      // 已选条显示状态变化后，重算搜索吸顶 top
      requestAnimationFrame(syncStickyOffsets);
    }

    // 盲盒随机（预算附近）
    function blindBox() {
      const budget = people * 17;
      const upper = budget + 20;
      const pool = menuData.filter(d =>
        d.cat !== "jiushui" && d.cat !== "tang" && d.price <= 50 && matchTaste(d)
      );
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const picked = [];
      let sum = 0;
      for (const d of pool) {
        if (sum + d.price > upper) continue;
        if (picked.some(p => p.cat === d.cat) && picked.filter(p => p.cat === d.cat).length >= 2) continue;
        picked.push(d);
        sum += d.price;
        if (sum >= budget && picked.length >= Math.max(3, Math.floor(people / 2))) break;
      }
      if (picked.length < 2) {
        toolHint.textContent = "盲盒失败，请放宽口味过滤后再试";
        return;
      }
      const next = {};
      picked.forEach(d => { next[d.id] = 1; });
      (async () => {
        const ok = await replaceCartLocalOrRemote(next, collabActive ? "盲盒将替换当前房间内所有人的购物车，确定继续？" : "");
        if (!ok) return;
        if (!collabActive) {
          document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
          document.querySelector('.tab[data-cat="all"]').classList.add("active");
          renderMenu("all");
          updateCartUI();
        } else {
          document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
          document.querySelector('.tab[data-cat="all"]').classList.add("active");
        }
        toolHint.textContent = `盲盒开出 ${picked.length} 道菜，合计 ¥${sum}`;
      })();
    }

    // ========== 按已选菜品一键补齐 ==========
    // 业务：保留购物车已有菜品只追加；总价最多上浮 ¥17；优先特色/小炒大菜；汤酒水及部分小食不参与自动补齐。
    function getCartSummary() {
      return Object.entries(cart).reduce((summary, [id, qty]) => {
        const dish = menuData.find(item => item.id == id);
        if (dish && qty > 0) {
          summary.total += dish.price * qty;
          summary.count += qty;
          summary.ids.add(dish.id);
        }
        return summary;
      }, { total: 0, count: 0, ids: new Set() });
    }

    function buildCompletion() {
      const budget = getBudget();
      const upperLimit = budget + 17;
      const current = getCartSummary();
      const smallGroup = people <= 4;
      // 花生米类、红糖糍粑、锅盔、水饺、部分汤品不参与自动补齐
      const excludedIds = new Set([90, 93, 95, 96, 97, 98, 99, 100, 103, 108]);
      const recommendationCats = ["liangcai", "xiaochao", "tese"];
      const catBits = Object.fromEntries(recommendationCats.map((cat, index) => [cat, 1 << index]));
      const dishById = Object.fromEntries(menuData.map(dish => [dish.id, dish]));

      if (current.total > upperLimit) return { reason: "over-limit", current, total: current.total, dishes: [] };
      if (current.total >= budget) return { reason: "already-covered", current, total: current.total, dishes: [] };

      const candidateLimit = upperLimit - current.total;
      const isBigDish = dish => dish && (dish.cat === "xiaochao" || dish.cat === "tese") && dish.price >= 38;
      const isMainDish = dish => dish && (dish.cat === "xiaochao" || dish.cat === "tese") && dish.price >= 20;
      const candidates = menuData
        .filter(dish => recommendationCats.includes(dish.cat)
          && !current.ids.has(dish.id)
          && !excludedIds.has(dish.id)
          && dish.price <= candidateLimit
          && matchTaste(dish)
          && (!smallGroup || !new Set([96, 97, 98, 99, 100]).has(dish.id)));

      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }

      const maxPerCategory = Math.max(2, Math.ceil(people / 5));
      let states = [{ sum: 0, ids: [], mask: 0, counts: {}, randomness: Math.random(), randomSlot: Math.floor(Math.random() * 4) }];

      const stateScore = state => {
        const finalTotal = current.total + state.sum;
        const gap = Math.abs(budget - finalTotal);
        const excess = Math.max(0, finalTotal - budget);
        const categoryCount = Object.keys(state.counts).length;
        const bigDishCount = state.ids.reduce((count, id) => count + (isBigDish(dishById[id]) ? 1 : 0), 0);
        const bigDishValue = state.ids.reduce((sum, id) => sum + (isBigDish(dishById[id]) ? dishById[id].price : 0), 0);
        const mainValue = state.ids.reduce((sum, id) => sum + (isMainDish(dishById[id]) ? dishById[id].price : 0), 0);
        return (finalTotal >= budget ? 1600 : 0)
          + bigDishCount * 260
          + bigDishValue * 14
          + mainValue * 9
          + categoryCount * 50
          - gap * 14
          - excess * 6
          + (state.randomness || 0) * 60;
      };

      candidates.forEach(dish => {
        const additions = [];
        states.forEach(state => {
          const nextSum = state.sum + dish.price;
          if (nextSum > candidateLimit) return;
          if ((state.counts[dish.cat] || 0) >= maxPerCategory) return;
          const counts = { ...state.counts, [dish.cat]: (state.counts[dish.cat] || 0) + 1 };
          additions.push({
            sum: nextSum,
            ids: state.ids.concat(dish.id),
            mask: state.mask | (catBits[dish.cat] || 0),
            counts,
            randomness: Math.random(),
            randomSlot: Math.floor(Math.random() * 4)
          });
        });

        const bestByShape = new Map();
        states.concat(additions).forEach(state => {
          const key = `${state.sum}|${state.mask}|${state.ids.length}|${state.randomSlot}`;
          const existing = bestByShape.get(key);
          if (!existing || stateScore(state) > stateScore(existing)) bestByShape.set(key, state);
        });
        states = [...bestByShape.values()]
          .sort((a, b) => stateScore(b) - stateScore(a))
          .slice(0, 2600);
      });

      const workable = states.filter(state => state.ids.length > 0);
      const reachesBudget = workable.filter(state => current.total + state.sum >= budget);
      const pool = (reachesBudget.length ? reachesBudget : workable)
        .sort((a, b) => stateScore(b) - stateScore(a))
        .slice(0, 12);
      const selected = pool.length
        ? pool[Math.floor(Math.random() * pool.length)]
        : { sum: 0, ids: [] };

      return {
        reason: selected.ids.length ? "completed" : "no-candidate",
        current,
        total: current.total + selected.sum,
        dishes: selected.ids.map(id => dishById[id]).filter(Boolean)
      };
    }

    // 历史记录
    function loadHistory() {
      try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
    }
    function saveHistory() {
      const items = Object.entries(cart).filter(([,q]) => q > 0).map(([id, qty]) => {
        const d = menuData.find(x => x.id == id);
        return { id: +id, name: d.name, price: d.price, qty };
      });
      if (!items.length) return;
      const total = items.reduce((s, i) => s + i.price * i.qty, 0);
      const record = {
        id: Date.now(),
        time: new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
        people, total, items
      };
      let list = loadHistory();
      list.unshift(record);
      list = list.slice(0, 8);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    }
    function renderHistory() {
      const list = loadHistory();
      const el = $("historyList");
      if (!list.length) {
        el.innerHTML = '<div class="history-empty">暂无历史记录，点完餐后会自动保存</div>';
        return;
      }
      el.innerHTML = list.map(h => `
        <div class="history-item">
          <div class="history-info">
            <div class="h-title">${h.people}人 · ¥${h.total} · ${h.items.length}道</div>
            <div class="h-meta">${h.time} · ${h.items.slice(0,3).map(i=>i.name).join("、")}${h.items.length>3?"…":""}</div>
          </div>
          <button class="btn-reuse" data-hid="${h.id}">复用</button>
        </div>`).join("");
    }

    // Events
    $("btnTaste").addEventListener("click", () => {
      const show = !tastePanel.classList.contains("show");
      tastePanel.classList.toggle("show", show);
      historyPanel.classList.remove("show");
      $("btnTaste").classList.toggle("active", show);
      $("btnHistory").classList.remove("active");
      toolHint.textContent = show ? "选择偏好后列表会自动过滤" : "";
    });
    $("btnHistory").addEventListener("click", () => {
      const show = !historyPanel.classList.contains("show");
      historyPanel.classList.toggle("show", show);
      tastePanel.classList.remove("show");
      $("btnHistory").classList.toggle("active", show);
      $("btnTaste").classList.remove("active");
      if (show) renderHistory();
      toolHint.textContent = show ? "点击「复用」可一键恢复上次点餐" : "";
    });
    $("btnBlind").addEventListener("click", () => {
      tastePanel.classList.remove("show");
      historyPanel.classList.remove("show");
      $("btnTaste").classList.remove("active");
      $("btnHistory").classList.remove("active");
      blindBox();
    });

    $("tasteTags").addEventListener("click", e => {
      const btn = e.target.closest(".taste-tag");
      if (!btn) return;
      const t = btn.dataset.taste;
      if (activeTastes.has(t)) { activeTastes.delete(t); btn.classList.remove("on"); }
      else { activeTastes.add(t); btn.classList.add("on"); }
      renderMenu(document.querySelector(".tab.active").dataset.cat);
    });

    $("historyList").addEventListener("click", e => {
      const btn = e.target.closest(".btn-reuse");
      if (!btn) return;
      const hid = +btn.dataset.hid;
      const rec = loadHistory().find(h => h.id === hid);
      if (!rec) return;
      (async () => {
        const next = {};
        rec.items.forEach(i => { next[i.id] = i.qty; });
        const ok = await replaceCartLocalOrRemote(next, collabActive ? "复用历史将替换房间内所有人的购物车，确定？" : "");
        if (!ok) return;
        if (collabActive) {
          try { await collabSetPeople(rec.people); } catch (_) {}
        } else {
          people = rec.people;
          peopleNumEl.textContent = people;
          budgetAmountEl.textContent = "¥" + people * 17;
          renderMenu("all");
          updateCartUI();
        }
        toolHint.textContent = `已复用 ${rec.time} 的点餐记录`;
        historyPanel.classList.remove("show");
        $("btnHistory").classList.remove("active");
      })();
    });

    const searchInput = $("searchInput");
    const searchWrap = $("searchWrap");
    const searchClear = $("searchClear");
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value.trim();
      searchWrap.classList.toggle("has-value", !!searchQuery);
      const activeCat = document.querySelector(".tab.active")?.dataset.cat || "all";
      renderMenu(activeCat);
    });
    searchClear.addEventListener("click", () => {
      searchInput.value = "";
      searchQuery = "";
      searchWrap.classList.remove("has-value");
      searchInput.focus();
      const activeCat = document.querySelector(".tab.active")?.dataset.cat || "all";
      renderMenu(activeCat);
    });

    $("selectedBar").addEventListener("click", () => {
      if (Object.keys(cart).length === 0) return;
      saveHistory();
      renderOrderModal();
      modalMask.classList.add("show");
    });

    document.getElementById("budgetTip").addEventListener("click", e => {
      const t = e.target.closest("[data-add-id]");
      if (!t) return;
      changeCartQty(+t.dataset.addId, 1);
    });

    btnPriceBrowse.addEventListener("click", () => {
      priceModalMask.classList.add("show");
      priceInput.focus();
    });
    btnPriceSearch.addEventListener("click", renderPriceResults);
    priceInput.addEventListener("keydown", e => {
      if (e.key === "Enter") renderPriceResults();
    });
    priceResults.addEventListener("click", async e => {
      const btn = e.target.closest("[data-price-action]");
      if (!btn) return;
      const id = +btn.dataset.id;
      const delta = btn.dataset.priceAction === "plus" ? 1 : -1;
      btn.disabled = true;
      try {
        await changeCartQty(id, delta);
      } finally {
        renderPriceResults();
      }
    });
    $("priceModalClose").addEventListener("click", () => priceModalMask.classList.remove("show"));
    priceModalMask.addEventListener("click", e => {
      if (e.target === priceModalMask) priceModalMask.classList.remove("show");
    });

    btnRecommend.addEventListener("click", () => {
      // 点击一键补齐：在已选基础上追加菜品，尽量贴近人数×17 预算
      const result = buildCompletion();
      const budget = getBudget();

      if (result.reason === "over-limit") {
        recommendHintEl.textContent = `当前已选 ¥${result.total}，已超出建议上限 ¥${budget + 17}，请先手动调整菜品`;
        return;
      }
      if (result.reason === "already-covered") {
        recommendHintEl.textContent = `当前已选 ¥${result.total}，已达到 ¥${budget} 菜品预算，无需再补齐`;
        return;
      }
      if (result.reason === "no-candidate") {
        recommendHintEl.textContent = "当前剩余预算不足以补充合适菜品，请手动调整人数或菜品";
        return;
      }

      (async () => {
        if (collabActive && !confirm("一键补齐将向房间购物车追加菜品，所有人可见。确定继续？")) return;
        const next = { ...cart };
        result.dishes.forEach(dish => { next[dish.id] = 1; });
        const ok = await replaceCartLocalOrRemote(next, "");
        if (!ok) return;
        if (!collabActive) {
          document.querySelectorAll(".tab").forEach(tab => tab.classList.remove("active"));
          document.querySelector('.tab[data-cat="all"]').classList.add("active");
          renderMenu("all");
          updateCartUI();
        } else {
          document.querySelectorAll(".tab").forEach(tab => tab.classList.remove("active"));
          document.querySelector('.tab[data-cat="all"]').classList.add("active");
        }

        const diff = result.total - budget;
        const budgetStatus = diff > 0 ? `上浮 ¥${diff}` : diff < 0 ? `剩余 ¥${-diff}` : "刚好预算";
        const retained = result.current.count
          ? `已保留 ${result.current.count} 道已选菜`
          : "已从空菜单生成推荐";
        recommendHintEl.textContent = `${retained}，本次补充 ${result.dishes.length} 道菜，合计 ¥${result.total}（预算 ¥${budget}，${budgetStatus}）；优先补充特色和家常小炒大菜`;
        btnRecommend.textContent = "已补齐 ✓";
        btnRecommend.classList.add("done");
        setTimeout(() => {
          btnRecommend.textContent = "一键补齐菜品";
          btnRecommend.classList.remove("done");
        }, 1800);
      })();
    });

    $("minusPeople").addEventListener("click", async () => {
      if (people <= 1) return;
      const next = people - 1;
      if (collabActive) {
        try { await collabSetPeople(next); } catch (e) { toolHint.textContent = "人数同步失败"; }
        return;
      }
      people = next;
      peopleNumEl.textContent = people;
      budgetAmountEl.textContent = "¥" + people * 17;
      resetRecommendUI();
      updateCartUI();
    });
    $("plusPeople").addEventListener("click", async () => {
      const next = people + 1;
      if (collabActive) {
        try { await collabSetPeople(next); } catch (e) { toolHint.textContent = "人数同步失败"; }
        return;
      }
      people = next;
      peopleNumEl.textContent = people;
      budgetAmountEl.textContent = "¥" + people * 17;
      resetRecommendUI();
      updateCartUI();
    });
    $("tabs").addEventListener("click", e => {
      if (!e.target.classList.contains("tab")) return;
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      e.target.classList.add("active");
      renderMenu(e.target.dataset.cat);
    });
    menuContainer.addEventListener("click", e => {
      const btn = e.target.closest(".qty-btn");
      if (!btn) return;
      const id = +btn.dataset.id;
      const delta = btn.dataset.act === "plus" ? 1 : -1;
      changeCartQty(id, delta);
    });

    function renderOrderModal() {
      let total = 0, html = "", lines = [];
      const budget = people * 17;
      Object.entries(cart).forEach(([id, qty]) => {
        if (qty <= 0) return;
        const d = menuData.find(x => x.id == id);
        const sub = d.price * qty; total += sub;
        const by = (cartMeta[id] && cartMeta[id].lastBy) ? `（${cartMeta[id].lastBy}）` : "";
        html += `<div class="order-item"><div class="order-item-main"><span>${d.name} ×${qty}${by}</span><span>¥${sub}</span></div><button class="btn-remove-item" data-remove-id="${d.id}">移除</button></div>`;
        lines.push(`${d.name} ×${qty}${by}  ¥${sub}`);
      });
      orderListEl.innerHTML = html || '<div class="empty-tip">还没有选择菜品</div>';
      modalTotalEl.textContent = "¥" + total;
      const diff = total - budget;
      let tip = `人数：${people}人 · 预算：¥${budget}`;
      if (diff > 0) tip += ` · 超出：¥${diff}`;
      else if (diff < 0) tip += ` · 剩余：¥${-diff}`;
      else tip += ` · 刚好`;
      tip += ` · 米饭：¥${people}`;
      modalBudgetTip.textContent = tip;
      copyTextEl.textContent = `【滋味轩点餐】${people}人\n----------------\n${lines.join("\n")}\n----------------\n菜品合计：¥${total}\n预算标准：¥${budget}（17×${people}）\n${diff>0?"超出：¥"+diff+"（现场补齐）":diff<0?"剩余：¥"+(-diff):"刚好预算"}\n米饭：¥${people}（另计）\n----------------\n请按此菜单准备，谢谢！`;
    }

    btnOrder.addEventListener("click", () => {
      saveHistory();
      renderOrderModal();
      modalMask.classList.add("show");
    });
    orderListEl.addEventListener("click", async e => {
      const btn = e.target.closest(".btn-remove-item");
      if (!btn) return;
      const id = +btn.dataset.removeId;
      if (collabActive) {
        const qty = cart[id] || 0;
        if (qty > 0) await changeCartQty(id, -qty);
      } else {
        delete cart[id];
        renderMenu(document.querySelector(".tab.active").dataset.cat);
        updateCartUI();
      }
      renderOrderModal();
    });
    $("modalClose").addEventListener("click", () => modalMask.classList.remove("show"));
    modalMask.addEventListener("click", e => { if (e.target === modalMask) modalMask.classList.remove("show"); });
    btnCopy.addEventListener("click", () => {
      const text = copyTextEl.textContent;
      navigator.clipboard.writeText(text).then(() => {
        btnCopy.textContent = "已复制 ✓";
        setTimeout(() => btnCopy.textContent = "一键复制点菜单", 1500);
      }).catch(() => {
        const ta = document.createElement("textarea");
        ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
        btnCopy.textContent = "已复制 ✓";
        setTimeout(() => btnCopy.textContent = "一键复制点菜单", 1500);
      });
    });

    // 协同 UI 事件
        $("btnCollabCreate").addEventListener("click", () => {
      if (!firebaseConfigured()) {
        alert("Firebase 未配置完整（缺少 apiKey / databaseURL / projectId）。");
        return;
      }
      // 清理可能冲掉正确 databaseURL 的本机旧配置
      try {
        const raw = localStorage.getItem("zixuan_firebase");
        if (raw) {
          const o = JSON.parse(raw);
          if (o && o.databaseURL && o.databaseURL.indexOf("firebaseio.com") !== -1 && !o.databaseURL.includes("asia-southeast1")) {
            delete o.databaseURL;
            localStorage.setItem("zixuan_firebase", JSON.stringify(o));
            location.reload();
            return;
          }
        }
      } catch (_) {}
      createRoom().catch(err => {
        console.error(err);
        const msg = (err && err.message) ? err.message : String(err);
        toolHint.textContent = "创建房间异常：" + msg;
        alert("创建房间异常：" + msg);
      });
    });
$("btnCollabCopy").addEventListener("click", async () => {
      if (!collabRoomId) return;
      const link = roomLink(collabRoomId);
      try {
        await navigator.clipboard.writeText(link);
        toolHint.textContent = "链接已复制";
      } catch (_) {
        prompt("复制此链接发给同伴：", link);
      }
    });
    $("btnCollabNick").addEventListener("click", async () => {
      const nick = await promptNickname(true);
      if (!nick) return;
      setNickname(nick);
      if (collabActive && fbDb) {
        await fbDb.ref(`rooms/${collabRoomId}/members/${getMemberId()}`).update({ name: nick, lastSeenAt: now() });
      }
      updateCollabUI();
      toolHint.textContent = `昵称已更新为 ${nick}`;
    });
    $("btnCollabEnd").addEventListener("click", () => endRoom());
    $("btnNickOk").addEventListener("click", () => {
      const v = ($("nickInput").value || "").trim().slice(0, 12);
      if (!v) {
        $("nickInput").focus();
        return;
      }
      if (nickResolver) nickResolver(v);
    });
    $("btnNickCancel").addEventListener("click", () => {
      if (nickResolver) nickResolver(getNickname() || "");
    });
    $("nickInput").addEventListener("keydown", e => {
      if (e.key === "Enter") $("btnNickOk").click();
    });

    renderMenu();
    updateCartUI();
    syncStickyOffsets();
    updateCollabUI();

    // URL 带 room 参数则自动进房
    (async () => {
      const rid = new URLSearchParams(location.search).get("room");
      if (rid && /^[a-z0-9]{6,16}$/i.test(rid)) {
        if (!firebaseConfigured()) {
          toolHint.textContent = "收到协同链接，但本页尚未配置 Firebase，无法进房";
          updateCollabUI();
          return;
        }
        await joinRoom(rid.toLowerCase());
      }
    })();
