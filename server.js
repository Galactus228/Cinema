const bcrypt = require('bcryptjs'); // Для хэширования паролей
const fastifyJwt = require('@fastify/jwt'); // Для токенов авторизации
const path = require('path');
const fs = require('fs'); // Для работы с файловой системой
const { pipeline } = require('stream'); // Для эффективной обработки потоков
const util = require('util'); // Для promisy-фикации pipeline

const pump = util.promisify(pipeline);
const mysql = require('mysql2/promise');
const fastify = require('fastify')({ logger: true });

// Инициализация JWT
fastify.register(fastifyJwt, {
    secret: 'super_secret_diploma_key_12345' // Надежный секретный ключ
});

// Регистрация плагина для загрузки файлов (multipart/form-data)
fastify.register(require('@fastify/multipart'), {
    limits: {
        fileSize: 5 * 1024 * 1024, // Максимальный размер файла 5MB
    }
});

fastify.decorate("authenticate", async function(request, reply) {
    try {
        await request.jwtVerify();
    } catch (err) {
        reply.send(err);
    }
});

// 1. Гарантируем, что папка uploads существует (чтобы при загрузке не было ошибки)
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, 'public'),
    prefix: '/'
});

// Настройки подключения к БД (берем из переменных окружения Docker)
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root_password',
    database: process.env.DB_NAME || 'cinema_db',
    dateStrings: true
};

let pool;

// === ФУНКЦИЯ АВТООБНОВЛЕНИЯ ДАТ СЕАНСОВ ===
// Она переносит все вчерашние (и более старые) сеансы на сегодня, сохраняя время
async function refreshSessionDates() {
    try {
        await pool.query(`
            UPDATE sessions 
            SET start_time = CONCAT(DATE(DATE_ADD(NOW(), INTERVAL 3 HOUR)), ' ', TIME(start_time))
            WHERE DATE(start_time) < DATE(DATE_ADD(NOW(), INTERVAL 3 HOUR))
        `);
    } catch (err) {
        console.error("Ошибка при автообновлении дат:", err);
    }
}

// API для получения афиши и сеансов
fastify.get('/api/now-playing', async (request, reply) => {
    try {
        await refreshSessionDates();
        const [rows] = await pool.query(`
            SELECT 
                m.id as movie_id, m.title, m.poster_url, m.genre, m.duration,
                s.id as session_id, s.start_time, s.price, h.name as hall_name
            FROM movies m
            JOIN sessions s ON m.id = s.movie_id
            JOIN halls h ON s.hall_id = h.id
            ORDER BY s.start_time ASC
        `);
        
        // Группируем сеансы по фильмам для удобства фронтенда
        const schedule = rows.reduce((acc, row) => {
            if (!acc[row.movie_id]) {
                acc[row.movie_id] = {
                    id: row.movie_id,
                    title: row.title,
                    poster: row.poster_url,
                    genre: row.genre,
                    duration: row.duration,
                    sessions: []
                };
            }
            acc[row.movie_id].sessions.push({
                id: row.session_id,
                time: row.start_time,
                price: row.price,
                hall: row.hall_name
            });
            return acc;
        }, {});

        return Object.values(schedule);
    } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: 'Ошибка базы данных' });
    }
});
// === НОВЫЙ API-МАРШРУТ ДЛЯ "СКОРО В КИНО" ===
fastify.get('/api/coming-soon-movies', async (request, reply) => {
    try {
        // Выбираем фильмы, ID которых НЕТ в таблице сеансов
        const [rows] = await pool.query(`
            SELECT id, title, poster_url, genre, duration
            FROM movies
            WHERE id NOT IN (SELECT DISTINCT movie_id FROM sessions)
            ORDER BY id DESC
        `);
        return rows;
    } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: 'Ошибка БД' });
    }
});
// === НОВЫЙ API-МАРШРУТ ДЛЯ РАСПИСАНИЯ ===
fastify.get('/api/schedule', async (request, reply) => {
    try {
        await refreshSessionDates();
        const [rows] = await pool.query(`
            SELECT 
                s.id as session_id,
                m.id as movie_id,
                s.start_time,
                s.price,
                h.name as hall_name,
                m.title,
                m.poster_url,
                m.genre,
                d.age_rating
            FROM sessions s
            JOIN movies m ON s.movie_id = m.id
            JOIN halls h ON s.hall_id = h.id
            LEFT JOIN movie_details d ON m.id = d.movie_id -- Используем LEFT JOIN, чтобы сеанс показался, даже если деталей фильма пока нет в базе
            WHERE s.start_time > DATE_ADD(NOW(), INTERVAL 3 HOUR)
            ORDER BY s.start_time ASC -- Сортировка по времени начала (от ближайших)
        `);
        
        return rows;
    } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: 'Ошибка при загрузке расписания' });
    }
});
// Получение списка новостей
fastify.get('/api/news', async (request, reply) => {
    try {
        const [rows] = await pool.query('SELECT * FROM news ORDER BY published_at DESC');
        return rows;
    } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: 'Ошибка при загрузке новостей' });
    }
});
// API: РЕГИСТРАЦИЯ ПОЛЬЗОВАТЕЛЯ
fastify.post('/api/register', async (request, reply) => {
    const { name, email, password } = request.body;

    try {
        // 1. Проверяем, не занят ли email
        const [existingUsers] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existingUsers.length > 0) {
            return reply.status(400).send({ error: 'Пользователь с таким email уже существует' });
        }

        // 2. Хэшируем (шифруем) пароль
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // 3. Сохраняем в базу
        const [result] = await pool.query(
            'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
            [name, email, hashedPassword]
        );

        // 4. Создаем JWT токен, чтобы сразу "залогинить" пользователя
        const token = fastify.jwt.sign({ userId: result.insertId, name: name, email: email, avatar_url: null });

        return reply.status(201).send({ message: 'Регистрация успешна', token: token, name: name, avatar_url: null });

    } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: 'Ошибка сервера при регистрации' });
    }
});
// API: ВХОД ПОЛЬЗОВАТЕЛЯ
fastify.post('/api/login', async (request, reply) => {
    const { email, password } = request.body;

    try {
        // 1. Ищем пользователя по email
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        const user = users[0];

        if (!user) {
            return reply.status(401).send({ error: 'Неверный email или пароль' });
        }

        // 2. Сравниваем введенный пароль с хэшем в базе
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            return reply.status(401).send({ error: 'Неверный email или пароль' });
        }

        // 3. Если всё верно — выдаем токен
        const token = fastify.jwt.sign({ id: user.id, name: user.name, email: user.email, avatar_url: user.avatar_url });

        return reply.send({ message: 'Вход выполнен', token: token, name: user.name, avatar_url: user.avatar_url });

    } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: 'Ошибка сервера при авторизации' });
    }
});
// API: Сохранение сообщения из формы контактов
fastify.post('/api/contacts', async (request, reply) => {
    const { name, email, message } = request.body;

    // Простая валидация
    if (!name || !email || !message) {
        return reply.status(400).send({ error: 'Все поля обязательны для заполнения' });
    }

    try {
        const query = 'INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)';
        await pool.query(query, [name, email, message]);

        return reply.send({ message: 'Сообщение успешно сохранено! Мы свяжемся с вами в ближайшее время.' });
    } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: 'Ошибка сервера при сохранении сообщения' });
    }
});
// API: ПОЛУЧЕНИЕ ДАННЫХ ПРОФИЛЯ (ЗАЩИЩЕННЫЙ)
fastify.get('/api/profile', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
        const userId = request.user.id;

        // 1. Получаем данные пользователя
        const [userRows] = await pool.query('SELECT id, name, email, avatar_url FROM users WHERE id = ?', [userId]);
        
        if (userRows.length === 0) {
            return reply.status(404).send({ message: 'Пользователь не найден' });
        }

        const user = userRows[0];

        // 2. Получаем историю билетов (чтобы не падала ошибка на data.bookings.length)
        const [tickets] = await pool.query(`
            SELECT t.id, sess.start_time, m.title, s.row_num, s.seat_num
            FROM tickets t
            JOIN sessions sess ON t.session_id = sess.id
            JOIN movies m ON sess.movie_id = m.id
            JOIN seats s ON t.seat_id = s.id
            WHERE t.user_id = ?
        `, [userId]);

        // Отправляем всё вместе
        return {
            name: user.name,
            email: user.email,
            avatar_url: user.avatar_url,
            bookings: tickets // Обязательно массив, даже если пустой
        };
    } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ message: 'Ошибка сервера при получении профиля' });
    }
});
// API: Загрузка и обновление аватарки пользователя (защищенный)
fastify.post('/api/profile/avatar', {
    preHandler: [fastify.authenticate], // Защищаем маршрут
    // Удаляем секцию schema, так как она конфликтует с multipart/form-data
    // schema: {
    //     body: {
    //         type: 'object',
    //         properties: {
    //             avatar: { type: 'string', format: 'binary' }
    //         },
    //         required: ['avatar']
    //     }
    // }
}, async (request, reply) => {
    const userId = request.user.id;
    // Проверяем, что запрос действительно multipart
    if (!request.isMultipart()) {
        return reply.status(400).send({ error: 'Запрос должен быть multipart/form-data' });
    }
    try {
        const data = await request.file(); // Получаем данные файла
        if (!data || !data.file) {
            return reply.status(400).send({ error: 'Файл не загружен' });
        }
        // Проверяем тип файла
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedMimeTypes.includes(data.mimetype)) {
            return reply.status(400).send({ error: 'Разрешены только изображения (JPEG, PNG, WebP)' });
        }
        // Генерируем уникальное имя файла
        const filename = `${userId}-${Date.now()}${path.extname(data.filename)}`;
        const filePath = path.join(uploadsDir, filename);
        const publicUrl = `/uploads/${filename}`; // URL, который будет храниться в БД
        // Сохраняем файл на диск
        await pump(data.file, fs.createWriteStream(filePath));
        // Обновляем avatar_url в базе данных
        await pool.query('UPDATE users SET avatar_url = ? WHERE id = ?', [publicUrl, userId]);
        // Обновляем JWT токен с новой аватаркой
        const newToken = fastify.jwt.sign({ ...request.user, avatar_url: publicUrl });
        return reply.send({
            message: 'Аватар обновлен',
            avatar_url: publicUrl,
            token: newToken // Отправляем новый токен с обновленной аватаркой
        });
    } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: `Ошибка при загрузке аватарки: ${err.message}` });
    }
});
// API: Получить все места и их статус (занято/свободно)
fastify.get('/api/sessions/:id/seats', async (request, reply) => {
    const { id } = request.params;
    try {
        const [rows] = await pool.query(`
            SELECT 
                s.id, 
                s.row_num, 
                s.seat_num, 
                (SELECT COUNT(*) FROM tickets t WHERE t.seat_id = s.id AND t.session_id = ?) as is_taken
            FROM seats s
            JOIN sessions sess ON s.hall_id = sess.hall_id
            WHERE sess.id = ?
            ORDER BY s.row_num, s.seat_num
        `, [id, id]);
        return rows;
    } catch (err) {
        return reply.status(500).send({ error: 'Ошибка базы данных' });
    }
});

// API: Покупка билета (защищен токеном)
fastify.post('/api/book-ticket', { preValidation: [fastify.authenticate] }, async (request, reply) => {
    // Теперь здесь точно будет id, так как мы поправили login
    const user_id = request.user.id; 
    const { session_id, seat_id } = request.body;

    if (!user_id) {
        return reply.status(401).send({ error: 'Пользователь не авторизован корректно' });
    }

    try {
        // SQL с добавлением 3 часов (МСК)
        await pool.query(
            'INSERT INTO tickets (session_id, seat_id, user_id, created_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 3 HOUR))', 
            [session_id, seat_id, user_id]
        );
        return { success: true };
    } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: 'Ошибка записи бронирования' });
    }
});
// API для получения данных одного фильма по ID
fastify.get('/api/movie/:id', async (request, reply) => {
    const { id } = request.params;
    try {
        const [rows] = await pool.query(`
            SELECT m.*, d.age_rating, d.premiere_date, d.country, d.synopsis, d.actors, d.director
            FROM movies m
            LEFT JOIN movie_details d ON m.id = d.movie_id
            WHERE m.id = ?
        `, [id]);

        if (rows.length === 0) {
            return reply.status(404).send({ error: 'Фильм не найден' });
        }

        return rows[0];
    } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: 'Ошибка сервера' });
    }
});
fastify.get('/', (req, reply) => reply.sendFile('index.html'));
fastify.get('/about', (req, reply) => reply.sendFile('about.html'));
fastify.get('/news', (req, reply) => reply.sendFile('news.html'));
fastify.get('/coming-soon', (req, reply) => reply.sendFile('coming-soon.html'));
fastify.get('/promotions', (req, reply) => reply.sendFile('promotions.html'));
fastify.get('/schedule', (req, reply) => reply.sendFile('schedule.html'));
fastify.get('/booking', (req, reply) => {
    reply.sendFile('booking.html');
});
fastify.get('/faq', async (request, reply) => {
    return reply.sendFile('faq.html'); // Убедись, что путь к файлу верный
});
fastify.get('/privacy', async (request, reply) => {
    return reply.sendFile('privacy.html');
});
fastify.get('/contacts', async (request, reply) => {
    return reply.sendFile('contacts.html');
});
// Роут для страницы профиля
fastify.get('/profile', (req, reply) => {
    reply.sendFile('profile.html');
});
// Роут для самой страницы фильма
fastify.get('/movie', (req, reply) => {
    reply.sendFile('movie.html');
});
const start = async () => {
    try {
        pool = await mysql.createPool(dbConfig);
        await fastify.listen({ port: 3000, host: '0.0.0.0' });
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};
start();

