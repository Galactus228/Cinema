document.addEventListener('DOMContentLoaded', () => {
    // --- Получаем все нужные элементы со страницы ---
    const modal = document.getElementById('auth-modal');
    const closeBtn = document.querySelector('.close-modal');
    const loginBtns = document.querySelectorAll('.btn-login');

    const loginContainer = document.getElementById('login-form-container');
    const registerContainer = document.getElementById('register-form-container');

    const goToRegister = document.getElementById('go-to-register');
    const goToLogin = document.getElementById('go-to-login');

    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    const loginErrorMsg = document.getElementById('login-error');
    const regErrorMsg = document.getElementById('reg-error');

    // Находим элементы ПЕРЕД тем как вешать события
    const logoutBtn = document.getElementById('logout-link');
    const profileBtn = document.getElementById('go-to-profile');

    if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.clear();
        window.location.href = '/';
    });
    }

    if (profileBtn) {
    profileBtn.addEventListener('click', () => {
        window.location.href = '/profile';
    });
    }
    // --- Управление UI (открытие, закрытие, переключение) ---
    loginBtns.forEach(btn => {
        btn.addEventListener('click', () => modal.style.display = 'flex');
    });
    closeBtn.addEventListener('click', () => modal.style.display = 'none');
    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });
    goToRegister.addEventListener('click', (e) => {
        e.preventDefault();
        loginContainer.style.display = 'none';
        registerContainer.style.display = 'block';
    });
    goToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        registerContainer.style.display = 'none';
        loginContainer.style.display = 'block';
    });

    // --- РЕГИСТРАЦИЯ: Обработка отправки формы ---
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Предотвращаем перезагрузку страницы

        const name = document.getElementById('reg-name').value;
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password }),
            });
            const data = await response.json();

            if (!response.ok) { // Если сервер ответил ошибкой (400, 500)
                throw new Error(data.error || 'Ошибка регистрации');
            }

            // Если всё успешно:
            saveAuthData(data.token, data.name, data.avatar_url);
            updateUIForLoggedInUser(data.name);
            modal.style.display = 'none'; // Закрываем окно

        } catch (err) {
            regErrorMsg.textContent = err.message;
            regErrorMsg.style.display = 'block';
        }
    });

    // --- ВХОД: Обработка отправки формы ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Ошибка входа');
            }

            saveAuthData(data.token, data.name, data.avatar_url);
            updateUIForLoggedInUser(data.name);
            modal.style.display = 'none';

        } catch (err) {
            loginErrorMsg.textContent = err.message;
            loginErrorMsg.style.display = 'block';
        }
    });

    // --- Функция сохранения данных в браузере ---
    function saveAuthData(token, name, avatarUrl = null) { // Добавляем avatarUrl
    localStorage.setItem('jwtToken', token);
    localStorage.setItem('userName', name);
    localStorage.setItem('userAvatarUrl', avatarUrl); // <--- Сохраняем URL аватарки
    }


    // --- Функция обновления интерфейса для залогиненного юзера ---
    function updateUIForLoggedInUser(userName) {
    const headerRight = document.querySelector('.header-right');
    if (!headerRight) return;

    const avatarUrl = localStorage.getItem('userAvatarUrl') || '/default-avatar.png';
    const loginBtn = headerRight.querySelector('.btn-login');
    if (loginBtn) loginBtn.remove();

    if (!headerRight.querySelector('.user-profile-block')) {
        const userBlock = document.createElement('div');
        userBlock.className = 'user-profile-block';
        userBlock.style.display = 'flex';
        userBlock.style.alignItems = 'center';
        userBlock.style.gap = '15px';

        userBlock.innerHTML = `
            <div class="profile-avatar" id="go-to-profile" style="cursor:pointer;">
                <img src="${avatarUrl}" alt="Avatar" style="width:40px; height:40px; border-radius:50%; border:2px solid var(--primary-color); object-fit: cover;">
            </div>
            <a href="#" class="logout-link" id="logout-link">Выйти</a>
        `;
        headerRight.appendChild(userBlock);

        // ИСПРАВЛЕНИЕ: Разделяем обработчики
        
        // Клик по аватару — переход в профиль
        document.getElementById('go-to-profile').onclick = () => {
            window.location.href = '/profile';
        };

        // Клик по "Выйти" — только тогда разлогин
        document.getElementById('logout-link').onclick = (e) => {
            e.preventDefault();
            localStorage.clear(); // Очищаем данные
            window.location.href = '/'; // На главную
        };
    }
}



    // --- Проверка при загрузке страницы ---
    // Если в браузере уже есть токен, сразу меняем UI
    // ...
    const storedToken = localStorage.getItem('jwtToken');
    const storedName = localStorage.getItem('userName');
    const storedAvatarUrl = localStorage.getItem('userAvatarUrl'); // <--- Получаем URL

    if (storedToken && storedName) {
    updateUIForLoggedInUser(storedName);
    }

    });

// Глобальная функция для глазка пароля (оставляем без изменений)
window.togglePasswordVisibility = function(inputId) {
    const passwordInput = document.getElementById(inputId);
    const eyeIcon = passwordInput.nextElementSibling; // Находим span, который идет после input

    if (passwordInput.type === "password") {
        passwordInput.type = "text";
        eyeIcon.style.filter = "grayscale(0) opacity(1)";
    } else {
        passwordInput.type = "password";
        eyeIcon.style.filter = "grayscale(1) opacity(0.5)";
    }
};
