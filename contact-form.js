(() => {
  const form = document.querySelector("#lead-form");
  const message = document.querySelector("#form-message");
  if (!form || !message) return;
  const apiBase = (window.CAIPU_API_BASE || "/api").replace(/\/$/, "");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type=submit]");
    const data = new FormData(form);
    const payload = {name:data.get("name"),phone:data.get("phone"),city:data.get("city"),storeType:data.get("storeType"),requirement:data.get("requirement"),services:data.getAll("services"),source:"智能客服需求表"};
    button.disabled = true;
    message.className = "form-message";
    message.textContent = "正在提交，请稍候…";
    try {
      const response = await fetch(`${apiBase}/leads`, {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "提交失败，请稍后重试。");
      form.reset();
      message.className = "form-message success";
      message.textContent = "需求已提交，稍后会有专人与您联系。";
    } catch (error) {
      message.textContent = error.message || "提交失败，请直接拨打18807917700。";
    } finally {
      button.disabled = false;
    }
  });
})();
