(() => {
  "use strict";
  const header = document.querySelector(".site-header");
  const nav = document.querySelector(".main-nav");
  const sections = [...document.querySelectorAll("main section[id]")];
  const navLinks = [...document.querySelectorAll(".main-nav a")];

  document.querySelectorAll("img").forEach((img) => {
    img.loading = "lazy";
    img.decoding = "async";
  });

  const progress = document.createElement("div");
  Object.assign(progress.style, {position:"fixed",top:"0",left:"0",zIndex:"99",width:"0",height:"3px",background:"#e65e35",transition:"width .1s linear"});
  document.body.appendChild(progress);

  const updateProgress = () => {
    const pageHeight = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = `${pageHeight ? (window.scrollY / pageHeight) * 100 : 0}%`;
    if (header) header.style.boxShadow = window.scrollY > 20 ? "0 8px 24px rgba(32,34,31,.07)" : "none";
  };
  window.addEventListener("scroll", updateProgress, {passive:true});
  updateProgress();

  const sectionObserver = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    navLinks.forEach((link) => {
      const current = link.getAttribute("href") === `#${visible.target.id}`;
      link.style.color = current ? "#e65e35" : "";
      link.setAttribute("aria-current", current ? "location" : "false");
    });
  }, {rootMargin:"-30% 0px -55% 0px",threshold:[0,.25,.6]});
  sections.forEach((section) => sectionObserver.observe(section));

  if (header && nav) {
    const menuButton = document.createElement("button");
    menuButton.type = "button";
    menuButton.className = "mobile-menu-button";
    menuButton.setAttribute("aria-label", "打开导航菜单");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.innerHTML = "<span></span><span></span><span></span>";
    Object.assign(menuButton.style, {display:"none",width:"42px",height:"38px",padding:"8px",marginLeft:"auto",border:"1px solid #20221f",background:"transparent",cursor:"pointer"});
    [...menuButton.children].forEach((line) => Object.assign(line.style, {display:"block",width:"20px",height:"1px",margin:"4px auto",background:"#20221f"}));
    header.insertBefore(menuButton, nav);

    const closeMenu = () => {
      nav.style.display = "none";
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.setAttribute("aria-label", "打开导航菜单");
    };
    const setMobileMode = () => {
      const mobile = window.innerWidth <= 900;
      menuButton.style.display = mobile ? "block" : "none";
      if (!mobile) { nav.style.display = ""; nav.removeAttribute("style"); }
      else if (menuButton.getAttribute("aria-expanded") !== "true") nav.style.display = "none";
    };
    menuButton.addEventListener("click", () => {
      if (menuButton.getAttribute("aria-expanded") === "true") return closeMenu();
      Object.assign(nav.style, {display:"flex",position:"absolute",top:"70px",right:"18px",left:"18px",flexDirection:"column",alignItems:"stretch",gap:"0",padding:"8px 18px",background:"#fffdf9",border:"1px solid #dedbd2",boxShadow:"0 14px 30px rgba(32,34,31,.1)"});
      navLinks.forEach((link) => Object.assign(link.style, {padding:"12px 0",borderBottom:"1px solid #dedbd2"}));
      menuButton.setAttribute("aria-expanded", "true");
      menuButton.setAttribute("aria-label", "关闭导航菜单");
    });
    navLinks.forEach((link) => link.addEventListener("click", closeMenu));
    window.addEventListener("resize", setMobileMode);
    setMobileMode();
  }

  const revealItems = [...document.querySelectorAll(".service-card,.capability-list article,.process-list li")];
  revealItems.forEach((item) => Object.assign(item.style, {opacity:"0",transform:"translateY(18px)",transition:"opacity .55s ease,transform .55s ease"}));
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry, index) => {
      if (!entry.isIntersecting) return;
      window.setTimeout(() => { entry.target.style.opacity = "1"; entry.target.style.transform = "translateY(0)"; }, index * 55);
      observer.unobserve(entry.target);
    });
  }, {threshold:.12});
  revealItems.forEach((item) => revealObserver.observe(item));

  document.querySelectorAll('a[href^="tel:"]').forEach((link) => link.addEventListener("click", () => {
    const original = link.textContent;
    link.textContent = "正在拨打咨询电话";
    window.setTimeout(() => { link.textContent = original; }, 1600);
  }));

  // Draggable customer-service launcher with an edge-aware information panel.
  const customerFloat = document.querySelector(".customer-float");
  const customerTrigger = document.querySelector(".customer-trigger");
  const customerPanel = document.querySelector(".customer-panel");
  const customerClose = document.querySelector(".customer-close");

  if (customerFloat && customerTrigger && customerPanel) {
    let dragging = false;
    let moved = false;
    let suppressClick = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    const positionPanel = () => {
      if (customerPanel.hidden) return;
      const triggerRect = customerTrigger.getBoundingClientRect();
      const panelRect = customerPanel.getBoundingClientRect();
      const left = clamp(triggerRect.right - panelRect.width, 16, window.innerWidth - panelRect.width - 16);
      const top = clamp(triggerRect.top - panelRect.height - 14, 16, window.innerHeight - panelRect.height - 16);
      customerPanel.style.left = `${left}px`;
      customerPanel.style.top = `${top}px`;
    };

    const closeCustomerPanel = () => {
      customerPanel.hidden = true;
      customerTrigger.setAttribute("aria-expanded", "false");
      if (typeof consultationActive !== "undefined") {
        consultationActive = false;
        requestMetrics?.("consultation_end");
      }
    };

    customerTrigger.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      dragging = true;
      moved = false;
      startX = event.clientX;
      startY = event.clientY;
      const rect = customerFloat.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      customerFloat.style.right = "auto";
      customerFloat.style.bottom = "auto";
      customerFloat.style.left = `${startLeft}px`;
      customerFloat.style.top = `${startTop}px`;
      customerFloat.classList.add("is-dragging");
      customerTrigger.setPointerCapture?.(event.pointerId);
    });

    customerTrigger.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      const rect = customerFloat.getBoundingClientRect();
      const left = clamp(startLeft + dx, 10, window.innerWidth - rect.width - 10);
      const top = clamp(startTop + dy, 10, window.innerHeight - rect.height - 10);
      customerFloat.style.left = `${left}px`;
      customerFloat.style.top = `${top}px`;
      if (moved) closeCustomerPanel();
    });

    const stopDragging = (event) => {
      if (!dragging) return;
      dragging = false;
      suppressClick = moved;
      customerFloat.classList.remove("is-dragging");
      customerTrigger.releasePointerCapture?.(event.pointerId);
      if (!moved) positionPanel();
    };

    customerTrigger.addEventListener("pointerup", stopDragging);
    customerTrigger.addEventListener("pointercancel", stopDragging);
    customerTrigger.addEventListener("click", () => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      customerPanel.hidden = !customerPanel.hidden;
      customerTrigger.setAttribute("aria-expanded", String(!customerPanel.hidden));
      positionPanel();
      if (!customerPanel.hidden) {
        consultationActive = true;
        requestMetrics("consultation_start");
        customerInput?.focus();
      } else {
        consultationActive = false;
        requestMetrics("consultation_end");
      }
    });
    customerClose?.addEventListener("click", closeCustomerPanel);
    document.addEventListener("click", (event) => {
      if (!customerFloat.contains(event.target) && !customerPanel.hidden) closeCustomerPanel();
    });
    window.addEventListener("resize", positionPanel);

    const customerForm = document.querySelector(".customer-form");
    const customerInput = document.querySelector("#customer-input");
    const customerMessages = document.querySelector(".customer-messages");
    const searchState = document.querySelector(".customer-search-state span");
    const customerStatus = document.querySelector(".customer-status span");
    const metricNodes = {
      visitors: document.querySelector('[data-metric="visitors"]'),
      consultations: document.querySelector('[data-metric="consultations"]'),
      totalVisits: document.querySelector('[data-metric="totalVisits"]')
    };
    const apiBase = (window.CAIPU_API_BASE || "/api").replace(/\/$/, "");
    const visitorId = sessionStorage.getItem("caipuVisitorId") || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
    sessionStorage.setItem("caipuVisitorId", visitorId);
    let consultationActive = false;
    let conversation = [];

    const setApiState = (state) => {
      if (!searchState) return;
      searchState.textContent = state === "search" ? "联网搜索已连接" : state === "service" ? "客服服务已连接" : "服务暂时离线";
      if (customerStatus) customerStatus.textContent = state === "offline" ? "暂时离线" : "在线";
    };
    const checkServiceHealth = async () => {
      try {
        const response = await fetch(`${apiBase.replace(/\/api$/, "")}/health`, {cache:"no-store"});
        if (!response.ok) throw new Error("health check failed");
        setApiState("service");
        return true;
      } catch (_) {
        setApiState("offline");
        return false;
      }
    };
    const shouldOfferLeadForm = (text) => /(联系|电话|人工|客服|咨询|报价|预算|定制|制作|设计|拍摄|灯箱|明档|菜单|摄影|短视频|动图|合作|门店升级|想做|需要做|帮我做)/i.test(text);

    const addMessage = (text, role = "assistant", citations = [], leadForm = false) => {
      const bubble = document.createElement("div");
      bubble.className = `customer-message customer-message-${role}`;
      bubble.textContent = text;
      if (citations.length) {
        const sources = document.createElement("div");
        sources.className = "customer-sources";
        citations.slice(0, 4).forEach((citation) => {
          const link = document.createElement("a");
          link.href = citation.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = citation.title || citation.url;
          sources.appendChild(link);
        });
        bubble.appendChild(sources);
      }
      if (leadForm && role === "assistant") {
        const leadLink = document.createElement("a");
        leadLink.className = "customer-lead-link";
        leadLink.href = window.CAIPU_LEAD_FORM_URL || "contact-form.html";
        leadLink.target = "_blank";
        leadLink.rel = "noopener noreferrer";
        leadLink.textContent = "填写需求信息，稍后专人联系 ↗";
        bubble.appendChild(leadLink);
      }
      customerMessages?.appendChild(bubble);
      if (customerMessages) customerMessages.scrollTop = customerMessages.scrollHeight;
      return bubble;
    };

    const requestMetrics = async (event = "heartbeat") => {
      try {
        const response = await fetch(`${apiBase}/metrics`, {method:"POST",headers:{"content-type":"application/json"},keepalive:event === "visit",body:JSON.stringify({event,visitorId,consulting:consultationActive})});
        if (!response.ok) return;
        const data = await response.json();
        setApiState("service");
        if (metricNodes.visitors) metricNodes.visitors.textContent = data.activeVisitors ?? "--";
        if (metricNodes.consultations) metricNodes.consultations.textContent = data.activeConsultations ?? "--";
        if (metricNodes.totalVisits) metricNodes.totalVisits.textContent = data.totalVisits ?? "--";
      } catch (_) {
        setApiState(false);
      }
    };

    customerForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const message = customerInput?.value.trim();
      if (!message) return;
      const submitButton = customerForm.querySelector("button");
      submitButton.disabled = true;
      customerInput.disabled = true;
      customerInput.value = "";
      conversation.push({role:"user",content:message});
      addMessage(message, "user");
      const loading = addMessage("正在联网检索并整理信息…", "loading");
      try {
        const response = await fetch(`${apiBase}/chat`, {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({messages:conversation.slice(-12)})});
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "客服服务暂时不可用");
        setApiState("search");
        loading.remove();
        conversation.push({role:"assistant",content:data.reply || "暂时没有检索到可用信息。"});
        addMessage(data.reply || "暂时没有检索到可用信息。", "assistant", data.citations || [], Boolean(data.leadForm) || shouldOfferLeadForm(message));
        requestMetrics("consultation_message");
      } catch (error) {
        setApiState(false);
        loading.textContent = error.message || "客服服务暂时不可用，请直接拨打商务电话。";
        loading.className = "customer-message customer-message-assistant";
      } finally {
        submitButton.disabled = false;
        customerInput.disabled = false;
        customerInput.focus();
      }
    });

    checkServiceHealth();
    requestMetrics("visit");
    window.setInterval(() => requestMetrics("heartbeat"), 20000);
    window.setInterval(checkServiceHealth, 30000);
    let leaveSent = false;
    const sendLeaveMetrics = () => {
      if (leaveSent) return;
      leaveSent = true;
      const payload = JSON.stringify({event:"leave",visitorId,consulting:consultationActive});
      const beaconSent = navigator.sendBeacon?.(`${apiBase}/metrics`, new Blob([payload], {type:"application/json"}));
      if (!beaconSent) fetch(`${apiBase}/metrics`, {method:"POST",headers:{"content-type":"application/json"},keepalive:true,body:payload}).catch(() => {});
    };
    window.addEventListener("pagehide", sendLeaveMetrics);
  }
})();
