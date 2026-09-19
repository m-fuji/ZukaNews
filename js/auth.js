/**
 * Zuka News - Passcode Authentication (0310)
 */

(function () {
  const CORRECT_PASSCODE = "0310";
  const STORAGE_KEY = "zuka_news_auth_token";
  
  let currentCode = "";

  const overlay = document.getElementById("authOverlay");
  const dots = document.querySelectorAll(".auth-dot");
  const errorMsg = document.getElementById("authError");
  const keypad = document.getElementById("authKeypad");
  const rememberCheckbox = document.getElementById("rememberMeCheckbox");
  const lockBtn = document.getElementById("lockAppBtn");

  // Check existing session
  function checkExistingAuth() {
    const isAuthed = localStorage.getItem(STORAGE_KEY) === "valid" || sessionStorage.getItem(STORAGE_KEY) === "valid";
    if (isAuthed && overlay) {
      overlay.classList.add("hidden");
    }
  }

  // Update dots display
  function updateDots() {
    dots.forEach((dot, index) => {
      if (index < currentCode.length) {
        dot.classList.add("filled");
      } else {
        dot.classList.remove("filled");
      }
    });
  }

  // Clear error
  function clearError() {
    if (errorMsg) {
      errorMsg.textContent = "";
      errorMsg.classList.remove("visible");
    }
  }

  // Handle wrong passcode
  function handleFailure() {
    if (errorMsg) {
      errorMsg.textContent = "パスコードが正しくありません";
      errorMsg.classList.add("visible");
    }
    
    // Trigger shake animation
    const card = document.querySelector(".auth-card");
    if (card) {
      card.classList.add("shake");
      setTimeout(() => card.classList.remove("shake"), 400);
    }

    currentCode = "";
    updateDots();
  }

  // Handle correct passcode
  function handleSuccess() {
    clearError();
    const shouldRemember = rememberCheckbox ? rememberCheckbox.checked : true;

    if (shouldRemember) {
      localStorage.setItem(STORAGE_KEY, "valid");
    } else {
      sessionStorage.setItem(STORAGE_KEY, "valid");
    }

    // Success fade
    if (overlay) {
      overlay.classList.add("hidden");
    }

    // Optional toast
    if (window.showToast) {
      window.showToast("ようこそ Zuka News へ 🌸");
    }
  }

  // Check code when 4 digits entered
  function verifyCode() {
    if (currentCode.length !== 4) return;

    if (currentCode === CORRECT_PASSCODE) {
      handleSuccess();
    } else {
      handleFailure();
    }
  }

  // Key input handler
  function handleKeyInput(val) {
    clearError();
    if (val === "clear") {
      currentCode = "";
      updateDots();
      return;
    }

    if (val === "delete") {
      if (currentCode.length > 0) {
        currentCode = currentCode.slice(0, -1);
        updateDots();
      }
      return;
    }

    if (currentCode.length < 4) {
      currentCode += val;
      updateDots();

      if (currentCode.length === 4) {
        setTimeout(verifyCode, 120);
      }
    }
  }

  // Lock App (Logout)
  function lockApp() {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    currentCode = "";
    updateDots();
    clearError();
    if (overlay) {
      overlay.classList.remove("hidden");
    }
    if (window.showToast) {
      window.showToast("画面をロックしました");
    }
  }

  // Attach keypad event listeners
  if (keypad) {
    keypad.addEventListener("click", (e) => {
      const keyBtn = e.target.closest(".auth-key");
      if (!keyBtn) return;
      const keyVal = keyBtn.getAttribute("data-key");
      if (keyVal !== null) {
        handleKeyInput(keyVal);
      }
    });
  }

  // Physical keyboard support
  window.addEventListener("keydown", (e) => {
    if (overlay && overlay.classList.contains("hidden")) return;

    if (e.key >= "0" && e.key <= "9") {
      handleKeyInput(e.key);
    } else if (e.key === "Backspace") {
      handleKeyInput("delete");
    } else if (e.key === "Escape") {
      handleKeyInput("clear");
    }
  });

  // Lock button in header
  if (lockBtn) {
    lockBtn.addEventListener("click", lockApp);
  }

  // Expose lockApp globally
  window.lockZukaNews = lockApp;

  // Initialize
  checkExistingAuth();
})();
