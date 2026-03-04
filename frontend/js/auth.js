/* ─────────────────────────────────────────────────────────
   DemoBank — Login Page
   ───────────────────────────────────────────────────────── */

// Redirect to dashboard if already logged in
if (localStorage.getItem('db_token')) {
  window.location.replace('/dashboard.html');
}

const form      = document.getElementById('loginForm');
const alertBox  = document.getElementById('alert');
const submitBtn = document.getElementById('submitBtn');

function showAlert(msg) {
  alertBox.textContent = msg;
  alertBox.className = 'alert alert-error';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  if (!username || !password) {
    showAlert('Введите логин и пароль');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> Вход…';
  alertBox.className = 'alert alert-error hidden';

  let ksid = 'empty';
  try {
    if (typeof window.kfp?.login_start === 'function') {
      ksid = await window.kfp.login_start();
    }
  } catch { /* KFP недоступен, продолжаем без ksid */ }

  try {
    const data = await API.login(username, password, ksid);
    localStorage.setItem('db_token', data.token);
    localStorage.setItem('db_user', JSON.stringify(data.user));
    window.location.replace('/dashboard.html');
  } catch (err) {
    showAlert(err.message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Войти';
  }
});
