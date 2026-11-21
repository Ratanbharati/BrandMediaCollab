(async function () {
  const $ = (selector) => document.querySelector(selector);
  const form = $("#reset-form");
  const updateForm = $("#update-form");
  const notice = $("#notice");
  const show = (message, error = false) => {
    if (!notice) return;
    notice.textContent = message;
    notice.classList.add("show");
    notice.style.background = error ? "#fff0ed" : "#eff7e7";
    notice.style.color = error ? "#8b3526" : "#405d32";
  };
  const setBusy = (button, busy) => { button.disabled = busy; button.textContent = busy ? "Please wait…" : button.dataset.label; };

  try {
    const supabase = await window.bmcSupabaseReady;
    if (!supabase) throw new Error(window.bmcSupabaseError || "Could not connect to Supabase.");

    if (form) {
      const emailInput = $("#email");
      const emailFromUrl = new URLSearchParams(location.search).get("email");
      if (emailFromUrl) emailInput.value = emailFromUrl;
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = form.querySelector("button[type=submit]");
        if (!button.dataset.label) button.dataset.label = button.textContent;
        setBusy(button, true);
        try {
          const redirectTo = `${location.origin}/site/update-password.html`;
          const { error } = await supabase.auth.resetPasswordForEmail(emailInput.value.trim(), { redirectTo });
          if (error) throw error;
          show("If an account uses this email, a password reset link has been sent. Check your inbox and spam folder.");
        } catch (error) {
          show(error.message || "Could not send the reset email. Please try again later.", true);
        } finally { setBusy(button, false); }
      });
    }

    if (updateForm) {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) {
        show("This reset link is invalid or expired. Request a new one from the login screen.", true);
        updateForm.hidden = true;
        return;
      }
      updateForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const password = $("#new-password").value;
        const confirmation = $("#confirm-password").value;
        if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return show("Choose a password with at least 8 characters, including a letter and a number.", true);
        if (password !== confirmation) return show("The two passwords do not match.", true);
        const button = updateForm.querySelector("button[type=submit]");
        if (!button.dataset.label) button.dataset.label = button.textContent;
        setBusy(button, true);
        try {
          const { error } = await supabase.auth.updateUser({ password });
          if (error) throw error;
          const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
          updateForm.hidden = true;
          show(signOutError ? "Password updated. Close this page, then log in again with your new password." : "Password updated. You can now log in with your new password.");
        } catch (error) {
          show(error.message || "Could not update the password. Request a new reset link and try again.", true);
        } finally { setBusy(button, false); }
      });
    }
  } catch (error) {
    show(error.message || "The password reset flow could not start.", true);
  }
})();
