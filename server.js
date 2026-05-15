const bcrypt = require('bcryptjs'); 
const fastifyJwt = require('@fastify/jwt'); 
const path = require('path');
const fs = require('fs'); 
const { pipeline } = require('stream'); 
const util = require('util'); 
const { sendTicketEmail } = require('./public/js/emailservice');
const pump = util.promisify(pipeline);
const mysql = require('mysql2/promise');
const fastify = require('fastify')({ logger: true });

fastify.register(fastifyJwt, {
    secret: 'super_secret_diploma_key_12345' 
});

fastify.register(require('@fastify/multipart'), {
    limits: {
        fileSize: 5 * 1024 * 1024,
    }
});

fastify.decorate("authenticate", async function(request, reply) {
    try {
        await request.jwtVerify();
    } catch (err) {
        reply.send(err);
    }
});

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, 'public'),
    prefix: '/'
});

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root_password',
    database: process.env.DB_NAME || 'cinema_db',
    dateStrings: true
};

let pool;


async function generateDailySessions() {
    try {
        const [todaySessions] = await pool.query(`
            SELECT id FROM sessions 
            WHERE DATE(start_time) = DATE(DATE_ADD(NOW(), INTERVAL 3 HOUR))
            LIMIT 1
        `);

        if (todaySessions.length === 0) {
            console.log("[System] Генерация бесконфликтного расписания...");

            const [movies] = await pool.query("SELECT id FROM movies WHERE status = 'now_playing'");
            const [halls] = await pool.query('SELECT id FROM halls');
            
            const timeSlots = ['10:00:00', '14:00:00', '18:00:00', '21:00:00'];
            const price = 350.00;

            if (movies.length === 0 || halls.length === 0) return;

            let allAvailableSlots = [];
            for (const hall of halls) {
                for (const time of timeSlots) {
                    allAvailableSlots.push({ hallId: hall.id, time: time });
                }
            }

            for (let i = 0; i < allAvailableSlots.length; i++) {
                const slot = allAvailableSlots[i];
                
                const movie = movies[i % movies.length];

                await pool.query(`
                    INSERT INTO sessions (movie_id, hall_id, start_time, price)
                    VALUES (?, ?, CONCAT(DATE(DATE_ADD(NOW(), INTERVAL 3 HOUR)), ' ', ?), ?)
                `, [movie.id, slot.hallId, slot.time, price]);
            }

            console.log(`[System] Успешно распределено ${allAvailableSlots.length} сеансов.`);
        }
    } catch (err) {
        console.error("Ошибка при генерации сеансов:", err);
    }
}
async function generateWeeklySessions(pool) {
    try {
        const [movies] = await pool.query("SELECT id FROM movies WHERE status = 'now_playing'");
        const [halls] = await pool.query('SELECT id FROM halls');

        if (movies.length === 0 || halls.length === 0) return;

        const timeSlots = ['10:00:00', '14:00:00', '18:00:00', '21:00:00'];
        const price = 350.00;

        for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
            const [dateRow] = await pool.query("SELECT DATE_ADD(CURDATE(), INTERVAL ? DAY) as targetDate", [dayOffset]);
            const targetDate = dateRow[0].targetDate;
            const [existing] = await pool.query("SELECT id FROM sessions WHERE DATE(start_time) = ? LIMIT 1", [targetDate]);

            if (existing.length === 0) {
                console.log(`[Generator] Создаем расписание на ${targetDate}`);
                for (let i = 0; i < halls.length; i++) {
                    for (let j = 0; j < timeSlots.length; j++) {
                        const movie = movies[(i + j + dayOffset) % movies.length];
                        const fullStartTime = `${targetDate} ${timeSlots[j]}`;

                        await pool.query(
                            "INSERT INTO sessions (movie_id, hall_id, start_time, price) VALUES (?, ?, ?, ?)",
                            [movie.id, halls[i].id, fullStartTime, price]
                        );
                    }
                }
            }
        }
    } catch (err) {
        console.error("Ошибка в генераторе:", err.message);
        throw err; 
    }
}
fastify.get('/api/now-playing', async (request, reply) => {
    try {
        const targetDate = request.query.date || new Date().toISOString().split('T')[0];
        const [rows] = await pool.query(`
            SELECT 
                m.id as movie_id, m.title, m.poster_url, m.genre, m.duration,
                s.id as session_id, s.start_time, s.price
            FROM movies m
            LEFT JOIN sessions s ON m.id = s.movie_id AND DATE(s.start_time) = ?
            WHERE m.status = 'now_playing'
            ORDER BY m.id, s.start_time ASC
        `, [targetDate]);
        const moviesMap = {};
        
        rows.forEach(row => {
            if (!moviesMap[row.movie_id]) {
                moviesMap[row.movie_id] = {
                    id: row.movie_id,
                    title: row.title,
                    poster: row.poster_url,
                    genre: row.genre,
                    duration: row.duration,
                    sessions: []
                };
            }
            
            if (row.session_id) {
                moviesMap[row.movie_id].sessions.push({
                    id: row.session_id,
                    time: row.start_time,
                    price: row.price
                });
            }
        });

        return Object.values(moviesMap);
    } catch (err) {
        console.error(err);
        return reply.status(500).send([]);
    }
});
fastify.get('/api/coming-soon-movies', async (request, reply) => {
    try {
        const [rows] = await pool.query(`
            SELECT id, title, poster_url, genre, duration
            FROM movies
            WHERE status = 'coming_soon'
            ORDER BY id DESC
        `);
        return rows;
    } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: 'Ошибка БД' });
    }
});
fastify.get('/api/schedule', async (request, reply) => {
    try {
        await generateWeeklySessions(pool);

        const targetDate = request.query.date || new Date().toISOString().split('T')[0];

        const [rows] = await pool.query(`
            SELECT 
                s.id as session_id, 
                s.start_time, 
                s.price,
                m.id as movie_id, 
                m.title, 
                m.genre, 
                md.age_rating,
                h.name as hall_name
            FROM sessions s
            JOIN movies m ON s.movie_id = m.id
            JOIN halls h ON s.hall_id = h.id
            LEFT JOIN movie_details md ON m.id = md.movie_id
            WHERE DATE(s.start_time) = ?
              -- НОВОЕ УСЛОВИЕ: время начала должно быть больше, чем (сейчас - 15 минут)
              AND s.start_time > DATE_SUB(DATE_ADD(NOW(), INTERVAL 3 HOUR), INTERVAL 15 MINUTE)
            ORDER BY s.start_time ASC
        `, [targetDate]);

        return rows;
    } catch (err) {
        console.error("Ошибка API /api/schedule:", err.message);
        return []; 
    }
});
fastify.get('/api/news', async (request, reply) => {
    try {
        const [rows] = await pool.query('SELECT * FROM news ORDER BY published_at DESC');
        return rows;
    } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: 'Ошибка при загрузке новостей' });
    }
});
fastify.post('/api/purchase-tickets', async (request, reply) => {
    const { sessionId, seatIds, userId, cardNumber } = request.body;

    try {
        const [existing] = await pool.query(
            "SELECT id FROM tickets WHERE session_id = ? AND seat_id IN (?)",
            [sessionId, seatIds]
        );

        if (existing.length > 0) {
            return reply.status(400).send({ success: false, message: "Некоторые места уже заняты" });
        }

        // Имитируем задержку банковской операции
        await new Promise(resolve => setTimeout(resolve, 1500));

        for (const seatId of seatIds) {
            await pool.query(
                "INSERT INTO tickets (session_id, seat_id, user_id, status) VALUES (?, ?, ?, 'sold')",
                [sessionId, seatId, userId]
            );
        }

        return { success: true, message: "Билеты успешно куплены!" };
    } catch (err) {
        console.error(err);
        return reply.status(500).send({ success: false, message: "Ошибка при проведении платежа" });
    }
});

fastify.post('/api/register', async (request, reply) => {
    const { name, email, password } = request.body;

    try {
        const [existingUsers] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existingUsers.length > 0) {
            return reply.status(400).send({ error: 'Пользователь с таким email уже существует' });
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const [result] = await pool.query(
            'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
            [name, email, hashedPassword]
        );

        const token = fastify.jwt.sign({ id: result.insertId, name: name, email: email, avatar_url: null });

        return reply.status(201).send({ message: 'Регистрация успешна', token: token, name: name, avatar_url: null });

    } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: 'Ошибка сервера при регистрации' });
    }
});
fastify.post('/api/login', async (request, reply) => {
    const { email, password } = request.body;

    try {
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        const user = users[0];

        if (!user) {
            return reply.status(401).send({ error: 'Неверный email или пароль' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            return reply.status(401).send({ error: 'Неверный email или пароль' });
        }

        const token = fastify.jwt.sign({ id: user.id, name: user.name, email: user.email, avatar_url: user.avatar_url });

        return reply.send({ message: 'Вход выполнен', token: token, name: user.name, avatar_url: user.avatar_url });

    } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: 'Ошибка сервера при авторизации' });
    }
});
fastify.get('/api/promotions', async (request, reply) => {
    try {
        // Подключаемся к БД и берем только активные акции
        // Если используешь mysql2 с промисами:
        const [rows] = await pool.query("SELECT * FROM promotions WHERE is_active = 1");
        return rows; 
    } catch (err) {
        fastify.log.error(err);
        reply.status(500).send({ error: "Ошибка при получении данных из БД" });
    }
});
fastify.post('/api/contacts', async (request, reply) => {
    const { name, email, message } = request.body;

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
fastify.get('/api/profile', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
        const userId = request.user.id;

        const [userRows] = await pool.query('SELECT id, name, email, avatar_url FROM users WHERE id = ?', [userId]);
        
        if (userRows.length === 0) {
            return reply.status(404).send({ message: 'Пользователь не найден' });
        }

        const user = userRows[0];

        const [tickets] = await pool.query(`
            SELECT t.id, sess.start_time, sess.price, m.title, s.row_num, s.seat_num
            FROM tickets t
            JOIN sessions sess ON t.session_id = sess.id
            JOIN movies m ON sess.movie_id = m.id
            JOIN seats s ON t.seat_id = s.id
            WHERE t.user_id = ?
        `, [userId]);

        const [transactions] = await pool.query(`
            SELECT 
                tr.id, 
                tr.amount, 
                tr.card_holder,
                tr.card_last_four, 
                tr.status, 
                tr.created_at,
                m.title AS movie_title
            FROM transactions tr
            JOIN sessions sess ON tr.session_id = sess.id
            JOIN movies m ON sess.movie_id = m.id
            WHERE tr.user_id = ? AND tr.status = 'success'
            ORDER BY tr.created_at DESC
        `, [userId]);
        return {
            name: user.name,
            email: user.email,
            avatar_url: user.avatar_url,
            bookings: tickets, 
            payments: transactions 
        };
    } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ message: 'Ошибка сервера при получении профиля' });
    }
});
fastify.post('/api/profile/avatar', {
    preHandler: [fastify.authenticate],
}, async (request, reply) => {
    const userId = request.user.id;
    if (!request.isMultipart()) {
        return reply.status(400).send({ error: 'Запрос должен быть multipart/form-data' });
    }
    try {
        const data = await request.file();
        if (!data || !data.file) {
            return reply.status(400).send({ error: 'Файл не загружен' });
        }
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedMimeTypes.includes(data.mimetype)) {
            return reply.status(400).send({ error: 'Разрешены только изображения (JPEG, PNG, WebP)' });
        }
        const filename = `${userId}-${Date.now()}${path.extname(data.filename)}`;
        const filePath = path.join(uploadsDir, filename);
        const publicUrl = `/uploads/${filename}`; // URL, который будет храниться в БД
        await pump(data.file, fs.createWriteStream(filePath));
        await pool.query('UPDATE users SET avatar_url = ? WHERE id = ?', [publicUrl, userId]);
        const newToken = fastify.jwt.sign({ ...request.user, avatar_url: publicUrl });
        return reply.send({
            message: 'Аватар обновлен',
            avatar_url: publicUrl,
            token: newToken
        });
    } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: `Ошибка при загрузке аватарки: ${err.message}` });
    }
});
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
fastify.get('/api/sessions/:id/price', async (request, reply) => {
    try {
        const { id } = request.params;
        const [rows] = await pool.query("SELECT price FROM sessions WHERE id = ?", [id]);
        
        if (rows.length === 0) {
            return reply.status(404).send({ price: 0 });
        }
        
        return { price: rows[0].price };
    } catch (err) {
        return { price: 0, error: err.message };
    }
});
fastify.post('/api/book-ticket', { preValidation: [fastify.authenticate] }, async (request, reply) => {
    const user_id = request.user.id;
    const { session_id, seat_id, card_number, card_holder, amount } = request.body;

    if (!card_number || !card_holder) {
        return reply.status(400).send({ error: 'Данные карты не заполнены' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const lastFour = card_number.slice(-4);
        const [transResult] = await connection.query(
            `INSERT INTO transactions (user_id, session_id, amount, card_holder, card_last_four, status) 
             VALUES (?, ?, ?, ?, ?, 'success')`,
            [user_id, session_id, amount, card_holder, lastFour]
        );

        const transactionId = transResult.insertId;

        await connection.query(
            'INSERT INTO tickets (session_id, seat_id, user_id, created_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 3 HOUR))',
            [session_id, seat_id, user_id]
        );

        await connection.commit();

        const [rows] = await pool.query(`
            SELECT u.email, m.title, s.start_time, st.row_num, st.seat_num, s.price
            FROM users u
            JOIN sessions s ON s.id = ?
            JOIN movies m ON s.movie_id = m.id
            JOIN seats st ON st.id = ?
            WHERE u.id = ?
        `, [session_id, seat_id, user_id]);

        if (rows.length > 0) {
            const data = rows[0];
            const formattedDate = new Date(data.start_time).toLocaleString('ru-RU', {
                day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            sendTicketEmail(
                data.email, 
                {
                    title: data.title,
                    date: formattedDate,
                    row: data.row_num,
                    seat: data.seat_num,
                    price: amount
                },
                {
                    id: transactionId,
                    card_last_four: lastFour,
                    card_holder: card_holder,
                    amount: amount
                }
            ).catch(mailErr => console.error('Ошибка отправки письма:', mailErr));
        }

        return { success: true };

    } catch (err) {
        await connection.rollback();
        fastify.log.error(err);
        return reply.status(500).send({ error: 'Ошибка транзакции при бронировании' });
    } finally {
        connection.release();
    }
});
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
fastify.delete('/api/tickets/:id', { preValidation: [fastify.authenticate] }, async (request, reply) => {
    const ticketId = request.params.id;
    const userId = request.user.id;

    try {
        const [tickets] = await pool.query(
            'SELECT session_id, seat_id FROM tickets WHERE id = ? AND user_id = ?',
            [ticketId, userId]
        );

        if (tickets.length === 0) {
            return reply.status(403).send({ error: 'Билет не найден' });
        }

        const { session_id, seat_id } = tickets[0];

        await pool.query(
            'UPDATE seats SET is_taken = 0 WHERE id = ?',
            [seat_id]
        );

        await pool.query(
            `UPDATE transactions SET status = 'refunded' 
             WHERE user_id = ? AND session_id = ? AND status = 'success' 
             LIMIT 1`, 
            [userId, session_id]
        );

        await pool.query('DELETE FROM tickets WHERE id = ?', [ticketId]);

        return { success: true, message: 'Билет возвращен, место свободно, статус транзакции изменен' };

    } catch (err) {
        fastify.log.error(err);
        return reply.status(500).send({ error: 'Ошибка сервера при возврате' });
    }
});
fastify.get('/api/sessions/:id/movie', async (request, reply) => {
    const { id } = request.params;
    const [rows] = await pool.query(`
        SELECT m.title 
        FROM sessions s 
        JOIN movies m ON s.movie_id = m.id 
        WHERE s.id = ?
    `, [id]);
    
    if (rows.length === 0) return reply.status(404).send({ error: 'Фильм не найден' });
    return rows[0];
});
fastify.get('/api/pushkin-status/:sessionId', async (request, reply) => {
    const { sessionId } = request.params;
    try {
        const [rows] = await pool.query(`
            SELECT m.pushkin_card 
            FROM movies m 
            JOIN sessions s ON s.movie_id = m.id 
            WHERE s.id = ?
        `, [sessionId]);

        return { isPushkinAvailable: rows[0] ? rows[0].pushkin_card : 0 };
    } catch (err) {
        return { isPushkinAvailable: 0 };
    }
});
fastify.get('/', (req, reply) => reply.sendFile('poster.html'));
fastify.get('/about', (req, reply) => reply.sendFile('about.html'));
fastify.get('/news', (req, reply) => reply.sendFile('news.html'));
fastify.get('/coming-soon', (req, reply) => reply.sendFile('coming-soon.html'));
fastify.get('/promotions', (req, reply) => reply.sendFile('promotions.html'));
fastify.get('/schedule', (req, reply) => reply.sendFile('schedule.html'));
fastify.get('/booking', (req, reply) => {
    reply.sendFile('booking.html');
});
fastify.get('/faq', async (request, reply) => {
    return reply.sendFile('faq.html');
});
fastify.get('/privacy', async (request, reply) => {
    return reply.sendFile('privacy.html');
});
fastify.get('/contacts', async (request, reply) => {
    return reply.sendFile('contacts.html');
});
fastify.get('/profile', (req, reply) => {
    reply.sendFile('profile.html');
});
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

