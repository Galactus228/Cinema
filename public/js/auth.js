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
            saveAuthData(data.token, data.name);
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

            saveAuthData(data.token, data.name);
            updateUIForLoggedInUser(data.name);
            modal.style.display = 'none';

        } catch (err) {
            loginErrorMsg.textContent = err.message;
            loginErrorMsg.style.display = 'block';
        }
    });

    // --- Функция сохранения данных в браузере ---
    function saveAuthData(token, name) {
        localStorage.setItem('jwtToken', token); // Храним токен
        localStorage.setItem('userName', name);   // Храним имя
    }

   // --- Функция обновления интерфейса для залогиненного юзера ---
    function updateUIForLoggedInUser(name) {
    loginBtns.forEach(btn => {
        const parent = btn.parentElement; // Находим .header-right
        
        // Создаем HTML-код для аватарки и кнопки "Выйти"
        parent.innerHTML = `
            <a href="/profile" class="profile-avatar" title="Перейти в профиль">
                <img src="/images/default-avatar.png" alt="Аватар">
                <span>${name}</span>
            </a>
            <a href="#" id="logout-link" class="logout-link">Выйти</a>
        `;

        // Добавляем обработчик для новой кнопки "Выйти"
        document.getElementById('logout-link').addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('jwtToken');
            localStorage.removeItem('userName');
            window.location.reload(); // Перезагружаем страницу, чтобы вернуть исходный UI
        });
    });
    }


    // --- Проверка при загрузке страницы ---
    // Если в браузере уже есть токен, сразу меняем UI
    const storedToken = localStorage.getItem('jwtToken');
    const storedName = localStorage.getItem('userName');
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