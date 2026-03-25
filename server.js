const path = require('path');
const mysql = require('mysql2/promise');
const fastify = require('fastify')({ logger: true });

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


fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, 'public'),
    prefix: '/',
});

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

